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

@router.get("/users/{user_id}/public")

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


@router.get("/users/{user_id}/reviews")

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


@router.get("/users/me")

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


@router.put("/users/me")

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

