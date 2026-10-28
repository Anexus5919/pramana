"""The scrutiny report for the Executive Committee.

When an official records a scrutiny outcome, Pramana writes one immutable report: the outcome and its reasons, a
summary of the findings with the provisions they relate to, the verification summary from the effective document
status, the correction rounds and whether every review request was answered, and a signed evidence pack built at
that moment. A later outcome adds a new version; an earlier one is never changed.

AICTE's Executive Committee takes the decision on approval and the Council ratifies it (Approval Process Handbook
2024-27, clause 1.10(a); clause 2.25(a) for existing institutions). Pramana prepares the scrutiny stage's record
for that decision; it never decides.
"""

import logging
from collections import Counter
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit
from ..crypto import digest, load_document, sha256_hex, store_document
from ..models import Application, Document, User, ValidationRun, VerificationAttempt, new_id, round_label
from ..officer.common import RECTIFIABLE_CATEGORIES, run_findings
from ..rules.basis import basis_for
from ..rules.engine import active_ruleset
from ..verification import base as vb
from ..verification.effective import FOLLOW_UP_CHANNELS, effective_document_status
from . import channels
from .models import EcForwarding, EcReport

log = logging.getLogger(__name__)

FORMAT = "pramana-ec-report/1"
PREPARED_FOR = "Executive Committee, AICTE"
NOTICE = ("Prepared by Pramana when the scrutiny outcome was recorded. AICTE's Executive Committee takes the "
          "decision on approval and the Council ratifies it; Pramana records and summarises the scrutiny stage and "
          "decides nothing. Findings are preliminary indicators for review by competent authorities. Synthetic demo "
          "data.")
# The chain from the scrutiny stage to the institution, each stage with its basis in the handbook (PDF pages)
PROCESS = [
    {"stage": "Scrutiny", "by": "Scrutiny Committee and Regulation Bureau, supported by Pramana",
     "what": "The documents are verified, deficiencies are communicated and the scrutiny outcome is recorded.",
     "basis": "Approval Process Handbook 2024-27, Annexure 16.8 (PDF page 194)"},
    {"stage": "Decision", "by": "Executive Committee",
     "what": "Takes the decision on approval, after considering the committees' recommendations and the views of "
             "the Regulation Bureau.",
     "basis": "Clause 1.10(a) (PDF page 24); clause 2.25(a) for existing institutions (PDF page 47)"},
    {"stage": "Ratification", "by": "Council", "what": "Ratifies the decision of the Executive Committee.",
     "basis": "Clause 1.10(a) (PDF page 24)"},
    {"stage": "Letter", "by": "AICTE web portal",
     "what": "The decision reaches the institution on the portal as a Letter of Approval, a Letter of Deficiency or "
             "a Letter of Rejection.",
     "basis": "Clause 1.10(b) (PDF page 24)"},
]
SEVERITIES = ("critical", "high", "medium", "low", "info")
# Review statuses in four groups an Executive Committee member can read
GROUPS = ("open", "acknowledged", "resolved", "dismissed")
GROUP_OF = {"open": "open", "evidence_requested": "open", "escalated": "open", "acknowledged": "acknowledged",
            "accepted": "acknowledged", "resolved": "resolved", "dismissed": "dismissed"}
CATEGORY_LABEL = {"completeness": "Completeness", "compliance": "Compliance", "validity": "Validity",
                  "verification": "Verification", "forensic": "Document forensics", "consistency": "Consistency"}
DOC_STATUS_LABEL = {vb.VERIFIED: "Verified", vb.MISMATCH: "Mismatch detected", vb.EXPIRED: "Expired",
                    vb.PENDING: "Pending with the issuer", vb.SOURCE_UNAVAILABLE: "Source unavailable",
                    vb.MANUAL_REVIEW: "Awaiting manual confirmation", vb.NOT_CHECKED: "No outside source",
                    vb.OFFICER_REVIEWED: "Reviewed by officer"}
STATUS_READY = "ready"
STATUS_FORWARDED = "forwarded"
STATUS_LABEL = {STATUS_READY: "Ready for the Executive Committee",
                STATUS_FORWARDED: "Forwarded to the Executive Committee"}


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


