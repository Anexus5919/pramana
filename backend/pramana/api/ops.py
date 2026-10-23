"""Platform operations: closing and withdrawing applications, retention purge and the platform status page."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, jobs, keyring, retention, sandbox
from .. import serializers as ser
from ..auth import cookie_name, load_application, require_roles
from ..config import get_settings
from ..db import engine, get_db
from ..models import User, ValidationRun

router = APIRouter(prefix="/api", tags=["platform"])


class Reason(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


def _reason(body: Reason) -> str:
    r = body.reason.strip()
    if not r:
        raise HTTPException(400, "a written reason is required")
    return r


@router.post("/applications/{app_id}/withdraw")
def withdraw(app_id: str, body: Reason, user: User = Depends(require_roles("institution")),
             db: Session = Depends(get_db)):
    """The institution withdraws its own application; the retention clock for its files starts now."""
    app = load_application(db, user, app_id)
    if app.status in retention.CLOSED:
        raise HTTPException(409, f"application is already {app.status}")
    if jobs.active_run(db, app.id):
        raise HTTPException(409, "the automatic check is still running; withdraw after it finishes")
    before, app.status = app.status, "withdrawn"
    audit.record(db, actor=user.username, actor_role=user.role, action="application.withdrawn",
                 object_type="application", object_id=app.id, application_id=app.id,
                 details={"reason": _reason(body), "previous_status": before})
    db.commit()
    return ser.application(app, for_institution=True)


@router.post("/applications/{app_id}/close")
def close(app_id: str, body: Reason, user: User = Depends(require_roles("officer", "admin")),
          db: Session = Depends(get_db)):
    """Record that processing of the application has concluded. The decision itself is made and recorded
    by the competent authority outside Pramana; closing only starts the retention clock."""
    app = load_application(db, user, app_id)
    if app.status in retention.CLOSED:
        raise HTTPException(409, f"application is already {app.status}")
    if jobs.active_run(db, app.id):
        raise HTTPException(409, "a validation run is still in progress")
    before, app.status = app.status, "closed"
    audit.record(db, actor=user.username, actor_role=user.role, action="application.closed",
                 object_type="application", object_id=app.id, application_id=app.id,
                 details={"reason": _reason(body), "previous_status": before})
    db.commit()
    return ser.application(app)


@router.get("/admin/retention")
def retention_plan(user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    """The retention policy and what a purge would delete now (a dry run)."""
    return retention.purge(db, user.username, user.role, dry_run=True)


class PurgeBody(BaseModel):
    dry_run: bool = True


@router.post("/admin/retention/purge")
def retention_purge(body: PurgeBody, user: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return retention.purge(db, user.username, user.role, dry_run=body.dry_run)


@router.get("/admin/platform")
def platform_status(user: User = Depends(require_roles("admin", "officer")), db: Session = Depends(get_db)):
    """What the platform enforces right now: background runs, parser sandbox, keys, sign-in limits, cookies."""
    s = get_settings()
    runs = db.scalars(select(ValidationRun).order_by(ValidationRun.started_at.desc()).limit(8)).all()
    active = db.scalars(select(ValidationRun).where(ValidationRun.status.in_(jobs.ACTIVE))).all()
    return {
        "database": engine.dialect.name,
        "jobs": {"background_runs": s.background_runs, "workers": 1 if engine.dialect.name == "sqlite"
                 else max(1, min(s.job_workers, 2)), "active": [ser.run_brief(r) for r in active],
                 "recent": [{**ser.run_brief(r), "application_id": r.application_id} for r in runs]},
        "sandbox": sandbox.status(),
        "keys": keyring.inventory([s.storage_dir, s.cache_dir]),
        "login_throttle": {"max_attempts_per_ip": s.login_max_per_ip,
                           "max_failures_per_username": s.login_max_failures_per_user, "window_s": s.login_window_s},
        "cookies": {"secure": s.cookie_secure, "session_cookie": cookie_name(),
                    "hsts": f"max-age={s.hsts_max_age}; includeSubDomains" if s.cookie_secure else None},
        "retention": retention.policy(),
    }
