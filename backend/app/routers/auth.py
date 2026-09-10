from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import Response as FastResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
import json, asyncio, os, bcrypt
from app.core import SessionLocal, get_db, hash_password, verify_password, oauth2_scheme, rate_limit, SECRET_KEY, ALGORITHM, DB_URL
from app.models import (UserRole, TaskStatus, TaskCategory, TransactionType, User, Transaction, PaymentRecord, Notification, Response, Task, Message, Review, PasswordResetToken, StoredFile)
from app.schemas import (UserCreate, TaskCreate, MessageCreate, MessageOut, ProfileUpdate, ResponseCreate, DepositRequest, ReviewCreate, ForgotPasswordRequest, ResetPasswordRequest, TaskImagesDeleteRequest, BuyPackageRequest, AIParseRequest, AIEstimateRequest, AIEnhanceProfileRequest)
from app.deps import (ConnectionManager, manager, user_online, decode_token_or_401, public_file_url, save_file_to_db, MONETIZATION_PACKAGES, DEMO_DEPOSIT_MAX, CATEGORY_PRICE_RANGES, CATEGORIES)
import payments
from file_utils import save_upload_file, delete_file, UPLOAD_DIR, validate_image
from geocoding import geocode_address

router = APIRouter()

@router.post("/login")

def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):

    rate_limit(request, "login", limit=10, window_sec=300)

    user = db.query(User).filter(User.email == form.username).first()

    if not user or not verify_password(form.password, user.hashed_password):

        raise HTTPException(401, "Ошибка")

    token = jwt.encode({"sub": str(user.id), "role": user.role, "exp": datetime.utcnow() + timedelta(days=1)}, SECRET_KEY, algorithm=ALGORITHM)

    return {"access_token": token, "token_type": "bearer", "role": user.role}


@router.post("/auth/forgot-password")

def forgot_password(req: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):

    rate_limit(request, "forgot", limit=5, window_sec=3600)

    user = db.query(User).filter(User.email == req.email).first()

    # Не раскрываем существование аккаунта — всегда отвечаем успехом

    if user:

        import secrets as pysecrets

        token = pysecrets.token_urlsafe(32)

        reset = PasswordResetToken(

            user_id=user.id,

            token=token,

            expires_at=(datetime.utcnow() + timedelta(hours=1)).isoformat()

        )

        db.add(reset)

        db.commit()

        frontend_url = os.environ.get("FRONTEND_URL", "https://delo-jhcy.onrender.com")

        link = f"{frontend_url}/reset?token={token}"

        send_email(

            req.email,

            "ДЕЛО — сброс пароля",

            f"Здравствуйте!\n\nКто-то (надеемся, вы) запросил сброс пароля на маркетплейсе ДЕЛО.\n"

            f"Ссылка действительна 1 час:\n\n{link}\n\n"

            f"Если вы не запрашивали сброс — просто проигнорируйте это письмо."

        )

    return {"message": "Если аккаунт существует, письмо со ссылкой отправлено"}


@router.post("/auth/reset-password")

def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):

    reset = db.query(PasswordResetToken).filter(PasswordResetToken.token == req.token).first()

    if not reset or reset.used:

        raise HTTPException(400, "Ссылка недействительна или уже использована")

    if datetime.fromisoformat(reset.expires_at) < datetime.utcnow():

        raise HTTPException(400, "Ссылка истекла, запросите сброс заново")

    user = db.query(User).filter(User.id == reset.user_id).first()

    user.hashed_password = hash_password(req.new_password)

    reset.used = True

    db.commit()

    return {"message": "Пароль обновлён, войдите с новым паролем"}

