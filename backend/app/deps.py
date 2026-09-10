"""Общие помощники: ConnectionManager, user_online, decode_token, uploads, константы монетизации."""
from fastapi import HTTPException, Request, UploadFile, File, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session
from datetime import datetime
from jose import JWTError, jwt
from app.core import SECRET_KEY, ALGORITHM, SessionLocal
from app.models import StoredFile, User
from file_utils import validate_image

def user_online(user) -> bool:
    """Онлайн = была активность за последние 2 минуты"""
    if not user.last_seen:
        return False
    try:
        return (datetime.utcnow() - datetime.fromisoformat(user.last_seen)).total_seconds() < 120
    except Exception:
        return False


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


DEMO_DEPOSIT_MAX = 100000  # верхняя граница демо-пополнения (₽)


MONETIZATION_PACKAGES = {
    "resp_10": {"type": "responses", "title": "10 откликов", "credits": 10, "price": 190},
    "resp_50": {"type": "responses", "title": "50 откликов", "credits": 50, "price": 790},
    "pro_1": {"type": "pro", "title": "PRO на 1 месяц", "days": 30, "price": 590},
    "pro_3": {"type": "pro", "title": "PRO на 3 месяца", "days": 90, "price": 1490},
    "pro_12": {"type": "pro", "title": "PRO на год", "days": 365, "price": 4900},
}


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


def decode_token_or_401(token: str):
    """Декодирует JWT; при истёкшем/невалидном токене возвращает 401 вместо 500"""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Сессия истекла, войдите снова")


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

manager = ConnectionManager()

CATEGORIES = {k: v["label"] for k, v in CATEGORY_PRICE_RANGES.items()}
