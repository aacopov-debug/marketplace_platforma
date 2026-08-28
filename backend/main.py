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

def user_online(user) -> bool:
    """Онлайн = была активность за последние 2 минуты"""
    if not user.last_seen:
        return False
    try:
        return (datetime.utcnow() - datetime.fromisoformat(user.last_seen)).total_seconds() < 120
    except Exception:
        return False

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
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, task_id: int, already_accepted: bool = False):
        if not already_accepted:
            await websocket.accept()
        if task_id not in self.active_connections:
            self.active_connections[task_id] = []
        self.active_connections[task_id].append(websocket)

    def disconnect(self, websocket: WebSocket, task_id: int):
        if task_id in self.active_connections:
            try:
                self.active_connections[task_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]

    async def broadcast(self, message: dict, task_id: int):
        if task_id in self.active_connections:
            for connection in self.active_connections[task_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception:
                    pass

manager = ConnectionManager()

# Pydantic models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    name: Optional[str] = None

    @field_validator("password")
    @classmethod
    def _password_policy(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Пароль должен быть не короче 8 символов")
        if v.isdigit() or v.isalpha():
            raise ValueError("Пароль должен содержать и буквы, и цифры")
        return v

class TaskCreate(BaseModel):
    title: str
    description: str
    budget: Optional[int] = None
    category: TaskCategory = TaskCategory.other
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    deadline: Optional[str] = None
    is_remote: bool = False
    images: Optional[str] = None

class TaskOut(TaskCreate):
    id: int
    customer_id: int
    executor_id: Optional[int] = None
    status: str

class MessageCreate(BaseModel):
    text: str

class MessageOut(BaseModel):
    id: int
    task_id: int
    sender_id: int
    text: str
    created_at: str
    sender_name: Optional[str] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None
    skills: Optional[str] = None  # JSON string
    portfolio: Optional[str] = None  # JSON string

class ResponseCreate(BaseModel):
    text: str
    proposed_price: Optional[int] = None
    estimated_days: Optional[int] = None

class DepositRequest(BaseModel):
    amount: int

class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""

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

@app.post("/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    rate_limit(request, "login", limit=10, window_sec=300)
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(401, "Ошибка")
    token = jwt.encode({"sub": str(user.id), "role": user.role, "exp": datetime.utcnow() + timedelta(days=1)}, SECRET_KEY, algorithm=ALGORITHM)
    return {"access_token": token, "token_type": "bearer", "role": user.role}

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password_policy(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Пароль должен быть не короче 8 символов")
        if v.isdigit() or v.isalpha():
            raise ValueError("Пароль должен содержать и буквы, и цифры")
        return v

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

@app.post("/auth/forgot-password")
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

@app.post("/auth/reset-password")
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

@app.post("/tasks/")
def create_task(task: TaskCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    if payload.get("role") != "customer":
        raise HTTPException(403, "Только для заказчиков")

    # Auto-geocode if city provided but no coordinates
    latitude = task.latitude
    longitude = task.longitude

    if task.city and not task.is_remote and (latitude is None or longitude is None):
        coords = geocode_address(task.city, task.address)
        if coords:
            latitude, longitude = coords

    new_task = Task(
        title=task.title,
        description=task.description,
        budget=task.budget,
        category=task.category,
        customer_id=int(payload.get("sub")),
        city=task.city,
        address=task.address,
        latitude=latitude,
        longitude=longitude,
        deadline=task.deadline,
        is_remote=task.is_remote,
        images=task.images
    )
    db.add(new_task)
    db.commit()
    return {"message": "Создано", "task_id": new_task.id}

@app.get("/tasks/")
def get_tasks(
    category: Optional[TaskCategory] = None,
    search: Optional[str] = None,
    city: Optional[str] = None,
    is_remote: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Task)
    if category:
        query = query.filter(Task.category == category)
    if search:
        query = query.filter(Task.title.ilike(f"%{search}%") | Task.description.ilike(f"%{search}%"))
    if city:
        query = query.filter(Task.city == city)
    if is_remote is not None:
        query = query.filter(Task.is_remote == is_remote)
    tasks = query.order_by(Task.id.desc()).all()
    return tasks

@app.get("/tasks/{task_id}")
def get_task_detail(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")
    customer = db.query(User).filter(User.id == task.customer_id).first()
    responses_count = db.query(Response).filter(Response.task_id == task_id).count()
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "budget": task.budget,
        "category": task.category,
        "customer_id": task.customer_id,
        "customer_name": customer.name if customer else None,
        "executor_id": task.executor_id,
        "status": task.status,
        "city": task.city,
        "address": task.address,
        "latitude": task.latitude,
        "longitude": task.longitude,
        "deadline": task.deadline,
        "is_remote": task.is_remote,
        "images": task.images,
        "responses_count": responses_count
    }

class TaskImagesDeleteRequest(BaseModel):
    urls_to_delete: List[str]

@app.delete("/tasks/{task_id}/images")
def delete_task_images(task_id: int, req: TaskImagesDeleteRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Удаление фото из заказа (только его автор)"""
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")
    if task.customer_id != user_id:
        raise HTTPException(403, "Удалять фото может только автор заказа")
    try:
        imgs = json.loads(task.images) if task.images else []
    except Exception:
        imgs = []
    new_imgs = [u for u in imgs if u not in req.urls_to_delete]
    task.images = json.dumps(new_imgs) if new_imgs else None
    db.commit()
    return {"message": "Фото удалено", "images": new_imgs}

@app.get("/users/{user_id}/public")
def get_public_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    # Отзывы ЧЕЛОВЕКУ: специалисту — про его работу, заказчику — про него как заказчика
    review_target = "specialist" if user.role == UserRole.specialist else "customer"
    rating = None
    reviews = db.query(Review).filter(Review.specialist_id == user.id, Review.target == review_target).all()
    if reviews:
        rating = round(sum(r.rating for r in reviews) / len(reviews), 1)
    if user.role == UserRole.specialist:
        completed_tasks = db.query(Task).filter(
            Task.executor_id == user.id,
            Task.status == TaskStatus.completed
        ).count()
    else:
        completed_tasks = db.query(Task).filter(
            Task.customer_id == user.id,
            Task.status == TaskStatus.completed
        ).count()
    return {
        "id": user.id,
        "role": user.role,
        "name": user.name,
        "bio": user.bio,
        "rating": rating,
        "city": user.city,
        "avatar": user.avatar,
        "portfolio": user.portfolio,
        "skills": user.skills,
        "verified": user.verified,
        "is_pro": user.is_pro,
        "completed_tasks": completed_tasks,
        "online": user_online(user),
        "last_seen": user.last_seen
    }

@app.get("/users/{user_id}/reviews")
def get_user_reviews(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    review_target = "specialist" if user.role == UserRole.specialist else "customer"
    reviews = db.query(Review).filter(
        Review.specialist_id == user_id, Review.target == review_target
    ).order_by(Review.id.desc()).all()
    result = []
    for r in reviews:
        reviewer = db.query(User).filter(User.id == r.reviewer_id).first()
        task = db.query(Task).filter(Task.id == r.task_id).first()
        reviewer_role = "Специалист" if (reviewer and reviewer.role == UserRole.specialist) else "Заказчик"
        result.append({
            "id": r.id,
            "rating": r.rating,
            "comment": r.comment,
            "reviewer_name": reviewer.name if reviewer and reviewer.name else reviewer_role,
            "reviewer_role": reviewer_role,
            "task_title": task.title if task else None,
            "task_id": r.task_id
        })
    return result

@app.get("/users/me")
def get_profile(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    rating = None
    completed_tasks = 0
    if user.role == UserRole.specialist:
        reviews = db.query(Review).filter(Review.specialist_id == user.id).all()
        if reviews:
            rating = round(sum(r.rating for r in reviews) / len(reviews), 1)
        completed_tasks = db.query(Task).filter(
            Task.executor_id == user.id,
            Task.status == TaskStatus.completed
        ).count()

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "name": user.name,
        "bio": user.bio,
        "rating": rating,
        "balance": user.balance,
        "city": user.city,
        "phone": user.phone,
        "avatar": user.avatar,
        "portfolio": user.portfolio,
        "skills": user.skills,
        "verified": user.verified,
        "completed_tasks": completed_tasks,
        "response_credits": user.response_credits,
        "is_pro": user.is_pro,
        "pro_until": user.pro_until
    }

@app.put("/users/me")
def update_profile(profile: ProfileUpdate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if profile.name is not None:
        user.name = profile.name
    if profile.bio is not None:
        user.bio = profile.bio
    if profile.city is not None:
        user.city = profile.city
    if profile.phone is not None:
        user.phone = profile.phone
    if profile.avatar is not None:
        user.avatar = profile.avatar
    if profile.skills is not None:
        user.skills = profile.skills
    if profile.portfolio is not None:
        user.portfolio = profile.portfolio
    db.commit()
    return {"message": "Профиль обновлен"}

DEMO_DEPOSIT_MAX = 100000  # верхняя граница демо-пополнения (₽)

@app.post("/wallet/deposit")
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

# ---- Монетизация: пакеты откликов и PRO-подписка ----

MONETIZATION_PACKAGES = {
    "resp_10": {"type": "responses", "title": "10 откликов", "credits": 10, "price": 190},
    "resp_50": {"type": "responses", "title": "50 откликов", "credits": 50, "price": 790},
    "pro_1": {"type": "pro", "title": "PRO на 1 месяц", "days": 30, "price": 590},
    "pro_3": {"type": "pro", "title": "PRO на 3 месяца", "days": 90, "price": 1490},
    "pro_12": {"type": "pro", "title": "PRO на год", "days": 365, "price": 4900},
}

class BuyPackageRequest(BaseModel):
    package_id: str

@app.get("/monetization/packages")
def get_packages():
    return {"packages": [
        {"id": pid, **pkg} for pid, pkg in MONETIZATION_PACKAGES.items()
    ]}

@app.post("/monetization/buy")
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

@app.get("/payments/status")
def payments_status():
    """Check if real payment provider (YooKassa) is configured"""
    return {"configured": payments.is_configured()}

@app.post("/payments/create")
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

@app.post("/payments/confirm")
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

@app.put("/tasks/{task_id}/assign")
def assign_task(task_id: int, specialist_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    customer_id = int(payload.get("sub"))
    customer = db.query(User).filter(User.id == customer_id).first()
    task = db.query(Task).filter(Task.id == task_id, Task.customer_id == customer_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден или вы не его автор")

    spec = db.query(User).filter(User.id == specialist_id, User.role == UserRole.specialist).first()
    if not spec:
        raise HTTPException(400, "Специалист не найден")

    budget = task.budget or 0
    if customer.balance < budget:
        raise HTTPException(400, "Недостаточно средств для безопасной сделки")

    customer.balance -= budget
    if budget > 0:
        tx = Transaction(user_id=customer.id, amount=-budget, type=TransactionType.escrow_hold, task_id=task.id)
        db.add(tx)

    task.executor_id = specialist_id
    task.status = TaskStatus.in_progress
    db.commit()

    # Notify specialist they were assigned
    db.add(Notification(
        user_id=specialist_id,
        type="assigned",
        title="Вас выбрали исполнителем!",
        text=f"Заказчик назначил вас на задачу \"{task.title}\"",
        task_id=task.id
    ))
    db.commit()
    return {"message": "Исполнитель назначен"}

@app.put("/tasks/{task_id}/complete")
def complete_task(task_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    customer_id = int(payload.get("sub"))
    task = db.query(Task).filter(Task.id == task_id, Task.customer_id == customer_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден или вы не его автор")

    task.status = TaskStatus.completed

    budget = task.budget or 0
    if task.executor_id and budget > 0:
        spec = db.query(User).filter(User.id == task.executor_id).first()
        if spec:
            spec.balance += budget
            tx = Transaction(user_id=spec.id, amount=budget, type=TransactionType.escrow_release, task_id=task.id)
            db.add(tx)

    # Notify specialist task completed + funds released
    if task.executor_id:
        db.add(Notification(
            user_id=task.executor_id,
            type="completed",
            title="Заказ завершён!",
            text=f"Заказчик завершил задачу \"{task.title}\". Средства зачислены на баланс.",
            task_id=task.id
        ))
    db.commit()
    return {"message": "Заказ завершен"}

@app.post("/tasks/{task_id}/responses")
def create_response(task_id: int, response: ResponseCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    if payload.get("role") != "specialist":
        raise HTTPException(403, "Только для специалистов")
    specialist_id = int(payload.get("sub"))
    specialist = db.query(User).filter(User.id == specialist_id).first()

    # Монетизация: PRO — безлимит, иначе списываем 1 отклик
    if not specialist.is_pro:
        if (specialist.response_credits or 0) <= 0:
            raise HTTPException(402, "Отклики закончились. Купите пакет откликов или оформите PRO в профиле")
        specialist.response_credits -= 1

    new_response = Response(
        task_id=task_id,
        specialist_id=specialist_id,
        text=response.text,
        proposed_price=response.proposed_price,
        estimated_days=response.estimated_days
    )
    db.add(new_response)

    # Notify customer about new response
    task = db.query(Task).filter(Task.id == task_id).first()
    if task:
        db.add(Notification(
            user_id=task.customer_id,
            type="new_response",
            title="Новый отклик на заказ!",
            text=f"{'PRO ★ ' if specialist.is_pro else ''}{specialist.name or specialist.email} откликнулся на задачу \"{task.title}\"" + (f" — {response.proposed_price} ₽" if response.proposed_price else ""),
            task_id=task_id
        ))
    db.commit()
    if not specialist.is_pro:
        db.commit()  # фиксируем списание отклика
    return {"message": "Отклик отправлен", "credits_left": None if specialist.is_pro else specialist.response_credits}

@app.get("/tasks/{task_id}/responses")
def get_task_responses(task_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")

    responses = db.query(Response).filter(Response.task_id == task_id).all()
    result = []
    for r in responses:
        spec = db.query(User).filter(User.id == r.specialist_id).first()
        rating = None
        completed_tasks = 0
        if spec:
            reviews = db.query(Review).filter(Review.specialist_id == spec.id).all()
            if reviews:
                rating = round(sum(rev.rating for rev in reviews) / len(reviews), 1)
            completed_tasks = db.query(Task).filter(
                Task.executor_id == spec.id,
                Task.status == TaskStatus.completed
            ).count()

        result.append({
            "id": r.id,
            "text": r.text,
            "specialist_id": r.specialist_id,
            "specialist_name": spec.name if spec else "Аноним",
            "specialist_email": spec.email if spec else "",
            "specialist_rating": rating,
            "specialist_completed_tasks": completed_tasks,
            "specialist_verified": spec.verified if spec else False,
            "specialist_city": spec.city if spec else None,
            "specialist_online": user_online(spec) if spec else False,
            "specialist_pro": spec.is_pro if spec else False,
            "proposed_price": r.proposed_price,
            "estimated_days": r.estimated_days
        })
    # PRO-исполнители — первыми в списке
    result.sort(key=lambda x: (not x["specialist_pro"], -(x["specialist_rating"] or 0)))
    return result

@app.post("/tasks/{task_id}/review")
def create_review(task_id: int, review: ReviewCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")

    if task.status != TaskStatus.completed:
        raise HTTPException(400, "Можно оставлять отзывы только на завершенные заказы")

    # Взаимные отзывы: заказчик оценивает исполнителя, исполнитель — заказчика
    if role == "customer" and task.customer_id == user_id:
        if not task.executor_id:
            raise HTTPException(400, "У заказа нет исполнителя")
        reviewee_id, target = task.executor_id, "specialist"
    elif role == "specialist" and task.executor_id == user_id:
        reviewee_id, target = task.customer_id, "customer"
    else:
        raise HTTPException(403, "Отзыв доступен только участникам заказа")

    existing = db.query(Review).filter(Review.task_id == task_id, Review.reviewer_id == user_id).first()
    if existing:
        raise HTTPException(400, "Вы уже оставили отзыв на этот заказ")

    new_review = Review(
        task_id=task_id,
        reviewer_id=user_id,
        specialist_id=reviewee_id,
        rating=review.rating,
        comment=review.comment,
        target=target
    )
    db.add(new_review)
    db.commit()
    return {"message": "Отзыв успешно добавлен"}

@app.websocket("/ws/tasks/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: int, db: Session = Depends(get_db), token: Optional[str] = None):
    already_accepted = False
    if not token:
        # Preferred auth: first message {"type": "auth", "token": "..."} — keeps the token out of URLs and logs
        await websocket.accept()
        already_accepted = True
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=10)
            data = json.loads(raw)
            token = data.get("token")
        except Exception:
            token = None
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_token_or_401(token)
    except:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = int(payload.get("sub"))
    role = payload.get("role")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        db.close()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if role == "customer" and task.customer_id != user_id:
        db.close()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    if role == "specialist" and task.executor_id != user_id:
        db.close()
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db.close()

    await manager.connect(websocket, task_id, already_accepted)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, task_id)

@app.get("/tasks/{task_id}/messages")
def get_messages(task_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")

    if role == "customer" and task.customer_id != user_id:
        raise HTTPException(403, "Нет доступа")
    if role == "specialist" and task.executor_id != user_id:
        raise HTTPException(403, "Нет доступа")

    messages = db.query(Message).filter(Message.task_id == task_id).order_by(Message.id).all()
    result = []
    for m in messages:
        sender = db.query(User).filter(User.id == m.sender_id).first()
        result.append({
            "id": m.id,
            "task_id": m.task_id,
            "sender_id": m.sender_id,
            "text": m.text,
            "created_at": m.created_at,
            "sender_name": sender.name or sender.email if sender else "Unknown"
        })
    return result

@app.post("/tasks/{task_id}/messages")
async def post_message(task_id: int, message: MessageCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")

    if role == "customer" and task.customer_id != user_id:
        raise HTTPException(403, "Нет доступа")
    if role == "specialist" and task.executor_id != user_id:
        raise HTTPException(403, "Нет доступа")

    new_message = Message(task_id=task_id, sender_id=user_id, text=message.text)
    db.add(new_message)
    db.commit()

    # Notify the other party about new message
    sender = db.query(User).filter(User.id == user_id).first()
    recipient_id = task.executor_id if role == "customer" else task.customer_id
    if recipient_id:
        db.add(Notification(
            user_id=recipient_id,
            type="message",
            title="Новое сообщение",
            text=f"{sender.name or sender.email}: {message.text[:60]}{'...' if len(message.text) > 60 else ''}",
            task_id=task_id
        ))
        db.commit()

    sender = db.query(User).filter(User.id == user_id).first()
    message_dict = {
        "id": new_message.id,
        "task_id": task_id,
        "sender_id": user_id,
        "text": message.text,
        "created_at": new_message.created_at,
        "sender_name": sender.name or sender.email if sender else "Unknown"
    }

    await manager.broadcast(message_dict, task_id)
    return message_dict

def public_file_url(request: Request, file_path: str) -> str:
    """Полный URL файла по фактическому адресу бэкенда (работает и локально, и на Render)"""
    return f"{str(request.base_url).rstrip('/')}/{file_path}"

def save_file_to_db(db: Session, file: UploadFile) -> int:
    """Сохраняет изображение в базу и возвращает его id (файлы переживают перезапуск контейнера)"""
    safe_ctype = validate_image(file)  # content-type определяется по содержимому, не по заголовку клиента
    data = file.file.read()
    stored = StoredFile(
        filename=file.filename or "image",
        content_type=safe_ctype,
        data=data
    )
    db.add(stored)
    db.commit()
    return stored.id

@app.get("/files/{file_id}")
def get_file(file_id: int, db: Session = Depends(get_db)):
    stored = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if not stored:
        raise HTTPException(404, "Файл не найден")
    # nosniff + attachment-safe: не даём браузеру интерпретировать файл как HTML/скрипт
    return FastResponse(
        content=stored.data,
        media_type=stored.content_type,
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'"}
    )

@app.post("/upload/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...), token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Upload user avatar"""
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))

    user = db.query(User).filter(User.id == user_id).first()
    file_id = save_file_to_db(db, file)
    url = public_file_url(request, f"files/{file_id}")
    user.avatar = url
    db.commit()

    return {"message": "Avatar uploaded", "url": url}

@app.post("/upload/portfolio")
async def upload_portfolio(request: Request, file: UploadFile = File(...), token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Upload portfolio image for specialist"""
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))

    user = db.query(User).filter(User.id == user_id).first()
    if user.role != UserRole.specialist:
        raise HTTPException(403, "Only specialists can upload portfolio")

    file_id = save_file_to_db(db, file)
    url = public_file_url(request, f"files/{file_id}")

    # Add to portfolio JSON array
    import json as json_lib
    portfolio = json_lib.loads(user.portfolio) if user.portfolio else []
    portfolio.append(url)
    user.portfolio = json_lib.dumps(portfolio)
    db.commit()

    return {"message": "Portfolio image uploaded", "url": url}

@app.post("/upload/task-image")
async def upload_task_image(request: Request, file: UploadFile = File(...), token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Upload task image (returns URL to include in task creation)"""
    payload = decode_token_or_401(token)

    file_id = save_file_to_db(db, file)
    return {"message": "Task image uploaded", "url": public_file_url(request, f"files/{file_id}")}

def decode_token_or_401(token: str):
    """Декодирует JWT; при истёкшем/невалидном токене возвращает 401 вместо 500"""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Сессия истекла, войдите снова")

@app.get("/notifications")
def get_notifications(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Get all notifications for current user"""
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))
    notifications = db.query(Notification).filter(
        Notification.user_id == user_id
    ).order_by(Notification.id.desc()).limit(50).all()
    return notifications

@app.get("/notifications/unread-count")
def get_unread_count(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Get count of unread notifications"""
    payload = decode_token_or_401(token)
    user_id = int(payload.get("sub"))
    count = db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.is_read == False
    ).count()
    return {"count": count}

@app.put("/notifications/read-all")
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

@app.put("/notifications/{notification_id}/read")
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

@app.get("/cities")
def get_cities():
    """Get list of popular cities"""
    return [
        "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург",
        "Казань", "Нижний Новгород", "Челябинск", "Самара",
        "Омск", "Ростов-на-Дону", "Уфа", "Красноярск",
        "Воронеж", "Пермь", "Волгоград", "Краснодар"
    ]

# ==========================================
# 🤖 1. AI-ПОМОЩНИК И УМНЫЙ КАЛЬКУЛЯТОР ЦЕН
# ==========================================

class AIParseRequest(BaseModel):
    prompt: str

class AIEstimateRequest(BaseModel):
    category: str
    title: Optional[str] = ""
    is_remote: Optional[bool] = False

class AIEnhanceProfileRequest(BaseModel):
    name: Optional[str] = ""
    skills: Optional[list[str]] = []
    experience_years: Optional[int] = 3
    category: Optional[str] = "repairs"

# Базовые ценовые ориентиры рынка для категорий (в рублях)
CATEGORY_PRICE_RANGES = {
    "repairs": {"min": 1500, "max": 8000, "recommended": 3000, "label": "Ремонт и сантехника"},
    "cleaning": {"min": 1200, "max": 6000, "recommended": 2500, "label": "Уборка и клининг"},
    "development": {"min": 5000, "max": 60000, "recommended": 18000, "label": "Разработка ПО и сайтов"},
    "design": {"min": 2500, "max": 25000, "recommended": 7000, "label": "Дизайн и графика"},
    "writing": {"min": 800, "max": 7000, "recommended": 2000, "label": "Копирайтинг и переводы"},
    "delivery": {"min": 600, "max": 3500, "recommended": 1200, "label": "Курьерская доставка"},
    "photo_video": {"min": 3000, "max": 20000, "recommended": 6500, "label": "Фото и видеосъёмка"},
    "tutoring": {"min": 1000, "max": 4000, "recommended": 1800, "label": "Обучение и репетиторы"},
    "beauty": {"min": 1500, "max": 7000, "recommended": 3000, "label": "Красота и здоровье"},
    "events": {"min": 4000, "max": 35000, "recommended": 12000, "label": "Организация мероприятий"},
    "business": {"min": 3000, "max": 30000, "recommended": 8000, "label": "Консалтинг и бизнес"},
    "other": {"min": 1000, "max": 10000, "recommended": 2500, "label": "Другие услуги"}
}

@app.post("/ai/parse-task")
def ai_parse_task(req: AIParseRequest):
    """
    Интеллектуальный NLP-разбор произвольного текста заказчика в структурированное ТЗ.
    Определяет категорию, формирует название, чек-лист описания, город и рекомендованную цену.
    """
    raw = (req.prompt or "").strip()
    if not raw:
        raise HTTPException(400, "Текст задания не может быть пустым")

    lower = raw.lower()
    
    # 1. Определение категории
    detected_cat = "other"
    if any(k in lower for k in ["ремонт", "сантехник", "кран", "труб", "электрик", "плитк", "замок", "дверь", "обои", "починить", "установить", "люстр"]):
        detected_cat = "repairs"
    elif any(k in lower for k in ["уборк", "клининг", "помыть", "окна", "генеральн", "пылесос", "вымыть"]):
        detected_cat = "cleaning"
    elif any(k in lower for k in ["сайт", "разработк", "код", "программ", "бот", "telegram", "frontend", "backend", "python", "react", "скрипт", "баг", "верстк"]):
        detected_cat = "development"
    elif any(k in lower for k in ["дизайн", "логотип", "баннер", "figma", "иллюстрац", "макет", "оформлен", "фотошоп"]):
        detected_cat = "design"
    elif any(k in lower for k in ["текст", "стать", "копирайт", "перевод", "рерайт", "пост", "эссе", "диплом"]):
        detected_cat = "writing"
    elif any(k in lower for k in ["доставк", "курьер", "отвезти", "забрать", "привезти", "посылк", "груз"]):
        detected_cat = "delivery"
    elif any(k in lower for k in ["фото", "видео", "монтаж", "съемк", "рилс", "reels", "клип", "свадебн"]):
        detected_cat = "photo_video"
    elif any(k in lower for k in ["репетитор", "урок", "английск", "математик", "подготовк", "егэ", "обучен"]):
        detected_cat = "tutoring"
    elif any(k in lower for k in ["макияж", "маникюр", "прическ", "массаж", "ресниц", "стрижк", "бров"]):
        detected_cat = "beauty"
    elif any(k in lower for k in ["праздник", "ведущ", "свадьб", "день рожден", "аниматор", "dj", "звук"]):
        detected_cat = "events"
    elif any(k in lower for k in ["бухгалтер", "юрист", "бизнес", "договор", "налог", "аудит", "консультац"]):
        detected_cat = "business"

    # 2. Определение удаленного формата
    is_remote = False
    if any(k in lower for k in ["удален", "онлайн", "дистанцион", "remote", "по интернету"]):
        is_remote = True
    elif detected_cat in ["development", "design", "writing"]:
        # По умолчанию IT/дизайн/тексты считаем удаленными, если не указан город явно
        is_remote = True

    # 3. Определение города
    found_city = None
    popular_cities = [
        "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург",
        "Казань", "Нижний Новгород", "Челябинск", "Самара",
        "Омск", "Ростов-на-Дону", "Уфа", "Красноярск",
        "Воронеж", "Пермь", "Волгоград", "Краснодар", "Сочи"
    ]
    for c in popular_cities:
        if c.lower() in lower:
            found_city = c
            is_remote = False
            break

    # 4. Формирование четкого заголовка
    first_sentence = raw.split("\n")[0].split(".")[0].strip()
    if len(first_sentence) > 70:
        words = first_sentence.split()
        title = " ".join(words[:8]) + "..."
    else:
        title = first_sentence.capitalize()

    # 5. Генерация красивого ТЗ и чек-листа
    description_blocks = [
        f"📋 Описание задачи:\n{raw}\n",
        "🎯 Ожидаемый результат:",
        "• Качественное и аккуратное выполнение работы",
        "• Соблюдение согласованных сроков и бюджета",
        "• Фотоотчёт или демонстрация результата после завершения"
    ]
    structured_description = "\n".join(description_blocks)

    # 6. Расчет рекомендуемого бюджета
    price_info = CATEGORY_PRICE_RANGES.get(detected_cat, CATEGORY_PRICE_RANGES["other"])
    
    # Попытка извлечь число из текста, если заказчик сам назвал бюджет
    import re
    numbers = [int(n) for n in re.findall(r'\b\d{3,6}\b', raw)]
    recommended_budget = price_info["recommended"]
    if numbers:
        # Если есть число больше 500 рублей, считаем его бюджетом заказчика
        valid_nums = [n for n in numbers if 500 <= n <= 200000]
        if valid_nums:
            recommended_budget = valid_nums[0]

    return {
        "title": title,
        "description": structured_description,
        "category": detected_cat,
        "city": found_city or ("" if is_remote else "Москва"),
        "is_remote": is_remote,
        "estimated_min_price": price_info["min"],
        "estimated_max_price": price_info["max"],
        "recommended_budget": recommended_budget,
        "explanation": f"Ориентир для категории «{price_info['label']}»: от {price_info['min']} до {price_info['max']} ₽ (в среднем {price_info['recommended']} ₽)"
    }

@app.post("/ai/estimate-price")
def ai_estimate_price(req: AIEstimateRequest):
    """Возвращает рыночную оценку стоимости и диапазон цен"""
    cat = req.category if req.category in CATEGORY_PRICE_RANGES else "other"
    info = CATEGORY_PRICE_RANGES[cat]
    return {
        "min_price": info["min"],
        "max_price": info["max"],
        "recommended_budget": info["recommended"],
        "category_label": info["label"],
        "tip": f"Средний чек по рынку: {info['recommended']} ₽. Заказы с адекватным бюджетом получают отклики мастеров в 3 раза быстрее."
    }

@app.post("/ai/enhance-profile")
def ai_enhance_profile(req: AIEnhanceProfileRequest):
    """Генерирует продающее описание профиля мастера и подбирает список навыков"""
    cat = req.category or "repairs"
    cat_label = CATEGORIES.get(cat, "Услуги")
    years = req.experience_years or 3
    
    skills_map = {
        "repairs": ["Сантехника", "Электрика", "Сборка мебели", "Мелкий бытовой ремонт", "Инструмент в наличии", "Гарантия на работу"],
        "cleaning": ["Генеральная уборка", "Поддерживающая уборка", "Мойка окон", "Химчистка", "Безопасная химия", "Пунктуальность"],
        "development": ["Python", "FastAPI", "React", "TypeScript", "Telegram Bots", "PostgreSQL", "Docker", "API Integration"],
        "design": ["Figma", "UI/UX", "Логотипы", "Фирменный стиль", "Баннеры", "Photoshop", "Illustrator"],
        "writing": ["Копирайтинг", "SEO-тексты", "Рерайтинг", "Статьи для блогов", "Грамотность", "Соблюдение дедлайнов"],
        "delivery": ["Пеший курьер", "На авто", "Быстрая доставка", "Ответственность", "Пунктуальность"],
        "photo_video": ["Портретная съемка", "Репортаж", "Монтаж Reels", "Цветокоррекция", "Sony/Canon", "Студийный свет"],
        "tutoring": ["Индивидуальный подход", "Подготовка к экзаменам", "Понятное объяснение", "Интерактивные уроки"],
        "beauty": ["Мастер с сертификатом", "Стерильный инструмент", "Премиум материалы", "Индивидуальный стиль"],
        "events": ["Ведущий", "DJ с оборудованием", "Написание сценария", "Конкурсы без пошлости", "Энергичная подача"],
        "business": ["Юридический анализ", "Бухгалтерский учёт", "Оптимизация налогов", "Составление договоров"],
        "other": ["Качественное исполнение", "Ответственный подход", "Работа на результат"]
    }

    suggested_skills = skills_map.get(cat, skills_map["other"])
    bio = (
        f"Профессиональный исполнитель в категории «{cat_label}». Опыт работы более {years} лет.\n\n"
        f"✅ Пунктуален, всегда на связи и соблюдаю оговоренные сроки.\n"
        f"✅ Работаю на совесть и предоставляю гарантию на выполненную работу.\n"
        f"✅ Полный комплект необходимого оборудования и материалов."
    )

    return {
        "bio": bio,
        "suggested_skills": suggested_skills
    }

# ==========================================
# 🎮 2. ГЕЙМИФИКАЦИЯ: УРОВНИ И БЕЙДЖИ
# ==========================================

@app.get("/specialists/{user_id}/gamification")
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
