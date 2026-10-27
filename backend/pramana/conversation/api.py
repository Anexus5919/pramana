"""Endpoints for the correction-round conversation, the institution's outcome view and notifications."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import audit
from ..auth import OFFICIAL_ROLES, current_user, load_application, require_roles
from ..config import get_settings
from ..crypto import load_document
from ..db import get_db
from ..models import Application, RectificationRequest, User, utcnow
from . import threads as th
from .models import Notification, RectMessage, RectThread
from .notify import notification_json

router = APIRouter(prefix="/api", tags=["rectification conversation"])
POSTERS = ("institution", "officer", "admin")


def _thread(db: Session, user: User, thread_id: str) -> tuple[RectThread, Application]:
    t = db.get(RectThread, thread_id)
    if t is None:
        raise HTTPException(404, "thread not found")
    # Object-level check: another institution's thread is reported as missing
    return t, load_application(db, user, t.application_id)


def _round(db: Session, user: User, app: Application, rect: RectificationRequest) -> dict:
    if th.ensure_threads(db, rect):
        db.commit()
    return th.round_json(db, app, rect, user)


@router.get("/applications/{app_id}/rectification/threads")
def round_threads(app_id: str, rectification_id: str | None = None, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    """The threads of one correction round: the latest unless a round is named."""
    app = load_application(db, user, app_id)
    rs = th.rounds(db, app)
    if not rs:
        return {"application_id": app.id, "rounds": [], "round": None, "threads": [], "can_post": False,
                "can_set_status": False, "closed_reason": None,
                "counts": {"awaiting_reply": 0, "pending_reviews": 0, "pending_reviews_all_rounds": 0}}
    rect = next((r for r in rs if r.id == rectification_id), None) if rectification_id else rs[-1]
    if rect is None:
        raise HTTPException(404, "correction round not found")
    return _round(db, user, app, rect)


@router.post("/rectification-threads/{thread_id}/messages")
async def post_message(thread_id: str, body: str = Form(...), kind: str | None = Form(None),
                       file: UploadFile | None = File(None), user: User = Depends(require_roles(*POSTERS)),
                       db: Session = Depends(get_db)):
    """Institutions reply, ask or request a review; officers and administrators reply as the AICTE Scrutiny Cell."""
    t, app = _thread(db, user, thread_id)
    attachment = None
    if file is not None and file.filename:
        limit = get_settings().max_upload_mb * 1024 * 1024
        attachment = (file.filename, await file.read(limit + 1))
    m = th.post_message(db, user, app, t, kind, body, attachment)
    db.commit()
    out = _round(db, user, app, db.get(RectificationRequest, t.rectification_id))
    return {"message_id": m.id, **out}


class StatusBody(BaseModel):
    status: str
    note: str = Field(min_length=1, max_length=1000)


@router.post("/rectification-threads/{thread_id}/status")
def set_status(thread_id: str, body: StatusBody, user: User = Depends(require_roles("officer", "admin")),
               db: Session = Depends(get_db)):
    """Mark an item resolved or still open, with a note the institution reads."""
    t, app = _thread(db, user, thread_id)
    th.set_status(db, user, app, t, body.status, body.note)
    db.commit()
    return _round(db, user, app, db.get(RectificationRequest, t.rectification_id))


@router.get("/rectification-messages/{message_id}/attachment")
def attachment(message_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(RectMessage, message_id)
    if m is None or not m.attachment_storage:
        raise HTTPException(404, "attachment not found")
    app = load_application(db, user, m.application_id)
    audit.record(db, actor=user.username, actor_role=user.role, action="rectification.attachment_downloaded",
                 object_type="rect_message", object_id=m.id, application_id=app.id,
                 details={"sha256": m.attachment_sha256})
    db.commit()
    return Response(load_document(m.attachment_storage), media_type=m.attachment_mime, headers={
        "Content-Disposition": f'attachment; filename="{m.attachment_name}"', "X-Content-Type-Options": "nosniff"})


@router.get("/rectification/awaiting")
def awaiting(user: User = Depends(require_roles(*OFFICIAL_ROLES)), db: Session = Depends(get_db)):
    """Threads waiting for the cell, for the review queue. Loading the queue also raises due-date reminders."""
    if th.deadline_sweep(db):
        db.commit()
    return th.awaiting(db)


@router.get("/applications/{app_id}/outcome")
def outcome(app_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    return {"application_id": app.id, "outcome": th.outcome_view(db, app, official=user.role != "institution")}


# ------------------------------------------------------------------ notifications


@router.get("/notifications")
def notifications(limit: int = 20, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The signed-in user's recent notifications. An institution's first load also raises due-date reminders."""
    if user.role == "institution" and th.deadline_sweep(db, user.institution_id):
        db.commit()
    mine = select(Notification).where(Notification.user_id == user.id)
    rows = db.scalars(mine.order_by(Notification.created_at.desc()).limit(max(1, min(limit, 50)))).all()
    unread = db.scalar(select(func.count()).select_from(Notification)
                       .where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    return {"unread": unread or 0, "items": [notification_json(n) for n in rows]}


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "notification not found")
    if n.read_at is None:
        n.read_at = utcnow()
        db.commit()
    return notification_json(n)


@router.post("/notifications/read-all")
def mark_all_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    res = db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
                     .values(read_at=utcnow()))
    db.commit()
    return {"marked": res.rowcount or 0}
