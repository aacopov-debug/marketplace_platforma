# -*- coding: utf-8 -*-
"""Тесты денежного потока маркетплейса «ДЕЛО».
Покрывают: эскроу hold->release, negative budget, idempotent complete, insufficient funds, утечку email.
Запуск:  python -m pytest backend/tests/ -q  (из корня репозитория)
"""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

import pytest
from fastapi.testclient import TestClient

if os.path.exists("test_money.db"):
    os.remove("test_money.db")
os.environ["DATABASE_URL"] = "sqlite:///./test_money.db"
os.environ["ENV"] = "development"
os.environ["SECRET_KEY"] = "test_key_not_prod"

import main

client = TestClient(main.app)


def make_user(email, role, balance_seed=None):
    r = client.post("/register/", json={"email": email, "password": "password123", "role": role, "name": email.split("@")[0]})
    assert r.status_code == 200, r.text
    tok = client.post("/login", data={"username": email, "password": "password123"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    if balance_seed is not None:
        r = client.post("/wallet/deposit", json={"amount": balance_seed}, headers=h)
        assert r.status_code == 200, r.text
    me = client.get("/users/me", headers=h).json()
    return {"id": me["id"], "headers": h}


def create_task(customer, title="Тест", budget=5000, category="repairs"):
    return client.post("/tasks/", json={"title": title, "description": "описание", "budget": budget,
                                        "category": category, "is_remote": True}, headers=customer["headers"])


def _balance(user):
    return client.get("/users/me", headers=user["headers"]).json()["balance"]


def _tx_count(task_id, tx_type):
    s = main.SessionLocal()
    try:
        return s.query(main.Transaction).filter(main.Transaction.task_id == task_id,
                                                 main.Transaction.type == tx_type).count()
    finally:
        s.close()


def _set_budget(task_id, value):
    s = main.SessionLocal()
    try:
        row = s.query(main.Task).get(task_id)
        row.budget = value
        s.commit()
    finally:
        s.close()


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    main._rate_buckets.clear()


def test_escrow_hold_and_release():
    cust = make_user("cust_hbrel@t.ru", "customer", balance_seed=10000)
    spec = make_user("spec_hbrel@t.ru", "specialist")
    r = create_task(cust, title="Эскроу поток", budget=4000)
    assert r.status_code == 200, r.text
    task_id = r.json()["task_id"]
    client.post(f"/tasks/{task_id}/responses", json={"text": "готов"}, headers=spec["headers"])
    r = client.put(f"/tasks/{task_id}/assign?specialist_id={spec['id']}", headers=cust["headers"])
    assert r.status_code == 200, r.text
    assert _balance(cust) == 6000, "hold: 4000 списано с заказчика"
    assert _balance(spec) == 0
    r = client.put(f"/tasks/{task_id}/complete", headers=cust["headers"])
    assert r.status_code == 200, r.text
    assert _balance(spec) == 4000, "release: исполнитель получил бюджет"
    assert _balance(cust) == 6000
    assert _tx_count(task_id, main.TransactionType.escrow_hold) == 1
    assert _tx_count(task_id, main.TransactionType.escrow_release) == 1


def test_neg_budget_400_and_no_balance_change():
    cust = make_user("cust_negb@t.ru", "customer", balance_seed=1000)
    r = create_task(cust, title="Негативный бюджет", budget=-5000)
    assert r.status_code == 422, "схема (ge=0) отклоняет отрицательный бюджет"
    assert _balance(cust) == 1000
    r = create_task(cust, title="Хороший бюджет", budget=100)
    task_id = r.json()["task_id"]
    _set_budget(task_id, -5000)
    spec = make_user("spec_negb@t.ru", "specialist")
    r = client.put(f"/tasks/{task_id}/assign?specialist_id={spec['id']}", headers=cust["headers"])
    assert r.status_code == 400, "assign отклоняет отрицательный бюджет"
    assert _balance(cust) == 1000


def test_complete_idempotent_no_double_pay():
    cust = make_user("cust_idem@t.ru", "customer", balance_seed=5000)
    spec = make_user("spec_idem@t.ru", "specialist")
    r = create_task(cust, title="Идемпотент", budget=2000)
    task_id = r.json()["task_id"]
    client.post(f"/tasks/{task_id}/responses", json={"text": "ок"}, headers=spec["headers"])
    client.put(f"/tasks/{task_id}/assign?specialist_id={spec['id']}", headers=cust["headers"])
    r1 = client.put(f"/tasks/{task_id}/complete", headers=cust["headers"])
    assert r1.status_code == 200
    r2 = client.put(f"/tasks/{task_id}/complete", headers=cust["headers"])
    assert r2.status_code == 200
    assert r2.json().get("already_completed") is True
    assert _tx_count(task_id, main.TransactionType.escrow_release) == 1, "выплата ровно один раз"
    assert _balance(spec) == 2000


def test_insufficient_funds_400():
    cust = make_user("cust_low@t.ru", "customer", balance_seed=100)
    spec = make_user("spec_low@t.ru", "specialist")
    r = create_task(cust, title="Малый баланс", budget=5000)
    task_id = r.json()["task_id"]
    client.post(f"/tasks/{task_id}/responses", json={"text": "ок"}, headers=spec["headers"])
    r = client.put(f"/tasks/{task_id}/assign?specialist_id={spec['id']}", headers=cust["headers"])
    assert r.status_code == 400
    assert _balance(cust) == 100, "списания нет при недостатке средств"


def test_responses_do_not_leak_email():
    cust = make_user("cust_noleak@t.ru", "customer", balance_seed=1000)
    spec = make_user("spec_noleak@t.ru", "specialist")
    r = create_task(cust, title="Без утечки", budget=300)
    task_id = r.json()["task_id"]
    client.post(f"/tasks/{task_id}/responses", json={"text": "готов"}, headers=spec["headers"])
    r = client.get(f"/tasks/{task_id}/responses", headers=cust["headers"])
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert "specialist_email" not in body[0], "email не должен быть в публичном ответе"
    assert "specialist_rating" in body[0]
