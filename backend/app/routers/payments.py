from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import Response as FastResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
import json, asyncio, os, bcrypt
from app.core import (SessionLocal, get_db, hash_password, verify_password, oauth2_scheme, rate_limit, SECRET_KEY, ALGORITHM, DB_URL, _is_production)
from app.models import (UserRole, TaskStatus, TaskCategory, TransactionType, User, Transaction, PaymentRecord, Notification, Response, Task, Message, Review, PasswordResetToken, StoredFile)
from app.schemas import (UserCreate, TaskCreate, MessageCreate, MessageOut, ProfileUpdate, ResponseCreate, DepositRequest, ReviewCreate, ForgotPasswordRequest, ResetPasswordRequest, TaskImagesDeleteRequest, BuyPackageRequest, AIParseRequest, AIEstimateRequest, AIEnhanceProfileRequest)
from app.deps import (ConnectionManager, manager, user_online, decode_token_or_401, public_file_url, save_file_to_db, MONETIZATION_PACKAGES, DEMO_DEPOSIT_MAX, CATEGORY_PRICE_RANGES, CATEGORIES)
import payments
import json
from file_utils import save_upload_file, delete_file, UPLOAD_DIR, validate_image
from geocoding import geocode_address

router = APIRouter()

@router.post("/wallet/deposit")