# ------------------------------------------------------------------ the report's sections


def findings_summary(db: Session, run: ValidationRun | None) -> dict[str, Any]:
    """Findings on the run the outcome was recorded against, by review group, severity and category, with the
    provisions each relates to from the regulatory basis."""
    fs = run_findings(db, run)
    # The document type the finding page resolves the basis with, so both show the same provisions
    ids = {f.document_id for f in fs if f.document_id}
    types = dict(db.execute(select(Document.id, Document.declared_type)
                            .where(Document.id.in_(ids))).all()) if ids else {}
    by_group = Counter()
    by_severity: dict[str, dict[str, int]] = {}
    by_category: dict[str, dict[str, int]] = {}
    provisions: dict[str, dict[str, Any]] = {}
    items = []
    for n, f in enumerate(fs, start=1):
        g = GROUP_OF.get(f.review_status, "open")
        by_group[g] += 1
        by_severity.setdefault(f.severity, dict.fromkeys(GROUPS, 0))[g] += 1
        by_category.setdefault(f.category, dict.fromkeys(GROUPS, 0))[g] += 1
        basis = basis_for(f.code, types.get(f.document_id))
        cites = []
        for p in (basis or {}).get("provisions", []):
            cites.append(p["cite"])
            row = provisions.setdefault(p["id"], {"id": p["id"], "cite": p["cite"], "number": p["number"],
                                                  "source": p["source"], "page": p["page"], "quote": p["quote"],
                                                  "findings": 0, "open_or_acknowledged": 0})
            row["findings"] += 1
            row["open_or_acknowledged"] += g in ("open", "acknowledged")
        items.append({"no": n, "finding_id": f.id, "code": f.code, "title": f.title, "severity": f.severity,
                      "category": f.category, "evidence_class": f.evidence_class, "review_status": f.review_status,
                      "group": g, "rectifiable": f.category in RECTIFIABLE_CATEGORIES, "relates_to": cites})
    order = {s: i for i, s in enumerate(SEVERITIES)}
    return {
        "run_id": run.id if run else None, "total": len(fs), "by_group": {g: by_group.get(g, 0) for g in GROUPS},
        "by_severity": dict(sorted(by_severity.items(), key=lambda kv: order.get(kv[0], 9))),
        "by_category": dict(sorted(by_category.items())),
        "provisions": sorted(provisions.values(), key=lambda p: (-p["open_or_acknowledged"], p["cite"])),
        "items": items,
    }


def verification_summary(db: Session, app: Application, run: ValidationRun | None) -> dict[str, Any]:
    """Each current document's effective status: the run's stored status with later confirmations applied."""
    rs = active_ruleset()
    status = effective_document_status(db, run)
    docs = db.scalars(select(Document).where(Document.application_id == app.id, Document.superseded.is_(False))
                      .order_by(Document.uploaded_at)).all()
    rows = [{"document_id": d.id, "declared_type": d.declared_type,
             "label": rs.doc_types.get(d.declared_type, {}).get("label", d.declared_type), "sha256": d.sha256,
             "status": status.get(d.id, vb.NOT_CHECKED)} for d in docs]
    simulated = bool(run) and db.scalar(select(func.count()).select_from(VerificationAttempt).where(
        VerificationAttempt.run_id == run.id, VerificationAttempt.simulated.is_(True),
        VerificationAttempt.channel.notin_(FOLLOW_UP_CHANNELS))) > 0
    counts = Counter(r["status"] for r in rows)
    return {"run_id": run.id if run else None, "documents": rows,
            "counts": {k: counts[k] for k in vb.STATUS_ORDER + [vb.OFFICER_REVIEWED] if counts.get(k)},
            "simulated_sources": simulated}


