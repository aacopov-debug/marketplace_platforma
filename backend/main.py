from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File, Request

from fastapi.responses import Response as FastResponse

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from fastapi.middleware.cors import CORSMiddleware

from fastapi.middleware.gzip import GZipMiddleware

from sqlalchemy import event

from sqlalchemy.engine import Engine

from fastapi.staticfiles import StaticFiles

import json

import asyncio

from enum import Enum as PyEnum

from pydantic import BaseModel, EmailStr, field_validator, Field

from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text, Enum as SqlaEnum

from sqlalchemy import LargeBinary as SqlaLargeBinary

from sqlalchemy.orm import declarative_base, sessionmaker, Session

import os

import bcrypt

from jose import JWTError, jwt

from datetime import datetime, timedelta

from typing import Optional, List

from file_utils import save_upload_file, delete_file, UPLOAD_DIR, validate_image

from geocoding import geocode_address

import payments
from app.schemas import (UserCreate, TaskCreate, MessageCreate, MessageOut, ProfileUpdate, ResponseCreate, DepositRequest, ReviewCreate, ForgotPasswordRequest, ResetPasswordRequest, TaskImagesDeleteRequest, BuyPackageRequest, AIParseRequest, AIEstimateRequest, AIEnhanceProfileRequest)
from app.deps import (ConnectionManager, manager, user_online, decode_token_or_401, public_file_url, save_file_to_db, MONETIZATION_PACKAGES, DEMO_DEPOSIT_MAX, CATEGORY_PRICE_RANGES, CATEGORIES)



ALGORITHM = "HS256"

DB_URL = os.environ.get("DATABASE_URL", "sqlite:///./marketplace_v3.db")



# JWT-ключ обязателен на проде. Если его нет, но это Postgres или ENV=production —

# падаем на старте, а не подписываем токены предсказуемым дефолтом (подделка JWT).

SECRET_KEY = os.environ.get("SECRET_KEY")

_is_production = (

    os.environ.get("ENV", "").lower() == "production"

    or DB_URL.startswith("postgres")

)

if not SECRET_KEY:

    if _is_production:

        raise RuntimeError(

            "SECRET_KEY environment variable must be set in production."

        )

    SECRET_KEY = "marketplace_super_secret"  # только для локальной разработки

# Render/Heroku отдают postgres:// — SQLAlchemy 2 требует явный драйвер

if DB_URL.startswith("postgres://"):

    DB_URL = DB_URL.replace("postgres://", "postgresql+psycopg2://", 1)

elif DB_URL.startswith("postgresql://"):

    DB_URL = DB_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {"check_same_thread": False, "timeout": 30} if "sqlite" in DB_URL else {}

engine = create_engine(DB_URL, connect_args=connect_args, pool_pre_ping=True)



if "sqlite" in DB_URL:

    @event.listens_for(Engine, "connect")

    def set_sqlite_pragma(dbapi_connection, connection_record):

        cursor = dbapi_connection.cursor()

        cursor.execute("PRAGMA journal_mode=WAL;")

        cursor.execute("PRAGMA synchronous=NORMAL;")

        cursor.execute("PRAGMA cache_size=-64000;")  # 64MB кэш в памяти

        cursor.execute("PRAGMA busy_timeout=30000;")

        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()



class UserRole(str, PyEnum):

    customer = "customer"

    specialist = "specialist"



class TaskStatus(str, PyEnum):

    open = "open"

    in_progress = "in_progress"

    completed = "completed"



class TaskCategory(str, PyEnum):

    design = "design"

    development = "development"

    writing = "writing"

    repairs = "repairs"

    cleaning = "cleaning"

    delivery = "delivery"

    photo_video = "photo_video"

    tutoring = "tutoring"

    beauty = "beauty"

    events = "events"

    business = "business"

    other = "other"



class TransactionType(str, PyEnum):

    deposit = "deposit"

    escrow_hold = "escrow_hold"

    escrow_release = "escrow_release"



class User(Base):

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, unique=True, index=True)

    hashed_password = Column(String)

    role = Column(SqlaEnum(UserRole), default=UserRole.customer)

    name = Column(String, nullable=True)

    bio = Column(String, nullable=True)

    balance = Column(Integer, default=0)

    city = Column(String, nullable=True)

    phone = Column(String, nullable=True)

    avatar = Column(String, nullable=True)

    portfolio = Column(Text, nullable=True)  # JSON string with portfolio items

    skills = Column(Text, nullable=True)  # JSON string with skills array

    verified = Column(Boolean, default=False)

    last_seen = Column(String, nullable=True)  # ISO-время последней активности

    response_credits = Column(Integer, default=5)  # оплаченные отклики (5 — стартовый бонус)

    is_pro = Column(Boolean, default=False)  # PRO-подписка: безлимит откликов + приоритет

    pro_until = Column(String, nullable=True)



