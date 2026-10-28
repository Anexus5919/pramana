"""Tables for the Executive Committee handoff. Registered by db.init_db.

A report is written once and never changed: a later scrutiny outcome adds a new version, and forwarding is a
separate record that points at the version it concerns.
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint, event
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..models import UTCDateTime, new_id, utcnow


class EcReport(Base):
    """The scrutiny report prepared for the Executive Committee when an official records a scrutiny outcome."""

    __tablename__ = "ec_reports"
    __table_args__ = (UniqueConstraint("application_id", "version"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ecr"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    outcome_id: Mapped[str] = mapped_column(ForeignKey("scrutiny_outcomes.id"), unique=True)
    # 1 for the first outcome on the application, then one more for each later outcome
    version: Mapped[int] = mapped_column(Integer)
    round: Mapped[int] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String(40))
    # The whole report as prepared; report_sha256 is the SHA-256 of its canonical JSON
    content: Mapped[dict[str, Any]] = mapped_column(JSON)
    report_sha256: Mapped[str] = mapped_column(String(64))
    # The PDF an Executive Committee member reads, stored with the document envelope encryption
    pdf_storage: Mapped[str] = mapped_column(String(120))
    pdf_sha256: Mapped[str] = mapped_column(String(64))
    pdf_size: Mapped[int] = mapped_column(Integer)
    # The signed evidence pack built at the same moment (officer.pack.build_pack)
    pack_id: Mapped[str] = mapped_column(String(40))
    pack_zip_sha256: Mapped[str] = mapped_column(String(64))
    pack_manifest_sha256: Mapped[str] = mapped_column(String(64))
    pack_size: Mapped[int] = mapped_column(Integer)
    prepared_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class EcForwarding(Base):
    """That a report reached the Executive Committee. While no connector to the AICTE portal is live, an officer or
    administrator records it by hand after forwarding the report; `sent_by_pramana` is then false."""

    __tablename__ = "ec_forwardings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ecf"))
    report_id: Mapped[str] = mapped_column(ForeignKey("ec_reports.id"), unique=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    # "manual" for a forwarding an official recorded; a live connector would write its own name
    channel: Mapped[str] = mapped_column(String(30))
    sent_by_pramana: Mapped[bool] = mapped_column(Boolean, default=False)
    forwarded_on: Mapped[date] = mapped_column(Date)
    reference: Mapped[str] = mapped_column(String(80))
    note: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class ImmutableRecord(RuntimeError):
    """An attempt to change a report or a forwarding after it was written."""


@event.listens_for(EcReport, "before_update")
@event.listens_for(EcForwarding, "before_update")
def _never_updated(mapper, connection, target) -> None:
    raise ImmutableRecord(f"{type(target).__name__} {target.id} is immutable; record a new version instead")


@event.listens_for(EcReport, "before_delete")
@event.listens_for(EcForwarding, "before_delete")
def _never_deleted(mapper, connection, target) -> None:
    raise ImmutableRecord(f"{type(target).__name__} {target.id} is immutable and cannot be deleted")
