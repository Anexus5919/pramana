"""Drishti's API: POST /api/drishti/ask and GET /api/drishti/suggestions, for signed-in users only."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import audit
from ..auth import current_user
from ..db import get_db
from ..models import User
from ..ratelimit import limit
from . import engine, replies
from .model_prompt import MAX_MESSAGE_CHARS

router = APIRouter(prefix="/api/drishti", tags=["drishti"])
PER_MINUTE = 30


class AskContext(BaseModel):
    path: str | None = Field(default=None, max_length=300)
    application_id: str | None = Field(default=None, max_length=40)


class AskBody(BaseModel):
    message: str = Field(max_length=MAX_MESSAGE_CHARS)
    conversation_id: str | None = Field(default=None, max_length=40)
    context: AskContext | None = None


@router.post("/ask")
def ask(body: AskBody, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    if not body.message.strip():
        raise HTTPException(422, "message is empty")
    limit(f"drishti:{user.id}", PER_MINUTE, 60)
    out = engine.ask(db, user, body.message, body.conversation_id,
                     body.context.model_dump() if body.context else None)
    # The intent, count and source are recorded; the message text is not
    audit.record(db, actor=user.username, actor_role=user.role, action="drishti.query", object_type="assistant",
                 object_id=out.conversation_id, application_id=out.application_id, details=out.audit)
    db.commit()
    return {"conversation_id": out.conversation_id, "reply": out.reply}


@router.get("/suggestions")
def suggestions(lang: str = "en", user: User = Depends(current_user)) -> dict[str, Any]:
    """Role-specific starter chips and the greeting the window shows when it first opens."""
    lang = lang if lang in ("en", "hi", "hinglish") else "en"
    res = engine.execute.Result("greeting", "greeting", {"name": user.display_name})
    return {"language": lang, "greeting": replies.text(res, user.role, lang),
            "suggestions": replies.starters(user.role, lang)}