class Transaction(Base):

    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, index=True)

    amount = Column(Integer)

    type = Column(SqlaEnum(TransactionType))

    task_id = Column(Integer, nullable=True)

    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())



class PaymentRecord(Base):

    __tablename__ = "payment_records"

    id = Column(Integer, primary_key=True, index=True)

    payment_id = Column(String, unique=True, index=True)

    user_id = Column(Integer, index=True)

    amount = Column(Integer)

    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())



class Notification(Base):

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, index=True)

    type = Column(String)       # "new_response", "assigned", "message", "completed", "review"

    title = Column(String)

    text = Column(String)

    task_id = Column(Integer, nullable=True)

    is_read = Column(Boolean, default=False)

    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())



class Response(Base):

    __tablename__ = "responses"

    id = Column(Integer, primary_key=True, index=True)

    task_id = Column(Integer, index=True)

    specialist_id = Column(Integer)

    text = Column(String)

    proposed_price = Column(Integer, nullable=True)

    estimated_days = Column(Integer, nullable=True)



class Task(Base):

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String)

    description = Column(String)

    budget = Column(Integer, nullable=True)

    category = Column(SqlaEnum(TaskCategory), default=TaskCategory.other, index=True)

    customer_id = Column(Integer)

    executor_id = Column(Integer, nullable=True)

    status = Column(SqlaEnum(TaskStatus), default=TaskStatus.open)

    city = Column(String, nullable=True, index=True)

    address = Column(String, nullable=True)

    latitude = Column(Float, nullable=True)

    longitude = Column(Float, nullable=True)

    deadline = Column(String, nullable=True)

    is_remote = Column(Boolean, default=False)

    images = Column(Text, nullable=True)  # JSON string with image URLs



class Message(Base):

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)

    task_id = Column(Integer, index=True)

    sender_id = Column(Integer)

    text = Column(String)

    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())



class Review(Base):

    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)

    task_id = Column(Integer, index=True)

    reviewer_id = Column(Integer)

    specialist_id = Column(Integer, index=True)  # тот, КТОМУ поставили оценку (специалист или заказчик)

    rating = Column(Integer)

    comment = Column(String, nullable=True)

    target = Column(String, default="specialist")  # specialist | customer — кому отзыв



class PasswordResetToken(Base):

    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, index=True)

    token = Column(String, unique=True, index=True)

    expires_at = Column(String)

    used = Column(Boolean, default=False)

    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())



class StoredFile(Base):

    """Файлы (аватары, портфолио, фото заказов) хранятся в базе — переживают перезапуск контейнера"""

    __tablename__ = "stored_files"

    id = Column(Integer, primary_key=True, index=True)

    filename = Column(String)

    content_type = Column(String, default="image/jpeg")

    data = Column(SqlaLargeBinary)

    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())



Base.metadata.create_all(bind=engine)



def _run_column_migrations():

    """Добавляет новые колонки в уже существующие таблицы (create_all их не трогает)"""

    from sqlalchemy import text

    is_pg = "postgresql" in DB_URL

    # PG понимает IF NOT EXISTS — не отравляет транзакцию. SQLite не понимает, но там ловим исключением.

    ck = "IF NOT EXISTS " if is_pg else ""

    migrations = [

        f"ALTER TABLE users ADD COLUMN {ck}last_seen VARCHAR",

        f"ALTER TABLE reviews ADD COLUMN {ck}target VARCHAR DEFAULT 'specialist'",

        f"ALTER TABLE users ADD COLUMN {ck}response_credits INTEGER DEFAULT 5",

        f"ALTER TABLE users ADD COLUMN {ck}is_pro BOOLEAN DEFAULT false",

        f"ALTER TABLE users ADD COLUMN {ck}pro_until VARCHAR",

    ]

    for m in migrations:

        with engine.connect() as conn:  # своя транзакция на каждую миграцию

            try:

                conn.execute(text(m))

                conn.commit()

            except Exception:

                conn.rollback()  # колонка уже существует (SQLite)



_run_column_migrations()



def hash_password(password: str) -> str:

    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')



def verify_password(password: str, hashed: str) -> bool:

    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))



oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")



def get_db():

    db = SessionLocal()

    try: yield db

    finally: db.close()



app = FastAPI(title="ProfiClone API - YouDo Edition")



# CORS: whitelist + поддержка любых доменов *.onrender.com и локальной разработки

_default_origins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"

_frontend_url = os.environ.get("FRONTEND_URL")

