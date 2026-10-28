"""Endpoints for the Executive Committee handoff. Officials only: institutions read the outcome and the next steps in
their portal, never the report, its findings summary, the evidence pack or who recorded what."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import audit
from ..auth import OFFICIAL_ROLES, load_application, require_roles
from ..db import get_db
from ..models import Application, User
from ..officer.common import FORBIDDEN_WORDS
from ..officer.pack import load_pack
from . import report as rp
from .models import EcReport

router = APIRouter(prefix="/api", tags=["executive committee handoff"])
# Who may record that a report was forwarded, and download the evidence pack inside it
FORWARDERS = ("officer", "admin")


def _report(db: Session, user: User, report_id: str) -> tuple[EcReport, Application]:
    r = db.get(EcReport, report_id)
    if r is None:
        raise HTTPException(404, "report not found")
    return r, load_application(db, user, r.application_id)


def _clean(text: str | None) -> str:
    return "".join(ch for ch in (text or "") if ch in "\n\t" or ord(ch) >= 32).strip()


@router.get("/applications/{app_id}/ec-reports")
def application_reports(app_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                        db: Session = Depends(get_db)):
    """The latest report for the Executive Committee, every earlier version and how reports are forwarded."""
    return rp.application_reports(db, load_application(db, user, app_id))


@router.post("/applications/{app_id}/ec-reports")
def prepare_again(app_id: str, user: User = Depends(require_roles("officer")), db: Session = Depends(get_db)):
    """Prepare the report for the current outcome when preparing it at the time failed. Never a second copy."""
    from ..history.watch import current_outcome

    app = load_application(db, user, app_id)
    out = current_outcome(db, app.id)
    if out is None:
        raise HTTPException(409, "no scrutiny outcome is recorded; the report is prepared when one is")
    if db.query(EcReport).filter(EcReport.outcome_id == out.id).first() is not None:
        raise HTTPException(409, "the report for the current outcome is already prepared")
    rp.prepare(db, app, out, user)
    return rp.application_reports(db, app)


@router.get("/ec-reports/{report_id}")
def report_record(report_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                  db: Session = Depends(get_db)):
    """The stored record; report_sha256 is the SHA-256 of `content` as canonical JSON."""
    r, app = _report(db, user, report_id)
    latest = rp.latest_report(db, app.id)
    return {"report": rp.report_json(db, r, latest.version if latest else r.version), "content": r.content}


@router.get("/ec-reports/{report_id}/report.pdf")
def report_pdf(report_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)), db: Session = Depends(get_db)):
    r, app = _report(db, user, report_id)
    data = rp.load_pdf(r)
    audit.record(db, actor=user.username, actor_role=user.role, action="ec_report.downloaded", object_type="ec_report",
                 object_id=r.id, application_id=app.id, details={"version": r.version, "pdf_sha256": r.pdf_sha256})
    db.commit()
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="scrutiny-report-{app.id}-v{r.version}.pdf"',
        "X-Content-Type-Options": "nosniff"})


@router.get("/ec-reports/{report_id}/evidence-pack.zip")
def report_pack(report_id: str, user: User = Depends(require_roles(*FORWARDERS)), db: Session = Depends(get_db)):
    r, app = _report(db, user, report_id)
    data = load_pack(app.id, r.pack_id)
    if data is None:
        raise HTTPException(404, "evidence pack not found")
    audit.record(db, actor=user.username, actor_role=user.role, action="evidence_pack.downloaded",
                 object_type="application", object_id=app.id, application_id=app.id,
                 details={"pack_id": r.pack_id, "zip_sha256": r.pack_zip_sha256, "ec_report_id": r.id})
    db.commit()
    return Response(data, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="evidence-pack-{app.id}-{r.pack_id}.zip"',
        "X-Content-Type-Options": "nosniff"})


class ForwardingBody(BaseModel):
    forwarded_on: date
    reference: str = Field(min_length=3, max_length=80)
    note: str | None = Field(None, max_length=1000)


@router.post("/ec-reports/{report_id}/forwarding")
def record_forwarding(report_id: str, body: ForwardingBody, user: User = Depends(require_roles(*FORWARDERS)),
                      db: Session = Depends(get_db)):
    """Record that an official forwarded the report to the Executive Committee. Pramana sent nothing itself, so the
    record says so; the date, reference and note go into the audit chain."""
    r, app = _report(db, user, report_id)
    latest = rp.latest_report(db, app.id)
    if latest is not None and latest.id != r.id:
        raise HTTPException(409, f"version {latest.version} replaces this report; forward that version instead")
    if rp.forwarding_of(db, r.id) is not None:
        raise HTTPException(409, "the forwarding of this report is already recorded")
    reference, note = _clean(body.reference), _clean(body.note) or None
    if len(reference) < 3:
        raise HTTPException(400, "give the reference number the forwarding was made under")
    if body.forwarded_on > date.today():
        raise HTTPException(400, "the forwarding date cannot be in the future")
    if body.forwarded_on < r.created_at.date():
        raise HTTPException(400, "the forwarding date cannot be before the report was prepared")
    if note and FORBIDDEN_WORDS.search(note):
        raise HTTPException(400, "Note: describe what was forwarded instead of judging a document")
    rp.add_forwarding(db, r, user, body.forwarded_on, reference, note)
    db.commit()
    return rp.application_reports(db, app)
