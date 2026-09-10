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

@router.get("/files/{file_id}")

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


@router.post("/upload/avatar")

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


@router.post("/upload/portfolio")

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


@router.post("/upload/task-image")

async def upload_task_image(request: Request, file: UploadFile = File(...), token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):

    """Upload task image (returns URL to include in task creation)"""

    payload = decode_token_or_401(token)



    file_id = save_file_to_db(db, file)

    return {"message": "Task image uploaded", "url": public_file_url(request, f"files/{file_id}")}