def rounds_summary(db: Session, app: Application) -> dict[str, Any]:
    """Every correction round, and whether each review request the institution made had the cell's answer."""
    from ..conversation import threads as th
    from ..conversation.models import RectMessage, RectStatusChange

    rows = []
    for rect in th.rounds(db, app):
        letter = th.final_letter(db, rect)
        ids = [t.id for t in th.threads_of(db, rect.id)]
        msgs = db.scalars(select(RectMessage).where(RectMessage.thread_id.in_(ids))
                          .order_by(RectMessage.created_at)).all()
        changes = db.scalars(select(RectStatusChange).where(RectStatusChange.thread_id.in_(ids))).all()
        # A review request is answered by any reply or status decision of the cell after it, on the same thread
        cell: dict[str, list[datetime]] = {}
        for m in msgs:
            if m.side == "cell":
                cell.setdefault(m.thread_id, []).append(m.created_at)
        for c in changes:
            if c.side == "cell":
                cell.setdefault(c.thread_id, []).append(c.created_at)
        asked = [m for m in msgs if m.kind == "review_request"]
        answered = sum(1 for m in asked if any(t > m.created_at for t in cell.get(m.thread_id, [])))
        items = letter.items if letter else rect.items
        rows.append({"rectification_id": rect.id, "round": rect.round, "label": th.round_name(rect),
                     "items": len(items), "status": rect.status, "requested_at": _iso(rect.created_at),
                     "responded_at": _iso(rect.responded_at),
                     "letter": {"id": letter.id, "sha256": letter.final_sha256,
                                "finalised_at": _iso(letter.finalised_at)} if letter else None,
                     "messages": len(msgs), "review_requests": len(asked), "review_requests_answered": answered})
    total = sum(r["review_requests"] for r in rows)
    answered = sum(r["review_requests_answered"] for r in rows)
    return {"rounds": rows, "review_requests": total, "review_requests_answered": answered,
            "all_review_requests_answered": answered == total}


def build_content(db: Session, app: Application, out, recorder: User | None, pack: dict[str, Any], *, report_id: str,
                  version: int, supersedes: str | None, prepared_at: datetime) -> dict[str, Any]:
    from ..history.watch import OUTCOMES

    rs = active_ruleset()
    run = db.get(ValidationRun, out.run_id) if out.run_id else None
    inst = app.institution
    return {
        "format": FORMAT, "report_id": report_id, "version": version, "supersedes": supersedes,
        "prepared_at": prepared_at.isoformat(), "prepared_for": PREPARED_FOR,
        "application": {"id": app.id, "institution": inst.name, "aicte_id": inst.aicte_id,
                        "place": ", ".join(x for x in (inst.district, inst.state) if x), "category": app.category,
                        "category_label": rs.checklists.get(app.category, {}).get("label", app.category),
                        "academic_year": app.academic_year, "status": app.status,
                        "submitted_at": _iso(app.submitted_at)},
        "outcome": {"id": out.id, "code": out.outcome, "label": OUTCOMES.get(out.outcome, out.outcome),
                    "reason": out.reason, "round": out.round, "round_label": round_label(out.round),
                    "run_id": out.run_id, "recorded_at": _iso(out.created_at),
                    "recorded_by": {"username": recorder.username, "name": recorder.display_name,
                                    "role": recorder.role} if recorder else None},
        "ruleset": {"id": run.ruleset_id, "sha256": run.ruleset_hash, "input_digest": run.input_digest,
                    "report_digest": run.report_digest} if run else None,
        "findings": findings_summary(db, run),
        "verification": verification_summary(db, app, run),
        "correction_rounds": rounds_summary(db, app),
        "evidence_pack": {"pack_id": pack["pack_id"], "zip_sha256": pack["zip_sha256"],
                          "manifest_sha256": pack["manifest_sha256"], "size": pack["size"],
                          "public_key": pack["public_key"], "checkpoint_seq": pack["checkpoint_seq"],
                          "include_originals": pack["include_originals"]},
        "process": PROCESS,
        "notice": NOTICE,
    }


# ------------------------------------------------------------------ preparing a version


def latest_report(db: Session, app_id: str) -> EcReport | None:
    return db.scalars(select(EcReport).where(EcReport.application_id == app_id)
                      .order_by(EcReport.version.desc()).limit(1)).first()


