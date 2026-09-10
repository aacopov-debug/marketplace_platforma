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

@router.post("/tasks/")

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


@router.get("/tasks/")

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


@router.get("/tasks/{task_id}")

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


@router.delete("/tasks/{task_id}/images")

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


@router.put("/tasks/{task_id}/assign")

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

    if task.budget is not None and task.budget <= 0:  # <-- фикс: защита от отрицательного бюджета (эмиссия денег)

        raise HTTPException(400, "Бюджет заказа должен быть положительным числом")

    if budget < 0:

        raise HTTPException(400, "Бюджет заказа не может быть отрицательным")

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


@router.put("/tasks/{task_id}/complete")

def complete_task(task_id: int, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    payload = decode_token_or_401(token)

    customer_id = int(payload.get("sub"))

    task = db.query(Task).filter(Task.id == task_id, Task.customer_id == customer_id).first()

    if not task:

        raise HTTPException(404, "Заказ не найден или вы не его автор")



    if task.status == TaskStatus.completed:  # <-- фикс: идемпотентность — не платить дважды

        return {"message": "Заказ уже завершен", "already_completed": True}



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


@router.post("/tasks/{task_id}/responses")

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


@router.get("/tasks/{task_id}/responses")

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

            # <-- фикс: email убираем из публичных ответов

            "specialist_rating": rating,

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


@router.post("/tasks/{task_id}/review")

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


@router.websocket("/ws/tasks/{task_id}")

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


@router.get("/tasks/{task_id}/messages")

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


@router.post("/tasks/{task_id}/messages")

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

