"""Background validation runs with persisted progress events.

A request queues a run and returns at once; a small in-process thread pool executes it with its own database
session. Each progress event is committed as it happens, so the browser can stream it, a reload can resume it
and a second viewer sees the same thing. The work itself is the same run_validation the synchronous path uses.

On SQLite there is exactly one job worker, so job writes never compete with each other; on PostgreSQL up to two.
A run left queued or running by a server stop is marked interrupted at the next start, with an audit event.
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit
from .config import get_settings
from .db import SessionLocal, engine
from .models import Application, Document, RunEvent, ValidationRun, utcnow

log = logging.getLogger(__name__)

ACTIVE = ("queued", "running")
TERMINAL = ("complete", "failed", "interrupted")
# Events with checks, finding counts and per-document forensic steps are for officials only
OFFICIAL_ONLY = {"doc.step", "check", "rules", "findings"}
# What an applicant may see of the events they are shown
INSTITUTION_KEYS = {"stage", "ms", "status", "documents", "declared_type", "document_id", "reason"}

_executor: ThreadPoolExecutor | None = None
_lock = threading.Lock()


def _pool() -> ThreadPoolExecutor:
    global _executor
    with _lock:
        if _executor is None:
            n = 1 if engine.dialect.name == "sqlite" else max(1, min(get_settings().job_workers, 2))
            _executor = ThreadPoolExecutor(max_workers=n, thread_name_prefix="pramana-job")
        return _executor


def shutdown(wait: bool = False) -> None:
    global _executor
    with _lock:
        ex, _executor = _executor, None
    if ex:
        ex.shutdown(wait=wait, cancel_futures=True)


class EventSink:
    """Progress callback for run_validation: each event is committed with the work done so far."""

    def __init__(self, db: Session, run_id: str):
        self.db = db
        self.run_id = run_id
        last = db.scalars(select(RunEvent.seq).where(RunEvent.run_id == run_id)
                          .order_by(RunEvent.seq.desc()).limit(1)).first()
        self.seq = last or 0

    def __call__(self, kind: str, **data: Any) -> None:
        self.seq += 1
        self.db.add(RunEvent(run_id=self.run_id, seq=self.seq, kind=kind, data=data,
                             audience="official" if kind in OFFICIAL_ONLY else "all"))
        self.db.commit()


def active_run(db: Session, app_id: str) -> ValidationRun | None:
    return db.scalars(select(ValidationRun).where(ValidationRun.application_id == app_id,
                                                  ValidationRun.status.in_(ACTIVE))
                      .order_by(ValidationRun.started_at.desc()).limit(1)).first()


def enqueue(db: Session, app: Application, actor: str, actor_role: str, *, reason: str,
            reprocess: str | None = None, retry_of: str | None = None,
            reuse_active: bool = True) -> tuple[ValidationRun, bool]:
    """Queue a run for the application, or return the one already queued or running (created=False).

    reprocess: None, "failed" (re-read documents that failed) or "all" (re-read every current document).
    reuse_active=False always queues a new run, e.g. after a submission changed the inputs.
    """
    from .pipeline.validate import ENGINE_VERSION
    from .rules.engine import active_ruleset

    existing = active_run(db, app.id)
    if existing and (reuse_active or existing.status == "queued"):
        return existing, False
    rs = active_ruleset()
    run = ValidationRun(application_id=app.id, round=app.round, status="queued", ruleset_id=f"{rs.id}@{rs.version}",
                        ruleset_hash=rs.sha256, engine_version=ENGINE_VERSION, triggered_by=actor)
    db.add(run)
    db.flush()
    audit.record(db, actor=actor, actor_role=actor_role, action="validation.queued", object_type="run",
                 object_id=run.id, application_id=app.id,
                 details={"reason": reason, "reprocess": reprocess, "retry_of": retry_of})
    EventSink(db, run.id)("run.queued", reason=reason, reprocess=reprocess, retry_of=retry_of)
    _pool().submit(_execute, run.id, actor, actor_role, reprocess)
    return run, True


def _execute(run_id: str, actor: str, actor_role: str, reprocess: str | None) -> None:
    from .pipeline.validate import run_validation

    db = SessionLocal()
    try:
        run = db.get(ValidationRun, run_id)
        if run is None or run.status != "queued":
            return
        app = db.get(Application, run.application_id)
        sink = EventSink(db, run_id)
        docs = list(db.scalars(select(Document).where(Document.application_id == app.id,
                                                      Document.superseded.is_(False))
                               .order_by(Document.uploaded_at)))
        for d in docs:
            if reprocess == "all" or (reprocess == "failed" and d.processing_status == "failed"):
                d.processing_status, d.processing_error = "pending", None
        run.status, run.started_at = "running", utcnow()
        sink("run.started", documents=[{"document_id": d.id, "declared_type": d.declared_type,
                                        "cached": d.processing_status == "processed"} for d in docs])
        run_validation(db, app, actor, actor_role, run=run, progress=sink)
        if run.status == "complete":
            s = run.summary or {}
            sink("findings", total=s.get("findings"), by_severity=s.get("by_severity", {}),
                 by_category=s.get("by_category", {}), by_evidence_class=s.get("by_evidence_class", {}))
        sink("run.finished", status=run.status, error=run.error)
    except Exception as e:  # noqa: BLE001  the run must end in a terminal state whatever happened
        log.exception("background run %s crashed", run_id)
        db.rollback()
        mark_failed(run_id, actor, actor_role, f"{type(e).__name__}: {e}")
    finally:
        db.close()


def mark_failed(run_id: str, actor: str, actor_role: str, reason: str, status: str = "failed") -> None:
    db = SessionLocal()
    try:
        run = db.get(ValidationRun, run_id)
        if run is None or run.status in ("complete",):
            return
        run.status, run.error, run.finished_at = status, reason[:1000], utcnow()
        audit.record(db, actor=actor, actor_role=actor_role, action=f"validation.{status}", object_type="run",
                     object_id=run.id, application_id=run.application_id, details={"error": reason[:300]})
        EventSink(db, run_id)("run.finished", status=status, error=reason[:300])
    finally:
        db.close()


def recover_interrupted() -> int:
    """Runs left queued or running when the server stopped cannot finish; say so instead of showing a spinner."""
    db = SessionLocal()
    try:
        ids = list(db.scalars(select(ValidationRun.id).where(ValidationRun.status.in_(ACTIVE))))
    finally:
        db.close()
    for rid in ids:
        mark_failed(rid, "system", "system", "The server stopped before this run finished. Start it again with Retry.",
                    status="interrupted")
    if ids:
        log.warning("marked %d unfinished validation runs as interrupted", len(ids))
    return len(ids)


def event_json(e: RunEvent, *, for_institution: bool = False) -> dict[str, Any]:
    data = e.data or {}
    if for_institution:
        data = {k: v for k, v in data.items() if k in INSTITUTION_KEYS}
        if e.kind == "run.started":
            data["documents"] = [{"declared_type": d.get("declared_type")} for d in data.get("documents", [])]
    return {"seq": e.seq, "ts": e.ts.isoformat() if e.ts else None, "kind": e.kind, "data": data}


def events_after(db: Session, run_id: str, after: int, *, for_institution: bool = False,
                 limit: int = 500) -> list[dict[str, Any]]:
    q = select(RunEvent).where(RunEvent.run_id == run_id, RunEvent.seq > after)
    if for_institution:
        q = q.where(RunEvent.audience == "all")
    return [event_json(e, for_institution=for_institution) for e in db.scalars(q.order_by(RunEvent.seq).limit(limit))]
