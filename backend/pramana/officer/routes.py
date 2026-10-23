"""Officer tool endpoints: deficiency letters, evidence packs and Ask why."""

import hashlib
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..auth import OFFICIAL_ROLES, current_user, load_application, require_roles
from ..crypto import load_document, store_document
from ..db import get_db
from ..models import Application, DeficiencyLetter, Finding, RectificationRequest, User, utcnow
from ..rules.engine import active_ruleset
from . import letter as lt
from .common import FORBIDDEN_WORDS, citation, latest_run, rules_by_id, run_findings

router = APIRouter(prefix="/api", tags=["officer"])
LETTER_CATEGORIES = ("completeness", "compliance", "validity")


def _names(db: Session, *ids: str | None) -> dict[str, str]:
    out = {}
    for i in {x for x in ids if x}:
        u = db.get(User, i)
        if u:
            out[i] = u.display_name
    return out


def _load_letter(db: Session, user: User, letter_id: str) -> tuple[DeficiencyLetter, Application]:
    letter = db.get(DeficiencyLetter, letter_id)
    if not letter:
        raise HTTPException(404, "letter not found")
    app = load_application(db, user, letter.application_id)
    # Institutions only ever see letters that were finalised and sent to them
    if user.role == "institution" and letter.status != "final":
        raise HTTPException(404, "letter not found")
    return letter, app


def _open_rectification(db: Session, app: Application) -> RectificationRequest | None:
    return db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == app.id,
                                                         RectificationRequest.status == "open")
                      .order_by(RectificationRequest.created_at.desc())).first()


def _has_letter(db: Session, rect_id: str) -> bool:
    return db.scalars(select(DeficiencyLetter).where(DeficiencyLetter.rectification_id == rect_id)).first() is not None


def _default_findings(db: Session, app: Application) -> list[Finding]:
    """Findings already chosen for rectification, else the open deficiencies of the latest run."""
    rect = _open_rectification(db, app)
    if rect and not _has_letter(db, rect.id):
        fs = [db.get(Finding, i["finding_id"]) for i in rect.items]
        return [f for f in fs if f]
    fs = run_findings(db, latest_run(db, app.id))
    chosen = [f for f in fs if f.review_status == "evidence_requested"]
    return chosen or [f for f in fs if f.category in LETTER_CATEGORIES and f.review_status in ("open", "acknowledged")]


def _clean(text: str, what: str) -> str:
    text = "".join(ch for ch in (text or "") if ch in "\n\t" or ord(ch) >= 32).strip()
    if FORBIDDEN_WORDS.search(text):
        raise HTTPException(400, f"{what}: describe the issue neutrally (for example 'could not be confirmed' or "
                                 "'modified after signing') instead of judging the document")
    return text


def _render(db: Session, letter: DeficiencyLetter, app: Application) -> bytes:
    if letter.status == "final" and letter.storage_name:
        return load_document(letter.storage_name)
    officer = db.get(User, letter.created_by)
    return lt.render_pdf(letter, app, officer, final=False)


# ------------------------------------------------------------------ deficiency letters


class DraftBody(BaseModel):
    finding_ids: list[str] | None = None


@router.post("/applications/{app_id}/letters")
def draft_letter(app_id: str, body: DraftBody, user: User = Depends(require_roles("officer")),
                 db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    rs = active_ruleset()
    if body.finding_ids:
        fs = []
        for fid in dict.fromkeys(body.finding_ids):
            f = db.get(Finding, fid)
            if not f or f.application_id != app.id:
                raise HTTPException(400, f"finding {fid} does not belong to this application")
            fs.append(f)
    else:
        fs = _default_findings(db, app)
    if not fs:
        raise HTTPException(400, "there are no open deficiencies to put in a letter; select findings first")
    # One working draft per application: a new draft replaces the previous unsent one
    for old in db.scalars(select(DeficiencyLetter).where(DeficiencyLetter.application_id == app.id,
                                                         DeficiencyLetter.status == "draft")):
        db.delete(old)
    respond_by = lt.default_deadline()
    letter = DeficiencyLetter(application_id=app.id, round=app.round, status="draft", subject=lt.default_subject(app),
                              intro=lt.DEFAULT_INTRO, items=lt.draft_items(db, fs, rs, respond_by),
                              created_by=user.id)
    db.add(letter)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="letter.drafted", object_type="letter",
                 object_id=letter.id, application_id=app.id, details={"findings": [c for i in letter.items for c in i["codes"]]})
    db.commit()
    pdf = lt.render_pdf(letter, app, user, final=False)
    return lt.letter_json(letter, page_count=lt.page_count(pdf), names=_names(db, letter.created_by))


