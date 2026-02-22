from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
import json
from enum import Enum as PyEnum
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, Column, Integer, String, Enum as SqlaEnum
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import os
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta

SECRET_KEY = os.environ.get("SECRET_KEY", "marketplace_super_secret")
ALGORITHM = "HS256"
DB_URL = os.environ.get("DATABASE_URL", "sqlite:///./marketplace_v2.db")
connect_args = {"check_same_thread": False} if "sqlite" in DB_URL else {}
engine = create_engine(DB_URL, connect_args=connect_args)
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

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    amount = Column(Integer)
    type = Column(SqlaEnum(TransactionType))
    task_id = Column(Integer, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

class Response(Base):
    __tablename__ = "responses"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, index=True)
    specialist_id = Column(Integer)
    text = Column(String)

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

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, index=True)
    sender_id = Column(Integer)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, index=True)
    reviewer_id = Column(Integer)
    specialist_id = Column(Integer, index=True)
    rating = Column(Integer)
    comment = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

app = FastAPI(title="ProfiClone API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class ConnectionManager:
    def __init__(self):
        # task_id -> list of active websockets
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, task_id: int):
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

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: UserRole

class TaskCreate(BaseModel):
    title: str
    description: str
    budget: int = None
    category: TaskCategory = TaskCategory.other

class TaskOut(TaskCreate):
    id: int
    customer_id: int
    executor_id: int | None = None
    status: str

class MessageCreate(BaseModel):
    text: str

class MessageOut(BaseModel):
    id: int
    task_id: int
    sender_id: int
    text: str
    created_at: str
    sender_name: str | None = None

@app.post("/register/")
def register(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(400, "Email занят")
    new_user = User(email=user.email, hashed_password=hash_password(user.password), role=user.role)
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

@app.post("/tasks/")
def create_task(task: TaskCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("role") != "customer":
        raise HTTPException(403, "Только для заказчиков")
    new_task = Task(title=task.title, description=task.description, budget=task.budget, category=task.category, customer_id=int(payload.get("sub")))
    db.add(new_task)
    db.commit()
    return {"message": "Создано", "task_id": new_task.id}

@app.get("/tasks/")
def get_tasks(category: TaskCategory | None = None, search: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Task)
    if category:
        query = query.filter(Task.category == category)
    if search:
        query = query.filter(Task.title.ilike(f"%{search}%") | Task.description.ilike(f"%{search}%"))
    tasks = query.order_by(Task.id.desc()).all()
    return tasks

class ProfileUpdate(BaseModel):
    name: str = None
    bio: str = None

@app.get("/users/me")
def get_profile(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
        
    rating = None
    if user.role == UserRole.specialist:
        reviews = db.query(Review).filter(Review.specialist_id == user.id).all()
        if reviews:
            rating = round(sum(r.rating for r in reviews) / len(reviews), 1)
            
    return {"id": user.id, "email": user.email, "role": user.role, "name": user.name, "bio": user.bio, "rating": rating, "balance": user.balance}

@app.put("/users/me")
def update_profile(profile: ProfileUpdate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user = db.query(User).filter(User.id == int(payload.get("sub"))).first()
    if profile.name is not None:
        user.name = profile.name
    if profile.bio is not None:
        user.bio = profile.bio
    db.commit()
    return {"message": "Профиль обновлен"}

class DepositRequest(BaseModel):
    amount: int

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
            
    db.commit()
    return {"message": "Заказ завершен"}

class ResponseCreate(BaseModel):
    text: str

@app.post("/tasks/{task_id}/responses")
def create_response(task_id: int, response: ResponseCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("role") != "specialist":
        raise HTTPException(403, "Только для специалистов")
    new_response = Response(task_id=task_id, specialist_id=int(payload.get("sub")), text=response.text)
    db.add(new_response)
    db.commit()
    return {"message": "Отклик отправлен", "response_id": new_response.id}

@app.get("/tasks/{task_id}/responses")
def get_task_responses(task_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    # Very simple check: ensure task exists (ideally check if user owns it, but keeping it simple for MVP)
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")
    
    responses = db.query(Response).filter(Response.task_id == task_id).all()
    # Enrich with specialist information
    result = []
    for r in responses:
        spec = db.query(User).filter(User.id == r.specialist_id).first()
        rating = None
        if spec:
            reviews = db.query(Review).filter(Review.specialist_id == spec.id).all()
            if reviews:
                rating = round(sum(rev.rating for rev in reviews) / len(reviews), 1)
                
        result.append({
            "id": r.id,
            "text": r.text,
            "specialist_id": r.specialist_id,
            "specialist_name": spec.name if spec else "Аноним",
            "specialist_email": spec.email if spec else "",
            "specialist_rating": rating
        })
    return result

class ReviewCreate(BaseModel):
    rating: int
    comment: str = ""

@app.post("/tasks/{task_id}/review")
def create_review(task_id: int, review: ReviewCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    
    if role != "customer":
        raise HTTPException(403, "Только заказчики могут оставлять отзывы")
        
    task = db.query(Task).filter(Task.id == task_id, Task.customer_id == user_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден или вы не автор")
        
    if task.status != TaskStatus.completed:
        raise HTTPException(400, "Отзыв можно оставить только после завершения заказа")
        
    if not task.executor_id:
        raise HTTPException(400, "У заказа нет исполнителя")
        
    existing_review = db.query(Review).filter(Review.task_id == task_id).first()
    if existing_review:
        raise HTTPException(400, "Отзыв уже оставлен")
        
    new_review = Review(
        task_id=task_id,
        reviewer_id=user_id,
        specialist_id=task.executor_id,
        rating=review.rating,
        comment=review.comment
    )
    db.add(new_review)
    db.commit()
    return {"message": "Отзыв успешно добавлен"}

@app.post("/tasks/{task_id}/messages")
def send_message(task_id: int, message: MessageCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "Заказ не найден")
        
    if task.status != TaskStatus.in_progress:
        raise HTTPException(400, "Чат доступен только для заказов в работе")
        
    if role == "customer" and task.customer_id != user_id:
        raise HTTPException(403, "Нет доступа")
    if role == "specialist" and task.executor_id != user_id:
        raise HTTPException(403, "Нет доступа")
        
    new_msg = Message(task_id=task_id, sender_id=user_id, text=message.text)
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)
    
    sender = db.query(User).filter(User.id == user_id).first()
    sender_name = sender.name or sender.email if sender else "Unknown"
    
    # Broadcast asynchronously without blocking the REST response (in a real prod app, use background tasks or pubsub)
    import asyncio
    msg_data = {
        "id": new_msg.id,
        "task_id": new_msg.task_id,
        "sender_id": new_msg.sender_id,
        "text": new_msg.text,
        "created_at": new_msg.created_at,
        "sender_name": sender_name
    }
    
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(manager.broadcast(msg_data, task_id))
    except RuntimeError:
        # If no loop is running, just skip WebSocket broadcast (should not happen in uvicorn)
        pass

    return {"message": "Сообщение отправлено", "message_id": new_msg.id}

@app.websocket("/ws/tasks/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: int, token: str):
    # Authenticate via query parameter (token)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        role = payload.get("role")
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    db = SessionLocal()
    task = db.query(Task).filter(Task.id == task_id).first()
    
    if not task or task.status != TaskStatus.in_progress:
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
    
    await manager.connect(websocket, task_id)
    try:
        while True:
            # We don't strictly need to receive messages here if clients only use POST /messages,
            # but we can listen for pings or other meta-events.
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
