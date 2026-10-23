"""Live validation runs: queue, follow (Server-Sent Events with a polling fallback), retry and re-read."""

import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import audit, jobs
from .. import serializers as ser
from ..auth import current_user, load_application, require_roles
from ..db import SessionLocal, get_db
from ..models import User, ValidationRun

router = APIRouter(prefix="/api", tags=["runs"])

STREAM_POLL_S = 0.25
STREAM_HEARTBEAT_S = 15
STREAM_MAX_S = 30 * 60


def _brief(run: ValidationRun | None, institution: bool) -> dict | None:
    b = ser.run_brief(run)
    if b and institution:
        b = {k: b[k] for k in ser.INSTITUTION_RUN_KEYS}
    return b


def _run_for(db: Session, user: User, run_id: str) -> ValidationRun:
    run = db.get(ValidationRun, run_id)
    if not run:
        raise HTTPException(404, "run not found")
    load_application(db, user, run.application_id)
    return run


def _queued(run: ValidationRun, created: bool, institution: bool = False) -> dict:
    return {**_brief(run, institution), "background": True, "queued": created}


@router.get("/applications/{app_id}/active-run")
def active_run(app_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The run currently queued or running for this application, so a reloaded page can resume following it."""
    app = load_application(db, user, app_id)
    return {"run": _brief(jobs.active_run(db, app.id), user.role == "institution")}


@router.post("/applications/{app_id}/reprocess")
def reprocess(app_id: str, user: User = Depends(require_roles("officer", "verifier", "admin")),
              db: Session = Depends(get_db)):
    """Re-read every current document from its stored bytes, then validate; runs in the background."""
    app = load_application(db, user, app_id)
    if app.status == "draft":
        raise HTTPException(409, "application has not been submitted")
    run, created = jobs.enqueue(db, app, user.username, user.role, reason="reprocess", reprocess="all")
    db.commit()
    return _queued(run, created)


@router.post("/runs/{run_id}/retry")
def retry(run_id: str, user: User = Depends(require_roles("officer", "verifier", "admin")),
          db: Session = Depends(get_db)):
    """Start a failed or interrupted run again; documents that could not be read are read again."""
    old = _run_for(db, user, run_id)
    if old.status not in ("failed", "interrupted"):
        raise HTTPException(409, f"run is {old.status}; only failed or interrupted runs can be retried")
    app = load_application(db, user, old.application_id)
    audit.record(db, actor=user.username, actor_role=user.role, action="validation.retry_requested",
                 object_type="run", object_id=old.id, application_id=app.id, details={"status": old.status})
    run, created = jobs.enqueue(db, app, user.username, user.role, reason="retry", reprocess="failed", retry_of=old.id)
    db.commit()
    return _queued(run, created)


def _snapshot(run_id: str, after: int, institution: bool) -> tuple[list[dict], dict | None]:
    db = SessionLocal()
    try:
        run = db.get(ValidationRun, run_id)
        events = jobs.events_after(db, run_id, after, for_institution=institution)
        return events, _brief(run, institution)
    finally:
        db.close()


@router.get("/runs/{run_id}/progress")
def progress(run_id: str, after: int = 0, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Polling fallback for the event stream: events after `after`, plus the run's current state."""
    _run_for(db, user, run_id)
    events, run = _snapshot(run_id, after, user.role == "institution")
    return {"run": run, "events": events, "done": bool(run and run["status"] in jobs.TERMINAL)}


@router.get("/runs/{run_id}/events")
async def events(run_id: str, request: Request, after: int = 0, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    """Server-Sent Events: every persisted event after `after` (or Last-Event-ID), then live ones until the end."""
    await run_in_threadpool(_run_for, db, user, run_id)
    institution = user.role == "institution"
    last = after
    try:
        last = max(last, int(request.headers.get("last-event-id") or 0))
    except ValueError:
        pass

    async def stream():
        nonlocal last
        yield "retry: 2000\n\n"
        started = beat = time.monotonic()
        while time.monotonic() - started < STREAM_MAX_S:
            if await request.is_disconnected():
                return
            evs, run = await run_in_threadpool(_snapshot, run_id, last, institution)
            for e in evs:
                last = e["seq"]
                yield f"id: {e['seq']}\nevent: progress\ndata: {json.dumps(e, separators=(',', ':'))}\n\n"
            if run is None or (run["status"] in jobs.TERMINAL and not evs):
                yield f"event: end\ndata: {json.dumps({'run': run})}\n\n"
                return
            if time.monotonic() - beat > STREAM_HEARTBEAT_S:
                beat = time.monotonic()
                yield ": keep-alive\n\n"
            await asyncio.sleep(STREAM_POLL_S)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})
