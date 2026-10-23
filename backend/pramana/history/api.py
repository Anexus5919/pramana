from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..auth import OFFICIAL_ROLES, load_application, require_roles
from ..crypto import load_document
from ..db import get_db
from ..models import Document, User, VerificationAttempt
from ..sim import issuers as sim
from . import revisions, watch

router = APIRouter(prefix="/api", tags=["history"])


def _official_doc(db: Session, user: User, doc_id: str) -> Document:
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    load_application(db, user, doc.application_id)
    return doc


@router.get("/documents/{doc_id}/revisions")
def document_revisions(doc_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                       db: Session = Depends(get_db)):
    """Saved revisions of a PDF with signature coverage and text changes. Officials only: forensic detail."""
    doc = _official_doc(db, user, doc_id)
    if doc.mime != "application/pdf":
        return {"document_id": doc.id, "supported": False, "revision_count": 0, "revisions": []}
    attempts = db.scalars(select(VerificationAttempt).where(VerificationAttempt.document_id == doc.id)
                          .order_by(VerificationAttempt.started_at.desc())).all()
    return {"supported": True, **revisions.describe(doc, load_document(doc.storage_name), attempts)}


@router.get("/documents/{doc_id}/revisions/{n}/pages/{page_no}.png")
def revision_page(doc_id: str, n: int, page_no: int, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                  db: Session = Depends(get_db)):
    doc = _official_doc(db, user, doc_id)
    if doc.mime != "application/pdf" or page_no < 1 or page_no > max(doc.page_count, 1):
        raise HTTPException(404, "no such page")
    try:
        png = revisions.render(doc, load_document(doc.storage_name), n, page_no)
    except IndexError as e:
        raise HTTPException(404, "no such revision or page in that revision") from e
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=600"})


class OutcomeBody(BaseModel):
    outcome: str
    reason: str = Field(min_length=1, max_length=2000)


@router.get("/applications/{app_id}/watch")
def application_watch(app_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                      db: Session = Depends(get_db)):
    return watch.application_watch(db, load_application(db, user, app_id))


@router.post("/applications/{app_id}/scrutiny-outcome")
def record_outcome(app_id: str, body: OutcomeBody, user: User = Depends(require_roles("officer")),
                   db: Session = Depends(get_db)):
    """The official's outcome, with a written reason. Pramana records it and starts the re-verification watch."""
    app = load_application(db, user, app_id)
    if body.outcome not in watch.OUTCOMES:
        raise HTTPException(400, f"outcome must be one of {sorted(watch.OUTCOMES)}")
    reason = body.reason.strip()
    if len(reason) < 10:
        raise HTTPException(400, "a written reason of at least 10 characters is required")
    if app.status in ("draft", "rectification_requested"):
        raise HTTPException(409, f"application is {app.status}; record the outcome after it is submitted")
    try:
        watch.record_outcome(db, app, user, body.outcome, reason)
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    return watch.application_watch(db, app)


@router.get("/watch")
def watch_status(user: User = Depends(require_roles(*OFFICIAL_ROLES)), db: Session = Depends(get_db)):
    return watch.status(db)


@router.post("/watch/run")
def run_watch_now(user: User = Depends(require_roles("officer", "verifier", "admin"))):
    return watch.run_watch("manual", user.username)


class RecordStatus(BaseModel):
    ref_no: str = Field(min_length=1, max_length=120)
    status: str
    note: str | None = Field(None, max_length=500)


@router.post("/sim/issuers/{code}/records/status")
def sim_record_status(code: str, body: RecordStatus, user: User = Depends(require_roles("officer", "admin")),
                      db: Session = Depends(get_db)):
    """Play the issuer: revoke, suspend or restore a certificate in the SIMULATED registry."""
    if body.status not in sim.RECORD_STATUSES:
        raise HTTPException(400, f"status must be one of {list(sim.RECORD_STATUSES)}")
    try:
        rec = sim.set_record_status(code, body.ref_no, body.status, body.note)
    except KeyError as e:
        raise HTTPException(404, str(e.args[0]) if e.args else "not found") from e
    audit.record(db, actor=user.username, actor_role=user.role, action="sim.record_status_changed",
                 object_type="issuer_record", object_id=f"{code}:{rec['ref_no']}"[:60],
                 details={"issuer": code, "ref_no": rec["ref_no"], "status": body.status, "note": body.note,
                          "simulated": True})
    db.commit()
    return {"simulated": True, "issuer": code, "record": rec}
