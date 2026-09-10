# -*- coding: utf-8 -*-
"""Тесты кошелька и монетизации «ДЕЛО».
Покрывают: демо-пополнение, защиту от отрицательных сумм и превышения лимита,
покупку пакета откликов и PRO-подписки, недоступность демо-пополнения «в проде».
Запуск:  python -m pytest backend/tests/ -q
"""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

import pytest
from fastapi.testclient import TestClient

if os.path.exists("test_wallet.db"):
    os.remove("test_wallet.db")
os.environ["DATABASE_URL"] = "sqlite:///./test_wallet.db"
os.environ["ENV"] = "development"
os.environ["SECRET_KEY"] = "test_key_not_prod"

import main

client = TestClient(main.app)


def make_user(email, role, balance_seed=None):
    r = client.post("/register/", json={"email": email, "password": "password123", "role": role, "name": email.split("@")[0]})
    assert r.status_code == 200, r.text
    tok = client.post("/login", data={"username": email, "password": "password123"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    me = client.get("/users/me", headers=h).json()
    return {"id": me["id"], "headers": h, "role": role}


def _me(user):
    return client.get("/users/me", headers=user["headers"]).json()


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    main._rate_buckets.clear()


def test_deposit_updates_balance():
    u = make_user("w_dep@t.ru", "customer")
    r = client.post("/wallet/deposit", json={"amount": 5000}, headers=u["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["new_balance"] == 5000
    assert _me(u)["balance"] == 5000


def test_deposit_negative_and_overlimit_400():
    u = make_user("w_neg@t.ru", "customer")
    r = client.post("/wallet/deposit", json={"amount": -1000}, headers=u["headers"])
    assert r.status_code == 400, "отрицательная сумма отклоняется"
    assert _me(u)["balance"] == 0
    r = client.post("/wallet/deposit", json={"amount": 200000}, headers=u["headers"])
    assert r.status_code == 400, "сумма сверх лимита отклоняется"
    assert _me(u)["balance"] == 0


def test_buy_responses_package():
    u = make_user("w_buy@t.ru", "specialist")
    client.post("/wallet/deposit", json={"amount": 1000}, headers=u["headers"])
    r = client.post("/monetization/buy", json={"package_id": "resp_10"}, headers=u["headers"])
    assert r.status_code == 200, r.text
    me = _me(u)
    assert me["response_credits"] == 15, "5 стартовых + 10 купленных"
    assert me["balance"] == 810, "1000 - 190 за пакет"


def test_buy_pro_subscription():
    u = make_user("w_pro@t.ru", "specialist")
    client.post("/wallet/deposit", json={"amount": 1000}, headers=u["headers"])
    r = client.post("/monetization/buy", json={"package_id": "pro_1"}, headers=u["headers"])
    assert r.status_code == 200, r.text
    me = _me(u)
    assert me["is_pro"] is True
    assert me["pro_until"] is not None
    assert me["balance"] == 410, "1000 - 590 за PRO"


def test_buy_insufficient_funds_400():
    u = make_user("w_poor@t.ru", "specialist")
    r = client.post("/monetization/buy", json={"package_id": "resp_10"}, headers=u["headers"])
    assert r.status_code == 400
    assert _me(u)["response_credits"] == 5, "кредиты не изменились"


def test_payments_status_not_configured():
    u = make_user("w_pay@t.ru", "customer")
    r = client.get("/payments/status")
    assert r.status_code == 200
    assert r.json()["configured"] is False
    r = client.post("/payments/create", json={"amount": 1000}, headers=u["headers"])
    assert r.status_code == 400, "без платёжной системы нельзя создать платёж"
