"""Pydantic-схемы (вынесено из main.py)."""
from pydantic import BaseModel, EmailStr, field_validator, Field
from typing import Optional, List
from app.models import UserRole, TaskCategory, TaskStatus

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
    budget: Optional[int] = Field(None, ge=0)  # <-- фикс: бюджет не может быть отрицательным
    category: TaskCategory = TaskCategory.other
    city: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    deadline: Optional[str] = None
    is_remote: bool = False
    images: Optional[str] = None

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

class TaskImagesDeleteRequest(BaseModel):
    urls_to_delete: List[str]

class BuyPackageRequest(BaseModel):
    package_id: str

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
