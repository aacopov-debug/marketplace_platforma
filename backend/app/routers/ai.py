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

@router.post("/ai/parse-task")

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


@router.post("/ai/estimate-price")

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


@router.post("/ai/enhance-profile")

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