_origins_env = os.environ.get("ALLOWED_ORIGINS", _default_origins)

allowed_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

if _frontend_url and _frontend_url not in allowed_origins:

    allowed_origins.append(_frontend_url)



app.add_middleware(

    CORSMiddleware,

    allow_origins=allowed_origins,

    allow_origin_regex=r"https://.*\.onrender\.com",

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)



@app.middleware("http")

async def security_headers(request, call_next):

    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"

    response.headers["X-Frame-Options"] = "DENY"

    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    if _is_production:

        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response



# --- Онлайн-статусы: обновляем last_seen не чаще раза в минуту ---

_seen_cache: dict[int, datetime] = {}



@app.middleware("http")

async def track_last_seen(request, call_next):

    response = await call_next(request)

    auth = request.headers.get("authorization", "")

    if auth.startswith("Bearer "):

        try:

            payload = jwt.decode(auth[7:], SECRET_KEY, algorithms=[ALGORITHM])

            uid = int(payload.get("sub"))

            now = datetime.utcnow()

            last = _seen_cache.get(uid)

            if last is None or (now - last).total_seconds() > 60:

                db = SessionLocal()

                try:

                    db.query(User).filter(User.id == uid).update({"last_seen": now.isoformat()})

                    db.commit()

                finally:

                    db.close()

                _seen_cache[uid] = now

        except Exception:

            pass

    return response





# --- Простой in-memory rate limiter (без внешних зависимостей) ---

# Скользящее окно по (ключ). Защищает login/register/forgot от брутфорса и спама.

_rate_buckets: dict[str, list[float]] = {}



def rate_limit(request: Request, bucket: str, limit: int, window_sec: int):

    import time as _time

    ip = request.client.host if request.client else "unknown"

    key = f"{bucket}:{ip}"

    now = _time.time()

    hits = [t for t in _rate_buckets.get(key, []) if now - t < window_sec]

    if len(hits) >= limit:

        raise HTTPException(429, "Слишком много запросов, попробуйте позже")

    hits.append(now)

    _rate_buckets[key] = hits



# Mount uploads directory for serving images

from app.routers.auth import router as auth_router
app.include_router(auth_router)
from app.routers.users import router as users_router
app.include_router(users_router)
from app.routers.payments import router as payments_router
app.include_router(payments_router)
from app.routers.uploads import router as uploads_router
app.include_router(uploads_router)
from app.routers.notifications import router as notifications_router
app.include_router(notifications_router)
from app.routers.cities import router as cities_router
app.include_router(cities_router)
from app.routers.ai import router as ai_router
app.include_router(ai_router)
from app.routers.gamification import router as gamification_router
app.include_router(gamification_router)
from app.routers.tasks import router as tasks_router
app.include_router(tasks_router)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")







# Pydantic models





class TaskOut(TaskCreate):

    id: int

    customer_id: int

    executor_id: Optional[int] = None

    status: str















# Routes

@app.post("/register/")

def register(user: UserCreate, request: Request, db: Session = Depends(get_db)):

    rate_limit(request, "register", limit=5, window_sec=3600)

    if db.query(User).filter(User.email == user.email).first():

        raise HTTPException(400, "Email занят")

    new_user = User(email=user.email, hashed_password=hash_password(user.password), role=user.role, name=user.name)

    db.add(new_user)

    db.commit()

    return {"message": "Успех", "user_id": new_user.id}










def send_email(to: str, subject: str, body: str):

    """Отправка письма через SMTP из переменных окружения"""

    import smtplib

    from email.mime.text import MIMEText

    host = os.environ.get("SMTP_HOST")

    user = os.environ.get("SMTP_USER")

    password = os.environ.get("SMTP_PASS")

    if not host or not user or not password:

        raise HTTPException(503, "Почтовый сервис не настроен. Обратитесь к администратору.")

    msg = MIMEText(body, "plain", "utf-8")

    msg["Subject"] = subject

    msg["From"] = os.environ.get("SMTP_FROM", user)

    msg["To"] = to

    port = int(os.environ.get("SMTP_PORT", "587"))

    with smtplib.SMTP(host, port, timeout=20) as server:

        server.starttls()

        server.login(user, password)

        server.send_message(msg)








































# ---- Монетизация: пакеты откликов и PRO-подписка ----















































































# ==========================================

# 🤖 1. AI-ПОМОЩНИК И УМНЫЙ КАЛЬКУЛЯТОР ЦЕН

# ==========================================









# Базовые ценовые ориентиры рынка для категорий (в рублях)












# ==========================================

# 🎮 2. ГЕЙМИФИКАЦИЯ: УРОВНИ И БЕЙДЖИ

# ==========================================



