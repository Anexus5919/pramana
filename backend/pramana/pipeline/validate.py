"""A validation run: process documents, evaluate rules, verify with issuers, collect forensic and
cross-application signals, and pin everything needed to reproduce the result."""

import logging
import shutil
import time
from collections.abc import Callable
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from .. import audit
from ..config import get_settings
from ..consistency.cross import cross_checks, relationship_graph
from ..consistency.seal_reuse import seal_reuse
from ..crypto import digest, load_document, sha256_hex
from ..history.yoy import findings as yoy_findings
from ..models import (
    Application,
    Document,
    Finding,
    Institution,
    RectificationRequest,
    ReferenceRecord,
    ValidationRun,
    VerificationAttempt,
    utcnow,
)
from ..photos.findings import photo_stage
from ..rules.engine import ERROR, FAIL, INSUFFICIENT, Ruleset, active_ruleset, evaluate, load_ruleset
from ..verification import base as vb
from ..verification import issuer_copy
from ..verification.issuer import adapters, compare_values
from ..verification.signature import validate_signatures
from ..verification.signed_qr import verify_token
from .facts_builder import build_facts, latest_by_type
from .process import process_document

log = logging.getLogger(__name__)
ENGINE_VERSION = "0.3.0"
SEVERITY_WEIGHT = {"critical": 40, "high": 15, "medium": 5, "low": 1, "info": 0}
STATUS_ORDER = [vb.MISMATCH, vb.EXPIRED, vb.SOURCE_UNAVAILABLE, vb.MANUAL_REVIEW, vb.PENDING, vb.VERIFIED, vb.NOT_CHECKED]


def as_of_date(app: Application) -> date:
    """Documents are judged on the date they were submitted; in a rectification round, on the response date."""
    db = object_session(app)
    if app.round > 1 and db is not None:
        r = db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == app.id,
                                                          RectificationRequest.status == "responded")
                       .order_by(RectificationRequest.responded_at.desc())).first()
        if r and r.responded_at:
            return r.responded_at.date()
    return (app.submitted_at or app.created_at).date()


def _archive_ruleset(rs: Ruleset) -> None:
    d = get_settings().data_dir / "rulesets"
    d.mkdir(parents=True, exist_ok=True)
    dst = d / f"{rs.sha256}.yaml"
    if not dst.exists():
        shutil.copyfile(rs.path, dst)


def ruleset_by_hash(h: str) -> Ruleset | None:
    p = get_settings().data_dir / "rulesets" / f"{h}.yaml"
    return load_ruleset(p) if p.exists() else None


