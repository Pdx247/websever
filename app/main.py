import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.auth import get_password_hash
from app.database import Base, SessionLocal, engine
from app.models import SystemConfig, User
from app.routers import admin, auth, chat

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="Legal AI Assistant", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(admin.router)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/healthz", include_in_schema=False)
def healthz():
    return {"status": "ok"}


def _ensure_config(db, key: str, value: str):
    item = db.get(SystemConfig, key)
    if item is None:
        db.add(SystemConfig(key=key, value=value))


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    default_admin_username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
    default_admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123")
    default_model = os.getenv("DEFAULT_OPENAI_MODEL", "gpt-4o-mini")
    default_base_url = os.getenv("DEFAULT_OPENAI_BASE_URL", "https://api.openai.com/v1")
    default_api_key = os.getenv("DEFAULT_OPENAI_API_KEY", "")

    with SessionLocal() as db:
        admin_user = db.scalar(
            select(User).where(User.username == default_admin_username)
        )
        if admin_user is None:
            admin_user = User(
                username=default_admin_username,
                password_hash=get_password_hash(default_admin_password),
                role="admin",
            )
            db.add(admin_user)

        _ensure_config(db, "openai_api_key", default_api_key)
        _ensure_config(db, "openai_base_url", default_base_url)
        _ensure_config(db, "openai_model", default_model)

        db.commit()
