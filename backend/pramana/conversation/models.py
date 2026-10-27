"""Tables for the correction-round conversation and notifications. Registered by db.init_db."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..models import UTCDateTime, new_id, utcnow


class RectThread(Base):
    """One conversation per deficiency-letter item (item_no 1 to n) and one general thread (item_no 0) per round."""

    __tablename__ = "rect_threads"
    __table_args__ = (UniqueConstraint("rectification_id", "item_no"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("thr"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    rectification_id: Mapped[str] = mapped_column(ForeignKey("rectification_requests.id"), index=True)
    item_no: Mapped[int] = mapped_column(Integer)
    # The item's title as the institution reads it, kept so a thread stays readable if the letter changes
    title: Mapped[str] = mapped_column(String(300))
    # open, responded, resolved, still_open, review_requested; the general thread stays open
    status: Mapped[str] = mapped_column(String(20), default="open")
    status_note: Mapped[str | None] = mapped_column(Text)
    status_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    status_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_activity_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class RectMessage(Base):
    """A message in a thread. The text lives here; the audit chain records its id, kind and digest."""

    __tablename__ = "rect_messages"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("msg"))
    thread_id: Mapped[str] = mapped_column(ForeignKey("rect_threads.id"), index=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    # institution or cell
    side: Mapped[str] = mapped_column(String(20))
    # Kept for officials and the audit trail; a cell author is never shown to the institution
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    # reply, question, review_request (institution) or cell_reply
    kind: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    # One optional PDF, JPG or PNG, stored with the document envelope encryption and never analysed
    attachment_name: Mapped[str | None] = mapped_column(String(160))
    attachment_mime: Mapped[str | None] = mapped_column(String(40))
    attachment_size: Mapped[int | None] = mapped_column(Integer)
    attachment_sha256: Mapped[str | None] = mapped_column(String(64))
    attachment_storage: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class RectStatusChange(Base):
    """A change of an item's status: set by an official with a note, or moved by an institution's message."""

    __tablename__ = "rect_status_changes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("rsc"))
    thread_id: Mapped[str] = mapped_column(ForeignKey("rect_threads.id"), index=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    side: Mapped[str] = mapped_column(String(20))
    from_status: Mapped[str] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    # The institution's message that moved the status, when a message did
    message_id: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Notification(Base):
    """One in-app notification for one user. Rows are written by the in-app channel (conversation.notify)."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ntf"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    # institution (an institution's users) or cell (officer and admin users)
    audience: Mapped[str] = mapped_column(String(20))
    event: Mapped[str] = mapped_column(String(40))
    # Template key and parameters, the same ones an email channel renders
    template: Mapped[str] = mapped_column(String(60))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(500), default="")
    link: Mapped[str] = mapped_column(String(300))
    application_id: Mapped[str | None] = mapped_column(String(40), index=True)
    thread_id: Mapped[str | None] = mapped_column(String(40))
    # Reminders are created once: the same key is never written twice
    dedupe_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
