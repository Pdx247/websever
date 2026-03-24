from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import SystemConfig, User
from app.schemas import AdminConfigOut, AdminConfigUpdate

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _read_config(db: Session, key: str, default: str = "") -> str:
    row = db.get(SystemConfig, key)
    if not row:
        return default
    return row.value or default


def _upsert_config(db: Session, key: str, value: str):
    row = db.get(SystemConfig, key)
    now = datetime.now(timezone.utc)
    if row:
        row.value = value
        row.updated_at = now
    else:
        db.add(SystemConfig(key=key, value=value, updated_at=now))


@router.get("/config", response_model=AdminConfigOut)
def get_config(
    db: Annotated[Session, Depends(get_db)],
    _admin: Annotated[User, Depends(require_admin)],
):
    return AdminConfigOut(
        api_key=_read_config(db, "openai_api_key", ""),
        base_url=_read_config(db, "openai_base_url", "https://api.openai.com/v1"),
        model=_read_config(db, "openai_model", "gpt-4o-mini"),
    )


@router.put("/config", response_model=AdminConfigOut)
def update_config(
    payload: AdminConfigUpdate,
    db: Annotated[Session, Depends(get_db)],
    _admin: Annotated[User, Depends(require_admin)],
):
    _upsert_config(db, "openai_api_key", payload.api_key.strip())
    _upsert_config(db, "openai_base_url", payload.base_url.strip())
    _upsert_config(db, "openai_model", payload.model.strip() or "gpt-4o-mini")
    db.commit()

    return AdminConfigOut(
        api_key=_read_config(db, "openai_api_key", ""),
        base_url=_read_config(db, "openai_base_url", "https://api.openai.com/v1"),
        model=_read_config(db, "openai_model", "gpt-4o-mini"),
    )
