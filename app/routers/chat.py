import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Conversation, Message, User
from app.schemas import ChatReply, ConversationOut, MessageCreate, MessageOut
from app.services.ai import generate_legal_reply, stream_legal_reply

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _get_owned_conversation(db: Session, conversation_id: int, user_id: int) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    rows = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
    ).all()
    return rows


@router.post("/conversations", response_model=ConversationOut)
def create_conversation(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    count = db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.user_id == current_user.id)
    )
    if (count or 0) >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="最多只能创建 3 个对话",
        )

    conversation = Conversation(user_id=current_user.id, title="新对话")
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    conversation = _get_owned_conversation(db, conversation_id, current_user.id)

    db.delete(conversation)
    db.commit()
    return {"ok": True}


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def list_messages(
    conversation_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    _get_owned_conversation(db, conversation_id, current_user.id)

    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    ).all()
    return messages


@router.post("/conversations/{conversation_id}/messages", response_model=ChatReply)
def send_message(
    conversation_id: int,
    payload: MessageCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    text = payload.content.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="消息不能为空")

    conversation = _get_owned_conversation(db, conversation_id, current_user.id)

    user_message = Message(conversation_id=conversation.id, role="user", content=text)
    db.add(user_message)

    if conversation.title in ("新对话", "New Chat"):
        conversation.title = text[:30]

    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user_message)

    history = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    ).all()

    try:
        assistant_text = generate_legal_reply(db, history)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM 调用失败: {exc}",
        )

    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=assistant_text,
    )
    conversation.updated_at = datetime.now(timezone.utc)
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)
    db.refresh(conversation)

    return ChatReply(
        conversation=conversation,
        user_message=user_message,
        assistant_message=assistant_message,
    )


@router.post("/conversations/{conversation_id}/messages/stream")
async def send_message_stream(
    conversation_id: int,
    payload: MessageCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    text = payload.content.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="消息不能为空")

    conversation = _get_owned_conversation(db, conversation_id, current_user.id)

    user_message = Message(conversation_id=conversation.id, role="user", content=text)
    db.add(user_message)

    if conversation.title in ("新对话", "New Chat"):
        conversation.title = text[:30]

    conversation.updated_at = datetime.now(timezone.utc)
    db.commit()

    history = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
    ).all()

    async def event_generator():
        parts: list[str] = []
        try:
            async for piece in stream_legal_reply(db, history):
                parts.append(piece)
                payload = json.dumps({"type": "token", "content": piece}, ensure_ascii=False)
                yield f"data: {payload}\n\n"

            assistant_text = "".join(parts).strip() or "抱歉，我暂时无法生成有效回答。"
            assistant_message = Message(
                conversation_id=conversation.id,
                role="assistant",
                content=assistant_text,
            )
            conversation.updated_at = datetime.now(timezone.utc)
            db.add(assistant_message)
            db.commit()

            done_payload = json.dumps({"type": "done"}, ensure_ascii=False)
            yield f"data: {done_payload}\n\n"
        except Exception as exc:
            db.rollback()
            error_payload = json.dumps(
                {"type": "error", "message": f"LLM 调用失败: {exc}"},
                ensure_ascii=False,
            )
            yield f"data: {error_payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
