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
from file_utils import save_upload_file, delete_file, UPLOAD_DIR, validate_image
from geocoding import geocode_address

router = APIRouter()

@router.get("/notifications")

def get_notifications(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    """Get all notifications for current user"""

    payload = decode_token_or_401(token)

    user_id = int(payload.get("sub"))

    notifications = db.query(Notification).filter(

        Notification.user_id == user_id

    ).order_by(Notification.id.desc()).limit(50).all()

    return notifications


@router.get("/notifications/unread-count")

def get_unread_count(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    """Get count of unread notifications"""

    payload = decode_token_or_401(token)

    user_id = int(payload.get("sub"))

    count = db.query(Notification).filter(

        Notification.user_id == user_id,

        Notification.is_read == False

    ).count()

    return {"count": count}


@router.put("/notifications/read-all")

def mark_all_read(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    """Mark all notifications as read"""

    payload = decode_token_or_401(token)

    user_id = int(payload.get("sub"))

    db.query(Notification).filter(

        Notification.user_id == user_id,

        Notification.is_read == False

    ).update({"is_read": True})

    db.commit()

    return {"message": "Все уведомления прочитаны"}


@router.put("/notifications/{notification_id}/read")

def mark_read(notification_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    """Mark single notification as read"""

    payload = decode_token_or_401(token)

    user_id = int(payload.get("sub"))

    notif = db.query(Notification).filter(

        Notification.id == notification_id,

        Notification.user_id == user_id

    ).first()

    if notif:

        notif.is_read = True

        db.commit()

    return {"message": "OK"}

