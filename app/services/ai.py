from collections.abc import AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session

from app.models import Message, SystemConfig

SYSTEM_PROMPT = (
    "You are a legal AI assistant. Answer in Chinese, structure answers clearly, and cite legal "
    "principles in plain language. If legal risk is high, suggest consulting a licensed lawyer. "
    "Do not fabricate statutes or case names."
)


def _get_config(db: Session, key: str, default: str = "") -> str:
    row = db.get(SystemConfig, key)
    if not row:
        return default
    return row.value or default


def _normalize_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(str(text))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content)


def _build_messages(history_messages: list[Message]):
    messages = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in history_messages:
        if msg.role == "user":
            messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            messages.append(AIMessage(content=msg.content))
    return messages


def _build_llm(db: Session, streaming: bool = False) -> ChatOpenAI:
    api_key = _get_config(db, "openai_api_key", "").strip()
    base_url = _get_config(db, "openai_base_url", "").strip() or None
    model = _get_config(db, "openai_model", "gpt-4o-mini").strip() or "gpt-4o-mini"

    if not api_key:
        raise RuntimeError("OpenAI API key 为空，请先在管理员设置中配置。")

    return ChatOpenAI(
        api_key=api_key,
        base_url=base_url,
        model=model,
        temperature=0.2,
        streaming=streaming,
    )


def generate_legal_reply(db: Session, history_messages: list[Message]) -> str:
    llm = _build_llm(db, streaming=False)
    messages = _build_messages(history_messages)
    response = llm.invoke(messages)
    content = _normalize_content(response.content).strip()
    return content or "抱歉，我暂时无法生成有效回答。"


async def stream_legal_reply(db: Session, history_messages: list[Message]) -> AsyncIterator[str]:
    llm = _build_llm(db, streaming=True)
    messages = _build_messages(history_messages)

    async for chunk in llm.astream(messages):
        piece = _normalize_content(chunk.content)
        if piece:
            yield piece
