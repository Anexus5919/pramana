"""Data retention per kind of data, and the purge that enforces it.

Kinds and their clocks (days are settings, see config.py):
- document files: original uploads of applications that were closed or withdrawn, counted from that event;
- page previews: rendered page images in the cache, counted from when they were rendered;
- run events: progress events of finished validation runs, counted from when the run finished;
- sessions: sign-in sessions, counted from when they expired.

A purge deletes the bytes and their wrapped data keys, and leaves a small tombstone so the API can answer
410 instead of failing. It never touches document hashes, extracted fields, findings, verification records,
run records or the audit chain, and it writes one audit event per purged document plus a summary.
"""

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import audit, keyring
from .config import get_settings
from .crypto import delete_document
from .models import Application, AuditEvent, AuthSession, Document, RunEvent, ValidationRun, utcnow

CLOSED = ("closed", "withdrawn")


def policy() -> dict[str, int]:
    s = get_settings()
    return {"documents_after_close_days": s.retention_document_days, "previews_days": s.retention_preview_days,
            "run_events_days": s.retention_run_event_days, "sessions_after_expiry_days": s.retention_session_days}


def _closed_at(db: Session, app: Application) -> datetime | None:
    e = db.scalars(select(AuditEvent).where(AuditEvent.application_id == app.id,
                                            AuditEvent.action.in_([f"application.{c}" for c in CLOSED]))
                   .order_by(AuditEvent.seq.desc()).limit(1)).first()
    return e.ts if e else None


def plan(db: Session, now: datetime | None = None) -> dict[str, Any]:
    """What a purge would delete right now, without deleting anything."""
    s = get_settings()
    now = now or utcnow()
    docs = []
    for app in db.scalars(select(Application).where(Application.status.in_(CLOSED))):
        closed = _closed_at(db, app)
        if closed is None:
            continue
        due = closed + timedelta(days=s.retention_document_days)
        for d in db.scalars(select(Document).where(Document.application_id == app.id)):
            if (s.storage_dir / d.storage_name).exists():
                docs.append({"document_id": d.id, "application_id": app.id, "storage_name": d.storage_name,
                             "sha256": d.sha256, "size_bytes": d.size_bytes, "closed_at": closed.isoformat(),
                             "due": due.isoformat(), "eligible": due <= now})
    cutoff = (now - timedelta(days=s.retention_preview_days)).timestamp()
    previews = [p for p in s.cache_dir.glob("*.png") if p.stat().st_mtime <= cutoff]
    ev_cut = now - timedelta(days=s.retention_run_event_days)
    old_runs = [r for r in db.scalars(select(ValidationRun.id).where(ValidationRun.finished_at.is_not(None),
                                                                      ValidationRun.finished_at <= ev_cut))]
    events = sum(1 for _ in db.scalars(select(RunEvent.id).where(RunEvent.run_id.in_(old_runs)))) if old_runs else 0
    sess_cut = now - timedelta(days=s.retention_session_days)
    sessions = sum(1 for _ in db.scalars(select(AuthSession.token_hash).where(AuthSession.expires_at <= sess_cut)))
    return {"policy": policy(), "as_of": now.isoformat(), "documents": docs,
            "documents_eligible": sum(1 for d in docs if d["eligible"]),
            "bytes_eligible": sum(d["size_bytes"] for d in docs if d["eligible"]),
            "previews_eligible": len(previews), "run_events_eligible": events, "sessions_eligible": sessions,
            "_previews": previews, "_runs": old_runs, "_session_cut": sess_cut}


def public(p: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in p.items() if not k.startswith("_")}


def purge(db: Session, actor: str, actor_role: str, *, dry_run: bool = True,
          now: datetime | None = None) -> dict[str, Any]:
    p = plan(db, now)
    if dry_run:
        return {**public(p), "dry_run": True}
    s = get_settings()
    purged = []
    for d in (x for x in p["documents"] if x["eligible"]):
        path = s.storage_dir / d["storage_name"]
        delete_document(d["storage_name"])
        path.with_name(d["storage_name"] + ".purged").write_text(json.dumps(
            {"document_id": d["document_id"], "sha256": d["sha256"], "purged_at": utcnow().isoformat()}))
        for c in s.cache_dir.glob(f"{d['document_id']}_p*.png"):
            c.unlink(missing_ok=True)
            keyring.key_path(c).unlink(missing_ok=True)
        audit.record(db, actor=actor, actor_role=actor_role, action="retention.document_purged",
                     object_type="document", object_id=d["document_id"], application_id=d["application_id"],
                     details={"sha256": d["sha256"], "size_bytes": d["size_bytes"], "closed_at": d["closed_at"],
                              "policy_days": s.retention_document_days})
        purged.append(d["document_id"])
    for c in p["_previews"]:
        c.unlink(missing_ok=True)
        keyring.key_path(c).unlink(missing_ok=True)
    events = 0
    if p["_runs"]:
        events = db.execute(delete(RunEvent).where(RunEvent.run_id.in_(p["_runs"]))).rowcount or 0
    sessions = db.execute(delete(AuthSession).where(AuthSession.expires_at <= p["_session_cut"])).rowcount or 0
    summary = {"documents_purged": len(purged), "previews_deleted": len(p["_previews"]),
               "run_events_deleted": events, "sessions_deleted": sessions, "policy": policy()}
    audit.record(db, actor=actor, actor_role=actor_role, action="retention.purge_completed",
                 object_type="retention", details=summary)
    db.commit()
    return {**public(p), "dry_run": False, **summary, "purged_document_ids": purged}
