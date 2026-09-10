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

@router.get("/cities")

def get_cities():

    """Get list of popular cities"""

    return [

        "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург",

        "Казань", "Нижний Новгород", "Челябинск", "Самара",

        "Омск", "Ростов-на-Дону", "Уфа", "Красноярск",

        "Воронеж", "Пермь", "Волгоград", "Краснодар"

    ]