def _evidence_from_inputs(inputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ev = []
    for i in inputs:
        prov = i.get("provenance", {})
        if i["source"] == "document":
            ev.append({"kind": "region", "document_id": prov.get("document_id"), "page": prov.get("page"),
                       "bbox": prov.get("bbox"), "label": i["path"], "value": i["value"], "raw": prov.get("raw")})
        elif i["source"] == "reference":
            ev.append({"kind": "reference_record", "record_id": prov.get("record_id"), "source": prov.get("record"),
                       "label": i["path"], "value": i["value"]})
        else:
            ev.append({"kind": "declared", "field": prov.get("form_field"), "label": i["path"], "value": i["value"]})
    return ev


def _overlap(a: list[float], b: list[float]) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def _fp(*parts: Any) -> str:
    return sha256_hex("|".join(str(p) for p in parts).encode())


def _rule_findings(rs: Ruleset, results, app: Application) -> list[dict[str, Any]]:
    out = []
    for r in results:
        if r.outcome not in (FAIL, INSUFFICIENT, ERROR):
            continue
        rule = r.rule
        sources = {i["source"] for i in r.inputs}
        eclass = "record" if "reference" in sources else "rule"
        sev = rule.get("severity", "medium") if r.outcome == FAIL else ("medium" if r.outcome == INSUFFICIENT else "low")
        title = rule["title"] if r.outcome == FAIL else f"Cannot evaluate: {rule['title']}"
        ev = _evidence_from_inputs(r.inputs)
        doc_id = next((e["document_id"] for e in ev if e.get("document_id")), None)
        out.append({
            "code": rule["id"], "fingerprint": _fp("rule", rule["id"], r.outcome), "category": rule.get("category", "compliance"),
            "evidence_class": eclass, "severity": sev, "outcome": r.outcome, "title": title, "message": r.message,
            "limitation": rule.get("limitation"), "rule": {"id": rule["id"], "version": rule.get("version"),
                                                           "citation": r.citation(rs)},
            "evidence": ev, "trace": {"inputs": r.inputs, "missing": r.missing, "detail": r.detail,
                                      "check": rule.get("check")},
            "document_id": doc_id,
        })
    return out


def _qr_compare(doc: Document, payload: dict[str, Any], mapping: dict[str, str]) -> list[vb.Comparison]:
    fields = {f.name: f for f in doc.fields}
    comps = []
    for pkey, fname in mapping.items():
        if pkey in payload:
            f = fields.get(fname)
            comps.append(compare_values(fname, f.value if f else None, payload[pkey]))
    return comps


def _signer_role(signer: str, vspec: dict[str, Any], inst: Institution) -> str:
    s = signer.lower()
    if any(p.lower() in s for p in vspec.get("issuer_signers", [])):
        return "issuer"
    names = [(inst.attributes or {}).get("authorised_signatory", ""), inst.name, inst.society_name or ""]
    if any(n and n.lower() in s for n in names):
        return "applicant"
    return "unknown"


def _classify_signatures(results: list[vb.VerificationResult], vspec: dict[str, Any],
                         inst: Institution) -> list[vb.VerificationResult]:
    """Separate who signed. A valid applicant DSC proves who uploaded the file, not who issued it."""
    out = []
    expects_issuer = bool(vspec.get("issuer_signers"))
    issuer_seen = False
    for r in results:
        if r.status == vb.NOT_CHECKED:
            r.channel = "issuer_signature" if expects_issuer else "applicant_signature"
            out.append(r)
            continue
        role = _signer_role(r.response.get("signer", ""), vspec, inst)
        r.response["signer_role"] = role
        if role == "applicant":
            r.channel = "applicant_signature"
            if r.status == vb.VERIFIED:
                r.claim = "The institution's authorised signatory signed this exact file. This does not authenticate the issuer."
                r.detail += " Signer is the applicant institution, not the issuing authority."
        else:
            r.channel = "issuer_signature"
            issuer_seen = True
            if role == "unknown" and r.status == vb.VERIFIED:
                r.status = vb.MANUAL_REVIEW
                r.detail += " The signer is neither the expected issuing authority nor the applicant."
        out.append(r)
    if expects_issuer and not issuer_seen and not any(r.channel == "issuer_signature" for r in out):
        out.append(vb.VerificationResult(
            "issuer_signature", vb.NOT_CHECKED, "Embedded signature", False,
            "No signature from the issuing authority. Any signature present is the applicant's own DSC."))
    return out


def _verify_document(doc: Document, spec: dict[str, Any], as_of: date, inst: Institution,
                     on_checks: Callable[[list[vb.VerificationResult]], None] | None = None) -> list[vb.VerificationResult]:
    results: list[vb.VerificationResult] = []
    vspec = spec.get("verification") or {}
    reported = 0

    def report() -> None:
        # Live progress: hand over each group of checks as soon as it finishes
        nonlocal reported
        if on_checks and len(results) > reported:
            on_checks(results[reported:])
        reported = len(results)

    if doc.mime == "application/pdf":
        results.extend(_classify_signatures(validate_signatures(load_document(doc.storage_name)), vspec, inst))
        report()
    tokens = (doc.analysis or {}).get("qr", [])
    for tok in tokens:
        chk = verify_token(tok["text"])
        if chk.payload is None and not chk.ok:
            continue  # a QR that is not a signed token (e.g. a URL) is reported in the document view only
        if not chk.ok:
            status = vb.MANUAL_REVIEW if chk.issuer is None else vb.MISMATCH
            results.append(vb.VerificationResult(
                "signed_qr", status, chk.issuer["issuer"] if chk.issuer else "Unknown issuer key", True,
                f"QR token on page {tok['page']}: {chk.error}.", {"page": tok["page"], "kid": chk.kid},
                {"payload": chk.payload}))
            continue
        comps = _qr_compare(doc, chk.payload, vspec.get("qr_fields", {}))
        bad = [c for c in comps if c.match is False]
        to = chk.payload.get("valid_until")
        if bad:
            status, detail = vb.MISMATCH, ("The issuer-signed QR verifies, but its signed values disagree with the printed text: "
                                           + "; ".join(f"{c.field} printed '{c.submitted}' vs signed '{c.authoritative}'"
                                                       for c in bad))
        elif to and date.fromisoformat(to) < as_of:
            status, detail = vb.EXPIRED, f"Signed QR verifies; the validity it certifies ended {to}."
        else:
            status, detail = vb.VERIFIED, (f"Signed QR from {chk.issuer['issuer']} verifies and matches "
                                           f"{len(comps)} printed fields.")
        results.append(vb.VerificationResult(
            "signed_qr", status, chk.issuer["issuer"], bool(chk.issuer.get("simulated")), detail,
            {"page": tok["page"], "kid": chk.kid, "bbox": tok["bbox"]}, {"payload": chk.payload}, comps,
            claim="Signature over the QR payload verified with the issuer's published key."))
    report()
    issuer_code = vspec.get("issuer")
    if issuer_code:
        adapter = adapters().get(issuer_code)
        ref_field = vspec.get("ref_field")
        fields = {f.name: f.value for f in doc.fields}
        ref = fields.get(ref_field)
        if adapter is None:
            results.append(vb.VerificationResult("issuer_registry", vb.SOURCE_UNAVAILABLE, issuer_code, True,
                                                 "No adapter configured for this issuer."))
        elif not ref:
            results.append(vb.VerificationResult(
                "issuer_registry", vb.MANUAL_REVIEW, adapter.name, True,
                f"Reference number ({ref_field}) could not be read from the document, so the issuer was not queried."))
        else:
            results.append(adapter.verify(ref, fields, as_of))
    report()
    return results


def _declared_changes(before: dict[str, Any], after: dict[str, Any]) -> set[str]:
    keys = set(before) | set(after)
    return {k for k in keys if before.get(k) != after.get(k)}


def _rectification_scope(db: Session, app: Application, docs: list[Document]) -> list[dict[str, Any]]:
    """Changes made in a rectification round that the officer did not ask for.

    Re-scrutiny examines only the deficiencies raised earlier, so edits outside that scope would
    otherwise pass unexamined."""
    req = db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == app.id,
                                                        RectificationRequest.status == "responded")
                     .order_by(RectificationRequest.created_at.desc())).first()
    if not req or not req.snapshot or req.round != app.round - 1:
        return []
    scope_docs = {i.get("document_type") for i in req.items if i.get("document_type")}
    scope_fields = set()
    for i in req.items:
        for p in i.get("fact_paths", []):
            if p.startswith("doc."):
                scope_docs.add(p.split(".")[1])
            elif p.startswith("app."):
                scope_fields.add(p.split(".")[1])
    if any(f in scope_fields for f in ("total_proposed_intake", "total_approved_intake_claimed", "programme_count")):
        scope_fields.add("programmes")
    now_docs = {d.declared_type: d.sha256 for d in docs}
    before_docs = req.snapshot.get("documents", {})
    changed_docs = {t for t in set(now_docs) | set(before_docs) if now_docs.get(t) != before_docs.get(t)}
    changed_fields = _declared_changes(req.snapshot.get("declared", {}), app.declared or {})
    out = []
    for t in sorted(changed_docs - scope_docs):
        d = next((x for x in docs if x.declared_type == t), None)
        out.append({
            "code": "RECT-OUT-OF-SCOPE-DOCUMENT", "fingerprint": _fp("rect", "doc", t), "category": "consistency",
            "evidence_class": "record", "severity": "medium", "outcome": "indicator",
            "title": "Document changed outside the rectification request",
            "message": f"In round {app.round} the {t.replace('_', ' ')} was "
                       f"{'replaced' if t in before_docs and t in now_docs else 'added' if t in now_docs else 'removed'}, "
                       "but the rectification request did not ask for it. Re-scrutiny of only the requested items "
                       "would not examine this change.",
            "evidence": [{"kind": "document", "document_id": d.id}] if d else [], "document_id": d.id if d else None})
    for k in sorted(changed_fields - scope_fields):
        out.append({
            "code": "RECT-OUT-OF-SCOPE-FIELD", "fingerprint": _fp("rect", "field", k), "category": "consistency",
            "evidence_class": "record", "severity": "medium", "outcome": "indicator",
            "title": "Declared value changed outside the rectification request",
            "message": f"'{k}' changed from {req.snapshot.get('declared', {}).get(k)!r} to "
                       f"{(app.declared or {}).get(k)!r} in round {app.round}, outside the items requested.",
            "evidence": [{"kind": "declared", "field": k, "value": (app.declared or {}).get(k)}], "document_id": None})
    return out