def deposit_funds(req: DepositRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    # Демо-пополнение без реальной оплаты. На проде это дыра «бесконечные деньги» —

    # начисляем баланс только вне production, иначе заставляем идти через YooKassa.

    if _is_production:

        raise HTTPException(403, "Демо-пополнение недоступно. Используйте оплату через платёжную систему.")

    payload = decode_token_or_401(token)

    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()

    if not user:

        raise HTTPException(404, "Пользователь не найден")

    if req.amount <= 0:

        raise HTTPException(400, "Сумма должна быть больше 0")

    if req.amount > DEMO_DEPOSIT_MAX:

        raise HTTPException(400, f"Слишком большая сумма (максимум {DEMO_DEPOSIT_MAX} ₽)")



    user.balance += req.amount

    tx = Transaction(user_id=user.id, amount=req.amount, type=TransactionType.deposit)

    db.add(tx)

    db.commit()

    return {"message": "Баланс пополнен", "new_balance": user.balance}


@router.get("/monetization/packages")

def get_packages():

    return {"packages": [

        {"id": pid, **pkg} for pid, pkg in MONETIZATION_PACKAGES.items()

    ]}


@router.post("/monetization/buy")

def buy_package(req: BuyPackageRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    pkg = MONETIZATION_PACKAGES.get(req.package_id)

    if not pkg:

        raise HTTPException(404, "Пакет не найден")



    payload = decode_token_or_401(token)

    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()

    if user.role != UserRole.specialist:

        raise HTTPException(403, "Пакеты доступны только специалистам")

    if (user.balance or 0) < pkg["price"]:

        raise HTTPException(400, f"Недостаточно средств: нужно {pkg['price']} ₽. Пополните баланс.")



    user.balance -= pkg["price"]

    tx = Transaction(user_id=user.id, amount=-pkg["price"], type=TransactionType.deposit)

    db.add(tx)



    if pkg["type"] == "responses":

        user.response_credits = (user.response_credits or 0) + pkg["credits"]

        msg = f"Пакет «{pkg['title']}» куплен! Откликов: {user.response_credits}"

    else:

        base = datetime.utcnow()

        if user.pro_until and datetime.fromisoformat(user.pro_until) > base:

            base = datetime.fromisoformat(user.pro_until)  # продление с текущей даты окончания

        user.pro_until = (base + timedelta(days=pkg["days"])).isoformat()

        user.is_pro = True

        msg = f"PRO активирован до {user.pro_until[:10]}"



    db.commit()

    return {"message": msg, "balance": user.balance,

            "response_credits": user.response_credits, "is_pro": user.is_pro, "pro_until": user.pro_until}


@router.get("/payments/status")

def payments_status():

    """Check if real payment provider (YooKassa) is configured"""

    return {"configured": payments.is_configured()}


@router.post("/payments/create")

def create_payment(req: DepositRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    """Create a YooKassa payment and return the confirmation URL to redirect the user."""

    payload = decode_token_or_401(token)

    user_id = int(payload.get("sub"))

    user = db.query(User).filter(User.id == user_id).first()

    if not user:

        raise HTTPException(404, "Пользователь не найден")

    if req.amount <= 0:

        raise HTTPException(400, "Сумма должна быть больше 0")



    if not payments.is_configured():

        raise HTTPException(400, "Платёжная система не настроена. Используйте демо-пополнение.")



    result = payments.create_payment(

        amount=req.amount,

        description=f"Пополнение баланса ProfiClone на {req.amount} руб.",

        metadata={"user_id": str(user_id), "amount": str(req.amount)}

    )



    if "error" in result:

        raise HTTPException(502, f"Ошибка создания платежа: {result['error']}")



    return {

        "payment_id": result["payment_id"],

        "confirmation_url": result["confirmation_url"]

    }


@router.post("/payments/confirm")

def confirm_payment(payment_id: str, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    """

    Check payment status and credit balance if paid.

    Called by frontend after user returns from YooKassa.

    Idempotent: won't double-credit thanks to transaction record check.

    """

    payload = decode_token_or_401(token)

    user_id = int(payload.get("sub"))



    status_result = payments.get_payment_status(payment_id)

    if "error" in status_result:

        raise HTTPException(502, f"Ошибка проверки платежа: {status_result['error']}")



    if not status_result.get("paid"):

        return {"status": status_result["status"], "credited": False}



    # Verify the payment belongs to this user

    meta_user_id = status_result.get("metadata", {}).get("user_id")

    if meta_user_id != str(user_id):

        raise HTTPException(403, "Платёж не принадлежит этому пользователю")



    # Idempotency: don't double-credit if we already processed this payment

    already = db.query(PaymentRecord).filter(PaymentRecord.payment_id == payment_id).first()

    if already:

        return {"status": "succeeded", "credited": False, "message": "Уже зачислено"}



    amount = status_result["amount"]

    user = db.query(User).filter(User.id == user_id).first()

    user.balance += amount

    tx = Transaction(user_id=user_id, amount=amount, type=TransactionType.deposit)

    db.add(tx)

    db.add(PaymentRecord(payment_id=payment_id, user_id=user_id, amount=amount))

    db.commit()



    return {"status": "succeeded", "credited": True, "new_balance": user.balance}


@router.post("/payments/webhook")
async def payments_webhook(request: Request, db: Session = Depends(get_db)):
    """Вебхук YooKassa: платёж прошёл -> зачислить на баланс (идемпотентно).
    Безопасность: подпись (Early-Signature HTTP-заголовок) + YooKassa IP не проверяется (рекомендуется по желанию).
    """
    body = await request.body()
    signature = request.headers.get("X-Signature") or request.headers.get("Early-Signature") or ""
    event = None
    try:
        payload = json.loads(body)
        event = payload.get("event")
    except Exception:
        raise HTTPException(400, "Некорректный JSON")

    # Отклоняем, если подпись неверная (в тестах можно обойти, если ключ не задан)
    if payments.YOOKASSA_SECRET_KEY and not payments.verify_webhook_signature(body, signature):
        raise HTTPException(400, "Неверная подпись вебхука")

    if event != "payment.succeeded":
        return {"message": "ignored"}

    obj = payload.get("object", {})
    payment_id = obj.get("id")
    amount = int(float((obj.get("amount") or {}).get("value", 0)))
    metadata = obj.get("metadata") or {}
    user_id = metadata.get("user_id")

    if not payment_id or not user_id:
        raise HTTPException(400, "Нет payment_id или user_id в метаданных")

    already = db.query(PaymentRecord).filter(PaymentRecord.payment_id == payment_id).first()
    if already:
        return {"status": "succeeded", "credited": False, "message": "Уже зачислено"}

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    user.balance += amount
    db.add(Transaction(user_id=user.id, amount=amount, type=TransactionType.deposit, task_id=None))
    db.add(PaymentRecord(payment_id=payment_id, user_id=user.id, amount=amount))
    db.commit()
    return {"status": "succeeded", "credited": True, "new_balance": user.balance}