def prepare(db: Session, app: Application, out, user: User) -> EcReport:
    """Write the next report version for a recorded outcome. Commits (the evidence pack commits as it seals)."""
    from ..officer.pack import build_pack, load_pack
    from .pdf import render

    existing = db.scalars(select(EcReport).where(EcReport.outcome_id == out.id)).first()
    if existing is not None:
        return existing
    prev = latest_report(db, app.id)
    version = (prev.version if prev else 0) + 1
    pack = build_pack(db, app, user, include_originals=False, purpose="executive_committee_report")
    report_id = new_id("ecr")
    now = datetime.fromisoformat(pack["generated_at"])
    recorder = db.get(User, out.actor_id)
    content = build_content(db, app, out, recorder, pack, report_id=report_id, version=version,
                            supersedes=prev.id if prev else None, prepared_at=now)
    rsha = digest(content)
    pdf = render(content, rsha)
    storage = f"ecreport_{report_id}.bin"
    store_document(storage, pdf)
    r = EcReport(id=report_id, application_id=app.id, outcome_id=out.id, version=version, round=out.round,
                 outcome=out.outcome, content=content, report_sha256=rsha, pdf_storage=storage,
                 pdf_sha256=sha256_hex(pdf), pdf_size=len(pdf), pack_id=pack["pack_id"],
                 pack_zip_sha256=pack["zip_sha256"], pack_manifest_sha256=pack["manifest_sha256"],
                 pack_size=pack["size"], prepared_by=user.id, created_at=now)
    db.add(r)
    db.flush()
    deliveries = channels.offer_all(db, r, pdf, load_pack(app.id, pack["pack_id"]) or b"")
    audit.record(db, actor=user.username, actor_role=user.role, action="ec_report.prepared", object_type="ec_report",
                 object_id=r.id, application_id=app.id,
                 details={"version": version, "outcome_id": out.id, "outcome": out.outcome, "round": out.round,
                          "report_sha256": rsha, "pdf_sha256": r.pdf_sha256, "pack_id": r.pack_id,
                          "pack_zip_sha256": r.pack_zip_sha256, "pack_manifest_sha256": r.pack_manifest_sha256,
                          "supersedes": prev.id if prev else None,
                          "channels": [{"channel": d.channel, "sent": d.sent, "detail": d.detail}
                                       for d in deliveries]})
    db.commit()
    return r


def prepare_safely(db: Session, app: Application, out, user: User) -> EcReport | None:
    """Prepare the report after an outcome is committed. A failure leaves the outcome in place, is audited and can
    be retried from the workspace; it never undoes the official's record."""
    try:
        return prepare(db, app, out, user)
    except Exception as e:  # noqa: BLE001  the outcome is already recorded; the report can be prepared again
        log.exception("could not prepare the Executive Committee report for %s", app.id)
        db.rollback()
        audit.record(db, actor=user.username, actor_role=user.role, action="ec_report.preparation_failed",
                     object_type="application", object_id=app.id, application_id=app.id,
                     details={"outcome_id": out.id, "error": f"{type(e).__name__}: {e}"[:300]})
        db.commit()
        return None


def load_pdf(r: EcReport) -> bytes:
    return load_document(r.pdf_storage)


def add_forwarding(db: Session, r: EcReport, user: User, forwarded_on: date, reference: str,
                   note: str | None) -> EcForwarding:
    """Record that an official forwarded the report by hand. Pramana sent nothing, and the record says so. The
    caller validates and commits."""
    f = EcForwarding(report_id=r.id, application_id=r.application_id, channel="manual", sent_by_pramana=False,
                     forwarded_on=forwarded_on, reference=reference, note=note, recorded_by=user.id)
    db.add(f)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="ec_report.forwarding_recorded",
                 object_type="ec_report", object_id=r.id, application_id=r.application_id,
                 details={"version": r.version, "forwarded_on": forwarded_on.isoformat(), "reference": reference,
                          "note": note, "channel": "manual", "sent_by_pramana": False,
                          "report_sha256": r.report_sha256, "pack_zip_sha256": r.pack_zip_sha256})
    return f


