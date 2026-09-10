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

@router.get("/specialists/{user_id}/gamification")

def get_specialist_gamification(user_id: int, db: Session = Depends(get_db)):

    """Рассчитывает игровой уровень, ранг и бейджи мастера"""

    user = db.query(User).filter(User.id == user_id).first()

    if not user:

        raise HTTPException(404, "Пользователь не найден")



    completed_count = db.query(Task).filter(

        Task.executor_id == user_id,

        Task.status == TaskStatus.completed

    ).count()



    reviews = db.query(Review).filter(Review.specialist_id == user_id).all()

    review_count = len(reviews)

    avg_rating = round(sum(r.rating for r in reviews) / review_count, 1) if review_count > 0 else 5.0



    # Определение ранга и прогресса

    if completed_count >= 20 and avg_rating >= 4.8:

        rank = "👑 Эксперт"

        level = 4

        level_name = "Эксперт платформы"

        next_level_tasks = 20

        progress = 100

    elif completed_count >= 8 and avg_rating >= 4.5:

        rank = "⭐ Профи"

        level = 3

        level_name = "Проверенный Профи"

        next_level_tasks = 20

        progress = int((completed_count / 20) * 100)

    elif completed_count >= 3:

        rank = "🔨 Мастер"

        level = 2

        level_name = "Опытный Мастер"

        next_level_tasks = 8

        progress = int((completed_count / 8) * 100)

    else:

        rank = "🌱 Новичок"

        level = 1

        level_name = "Начинающий специалист"

        next_level_tasks = 3

        progress = int((completed_count / 3) * 100)



    # Коллекция бейджей

    badges = []

    if user.is_pro:

        badges.append({"id": "pro", "label": "PRO ★ Подписка", "icon": "👑", "color": "amber"})

    if user.verified:

        badges.append({"id": "verified", "label": "Паспорт проверен", "icon": "🛡", "color": "emerald"})

    if completed_count >= 1:

        badges.append({"id": "escrow", "label": "Безопасная сделка", "icon": "🤝", "color": "sky"})

    if review_count >= 5 and avg_rating >= 4.9:

        badges.append({"id": "top_rated", "label": "100% довольных клиентов", "icon": "❤️", "color": "rose"})

    if user_online(user):

        badges.append({"id": "fast_reply", "label": "Быстрый ответ (онлайн)", "icon": "⚡", "color": "violet"})



    return {

        "user_id": user_id,

        "level": level,

        "rank": rank,

        "level_name": level_name,

        "completed_tasks": completed_count,

        "reviews_count": review_count,

        "avg_rating": avg_rating,

        "progress_percent": min(progress, 100),

        "next_level_requirement": f"{next_level_tasks} выполненных заказов",

        "badges": badges

    }

