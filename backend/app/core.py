"""Core: конфигурация, движок БД, сессии, безопасность, rate-limit. Извлечено из main.py."""
import os
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import bcrypt
from jose import JWTError, jwt
from fastapi import HTTPException, Request
from fastapi.security import OAuth2PasswordBearer

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



def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()



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

