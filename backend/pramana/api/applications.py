import hashlib
import re
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, jobs, sandbox
from .. import serializers as ser
from ..auth import OFFICIAL_ROLES, current_user, load_application, require_roles
from ..config import get_settings
from ..conversation.threads import notify_round_opened
from ..crypto import cache_get, cache_put, load_document, store_document
from ..db import get_db
from ..models import (
    Application,
    Document,
    Finding,
    Institution,
    RectificationRequest,
    ReviewAction,
    User,
    ValidationRun,
    VerificationAttempt,
    utcnow,
)
from ..officer.common import FORBIDDEN_WORDS, RECTIFIABLE_CATEGORIES
from ..officer.letter import item_wording
from ..pipeline.intake import UploadRejected, validate_upload
from ..pipeline.validate import ruleset_by_hash, run_validation
from ..rules.basis import basis_for
from ..rules.engine import active_ruleset
from ..verification import base as vb
from ..verification.effective import FOLLOW_UP_CHANNELS, OFFICER_REVIEW, effective_document_status

router = APIRouter(prefix="/api", tags=["applications"])

EDITABLE = {"draft", "rectification_requested"}


def latest_run(db: Session, app_id: str) -> ValidationRun | None:
    # The last complete result stays current while a background run is queued or running, and after one fails;
    # a failed or interrupted run is only shown when nothing has completed yet
    q = select(ValidationRun).where(ValidationRun.application_id == app_id).order_by(ValidationRun.started_at.desc())
    return (db.scalars(q.where(ValidationRun.status == "complete").limit(1)).first()
            or db.scalars(q.where(ValidationRun.status.notin_(jobs.ACTIVE)).limit(1)).first())


@router.get("/applications")
def list_applications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Application)
    if user.role == "institution":
        q = q.where(Application.institution_id == user.institution_id)
    apps = db.scalars(q.order_by(Application.created_at.desc())).all()
    inst = user.role == "institution"
    return [ser.application(a, latest_run(db, a.id), for_institution=inst) for a in apps]


class NewApplication(BaseModel):
    category: str
    academic_year: str = Field(pattern=r"^\d{4}-\d{2}$")
    declared: dict = {}


@router.post("/applications")
def create_application(body: NewApplication, user: User = Depends(require_roles("institution")),
                       db: Session = Depends(get_db)):
    rs = active_ruleset()
    if body.category not in rs.checklists:
        raise HTTPException(400, f"unknown category; expected one of {sorted(rs.checklists)}")
    app = Application(id=f"APP-{body.academic_year[:4]}-{uuid.uuid4().hex[:6].upper()}",
                      institution_id=user.institution_id, category=body.category,
                      academic_year=body.academic_year, declared=body.declared)
    db.add(app)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="application.created",
                 object_type="application", object_id=app.id, application_id=app.id,
                 details={"category": app.category, "academic_year": app.academic_year})
    db.commit()
    return ser.application(app)


@router.get("/applications/{app_id}")
def get_application(app_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    rs = active_ruleset()
    docs = db.scalars(select(Document).where(Document.application_id == app.id)
                      .order_by(Document.uploaded_at)).all()
    cl = rs.checklists.get(app.category, {})
    required = [{"doc_type": t, "label": rs.doc_types.get(t, {}).get("label", t),
                 "description": rs.doc_types.get(t, {}).get("description"),
                 "required": t in cl.get("required", []),
                 "uploaded": any(d.declared_type == t and not d.superseded for d in docs)}
                for t in cl.get("required", []) + cl.get("optional", [])]
    rect = db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == app.id)
                      .order_by(RectificationRequest.created_at.desc())).all()
    inst = user.role == "institution"
    return {**ser.application(app, latest_run(db, app.id), for_institution=inst),
            "category_label": cl.get("label", app.category), "checklist_source": cl.get("source"),
            "document_checklist": required,
            "documents": [ser.document(d) for d in docs],
            "rectifications": [{"id": r.id, "round": r.round,
                                "items": [institution_item(db, i, rs) for i in r.items] if inst else r.items,
                                "message": r.message, "status": r.status, "created_at": r.created_at.isoformat(),
                                "responded_at": r.responded_at.isoformat() if r.responded_at else None}
                               for r in rect]}


