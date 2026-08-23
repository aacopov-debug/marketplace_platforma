from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File, Request
from fastapi.responses import Response as FastResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import json
import asyncio
from enum import Enum as PyEnum
from pydantic import BaseModel, EmailStr
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

SECRET_KEY = os.environ.get("SECRET_KEY", "marketplace_super_secret")
ALGORITHM = "HS256"
DB_URL = os.environ.get("DATABASE_URL", "sqlite:///./marketplace_v3.db")
# Render/Heroku отдают postgres:// — SQLAlchemy 2 требует явный драйвер
if DB_URL.startswith("postgres://"):
    DB_URL = DB_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DB_URL.startswith("postgresql://"):
    DB_URL = DB_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
connect_args = {"check_same_thread": False} if "sqlite" in DB_URL else {}
engine = create_engine(DB_URL, connect_args=connect_args, pool_pre_ping=True)
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
    migrations = [
        "ALTER TABLE users ADD COLUMN last_seen VARCHAR",
        "ALTER TABLE reviews ADD COLUMN target VARCHAR DEFAULT 'specialist'",
    ]
    with engine.connect() as conn:
        for m in migrations:
            try:
                conn.execute(text(m))
                conn.commit()
            except Exception:
                conn.rollback()  # колонка уже существует

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
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

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
    rating: int
    comment: str = ""

# Routes
@app.post("/register/")
def register(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(400, "Email занят")
    new_user = User(email=user.email, hashed_password=hash_password(user.password), role=user.role, name=user.name)
    db.add(new_user)
    db.commit()
    return {"message": "Успех", "user_id": new_user.id}

@app.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
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
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
        "completed_tasks": completed_tasks
    }

@app.put("/users/me")
def update_profile(profile: ProfileUpdate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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

@app.post("/wallet/deposit")
def deposit_funds(req: DepositRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    if req.amount <= 0:
        raise HTTPException(400, "Сумма должна быть больше 0")

    user.balance += req.amount
    tx = Transaction(user_id=user.id, amount=req.amount, type=TransactionType.deposit)
    db.add(tx)
    db.commit()
    return {"message": "Баланс пополнен", "new_balance": user.balance}

@app.get("/payments/status")
def payments_status():
    """Check if real payment provider (YooKassa) is configured"""
    return {"configured": payments.is_configured()}

@app.post("/payments/create")
def create_payment(req: DepositRequest, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Create a YooKassa payment and return the confirmation URL to redirect the user."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("role") != "specialist":
        raise HTTPException(403, "Только для специалистов")
    new_response = Response(
        task_id=task_id,
        specialist_id=int(payload.get("sub")),
        text=response.text,
        proposed_price=response.proposed_price,
        estimated_days=response.estimated_days
    )
    db.add(new_response)

    # Notify customer about new response
    task = db.query(Task).filter(Task.id == task_id).first()
    specialist = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if task:
        db.add(Notification(
            user_id=task.customer_id,
            type="new_response",
            title="Новый отклик на заказ!",
            text=f"{specialist.name or specialist.email} откликнулся на задачу \"{task.title}\"" + (f" — {response.proposed_price} ₽" if response.proposed_price else ""),
            task_id=task_id
        ))
    db.commit()
    return {"message": "Отклик отправлен", "response_id": new_response.id}

@app.get("/tasks/{task_id}/responses")
def get_task_responses(task_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
            "proposed_price": r.proposed_price,
            "estimated_days": r.estimated_days
        })
    return result

@app.post("/tasks/{task_id}/review")
def create_review(task_id: int, review: ReviewCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    validate_image(file)
    data = file.file.read()
    stored = StoredFile(
        filename=file.filename or "image",
        content_type=file.content_type or "image/jpeg",
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
    return FastResponse(content=stored.data, media_type=stored.content_type)

@app.post("/upload/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...), token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Upload user avatar"""
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