@router.get("/applications/{app_id}/letters")
def list_letters(app_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    q = select(DeficiencyLetter).where(DeficiencyLetter.application_id == app.id)
    inst = user.role == "institution"
    if inst:
        q = q.where(DeficiencyLetter.status == "final")
    rows = db.scalars(q.order_by(DeficiencyLetter.created_at.desc())).all()
    names = _names(db, *[r.created_by for r in rows], *[r.finalised_by for r in rows])
    return [lt.letter_json(r, for_institution=inst, names=names) for r in rows]


@router.get("/letters/{letter_id}")
def get_letter(letter_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    letter, app = _load_letter(db, user, letter_id)
    inst = user.role == "institution"
    pages = None if inst else lt.page_count(_render(db, letter, app))
    return lt.letter_json(letter, for_institution=inst, page_count=pages,
                          names=_names(db, letter.created_by, letter.finalised_by))


class ItemBody(BaseModel):
    finding_ids: list[str] = Field(min_length=1, max_length=20)
    title: str = Field(min_length=3, max_length=300)
    description: str = Field(min_length=3, max_length=2000)
    required: str = Field(min_length=3, max_length=1200)
    rule_id: str | None = None
    respond_by: date


class LetterBody(BaseModel):
    subject: str = Field(min_length=3, max_length=300)
    intro: str = Field(max_length=3000)
    items: list[ItemBody] = Field(min_length=1, max_length=40)


@router.put("/letters/{letter_id}")
def update_letter(letter_id: str, body: LetterBody, user: User = Depends(require_roles("officer")),
                  db: Session = Depends(get_db)):
    letter, app = _load_letter(db, user, letter_id)
    if letter.status != "draft":
        raise HTTPException(409, "this letter is final and can no longer be edited")
    rs = active_ruleset()
    rules = rules_by_id(rs)
    items, seen = [], set()
    for it in body.items:
        fs = [db.get(Finding, i) for i in it.finding_ids]
        if any(not f or f.application_id != app.id or f.id in seen for f in fs):
            raise HTTPException(400, "an item refers to a finding that is not valid for this application")
        seen.update(f.id for f in fs)
        if it.rule_id and it.rule_id not in rules:
            raise HTTPException(400, f"unknown rule {it.rule_id}")
        if it.respond_by < date.today():
            raise HTTPException(400, "the response date cannot be in the past")
        items.append({"finding_ids": [f.id for f in fs], "codes": [f.code for f in fs],
                      "title": _clean(it.title, "Item title"),
                      "description": _clean(it.description, "Item description"),
                      "required": _clean(it.required, "What to submit"),
                      # The clause text always comes from the ruleset, never from the editor
                      "citation": citation(rs, rules[it.rule_id]) if it.rule_id else None,
                      "respond_by": it.respond_by.isoformat()})
    letter.subject = _clean(body.subject, "Subject")
    letter.intro = _clean(body.intro, "Opening paragraph")
    letter.items = items
    letter.updated_at = utcnow()
    db.commit()
    pdf = lt.render_pdf(letter, app, db.get(User, letter.created_by), final=False)
    return lt.letter_json(letter, page_count=lt.page_count(pdf), names=_names(db, letter.created_by))


@router.get("/letters/{letter_id}/pdf")
def letter_pdf(letter_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    letter, app = _load_letter(db, user, letter_id)
    data = _render(db, letter, app)
    if letter.status == "final":
        audit.record(db, actor=user.username, actor_role=user.role, action="letter.downloaded", object_type="letter",
                     object_id=letter.id, application_id=app.id, details={"sha256": letter.final_sha256})
        db.commit()
    name = f"deficiency-notice-{app.id}-r{letter.round}{'' if letter.status == 'final' else '-DRAFT'}.pdf"
    return Response(data, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{name}"', "X-Content-Type-Options": "nosniff"})


@router.get("/letters/{letter_id}/pages/{page_no}.png")
def letter_page(letter_id: str, page_no: int, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                db: Session = Depends(get_db)):
    from ..pipeline.text import render_pdf_page

    letter, app = _load_letter(db, user, letter_id)
    data = _render(db, letter, app)
    if page_no < 1 or page_no > lt.page_count(data):
        raise HTTPException(404, "no such page")
    out = io.BytesIO()
    render_pdf_page(data, page_no - 1, 110).save(out, "PNG", optimize=True)
    return Response(out.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})


class FinaliseBody(BaseModel):
    reason: str = Field(min_length=8, max_length=1000)
    message: str | None = Field(None, max_length=2000)


@router.post("/letters/{letter_id}/finalise")
def finalise_letter(letter_id: str, body: FinaliseBody, user: User = Depends(require_roles("officer")),
                    db: Session = Depends(get_db)):
    """Render the final PDF, attach it to the rectification request and record its digest in the audit chain."""
    from ..api.applications import RectifyBody, request_rectification

    letter, app = _load_letter(db, user, letter_id)
    if letter.status != "draft":
        raise HTTPException(409, "this letter is already final")
    reason = _clean(body.reason, "Reason")
    message = _clean(body.message, "Message") if body.message else None
    now = utcnow()
    officer = db.get(User, letter.created_by)
    data = lt.render_pdf(letter, app, officer, final=True, finalised_on=now)
    sha = hashlib.sha256(data).hexdigest()
    ids = [fid for i in letter.items for fid in i["finding_ids"]]
    rect = _open_rectification(db, app)
    if rect and not _has_letter(db, rect.id) and {i["finding_id"] for i in rect.items} == set(ids):
        rect_id, created = rect.id, False
    else:
        # The existing rectification flow sets finding statuses, snapshots the application and opens the round
        res = request_rectification(app.id, RectifyBody(finding_ids=ids, message=message or letter.subject), user, db)
        rect_id, created = res["id"], True
    letter = db.get(DeficiencyLetter, letter_id)
    letter.storage_name = f"letter_{letter.id}.bin"
    store_document(letter.storage_name, data)
    letter.status, letter.final_sha256, letter.final_reason = "final", sha, reason
    letter.finalised_by, letter.finalised_at, letter.rectification_id = user.id, now, rect_id
    audit.record(db, actor=user.username, actor_role=user.role, action="letter.finalised", object_type="letter",
                 object_id=letter.id, application_id=app.id,
                 details={"sha256": sha, "size": len(data), "rectification_id": rect_id, "reason": reason,
                          "findings": [c for i in letter.items for c in i["codes"]], "new_rectification": created})
    db.commit()
    return {"letter": lt.letter_json(letter, page_count=lt.page_count(data),
                                     names=_names(db, letter.created_by, letter.finalised_by)),
            "rectification_id": rect_id, "rectification_created": created, "round": app.round}