class DeclaredUpdate(BaseModel):
    declared: dict


@router.patch("/applications/{app_id}/declared")
def update_declared(app_id: str, body: DeclaredUpdate, user: User = Depends(require_roles("institution")),
                    db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    if app.status not in EDITABLE:
        raise HTTPException(409, f"application is {app.status}; it cannot be edited now")
    app.declared = body.declared
    audit.record(db, actor=user.username, actor_role=user.role, action="application.declared_updated",
                 object_type="application", object_id=app.id, application_id=app.id)
    db.commit()
    return ser.application(app)


def _safe_name(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1])[:120]
    return base or "upload"


@router.post("/applications/{app_id}/documents")
async def upload_document(app_id: str, declared_type: str = Form(...), file: UploadFile = File(...),
                          user: User = Depends(require_roles("institution")), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    if app.status not in EDITABLE:
        raise HTTPException(409, f"application is {app.status}; documents cannot be added now")
    rs = active_ruleset()
    if declared_type not in rs.doc_types:
        raise HTTPException(400, "unknown document type")
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    name = _safe_name(file.filename or "upload")
    try:
        res = validate_upload(name, data)
    except UploadRejected as e:
        audit.record(db, actor=user.username, actor_role=user.role, action="document.rejected",
                     object_type="application", object_id=app.id, application_id=app.id,
                     details={"filename": name, "reason": str(e)})
        db.commit()
        raise HTTPException(422, str(e)) from e
    sha = hashlib.sha256(data).hexdigest()
    for old in db.scalars(select(Document).where(Document.application_id == app.id,
                                                 Document.declared_type == declared_type,
                                                 Document.superseded.is_(False))):
        old.superseded = True
    doc = Document(application_id=app.id, round=app.round, declared_type=declared_type, original_filename=name,
                   sha256=sha, size_bytes=len(data), mime=res.mime, page_count=res.page_count,
                   storage_name=f"{uuid.uuid4().hex}.bin", uploaded_by=user.id,
                   analysis={"active_content": res.active_content})
    store_document(doc.storage_name, data)
    db.add(doc)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="document.uploaded", object_type="document",
                 object_id=doc.id, application_id=app.id,
                 details={"declared_type": declared_type, "sha256": sha, "size": len(data), "mime": res.mime,
                          "active_content": [a["key"] for a in res.active_content]})
    db.commit()
    return ser.document(doc)


@router.post("/applications/{app_id}/submit")
def submit(app_id: str, user: User = Depends(require_roles("institution")), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    if app.status not in EDITABLE:
        raise HTTPException(409, f"application is already {app.status}")
    rect = db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == app.id,
                                                         RectificationRequest.status == "open")).first()
    if rect:
        rect.status, rect.responded_at = "responded", utcnow()
        app.status = "rectified"
    else:
        app.status = "submitted"
        app.submitted_at = utcnow()
    audit.record(db, actor=user.username, actor_role=user.role, action="application.submitted",
                 object_type="application", object_id=app.id, application_id=app.id, details={"round": app.round})
    db.commit()
    if get_settings().background_runs:
        # A run already in progress started before this submission, so the new inputs get a run of their own
        queued, _ = jobs.enqueue(db, app, "system", "system", reason="submitted", reuse_active=False)
        db.commit()
        brief = {k: ser.run_brief(queued)[k] for k in ser.INSTITUTION_RUN_KEYS}
        return {"application": ser.application(app, latest_run(db, app.id), for_institution=True),
                "run": {**brief, "background": True}}
    run = run_validation(db, app, "system", "system")
    brief = ser.run_brief(run)
    # Institutions learn that validation ran, not the counts of indicators under review
    brief = {k: brief[k] for k in ser.INSTITUTION_RUN_KEYS}
    return {"application": ser.application(app, run, for_institution=True), "run": brief}