def document_status(results: list[vb.VerificationResult]) -> str:
    """Authenticity status of a document; the applicant's own signature only counts when it is broken."""
    statuses = [r.status for r in results if r.channel != "applicant_signature" or r.status == vb.MISMATCH]
    real = [s for s in statuses if s != vb.NOT_CHECKED]
    if not real:
        return vb.NOT_CHECKED
    for s in STATUS_ORDER:
        if s in real:
            return s
    return vb.NOT_CHECKED


def run_validation(db: Session, app: Application, actor: str, actor_role: str, *, ruleset: Ruleset | None = None,
                   as_of: date | None = None, replay_of: str | None = None, run: ValidationRun | None = None,
                   progress: Callable[..., None] | None = None) -> ValidationRun:
    """Synchronous run. Background jobs (pramana.jobs) pass a queued `run` and a `progress` callback."""
    rs = ruleset or active_ruleset()
    _archive_ruleset(rs)
    as_of = as_of or as_of_date(app)
    if run is None:
        run = ValidationRun(application_id=app.id, round=app.round, ruleset_id=f"{rs.id}@{rs.version}",
                            ruleset_hash=rs.sha256, engine_version=ENGINE_VERSION, triggered_by=actor)
        db.add(run)
    else:
        run.round, run.ruleset_id, run.ruleset_hash = app.round, f"{rs.id}@{rs.version}", rs.sha256
        run.engine_version, run.status = ENGINE_VERSION, "running"
    db.flush()
    stages: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    emit = progress or (lambda *a, **k: None)

    def stage(name: str, t0: float, **info: Any) -> None:
        stages.append({"stage": name, "ms": round((time.perf_counter() - t0) * 1000), **info})
        emit("stage.finished", **stages[-1], findings=len(findings))

    try:
        docs = list(db.scalars(select(Document).where(Document.application_id == app.id,
                                                      Document.superseded.is_(False))))
        campus = (app.institution.latitude, app.institution.longitude) if app.institution.latitude else None

        t0 = time.perf_counter()
        processed = 0
        for d in docs:
            if d.processing_status != "processed":
                try:
                    process_document(db, d, rs, campus, progress)
                    processed += 1
                except Exception as e:  # noqa: BLE001  one bad file must not sink the run
                    log.exception("processing failed for %s", d.id)
                    d.processing_status, d.processing_error = "failed", str(e)[:500]
            emit("doc.done", document_id=d.id, declared_type=d.declared_type, status=d.processing_status)
        db.flush()
        stage("document_processing", t0, documents=len(docs), newly_processed=processed)

        t0 = time.perf_counter()
        for d in docs:
            if d.processing_status == "failed":
                findings.append({"code": "DOC-PROCESSING-FAILED", "fingerprint": _fp("proc", d.declared_type),
                                 "category": "completeness", "evidence_class": "structural", "severity": "medium",
                                 "outcome": "manual_review", "title": "Document could not be processed",
                                 "message": f"'{d.original_filename}': {d.processing_error}", "evidence": [],
                                 "document_id": d.id})
                continue
            cls = d.classification or {}
            if cls.get("type") and cls["type"] != d.declared_type and d.declared_type in rs.doc_types:
                findings.append({
                    "code": "DOC-TYPE-MISMATCH", "fingerprint": _fp("cls", d.declared_type, cls["type"]),
                    "category": "completeness", "evidence_class": "heuristic", "severity": "medium",
                    "outcome": "fail", "title": "Uploaded document does not look like the required document",
                    "message": f"Uploaded as {rs.doc_types[d.declared_type]['label']} but its content matches "
                               f"{rs.doc_types.get(cls['type'], {}).get('label', cls['type'])} "
                               f"(keywords: {', '.join(cls['candidates'][0]['matched'][:4])}).",
                    "limitation": "Keyword classification; a reviewer should open the file.",
                    "evidence": [{"kind": "document", "document_id": d.id}], "document_id": d.id})
            for il in (d.analysis or {}).get("instruction_lines") or []:
                findings.append({
                    "code": "SEC-INSTRUCTION-TEXT", "fingerprint": _fp("inj", d.declared_type, il["text"][:60]),
                    "category": "forensic", "evidence_class": "structural", "severity": "high",
                    "outcome": "indicator", "title": "Document contains instructions aimed at automated readers",
                    "message": f"Page {il['page']} says: '{il['text']}'. Certificates from issuers do not address "
                               "software. Values found only in this line are never accepted.",
                    "limitation": "Pattern-based; unusual but legitimate wording could match. Read the line.",
                    "evidence": [{"kind": "region", "document_id": d.id, "page": il["page"], "bbox": il["bbox"],
                                  "label": "instruction text", "value": il["text"]}],
                    "document_id": d.id})
            unread = (d.analysis or {}).get("unreadable_pages") or []
            if unread:
                findings.append({
                    "code": "DOC-UNREADABLE", "fingerprint": _fp("unread", d.declared_type),
                    "category": "completeness", "evidence_class": "structural", "severity": "medium",
                    "outcome": "manual_review", "title": "Pages could not be read",
                    "message": f"No text layer and OCR produced nothing on pages {unread}. Values on these pages "
                               "were not checked.", "evidence": [{"kind": "document", "document_id": d.id}],
                    "document_id": d.id})
            for sc in (d.analysis or {}).get("ocr_scripts") or []:
                if sc.get("read") is False:
                    findings.append({
                        "code": "DOC-SCRIPT-NOT-READ", "fingerprint": _fp("script", d.declared_type, sc["page"]),
                        "category": "completeness", "evidence_class": "structural", "severity": "medium",
                        "outcome": "manual_review", "title": "Hindi text was not read",
                        "message": f"Page {sc['page']} carries Devanagari text ({sc.get('reason')}). "
                                   f"{sc.get('note')} Values printed only in Hindi were not checked.",
                        "evidence": [{"kind": "document", "document_id": d.id}], "document_id": d.id})
            diffs = ((d.analysis or {}).get("forensic_facts") or {}).get("revision_diffs") or []
            for f in d.fields:
                hit = next((x for x in diffs if f.bbox and x.get("bbox") and x["page"] == f.page
                            and _overlap(f.bbox, x["bbox"])), None)
                if hit:
                    label = f.name.replace("_", " ")
                    findings.append({
                        "code": "FX-FIELD-OVERWRITTEN", "fingerprint": _fp("fxf", d.declared_type, f.name),
                        "category": "forensic", "evidence_class": "structural", "severity": "high",
                        "outcome": "indicator", "title": f"{label.capitalize()} was overwritten",
                        "message": f"The text layer reads '{f.raw}' for {label}, but revision {hit['to_revision']} "
                                   f"drew '{hit['added_text']}' over that position. A reader sees "
                                   f"'{hit['added_text']}'; checks in this report use the original '{f.raw}'.",
                        "limitation": "Issuers rarely amend a signed certificate in place; confirm with the issuer.",
                        "evidence": [{"kind": "region", "document_id": d.id, "page": f.page, "bbox": hit["bbox"],
                                      "label": f"drawn over {label}", "value": hit["added_text"]},
                                     {"kind": "region", "document_id": d.id, "page": f.page, "bbox": f.bbox,
                                      "label": f"{label} (text layer)", "value": f.raw}],
                        "document_id": d.id})
                if f.status in ("uncertain", "unparseable"):
                    findings.append({
                        "code": "FIELD-UNCERTAIN", "fingerprint": _fp("fld", d.declared_type, f.name),
                        "category": "completeness", "evidence_class": "heuristic", "severity": "low",
                        "outcome": "manual_review", "title": f"Uncertain value for {f.name.replace('_', ' ')}",
                        "message": f"Read '{f.raw}' via {f.method}"
                                   + (f" with OCR confidence {f.confidence:.2f}" if f.confidence is not None else "")
                                   + ". Confirm against the page.",
                        "evidence": [{"kind": "region", "document_id": d.id, "page": f.page, "bbox": f.bbox,
                                      "label": f.name, "value": f.raw}], "document_id": d.id})
        stage("extraction_checks", t0)

        t0 = time.perf_counter()
        doc_status: dict[str, str] = {}
        ver_facts: dict[str, dict[str, tuple]] = {}
        latest = latest_by_type(docs)
        for d in docs:
            if d.processing_status != "processed":
                continue
            spec = rs.doc_types.get(d.declared_type, {})
            vres = _verify_document(d, spec, as_of, app.institution, lambda vs, d=d: [emit(
                "check", document_id=d.id, declared_type=d.declared_type, channel=v.channel, status=v.status,
                simulated=v.simulated, source=v.source_name) for v in vs])
            if d is latest.get(d.declared_type):
                for v in vres:
                    ver_facts.setdefault(d.declared_type, {})[v.channel] = (v.status, d.id, v.source_name)
            for v in vres:
                db.add(VerificationAttempt(
                    application_id=app.id, document_id=d.id, run_id=run.id, channel=v.channel,
                    source_name=v.source_name, simulated=v.simulated, status=v.status, request=v.request,
                    response=v.response, comparison=[c.as_dict() for c in v.comparisons], detail=v.detail,
                    actor="system", completed_at=utcnow()))
                if v.status in (vb.VERIFIED, vb.NOT_CHECKED):
                    continue
                sev = {"mismatch_detected": "high", "expired": "high", "source_unavailable": "medium",
                       "manual_review_required": "medium", "verification_pending": "low"}[v.status]
                if d is not latest.get(d.declared_type):
                    sev = "low"
                findings.append({
                    "code": f"VER-{v.channel.upper()}-{v.status.upper()}",
                    "fingerprint": _fp("ver", d.declared_type, v.channel, v.status),
                    "category": "verification",
                    "evidence_class": "cryptographic" if v.channel in ("issuer_signature", "applicant_signature", "signed_qr") else "issuer",
                    "severity": sev, "outcome": v.status,
                    "title": f"{spec.get('label', d.declared_type)}: {v.status.replace('_', ' ')} ({v.channel.replace('_', ' ')})",
                    "message": v.detail, "limitation": None if not v.simulated else
                    "Result from a SIMULATED source or DEMO trust anchor; not a real-world confirmation.",
                    "evidence": [{"kind": "document", "document_id": d.id},
                                 *([{"kind": "region", "document_id": d.id, "page": v.request.get("page"),
                                     "bbox": v.request.get("bbox"), "label": "signed QR"}]
                                   if v.request.get("bbox") else []),
                                 {"kind": "verification", "channel": v.channel, "source": v.source_name,
                                  "simulated": v.simulated, "comparisons": [c.as_dict() for c in v.comparisons]}],
                    "document_id": d.id})
            doc_status[d.id] = document_status(vres)
            # Issuer documents without the issuer's signature, or as images (docs/features/edits.md)
            copy = issuer_copy.findings(d, spec, vres, _fp)
            findings += copy if d is latest.get(d.declared_type) else [{**f, "severity": "low"} for f in copy]
        stage("verification", t0, documents=len(doc_status))

        t0 = time.perf_counter()
        facts = build_facts(db, app, docs, rs, ver_facts, as_of)
        results = evaluate(rs, facts, category=app.category, as_of=as_of)
        findings += _rule_findings(rs, results, app)
        emit("rules", evaluated=len(results), outcomes=_count([{"o": r.outcome} for r in results], "o"))
        checklist = [{
            "rule_id": r.rule["id"], "title": r.rule["title"], "category": r.rule.get("category"),
            "outcome": r.outcome, "message": r.message, "severity": r.rule.get("severity"),
            "citation": r.citation(rs), "inputs": r.inputs, "missing": r.missing,
            "evidence": _evidence_from_inputs(r.inputs),
        } for r in results]
        stage("rules", t0, evaluated=len(results), facts=len(facts.all()))


        t0 = time.perf_counter()
        for d in docs:
            an = d.analysis or {}
            for s in an.get("forensic_signals", []):
                if s["severity"] == "info":
                    continue
                evs = [{**e, "document_id": d.id} for e in s.get("evidence", [])] or [{"kind": "document",
                                                                                         "document_id": d.id}]
                findings.append({
                    "code": s["code"], "fingerprint": _fp("fx", d.declared_type, s["code"]),
                    "category": "forensic", "evidence_class": s.get("evidence_class") or (
                        "structural" if s["code"].startswith("FX-PDF-") and s["severity"] in ("high", "medium")
                        else "heuristic"),
                    "severity": s["severity"], "outcome": "indicator", "title": s["title"], "message": s["detail"],
                    "limitation": s.get("limitation"), "evidence": evs, "document_id": d.id})
        # Content Credentials and room indicators for photos
        findings += photo_stage(db, app, run, docs, doc_status)
        stage("forensics", t0)

        t0 = time.perf_counter()
        ref_fields = {t: (s.get("verification") or {}).get("ref_field") for t, s in rs.doc_types.items()
                      if (s.get("verification") or {}).get("ref_field")}
        processed_docs = [d for d in docs if d.processing_status == "processed"]
        links = cross_checks(db, app, processed_docs, ref_fields) + seal_reuse(db, app, processed_docs)
        for ln in links:
            findings.append({
                "code": ln.code, "fingerprint": _fp("xa", ln.code, ln.entity), "category": "consistency",
                "evidence_class": ln.evidence_class, "severity": ln.severity, "outcome": "indicator",
                "title": ln.title, "message": ln.detail, "limitation": ln.limitation, "evidence": ln.evidence,
                "document_id": next((e.get("document_id") for e in ln.evidence if e.get("kind") != "peer_document"),
                                    None)})
        graph = relationship_graph(db, app, links)
        findings += _rectification_scope(db, app, docs)
        findings += yoy_findings(db, app, docs, rs)
        stage("cross_application", t0, links=len(links))

        # Reviewer decisions carry over when the same finding reappears in a later run
        prev = db.scalars(select(ValidationRun).where(ValidationRun.application_id == app.id,
                                                      ValidationRun.id != run.id, ValidationRun.status == "complete")
                          .order_by(ValidationRun.started_at.desc()).limit(1)).first()
        prev_f = {f.fingerprint: f for f in db.scalars(select(Finding).where(Finding.run_id == prev.id))} if prev else {}
        seen = set()
        for f in findings:
            if f["fingerprint"] in seen:
                f["fingerprint"] = _fp(f["fingerprint"], f["message"])
            seen.add(f["fingerprint"])
            old = prev_f.get(f["fingerprint"])
            row = Finding(run_id=run.id, application_id=app.id, **{k: f.get(k) for k in (
                "code", "fingerprint", "category", "evidence_class", "severity", "outcome", "title", "message",
                "limitation", "rule", "document_id")}, evidence=f.get("evidence", []), trace=f.get("trace", {}))
            if old and old.review_status in ("dismissed", "accepted", "escalated"):
                row.review_status = old.review_status
                row.review_note = f"Carried over from run {prev.id}: {old.review_note or ''}".strip()
            db.add(row)
        resolved = [{"code": f.code, "title": f.title} for fp, f in prev_f.items() if fp not in seen]

        canonical = sorted(({k: f.get(k) for k in ("code", "fingerprint", "severity", "outcome", "message", "evidence")}
                            for f in findings), key=lambda x: (x["fingerprint"], x["message"]))
        refs = db.scalars(select(ReferenceRecord).where(ReferenceRecord.institution_id == app.institution_id)).all()
        run.input_digest = digest({
            "documents": sorted([d.declared_type, d.sha256] for d in docs), "declared": app.declared,
            "category": app.category, "academic_year": app.academic_year, "ruleset": rs.sha256,
            "engine": ENGINE_VERSION, "as_of": as_of.isoformat(),
            "references": sorted(digest(r.data) for r in refs)})
        run.report_digest = digest({"findings": canonical,
                                    "checklist": [[c["rule_id"], c["outcome"]] for c in checklist],
                                    "verification": sorted(doc_status.items())})
        by_sev: dict[str, int] = {}
        for f in findings:
            by_sev[f["severity"]] = by_sev.get(f["severity"], 0) + 1
        run.summary = {
            "as_of": as_of.isoformat(), "replay_of": replay_of,
            "findings": len(findings), "by_severity": by_sev,
            "by_category": _count(findings, "category"), "by_evidence_class": _count(findings, "evidence_class"),
            "checklist": checklist, "document_status": doc_status, "graph": graph,
            "review_priority": sum(SEVERITY_WEIGHT.get(f["severity"], 0) for f in findings),
            "resolved_since_previous": resolved, "previous_run": prev.id if prev else None,
            "facts": facts.snapshot(),
        }
        run.stages = stages
        run.status = "complete"
        run.finished_at = utcnow()
        if app.status in ("submitted", "validating", "rectified"):
            app.status = "under_review"
        audit.record(db, actor=actor, actor_role=actor_role, action="validation.completed", object_type="run",
                     object_id=run.id, application_id=app.id,
                     details={"ruleset": run.ruleset_id, "ruleset_hash": rs.sha256, "input_digest": run.input_digest,
                              "report_digest": run.report_digest, "findings": len(findings), "replay_of": replay_of})
    except Exception as e:
        log.exception("validation failed")
        run.status, run.error, run.finished_at = "failed", str(e)[:1000], utcnow()
        run.stages = stages
        audit.record(db, actor=actor, actor_role=actor_role, action="validation.failed", object_type="run",
                     object_id=run.id, application_id=app.id, details={"error": str(e)[:300]})
    db.commit()
    return run


def _count(items: list[dict[str, Any]], key: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for i in items:
        out[i[key]] = out.get(i[key], 0) + 1
    return out
