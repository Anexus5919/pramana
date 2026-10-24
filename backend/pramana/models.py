import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """Stores UTC and always returns timezone-aware values (SQLite drops tzinfo otherwise)."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(UTC).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=UTC) if value is not None and value.tzinfo is None else value


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def round_label(n: int) -> str:
    """An application round in words. Round 1 is the first submission; each rectification request opens the next
    correction round, so round 2 is correction round 1, the round the first deficiency letter asks for."""
    return f"correction round {n - 1}" if n > 1 else "first submission"


class Institution(Base):
    """Institution master as held in AICTE records (synthetic in the prototype)."""

    __tablename__ = "institutions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    aicte_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(300))
    aishe_code: Mapped[str | None] = mapped_column(String(20))
    society_name: Mapped[str | None] = mapped_column(String(300))
    address: Mapped[str] = mapped_column(Text, default="")
    state: Mapped[str] = mapped_column(String(80), default="")
    district: Mapped[str] = mapped_column(String(80), default="")
    pincode: Mapped[str | None] = mapped_column(String(10))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    institution_type: Mapped[str] = mapped_column(String(80), default="Private-Self Financing")
    women_only: Mapped[bool] = mapped_column(Boolean, default=False)
    established_year: Mapped[int | None] = mapped_column(Integer)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ReferenceRecord(Base):
    """A record from an authorized source (approval history, faculty registry, accreditation list...).

    In the prototype these are synthetic stand-ins for AICTE systems; `source` names the system and
    `provenance` says whether the data is synthetic, public or obtained via an authorized channel.
    """

    __tablename__ = "reference_records"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ref"))
    source: Mapped[str] = mapped_column(String(120), index=True)
    record_type: Mapped[str] = mapped_column(String(60), index=True)
    key: Mapped[str] = mapped_column(String(120), index=True)
    institution_id: Mapped[str | None] = mapped_column(ForeignKey("institutions.id"), index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    as_of: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    provenance: Mapped[str] = mapped_column(String(40), default="synthetic")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("usr"))
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(30))
    institution_id: Mapped[str | None] = mapped_column(ForeignKey("institutions.id"))
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    institution_id: Mapped[str] = mapped_column(ForeignKey("institutions.id"), index=True)
    category: Mapped[str] = mapped_column(String(40))
    academic_year: Mapped[str] = mapped_column(String(9))
    status: Mapped[str] = mapped_column(String(40), default="draft")
    round: Mapped[int] = mapped_column(Integer, default=1)
    declared: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    institution: Mapped[Institution] = relationship()
    documents: Mapped[list["Document"]] = relationship(back_populates="application")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("doc"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    round: Mapped[int] = mapped_column(Integer, default=1)
    declared_type: Mapped[str] = mapped_column(String(60))
    detected_type: Mapped[str | None] = mapped_column(String(60))
    classification: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    original_filename: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    mime: Mapped[str] = mapped_column(String(80))
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_name: Mapped[str] = mapped_column(String(120))
    text_source: Mapped[str | None] = mapped_column(String(20))
    processing_status: Mapped[str] = mapped_column(String(30), default="pending")
    processing_error: Mapped[str | None] = mapped_column(Text)
    fingerprints: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    analysis: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    uploaded_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    superseded: Mapped[bool] = mapped_column(Boolean, default=False)

    application: Mapped[Application] = relationship(back_populates="documents")
    pages: Mapped[list["DocumentPage"]] = relationship(
        back_populates="document", order_by="DocumentPage.page_no", cascade="all, delete-orphan"
    )
    fields: Mapped[list["ExtractedField"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )


class DocumentPage(Base):
    __tablename__ = "document_pages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    page_no: Mapped[int] = mapped_column(Integer)
    width: Mapped[float] = mapped_column(Float)
    height: Mapped[float] = mapped_column(Float)
    text_source: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text, default="")
    words: Mapped[list[Any]] = mapped_column(JSON, default=list)
    ocr_mean_confidence: Mapped[float | None] = mapped_column(Float)

    document: Mapped[Document] = relationship(back_populates="pages")


class ExtractedField(Base):
    """A value read from a document. It is a claim made by the document, not a verified fact."""

    __tablename__ = "extracted_fields"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("fld"))
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    raw: Mapped[str | None] = mapped_column(Text)
    value: Mapped[str | None] = mapped_column(Text)
    value_type: Mapped[str] = mapped_column(String(20), default="text")
    page: Mapped[int | None] = mapped_column(Integer)
    bbox: Mapped[list[float] | None] = mapped_column(JSON)
    method: Mapped[str] = mapped_column(String(40))
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="extracted")

    document: Mapped[Document] = relationship(back_populates="fields")


class ValidationRun(Base):
    __tablename__ = "validation_runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("run"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    round: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="running")
    ruleset_id: Mapped[str] = mapped_column(String(60))
    ruleset_hash: Mapped[str] = mapped_column(String(64))
    engine_version: Mapped[str] = mapped_column(String(20))
    input_digest: Mapped[str | None] = mapped_column(String(64))
    report_digest: Mapped[str | None] = mapped_column(String(64))
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    stages: Mapped[list[Any]] = mapped_column(JSON, default=list)
    triggered_by: Mapped[str | None] = mapped_column(String(80))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    error: Mapped[str | None] = mapped_column(Text)


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("fnd"))
    run_id: Mapped[str] = mapped_column(ForeignKey("validation_runs.id"), index=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    code: Mapped[str] = mapped_column(String(60))
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    category: Mapped[str] = mapped_column(String(30))
    evidence_class: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(20))
    outcome: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(300))
    message: Mapped[str] = mapped_column(Text)
    limitation: Mapped[str | None] = mapped_column(Text)
    rule: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    evidence: Mapped[list[Any]] = mapped_column(JSON, default=list)
    trace: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    document_id: Mapped[str | None] = mapped_column(String(40))
    review_status: Mapped[str] = mapped_column(String(30), default="open")
    review_note: Mapped[str | None] = mapped_column(Text)


class VerificationAttempt(Base):
    __tablename__ = "verification_attempts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ver"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(String(40))
    channel: Mapped[str] = mapped_column(String(60))
    source_name: Mapped[str] = mapped_column(String(200))
    simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30))
    request: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    response: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    comparison: Mapped[list[Any]] = mapped_column(JSON, default=list)
    detail: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str | None] = mapped_column(String(80))
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class ReviewAction(Base):
    __tablename__ = "review_actions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("rev"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    finding_id: Mapped[str | None] = mapped_column(ForeignKey("findings.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(40))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class RectificationRequest(Base):
    __tablename__ = "rectification_requests"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("rect"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    items: Mapped[list[Any]] = mapped_column(JSON, default=list)
    # What the application looked like when rectification was requested, to detect out-of-scope changes
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    message: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    responded_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class AuditEvent(Base):
    """Append-only, hash-chained audit log. hash = sha256(prev_hash + canonical(event))."""

    __tablename__ = "audit_events"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    actor: Mapped[str] = mapped_column(String(80))
    actor_role: Mapped[str] = mapped_column(String(30))
    action: Mapped[str] = mapped_column(String(60), index=True)
    object_type: Mapped[str] = mapped_column(String(40))
    object_id: Mapped[str | None] = mapped_column(String(60), index=True)
    application_id: Mapped[str | None] = mapped_column(String(40), index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64), unique=True)


class AuditCheckpoint(Base):
    """Ed25519 signature over the audit chain head, so later truncation or rewriting is detectable."""

    __tablename__ = "audit_checkpoints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    seq: Mapped[int] = mapped_column(Integer)
    head_hash: Mapped[str] = mapped_column(String(64))
    signature: Mapped[str] = mapped_column(String(200))
    public_key: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class RunEvent(Base):
    """One progress event of a validation run, persisted so a reload or a second viewer can resume the stream."""

    __tablename__ = "run_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("validation_runs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    ts: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    kind: Mapped[str] = mapped_column(String(40))
    # "all" events are safe to show the applicant; "official" events carry checks and finding counts
    audience: Mapped[str] = mapped_column(String(20), default="official")
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class DeficiencyLetter(Base):
    """Deficiency notice drafted from findings. Finalising stores the PDF and records its SHA-256 in the audit chain."""

    __tablename__ = "deficiency_letters"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: new_id("ltr"))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    subject: Mapped[str] = mapped_column(String(300))
    intro: Mapped[str] = mapped_column(Text, default="")
    # Structured items only: finding, title, description, what to submit, cited rule and response date
    items: Mapped[list[Any]] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    finalised_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    finalised_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    final_reason: Mapped[str | None] = mapped_column(Text)
    final_sha256: Mapped[str | None] = mapped_column(String(64))
    storage_name: Mapped[str | None] = mapped_column(String(120))
    rectification_id: Mapped[str | None] = mapped_column(ForeignKey("rectification_requests.id"), index=True)