@router.post("/applications/{app_id}/validate")
def validate(app_id: str, user: User = Depends(require_roles("officer", "verifier", "admin")),
             db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    if app.status in ("draft",):
        raise HTTPException(409, "application has not been submitted")
    if get_settings().background_runs:
        queued, created = jobs.enqueue(db, app, user.username, user.role, reason="validate")
        db.commit()
        return {**ser.run_brief(queued), "background": True, "queued": created}
    run = run_validation(db, app, user.username, user.role)
    return ser.run_full(run)


@router.get("/applications/{app_id}/runs")
def list_runs(app_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    runs = db.scalars(select(ValidationRun).where(ValidationRun.application_id == app.id)
                      .order_by(ValidationRun.started_at.desc())).all()
    if user.role == "institution":
        # Institutions see when a check ran, not its severity or evidence-class counts; officers' replays stay internal
        briefs = [ser.run_brief(r) for r in runs if not (r.summary or {}).get("replay_of")]
        return [{k: b[k] for k in ser.INSTITUTION_RUN_KEYS} for b in briefs]
    return [ser.run_brief(r) for r in runs]


@router.get("/runs/{run_id}")
def get_run(run_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(ValidationRun, run_id)
    if not run:
        raise HTTPException(404, "run not found")
    load_application(db, user, run.application_id)
    return ser.run_full(run)


@router.post("/runs/{run_id}/replay")
def replay(run_id: str, user: User = Depends(require_roles("officer", "admin")), db: Session = Depends(get_db)):
    """Re-run under the pinned ruleset and as-of date, and report whether the result is identical."""
    run = db.get(ValidationRun, run_id)
    if not run:
        raise HTTPException(404, "run not found")
    app = load_application(db, user, run.application_id)
    rs = ruleset_by_hash(run.ruleset_hash)
    if rs is None:
        raise HTTPException(409, "archived ruleset for this run is not available")
    as_of = datetime.fromisoformat((run.summary or {}).get("as_of")).date()
    new = run_validation(db, app, user.username, user.role, ruleset=rs, as_of=as_of, replay_of=run.id)
    return {"original": ser.run_brief(run), "replay": ser.run_brief(new),
            "inputs_identical": new.input_digest == run.input_digest,
            "report_identical": new.report_digest == run.report_digest}


@router.get("/applications/{app_id}/findings")
def list_findings(app_id: str, run_id: str | None = None, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    run = db.get(ValidationRun, run_id) if run_id else latest_run(db, app.id)
    if not run or run.application_id != app.id:
        return []
    fs = db.scalars(select(Finding).where(Finding.run_id == run.id)).all()
    if user.role == "institution":
        # Institutions see deficiencies, not forensic or cross-institution indicators under review; the clause
        # they must meet reaches them in the deficiency letter, not the regulatory basis below
        fs = [f for f in fs if f.category in ("completeness", "compliance", "validity") and f.review_status != "dismissed"]
        return [ser.finding(f) for f in fs]
    return with_basis(db, fs)


def with_basis(db: Session, fs: list[Finding]) -> list[dict]:
    """Findings for officials, each with the provisions it concerns and what to establish before acting.

    Resolved by code and document type from a cached map, so a list costs one query for document types."""
    ids = {f.document_id for f in fs if f.document_id}
    types = dict(db.execute(select(Document.id, Document.declared_type).where(Document.id.in_(ids))).all()) if ids else {}
    return [{**ser.finding(f), "regulatory_basis": basis_for(f.code, types.get(f.document_id))} for f in fs]


@router.get("/applications/{app_id}/verifications")
def list_verifications(app_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                       db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    run = latest_run(db, app.id)
    if not run:
        return []
    return [ser.attempt(v) for v in db.scalars(select(VerificationAttempt).where(
        VerificationAttempt.run_id == run.id).order_by(VerificationAttempt.started_at))]


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    load_application(db, user, doc.application_id)
    out = ser.document(doc, detail=True)
    if user.role == "institution":
        for k in ("forensic_signals", "forensic_facts", "fingerprints", "llm", "instruction_lines"):
            out.pop(k, None)
    else:
        out["verifications"] = [ser.attempt(v) for v in db.scalars(
            select(VerificationAttempt).where(VerificationAttempt.document_id == doc.id)
            .order_by(VerificationAttempt.started_at.desc()))]
    return out


@router.get("/documents/{doc_id}/pages/{page_no}.png")
def page_image(doc_id: str, page_no: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    load_application(db, user, doc.application_id)
    if page_no < 1 or page_no > max(doc.page_count, 1):
        raise HTTPException(404, "no such page")
    name = f"{doc.id}_p{page_no}.png"
    png = cache_get(name)
    if png is None:
        try:
            png = sandbox.render_png(load_document(doc.storage_name), doc.mime, page_no - 1, 110)
        except sandbox.SandboxError as e:
            raise HTTPException(422, f"page could not be rendered safely: {e}") from e
        cache_put(name, png)
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=600"})


@router.get("/documents/{doc_id}/file")
def download(doc_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    app = load_application(db, user, doc.application_id)
    audit.record(db, actor=user.username, actor_role=user.role, action="document.downloaded", object_type="document",
                 object_id=doc.id, application_id=app.id)
    db.commit()
    return Response(load_document(doc.storage_name), media_type=doc.mime, headers={
        "Content-Disposition": f'attachment; filename="{doc.original_filename}"',
        "X-Content-Type-Options": "nosniff"})


class ReviewBody(BaseModel):
    action: str
    note: str | None = None


REVIEW_ACTIONS = {
    "acknowledge": "acknowledged",
    "accept": "accepted",
    "dismiss": "dismissed",
    "escalate_inspection": "escalated",
    "request_evidence": "evidence_requested",
    "resolve": "resolved",
    "note": None,
}


@router.post("/findings/{finding_id}/review")
def review_finding(finding_id: str, body: ReviewBody, user: User = Depends(require_roles("officer", "verifier")),
                   db: Session = Depends(get_db)):
    f = db.get(Finding, finding_id)
    if not f:
        raise HTTPException(404, "finding not found")
    app = load_application(db, user, f.application_id)
    if body.action not in REVIEW_ACTIONS:
        raise HTTPException(400, f"action must be one of {sorted(REVIEW_ACTIONS)}")
    if body.action in ("dismiss", "accept", "escalate_inspection") and not (body.note or "").strip():
        raise HTTPException(400, "a reason is required for this decision")
    new_status = REVIEW_ACTIONS[body.action]
    if new_status:
        f.review_status = new_status
    if body.note:
        f.review_note = body.note
    ra = ReviewAction(application_id=app.id, finding_id=f.id, actor_id=user.id, action=body.action, note=body.note)
    db.add(ra)
    audit.record(db, actor=user.username, actor_role=user.role, action=f"finding.{body.action}", object_type="finding",
                 object_id=f.id, application_id=app.id, details={"code": f.code, "note": body.note,
                                                                  "status": f.review_status})
    db.commit()
    return with_basis(db, [f])[0]


@router.get("/findings/{finding_id}/history")
def finding_history(finding_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                    db: Session = Depends(get_db)):
    f = db.get(Finding, finding_id)
    if not f:
        raise HTTPException(404, "finding not found")
    load_application(db, user, f.application_id)
    rows = db.scalars(select(ReviewAction).where(ReviewAction.finding_id == f.id).order_by(ReviewAction.created_at))
    return [ser.review(r, (db.get(User, r.actor_id).display_name if r.actor_id else None)) for r in rows]


class RectifyBody(BaseModel):
    finding_ids: list[str] = []
    message: str | None = None


def institution_item(db: Session, item: dict, rs) -> dict:
    """One rectification item as the institution reads it: a title and a plain message, never a rule or detector
    code, a fact path or an indicator's own wording."""
    out = {"finding_id": item.get("finding_id"), "title": item.get("title"), "message": item.get("message"),
           "document_type": item.get("document_type")}
    if item.get("neutral"):
        return out
    f = db.get(Finding, item["finding_id"]) if item.get("finding_id") else None
    if f is None:
        return {**out, "title": "Item to correct", "message": "Details are in the deficiency letter."}
    title, message = item_wording(db, f, rs)
    return {**out, "title": title, "message": message}


def open_rectification(db: Session, app: Application, findings: list[Finding], message: str | None, user: User,
                       wording: dict[str, tuple[str, str]] | None = None) -> RectificationRequest:
    """Open a rectification round: mark the findings as asked about, snapshot the application and start the next round.

    `wording` maps finding ids to the institution-facing title and message (the deficiency letter's text); items
    without it are stored with their finding's text for officials and reworded when an institution reads them."""
    items = []
    for f in findings:
        f.review_status = "evidence_requested"
        doc = db.get(Document, f.document_id) if f.document_id else None
        paths = sorted({i.get("path") for i in (f.trace or {}).get("inputs", []) if i.get("path")})
        item = {"finding_id": f.id, "code": f.code, "title": f.title, "message": f.message,
                "document_type": doc.declared_type if doc else None, "fact_paths": paths}
        if wording and f.id in wording:
            item.update(title=wording[f.id][0], message=wording[f.id][1], neutral=True)
        items.append(item)
    current = db.scalars(select(Document).where(Document.application_id == app.id,
                                                Document.superseded.is_(False))).all()
    snapshot = {"declared": app.declared, "documents": {d.declared_type: d.sha256 for d in current}}
    r = RectificationRequest(application_id=app.id, round=app.round, items=items, message=message,
                             created_by=user.id, snapshot=snapshot)
    db.add(r)
    db.flush()
    app.round += 1
    app.status = "rectification_requested"
    audit.record(db, actor=user.username, actor_role=user.role, action="rectification.requested",
                 object_type="application", object_id=app.id, application_id=app.id,
                 details={"items": [i["code"] for i in items], "new_round": app.round})
    return r


@router.post("/applications/{app_id}/rectification")
def request_rectification(app_id: str, body: RectifyBody, user: User = Depends(require_roles("officer")),
                          db: Session = Depends(get_db)):
    """Ask the institution to correct deficiencies. Only completeness, compliance and validity findings can be sent:
    forensic, cross-application and issuer-verification findings stay with officials (a deficiency letter words
    them neutrally), so the institution never learns what a detector saw."""
    app = load_application(db, user, app_id)
    message = (body.message or "").strip() or None
    if message and FORBIDDEN_WORDS.search(message):
        raise HTTPException(400, "Message: describe the issue neutrally (for example 'could not be confirmed') "
                                 "instead of judging the document")
    if not body.finding_ids and not message:
        raise HTTPException(400, "select at least one finding or write a message")
    findings = []
    for fid in dict.fromkeys(body.finding_ids):
        f = db.get(Finding, fid)
        if not f or f.application_id != app.id:
            raise HTTPException(400, f"finding {fid} does not belong to this application")
        findings.append(f)
    held = [f for f in findings if f.category not in RECTIFIABLE_CATEGORIES]
    if held:
        raise HTTPException(422, "Forensic, cross-application and issuer-verification findings stay with officials "
                                 "and cannot be sent to the institution (" + ", ".join(f.code for f in held) + "). "
                                 "Describe what to correct in the message, or draft a deficiency letter.")
    r = open_rectification(db, app, findings, message, user)
    notify_round_opened(db, app, r, None)
    db.commit()
    return {"id": r.id, "round": app.round, "items": r.items}


class ManualVerification(BaseModel):
    status: str
    note: str


@router.post("/verifications/{attempt_id}/manual")
def manual_verification(attempt_id: str, body: ManualVerification,
                        user: User = Depends(require_roles("verifier", "officer")), db: Session = Depends(get_db)):
    """Record the outcome of an offline confirmation (letter, email, portal check) by the verification cell."""
    v = db.get(VerificationAttempt, attempt_id)
    if not v:
        raise HTTPException(404, "verification attempt not found")
    app = load_application(db, user, v.application_id)
    if body.status not in ("verified", "mismatch_detected", "expired", "manual_review_required"):
        raise HTTPException(400, "invalid status")
    if v.channel in FOLLOW_UP_CHANNELS:
        # A confirmation follows a check; an officer's own review is never turned into a confirmation
        raise HTTPException(409, "This is a recorded confirmation or officer review; confirm the check it concerns")
    m = VerificationAttempt(application_id=app.id, document_id=v.document_id, run_id=v.run_id,
                            channel="manual_confirmation", source_name=f"Manual confirmation by {user.display_name}",
                            simulated=False, status=body.status, request={"follows": v.id},
                            response={"note": body.note}, detail=body.note, actor=user.username,
                            completed_at=utcnow())
    db.add(m)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="verification.manual_recorded",
                 object_type="verification", object_id=m.id, application_id=app.id,
                 details={"follows": v.id, "status": body.status, "note": body.note})
    db.commit()
    return ser.attempt(m)


class OfficerReview(BaseModel):
    note: str


OFFICER_NOTE_MIN = 10
# Document statuses in the words the workspace shows officials
STATUS_WORDS = {vb.NOT_CHECKED: "no outside source", vb.OFFICER_REVIEWED: "reviewed by officer"}


@router.post("/documents/{doc_id}/officer-review")
def officer_review(doc_id: str, body: OfficerReview, user: User = Depends(require_roles("verifier", "officer")),
                   db: Session = Depends(get_db)):
    """Record that an official examined a document no outside source can confirm (status not_checked).

    It is a review, not a confirmation: the document reads "Reviewed by officer", never verified, and the run's
    stored result stays as validation wrote it."""
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    app = load_application(db, user, doc.application_id)
    note = body.note.strip()
    if len(note) < OFFICER_NOTE_MIN:
        raise HTTPException(400, f"Note: say what you examined, in at least {OFFICER_NOTE_MIN} characters")
    if FORBIDDEN_WORDS.search(note):
        raise HTTPException(400, "Note: describe what you examined instead of judging the document")
    if doc.superseded:
        raise HTTPException(409, "This is an earlier version; review the current upload")
    run = latest_run(db, app.id)
    if run is None or run.status != "complete":
        raise HTTPException(409, "Run validation before recording a review")
    current = effective_document_status(db, run).get(doc.id)
    if current is None:
        raise HTTPException(409, "The latest run did not check this document")
    if current != vb.NOT_CHECKED:
        raise HTTPException(409, "Officer review is for documents with no outside source; this document's status "
                                 f"is {STATUS_WORDS.get(current, current.replace('_', ' '))}")
    m = VerificationAttempt(application_id=app.id, document_id=doc.id, run_id=run.id, channel=OFFICER_REVIEW,
                            source_name=f"Officer review by {user.display_name}", simulated=False,
                            status=vb.OFFICER_REVIEWED, request={"document_status": current},
                            response={"note": note}, detail=note, actor=user.username, completed_at=utcnow())
    db.add(m)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="verification.officer_reviewed",
                 object_type="verification", object_id=m.id, application_id=app.id,
                 details={"document_id": doc.id, "run_id": run.id, "note": note})
    db.commit()
    return ser.attempt(m)


@router.get("/applications/{app_id}/audit")
def application_audit(app_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                      db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    from ..models import AuditEvent

    rows = db.scalars(select(AuditEvent).where(AuditEvent.application_id == app.id).order_by(AuditEvent.seq))
    return [ser.audit_event(e) for e in rows]


@router.get("/institutions/{inst_id}")
def get_institution(inst_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "institution" and user.institution_id != inst_id:
        raise HTTPException(404, "institution not found")
    inst = db.get(Institution, inst_id)
    if not inst:
        raise HTTPException(404, "institution not found")
    return ser.institution(inst)


def now_utc() -> datetime:
    return datetime.now(UTC)