# ------------------------------------------------------------------ views


def forwarding_of(db: Session, report_id: str) -> EcForwarding | None:
    return db.scalars(select(EcForwarding).where(EcForwarding.report_id == report_id)).first()


def forwarding_json(db: Session, f: EcForwarding | None) -> dict[str, Any] | None:
    if f is None:
        return None
    u = db.get(User, f.recorded_by)
    return {"id": f.id, "channel": f.channel, "sent_by_pramana": f.sent_by_pramana,
            "forwarded_on": f.forwarded_on.isoformat(), "reference": f.reference, "note": f.note,
            "recorded_by": u.display_name if u else None, "recorded_at": f.created_at.isoformat()}


def report_json(db: Session, r: EcReport, latest_version: int) -> dict[str, Any]:
    c = r.content
    fw = forwarding_of(db, r.id)
    status = STATUS_FORWARDED if fw else STATUS_READY
    base = f"/api/ec-reports/{r.id}"
    return {
        "id": r.id, "application_id": r.application_id, "version": r.version, "latest": r.version == latest_version,
        "superseded_by_version": latest_version if r.version != latest_version else None,
        "status": status, "status_label": STATUS_LABEL[status], "round": r.round, "outcome": c["outcome"],
        "prepared_at": r.created_at.isoformat(), "report_sha256": r.report_sha256, "pdf_sha256": r.pdf_sha256,
        "pdf_size": r.pdf_size,
        "pack": {"pack_id": r.pack_id, "zip_sha256": r.pack_zip_sha256, "manifest_sha256": r.pack_manifest_sha256,
                 "size": r.pack_size, "public_key": c["evidence_pack"]["public_key"]},
        "summary": {"findings": c["findings"]["by_group"], "findings_total": c["findings"]["total"],
                    "provisions": len(c["findings"]["provisions"]),
                    "documents": c["verification"]["counts"],
                    "simulated_sources": c["verification"]["simulated_sources"],
                    "correction_rounds": len(c["correction_rounds"]["rounds"]),
                    "review_requests": c["correction_rounds"]["review_requests"],
                    "review_requests_answered": c["correction_rounds"]["review_requests_answered"]},
        "forwarding": forwarding_json(db, fw),
        "pdf_url": f"{base}/report.pdf", "pack_url": f"{base}/evidence-pack.zip", "record_url": f"{base}",
    }


def application_reports(db: Session, app: Application) -> dict[str, Any]:
    from ..history.watch import current_outcome

    rows = db.scalars(select(EcReport).where(EcReport.application_id == app.id)
                      .order_by(EcReport.version.desc())).all()
    latest = rows[0].version if rows else 0
    out = current_outcome(db, app.id)
    # An outcome with no report means preparation failed; officers can prepare it again
    missing = out is not None and not any(r.outcome_id == out.id for r in rows)
    return {"application_id": app.id, "latest": report_json(db, rows[0], latest) if rows else None,
            "versions": [report_json(db, r, latest) for r in rows], "outcome_without_report": missing,
            "channels": channels.describe(), "process": PROCESS}


def ready_for_ec(db: Session) -> dict[str, Any]:
    """Applications whose latest report is prepared and not yet recorded as forwarded, for the review queue."""
    latest = select(EcReport.application_id, func.max(EcReport.version).label("v")).group_by(
        EcReport.application_id).subquery()
    rows = db.scalars(select(EcReport).join(latest, (EcReport.application_id == latest.c.application_id)
                                            & (EcReport.version == latest.c.v))
                      .order_by(EcReport.created_at)).all()
    ready, forwarded = [], 0
    for r in rows:
        if forwarding_of(db, r.id):
            forwarded += 1
            continue
        app = db.get(Application, r.application_id)
        ready.append({"application_id": r.application_id, "institution": app.institution.name if app else "",
                      "report_id": r.id, "version": r.version, "outcome_label": r.content["outcome"]["label"],
                      "prepared_at": r.created_at.isoformat()})
    return {"ready": len(ready), "forwarded": forwarded, "items": ready}
