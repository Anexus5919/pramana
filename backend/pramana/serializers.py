from typing import Any

from .models import (
    Application,
    AuditEvent,
    Document,
    ExtractedField,
    Finding,
    ReviewAction,
    User,
    ValidationRun,
    VerificationAttempt,
)


def _dt(v):
    return v.isoformat() if v else None


def user(u: User) -> dict[str, Any]:
    return {"id": u.id, "username": u.username, "display_name": u.display_name, "role": u.role,
            "institution_id": u.institution_id}


def institution(i) -> dict[str, Any]:
    return {"id": i.id, "aicte_id": i.aicte_id, "name": i.name, "aishe_code": i.aishe_code,
            "society_name": i.society_name, "address": i.address, "state": i.state, "district": i.district,
            "pincode": i.pincode, "latitude": i.latitude, "longitude": i.longitude,
            "institution_type": i.institution_type, "women_only": i.women_only,
            "established_year": i.established_year}


def run_brief(r: ValidationRun | None) -> dict[str, Any] | None:
    if r is None:
        return None
    s = r.summary or {}
    return {"id": r.id, "status": r.status, "round": r.round, "ruleset_id": r.ruleset_id,
            "ruleset_hash": r.ruleset_hash, "engine_version": r.engine_version, "input_digest": r.input_digest,
            "report_digest": r.report_digest, "started_at": _dt(r.started_at), "finished_at": _dt(r.finished_at),
            "findings": s.get("findings"), "by_severity": s.get("by_severity", {}),
            "by_category": s.get("by_category", {}), "by_evidence_class": s.get("by_evidence_class", {}),
            "review_priority": s.get("review_priority"), "document_status": s.get("document_status", {}),
            "as_of": s.get("as_of"), "replay_of": s.get("replay_of"), "triggered_by": r.triggered_by,
            "error": r.error}


def run_full(r: ValidationRun) -> dict[str, Any]:
    s = r.summary or {}
    return {**run_brief(r), "stages": r.stages, "checklist": s.get("checklist", []), "graph": s.get("graph"),
            "resolved_since_previous": s.get("resolved_since_previous", []),
            "previous_run": s.get("previous_run"), "facts": s.get("facts", [])}


def application(a: Application, latest: ValidationRun | None = None) -> dict[str, Any]:
    return {"id": a.id, "institution": institution(a.institution), "category": a.category,
            "academic_year": a.academic_year, "status": a.status, "round": a.round, "declared": a.declared,
            "created_at": _dt(a.created_at), "submitted_at": _dt(a.submitted_at), "latest_run": run_brief(latest)}


def field(f: ExtractedField) -> dict[str, Any]:
    return {"id": f.id, "name": f.name, "raw": f.raw, "value": f.value, "value_type": f.value_type, "page": f.page,
            "bbox": f.bbox, "method": f.method, "confidence": f.confidence, "status": f.status}


def document(d: Document, *, detail: bool = False) -> dict[str, Any]:
    out = {"id": d.id, "application_id": d.application_id, "round": d.round, "declared_type": d.declared_type,
           "detected_type": d.detected_type, "original_filename": d.original_filename, "sha256": d.sha256,
           "size_bytes": d.size_bytes, "mime": d.mime, "page_count": d.page_count, "text_source": d.text_source,
           "processing_status": d.processing_status, "processing_error": d.processing_error,
           "uploaded_at": _dt(d.uploaded_at), "superseded": d.superseded}
    if detail:
        an = d.analysis or {}
        out.update({
            "classification": d.classification,
            "pages": [{"page_no": p.page_no, "width": p.width, "height": p.height, "text_source": p.text_source,
                       "ocr_mean_confidence": p.ocr_mean_confidence, "text": p.text} for p in d.pages],
            "fields": [field(f) for f in d.fields],
            "forensic_signals": an.get("forensic_signals", []),
            "forensic_facts": an.get("forensic_facts", {}),
            "qr": [{"page": q["page"], "bbox": q["bbox"], "length": len(q["text"])} for q in an.get("qr", [])],
            "rows": an.get("rows"),
            "fingerprints": {k: v for k, v in (d.fingerprints or {}).items() if k != "minhash"},
        })
    return out


def finding(f: Finding) -> dict[str, Any]:
    return {"id": f.id, "run_id": f.run_id, "code": f.code, "fingerprint": f.fingerprint, "category": f.category,
            "evidence_class": f.evidence_class, "severity": f.severity, "outcome": f.outcome, "title": f.title,
            "message": f.message, "limitation": f.limitation, "rule": f.rule, "evidence": f.evidence,
            "trace": f.trace, "document_id": f.document_id, "review_status": f.review_status,
            "review_note": f.review_note}


def attempt(v: VerificationAttempt) -> dict[str, Any]:
    return {"id": v.id, "document_id": v.document_id, "run_id": v.run_id, "channel": v.channel,
            "source_name": v.source_name, "simulated": v.simulated, "status": v.status, "request": v.request,
            "response": v.response, "comparison": v.comparison, "detail": v.detail, "actor": v.actor,
            "started_at": _dt(v.started_at), "completed_at": _dt(v.completed_at)}


def review(r: ReviewAction, actor_name: str | None = None) -> dict[str, Any]:
    return {"id": r.id, "finding_id": r.finding_id, "actor_id": r.actor_id, "actor": actor_name, "action": r.action,
            "note": r.note, "created_at": _dt(r.created_at)}


def audit_event(e: AuditEvent) -> dict[str, Any]:
    return {"seq": e.seq, "ts": _dt(e.ts), "actor": e.actor, "actor_role": e.actor_role, "action": e.action,
            "object_type": e.object_type, "object_id": e.object_id, "application_id": e.application_id,
            "details": e.details, "prev_hash": e.prev_hash, "hash": e.hash}
