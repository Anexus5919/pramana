"""Tables for the scrutiny outcome and the re-verification watch. Registered by db.init_db."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..models import UTCDateTime, new_id, utcnow


class ScrutinyOutcome(Base):
    """An official's recorded scrutiny outcome. Pramana records it; it never makes it."""

    __tablename__ = "scrutiny_outcomes"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("out"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    round: Mapped[int] = mapped_column(Integer, default=1)
    outcome: Mapped[str] = mapped_column(String(40))
    reason: Mapped[str] = mapped_column(Text)
    run_id: Mapped[str | None] = mapped_column(String(40))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class WatchItem(Base):
    """One issuer-verified certificate kept under watch after a scrutiny outcome."""

    __tablename__ = "watch_items"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("wat"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    outcome_id: Mapped[str] = mapped_column(ForeignKey("scrutiny_outcomes.id"), index=True)
    document_id: Mapped[str | None] = mapped_column(String(40))
    declared_type: Mapped[str] = mapped_column(String(60))
    label: Mapped[str] = mapped_column(String(200))
    issuer_code: Mapped[str] = mapped_column(String(60))
    issuer_name: Mapped[str] = mapped_column(String(200))
    ref_no: Mapped[str] = mapped_column(String(120))
    valid_until: Mapped[str | None] = mapped_column(String(10))
    baseline: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    # ok, revoked, suspended, expired, not_found, source_unavailable
    state: Mapped[str] = mapped_column(String(30), default="ok")
    detail: Mapped[str | None] = mapped_column(Text)
    last_checked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class WatchEvent(Base):
    """A change the watch observed. Negative changes also raise a finding and a dashboard alert."""

    __tablename__ = "watch_events"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("wev"))
    item_id: Mapped[str] = mapped_column(ForeignKey("watch_items.id"), index=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(String(40))
    change: Mapped[str] = mapped_column(String(30))
    previous_state: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(20))
    detail: Mapped[str] = mapped_column(Text)
    response: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    finding_id: Mapped[str | None] = mapped_column(String(40))
    open: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class WatchRun(Base):
    """One pass of the watch over every active item, by the scheduler or on demand."""

    __tablename__ = "watch_runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("wrn"))
    trigger: Mapped[str] = mapped_column(String(30))
    actor: Mapped[str] = mapped_column(String(80))
    checked: Mapped[int] = mapped_column(Integer, default=0)
    changes: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
