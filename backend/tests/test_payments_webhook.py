# -*- coding: utf-8 -*-
"""Тесты вебхука YooKassa (мок, без запросов к YooKassa)."""
import os, sys, hashlib, hmac, json, uuid
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
import pytest
from fastapi.testclient import TestClient

if os.path.exists("test_webhook.db"):
    os.remove("test_webhook.db")
os.environ["DATABASE_URL"] = "sqlite:///./test_webhook.db"
os.environ["ENV"] = "development"
os.environ["SECRET_KEY"] = "test_key_not_prod"

import payments
import main

client = TestClient(main.app)

def _canonical(data):
    obj = data.get("object", data)
    def g(*keys):
        cur = obj
        for k in keys:
            if not isinstance(cur, dict) or k not in cur:
                return ""
            cur = cur[k]
        return str(cur)
    return "|".join([
        g("amount","value"), g("amount","currency"), g("captured_at"), g("created_at"),
        g("description"), g("id"), g("ip"), g("metadata"),
        g("payment_method"), g("recipient","account_id"), g("recipient","gateway_id"),
        g("refundable"), g("refunded_amount","value"), g("refunded_amount","currency"),
        g("status"), g("test"),
    ])

def _headers_for(body, secret="test_secret"):
    payments.YOOKASSA_SECRET_KEY = secret
    sig = hmac.new(secret.encode(), _canonical(json.loads(body)).encode(), hashlib.sha256).hexdigest()
    return {"X-Signature": sig}

def _event(uid):
    return {
        "event": "payment.succeeded", "type": "notification",
        "object": {
            "id": str(uuid.uuid4()), "status": "succeeded", "paid": True,
            "amount": {"value": "1000.00", "currency": "RUB"},
            "metadata": {"user_id": str(uid), "amount": "1000"},
            "created_at": "2026-09-09T00:00:00.000Z", "test": True,
        },
    }

def make_user(email):
    r = client.post("/register/", json={"email": email, "password": "password123", "role": "customer", "name": email.split("@")[0]})
    assert r.status_code == 200, r.text
    tok = client.post("/login", data={"username": email, "password": "password123"}).json()["access_token"]
    me = client.get("/users/me", headers={"Authorization": f"Bearer {tok}"}).json()
    return me["id"]

def balance(uid):
    s = main.SessionLocal()
    try:
        return s.query(main.User).filter(main.User.id == uid).first().balance
    finally:
        s.close()

@pytest.fixture(autouse=True)
def _reset():
    main._rate_buckets.clear()
    payments.YOOKASSA_SECRET_KEY = "test_secret"
    payments.YOOKASSA_SHOP_ID = "123456"

def test_webhook_credits_balance():
    uid = make_user("wh_ok@t.ru")
    body = json.dumps(_event(uid))
    r = client.post("/payments/webhook", content=body, headers=_headers_for(body))
    assert r.status_code == 200, r.text
    assert r.json()["credited"] is True
    assert balance(uid) == 1000

def test_webhook_idempotent_no_double_credit():
    uid = make_user("wh_idem@t.ru")
    body = json.dumps(_event(uid))
    r1 = client.post("/payments/webhook", content=body, headers=_headers_for(body))
    assert r1.status_code == 200 and r1.json()["credited"] is True
    r2 = client.post("/payments/webhook", content=body, headers=_headers_for(body))
    assert r2.status_code == 200 and r2.json()["credited"] is False
    assert balance(uid) == 1000

def test_webhook_ignores_other_events():
    uid = make_user("wh_ign@t.ru")
    ev = {"event": "payment.canceled", "type": "notification",
          "object": {"id": str(uuid.uuid4()), "amount": {"value": "100.00", "currency": "RUB"}, "metadata": {"user_id": str(uid)}}}
    body = json.dumps(ev)
    r = client.post("/payments/webhook", content=body, headers=_headers_for(body))
    assert r.status_code == 200 and r.json() == {"message": "ignored"}
    assert balance(uid) == 0

def test_webhook_wrong_signature_400():
    uid = make_user("wh_sig@t.ru")
    body = json.dumps(_event(uid))
    r = client.post("/payments/webhook", content=body, headers={"X-Signature": "deadbeef"})
    assert r.status_code == 400
    assert balance(uid) == 0

def test_webhook_missing_user_id_400():
    ev = _event(42)
    ev["object"]["metadata"] = {}
    body = json.dumps(ev)
    r = client.post("/payments/webhook", content=body, headers=_headers_for(body))
    assert r.status_code == 400

def test_webhook_no_secret_key_passthrough():
    payments.YOOKASSA_SECRET_KEY = ""
    uid = make_user("wh_nosecret@t.ru")
    body = json.dumps(_event(uid))
    r = client.post("/payments/webhook", content=body, headers={"X-Signature": "whatever"})
    assert r.status_code == 200 and r.json()["credited"] is True
    assert balance(uid) == 1000
