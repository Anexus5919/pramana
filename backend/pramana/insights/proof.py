"""Proof strength and certificate coverage for one application, for officials only.

Proof-strength matrix: every requirement the ruleset sets for the application, and how strongly the
latest validation run proves it, on six levels from "only declared by the institution" to "the issuer's
signature or signed QR verifies". Rows come from the ruleset's checklist, document types and rules; each
rung lists the exact rule outcomes, verification attempts, findings and page regions behind it.

Coverage calendar: every time-bound certificate (a document type with a validity date, or a rule that
gives it a validity period) against the submission date and the academic session being approved. The
session dates are configuration in the ruleset (norms.academic_session), not handbook law.

The pipeline also calls session_findings() so a certificate that lapses before the session ends is a
finding (XD-CERT-EXPIRES-IN-SESSION), and dashboard_alerts() surfaces those on the review queue.
"""

import re
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import OFFICIAL_ROLES, load_application, require_roles
from ..db import get_db
from ..models import Application, Document, Finding, ReferenceRecord, User, ValidationRun, VerificationAttempt
from ..rules.engine import Ruleset, active_ruleset

router = APIRouter(prefix="/api", tags=["insights"])

SESSION_CODE = "XD-CERT-EXPIRES-IN-SESSION"
OPEN_REVIEW = {"open", "acknowledged", "evidence_requested"}

# ---------------------------------------------------------------- academic session and validity


def session_window(rs: Ruleset, academic_year: str) -> dict[str, Any] | None:
    """The session an approval for `academic_year` covers, from the ruleset's configuration."""
    m = re.match(r"(\d{4})-\d{2}$", academic_year or "")
    if not m:
        return None
    cfg = (rs.norms or {}).get("academic_session") or {}
    month, day = (int(x) for x in str(cfg.get("start", "07-01")).split("-"))
    months = int(cfg.get("months", 12))
    start = date(int(m.group(1)), month, day)
    y, mo = divmod(start.month - 1 + months, 12)
    end = date(start.year + y, mo + 1, start.day) - timedelta(days=1)
    return {"label": academic_year, "start": start, "end": end, "basis": "configuration",
            "source": cfg.get("source", "CONFIG"), "assumed": True}


_DAYS_RE = re.compile(r"days_between\(doc\.(\w+)\.(\w+),\s*as_of\)\s*<=\s*(\d+)")


def _citation(rs: Ruleset, rule: dict[str, Any] | None) -> dict[str, Any] | None:
    if not rule:
        return None
    src = dict(rule.get("source") or {})
    doc = rs.sources.get(src.get("doc", ""), {})
    return {**src, "doc_title": doc.get("title"), "doc_url": doc.get("url")}


def time_bound_types(rs: Ruleset) -> dict[str, dict[str, Any]]:
    """Document types whose validity ends: a printed validity date, or a rule that sets a period."""
    out: dict[str, dict[str, Any]] = {}
    for t, spec in rs.doc_types.items():
        names = {f["name"] for f in spec.get("fields", [])}
        if "valid_until" in names:
            start = "valid_from" if "valid_from" in names else ("issue_date" if "issue_date" in names else None)
            out[t] = {"start_field": start, "end_field": "valid_until", "days": None, "rule": None}
    for r in rs.rules:
        for t, f, n in _DAYS_RE.findall((r.get("check") or {}).get("expr") or ""):
            if t in rs.doc_types and t not in out:
                out[t] = {"start_field": f, "end_field": None, "days": int(n), "rule": r}
    for t, tb in out.items():
        if tb["rule"] is None:
            # The rule that judges this certificate's validity, else the rule about the claim it supports
            token = t.split("_")[0].upper()
            tb["rule"] = (next((r for r in rs.rules if f"doc.{t}.valid_until" in str(r.get("check"))), None)
                          or next((r for r in rs.rules if token in r["id"].split("-")), None))
    return out


def _parse_date(v: Any) -> date | None:
    if v is None:
        return None
    s = str(v).strip()[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        pass
    m = re.match(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", s)
    try:
        return date(int(m[3]), int(m[2]), int(m[1])) if m else None
    except ValueError:
        return None


def _dmy(d: date | None) -> str:
    return d.strftime("%d-%m-%Y") if d else "unknown"


def _field(doc: Document, name: str | None):
    return next((f for f in doc.fields if f.name == name), None) if name else None


def cert_window(doc: Document, tb: dict[str, Any]) -> dict[str, Any]:
    """Start and end of a certificate's validity as the checks read it (the extracted text)."""
    sf = _field(doc, tb["start_field"])
    start = _parse_date(sf.value) if sf and sf.value else None
    if tb["end_field"]:
        ef = _field(doc, tb["end_field"])
        end = _parse_date(ef.value) if ef and ef.value else None
        loc, basis = ef, "printed"
    else:
        end = start + timedelta(days=tb["days"]) if start else None
        loc, basis = sf, "rule"
    return {"start": start, "start_field": sf, "end": end, "end_field": loc, "basis": basis}


def classify(end: date | None, as_of: date, s: dict[str, Any]) -> tuple[str, float | None]:
    if end is None:
        return "unknown", None
    if end < as_of:
        return "expired_at_submission", None
    if end < s["start"]:
        return "lapses_before_session", None
    if end < s["end"]:
        return "expires_in_session", ((end - s["start"]).days + 1) / 30.44
    return "covers_session", None


def months_phrase(months: float | None) -> str:
    if months is None:
        return ""
    n = round(months)
    if n < 1:
        return "in the first month of the session"
    return f"{n} month{'s' if n != 1 else ''} into the session"


def _latest_by_type(docs: list[Document]) -> dict[str, Document]:
    out: dict[str, Document] = {}
    for d in sorted(docs, key=lambda d: (d.round, d.uploaded_at)):
        out[d.declared_type] = d
    return out


def session_findings(rs: Ruleset, app: Application, docs: list[Document], as_of: date,
                     fp: Callable[..., str]) -> list[dict[str, Any]]:
    """A finding per certificate that is valid on the submission date but lapses before the session ends."""
    s = session_window(rs, app.academic_year)
    if not s:
        return []
    latest = _latest_by_type(docs)
    out = []
    for t, tb in time_bound_types(rs).items():
        d = latest.get(t)
        if d is None or d.processing_status != "processed":
            continue
        w = cert_window(d, tb)
        status, months = classify(w["end"], as_of, s)
        if status not in ("lapses_before_session", "expires_in_session"):
            continue
        label = rs.doc_types[t].get("label", t)
        when = (f"lapses {months_phrase(months)}" if status == "expires_in_session"
                else "lapses before the session starts")
        basis = ("" if w["basis"] == "printed" else
                 f" ({tb['days']} days from the issue date {_dmy(w['start'])}, per rule {tb['rule']['id']})")
        loc = w["end_field"]
        ev = [{"kind": "region", "document_id": d.id, "page": loc.page if loc else None,
               "bbox": loc.bbox if loc else None, "label": loc.name if loc else "validity",
               "value": loc.value if loc else None, "raw": loc.raw if loc else None}] if loc else []
        ev.append({"kind": "document", "document_id": d.id})
        rule = tb["rule"]
        out.append({
            "code": SESSION_CODE, "fingerprint": fp("session", t), "category": "validity",
            "evidence_class": "rule", "severity": "medium", "outcome": "fail",
            "title": (f"{label} expires during the {s['label']} session" if status == "expires_in_session"
                      else f"{label} lapses before the {s['label']} session starts"),
            "message": (f"Valid until {_dmy(w['end'])}{basis}. It was valid on the submission date {_dmy(as_of)}, "
                        f"so the submission-date check passes, but it {when} (assumed session "
                        f"{_dmy(s['start'])} to {_dmy(s['end'])}). Ask for the renewed certificate or the "
                        "renewal application."),
            "limitation": ("Session dates (1 July to 30 June) are configuration, not handbook law. The issuing "
                           "authority sets the validity period, and a renewal may already be in progress."),
            "rule": {"id": SESSION_CODE, "version": 1, "citation": _citation(rs, rule)},
            "evidence": ev, "document_id": d.id,
            "trace": {"inputs": [{"path": f"doc.{t}.{loc.name if loc else 'valid_until'}",
                                  "value": w["end"].isoformat() if w["end"] else None, "source": "document",
                                  "provenance": {"document_id": d.id, "page": loc.page if loc else None,
                                                 "bbox": loc.bbox if loc else None}},
                                 {"path": "config.academic_session", "value": f"{s['start']} to {s['end']}",
                                  "source": "derived", "provenance": {"rule": "ruleset norms.academic_session",
                                                                      "computation": "configuration, not law"}}],
                      "check": {"type": "session_coverage", "expr": f"doc.{t} validity >= session end"}},
        })
    return out


# ---------------------------------------------------------------- proof-strength matrix

LEVELS = [
    {"id": "declared", "label": "Declared",
     "description": "Only declared by the institution: a form value or the Annexure 2.1 self-disclosure."},
    {"id": "present", "label": "Present", "description": "The document is uploaded."},
    {"id": "read", "label": "Read",
     "description": "Fields were extracted from the document and checked against the declared values."},
    {"id": "record", "label": "AICTE record",
     "description": "An AICTE record matches: institution master, approval history, TER ledger, faculty registry "
                    "or accreditation register."},
    {"id": "issuer", "label": "Issuer registry", "simulated": True,
     "description": "The issuing authority's registry confirms the document (SIMULATED issuers in this prototype)."},
    {"id": "crypto", "label": "Signature or QR",
     "description": "The issuer's digital signature or signed QR verifies over the document."},
]

# Requirement themes: which document types and fact paths belong to which requirement. Rows are only the
# themes the ruleset actually applies to this application; anything unmatched lands in "Other requirements".
THEMES: list[dict[str, Any]] = [
    {"id": "fire", "label": "Fire safety", "docs": ["fire_noc"], "paths": []},
    {"id": "building", "label": "Building and structural safety",
     "docs": ["occupancy_certificate", "structural_stability"], "paths": ["derived.years_since_completion"]},
    {"id": "land", "label": "Land and campus location", "docs": ["satellite_map"], "paths": ["inst.latitude"]},
    {"id": "faculty", "label": "Faculty and ratio", "docs": ["faculty_list"],
     "paths": ["app.faculty_count", "derived.required_faculty", "ref.faculty"]},
    {"id": "intake", "label": "Intake and approvals", "docs": [],
     "paths": ["derived.intake_mismatches", "ref.approval", "app.total_proposed_intake", "derived.core_branch_count",
               "derived.non_cs_core_count", "app.programme", "app.total_approved_intake_claimed"]},
    {"id": "nba", "label": "Accreditation claims", "docs": ["nba_certificate"],
     "paths": ["derived.nba_claims_unsupported", "ref.nba"]},
    {"id": "fees", "label": "Fees (TER) and deadline", "docs": ["ter_receipt"], "paths": ["ref.fee", "app.submitted_on"]},
    {"id": "affidavit", "label": "Affidavit 2", "docs": ["affidavit_2"], "paths": []},
    {"id": "accounts", "label": "Audited accounts", "docs": ["audited_accounts"], "paths": ["derived.previous_fy"]},
    {"id": "norms", "label": "Infrastructure norms", "docs": [],
     "paths": ["app.internet_bandwidth_mbps", "derived.required_bandwidth_mbps", "app.administrative_area_sqm",
               "app.amenities_area_sqm"]},
]
OTHER_THEME = {"id": "other", "label": "Other requirements", "docs": [], "paths": []}
# Fact paths that are AICTE records even though the rule engine computes or timestamps them
RECORD_PATHS = ("ref.", "inst.", "derived.intake_mismatches", "derived.nba_claims_unsupported", "app.submitted_on")
_PATH_RE = re.compile(r"\b((?:doc|ver|ref|inst|app|derived)\.[A-Za-z0-9_.]+)")
EFFECT_ORDER = ["against", "inconclusive", "supports", "not_checked"]
PROVEN_BY = {3: "an AICTE record", 4: "the issuer registry", 5: "signature or signed QR"}
AGAINST_PHRASE = {0: "the declared figures", 1: "a missing document", 2: "the document itself",
                  3: "AICTE records", 4: "the issuer registry", 5: "the issuer's signature"}
CHANNEL_LEVEL = {"issuer_registry": 4, "manual_confirmation": 4, "issuer_signature": 5, "signed_qr": 5,
                 "applicant_signature": 5}
STATUS_EFFECT = {"verified": "supports", "mismatch_detected": "against", "expired": "against",
                 "verification_pending": "inconclusive", "source_unavailable": "inconclusive",
                 "manual_review_required": "inconclusive", "not_checked": "not_checked"}
OUTCOME_EFFECT = {"pass": "supports", "fail": "against", "insufficient_evidence": "inconclusive",
                  "error": "inconclusive"}


def _rule_paths(rule: dict[str, Any] | None, entry: dict[str, Any]) -> list[str]:
    paths = [i.get("path", "") for i in entry.get("inputs") or []] + list(entry.get("missing") or [])
    chk = (rule or {}).get("check") or {}
    text = " ".join([str(chk.get("expr") or ""), *[str(v) for v in (chk.get("show") or {}).values()],
                     str(((rule or {}).get("applies_to") or {}).get("when") or "")])
    return [p for p in paths if p] + _PATH_RE.findall(text)


def rule_level(rule: dict[str, Any] | None, entry: dict[str, Any]) -> int:
    """The proof level a rule outcome speaks to, from the kinds of facts it read."""
    if ((rule or {}).get("check") or {}).get("type") == "document_present":
        return 1
    level = 0
    for p in _rule_paths(rule, entry):
        if p.startswith("ver."):
            level = max(level, 5)
        elif p.startswith(RECORD_PATHS):
            level = max(level, 3)
        elif p.startswith("doc."):
            level = max(level, 2)
    return level


def _theme_for(doc_types: list[str], paths: list[str]) -> dict[str, Any]:
    for t in doc_types:
        th = next((x for x in THEMES if t in x["docs"]), None)
        if th:
            return th
    for p in paths:
        th = next((x for x in THEMES if any(p.startswith(q) for q in x["paths"])), None)
        if th:
            return th
    return OTHER_THEME


def _rule_doc_types(rs: Ruleset, rule: dict[str, Any] | None) -> list[str]:
    if not rule:
        return []
    chk = rule.get("check") or {}
    types = ([chk["doc_type"]] if chk.get("doc_type") else []) + list(
        (rule.get("applies_to") or {}).get("requires_docs") or [])
    types += re.findall(r"\b(?:doc|ver)\.(\w+)\.", str(chk.get("expr") or ""))
    return [t for t in dict.fromkeys(types) if t in rs.doc_types]


def _finding_level(f: Finding) -> tuple[int, str] | None:
    """Where a non-rule finding sits on the ladder, and its effect; None when it does not bear on proof."""
    c = f.code
    if c == SESSION_CODE:
        return 2, "info"
    if c == "DOC-TYPE-MISMATCH":
        return 1, "inconclusive"
    if c in ("DOC-PROCESSING-FAILED", "DOC-UNREADABLE", "DOC-SCRIPT-NOT-READ", "FIELD-UNCERTAIN"):
        return 2, "inconclusive"
    if c in ("VER-ISSUER-SIGNATURE-ABSENT", "FX-IMAGE-ONLY-ISSUER-DOC"):
        return 5, "inconclusive"
    if c.startswith("VER-") or c.startswith("RECT-") or c.startswith("PH-"):
        return None
    if f.category == "forensic":
        return (2, "inconclusive") if f.severity in ("critical", "high", "medium") else None
    if c.startswith(("XA-", "YOY-")):
        return 3, "inconclusive"
    return None


def _brief_finding(f: Finding) -> dict[str, Any]:
    return {"finding_id": f.id, "code": f.code, "title": f.title, "message": f.message, "severity": f.severity,
            "evidence_class": f.evidence_class, "review_status": f.review_status}


def _attempt_item(a: VerificationAttempt, effect: str, finding: Finding | None, note: str | None = None
                  ) -> dict[str, Any]:
    return {"kind": "attempt", "effect": effect, "attempt_id": a.id, "channel": a.channel, "status": a.status,
            "source": a.source_name, "simulated": a.simulated, "detail": a.detail, "document_id": a.document_id,
            "comparisons": a.comparison or [], "finding_id": finding.id if finding else None, "note": note}


def _against_phrase(item: dict[str, Any], level: int) -> str:
    if item.get("kind") == "attempt":
        return {"signed_qr": "the signed QR", "issuer_signature": "the issuer's signature",
                "applicant_signature": "the signatory's signature",
                "issuer_registry": "the issuer registry"}.get(item["channel"], AGAINST_PHRASE[level])
    return AGAINST_PHRASE[level]


def _join(parts: list[str]) -> str:
    parts = list(dict.fromkeys(parts))
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def proof_matrix(db: Session, app: Application, run: ValidationRun, rs: Ruleset, docs: list[Document],
                 attempts: list[VerificationAttempt], findings: list[Finding]) -> dict[str, Any]:
    latest = _latest_by_type(docs)
    checklist = (rs.checklists or {}).get(app.category) or {}
    required = list(checklist.get("required") or [])
    rules_by_id = {r["id"]: r for r in rs.rules}
    by_code: dict[str, list[Finding]] = {}
    for f in findings:
        by_code.setdefault(f.code, []).append(f)
    declared = app.declared or {}
    nba_claimed = any(p.get("nba_accredited") for p in declared.get("programmes") or [])

    rows: dict[str, dict[str, Any]] = {}

    def row(th: dict[str, Any]) -> dict[str, Any]:
        if th["id"] not in rows:
            rows[th["id"]] = {"theme": th, "items": {i: [] for i in range(6)}, "doc_types": [], "rules": 0,
                              "expected": {0}, "applies": False}
        return rows[th["id"]]

    # Rule outcomes from the run's checklist
    for e in (run.summary or {}).get("checklist") or []:
        if e.get("outcome") == "not_applicable":
            continue
        rule = rules_by_id.get(e["rule_id"])
        types = _rule_doc_types(rs, rule)
        r = row(_theme_for(types, _rule_paths(rule, e)))
        r["applies"] = True
        r["rules"] += 1
        lvl = rule_level(rule, e)
        r["expected"].add(lvl)
        if rule and rule.get("id") == "APH-A21-SSC-REQUIRED":
            r["doc_types"].append("structural_stability")
        f = next(iter(by_code.get(e["rule_id"], [])), None)
        r["items"][lvl].append({
            "kind": "rule", "effect": OUTCOME_EFFECT.get(e["outcome"], "inconclusive"), "rule_id": e["rule_id"],
            "title": e.get("title"), "outcome": e["outcome"], "message": e.get("message"),
            "citation": e.get("citation"), "evidence": e.get("evidence") or [], "finding_id": f.id if f else None})
        for i in e.get("inputs") or []:
            if i.get("source") == "declared":
                r["items"][0].append({"kind": "declared", "effect": "supports", "field": i.get("path"),
                                      "value": i.get("value")})

    # Documents the checklist expects, or that were uploaded
    for th in THEMES:
        for t in th["docs"]:
            if t in required or t in latest or (t == "nba_certificate" and nba_claimed):
                r = row(th)
                r["applies"] = True
                if t not in r["doc_types"]:
                    r["doc_types"].append(t)
    if not nba_claimed and "nba_certificate" not in latest:
        rows.pop("nba", None)

    attempts_by_doc: dict[str, list[VerificationAttempt]] = {}
    for a in attempts:
        attempts_by_doc.setdefault(a.document_id or "", []).append(a)

    for r in rows.values():
        th = r["theme"]
        for t in r["doc_types"]:
            spec = rs.doc_types.get(t, {})
            vspec = spec.get("verification") or {}
            label = spec.get("label", t)
            r["expected"] |= {1, 2}
            if vspec.get("issuer"):
                r["expected"].add(4)
            if vspec.get("issuer_signers") or vspec.get("qr_fields") or vspec.get("applicant_signed"):
                r["expected"].add(5)
            d = latest.get(t)
            if d is None:
                continue
            r["items"][1].append({"kind": "document", "effect": "supports", "document_id": d.id, "doc_type": t,
                                  "label": label, "filename": d.original_filename})
            fields = [{"name": f.name, "value": f.value, "raw": f.raw, "page": f.page, "bbox": f.bbox,
                       "status": f.status, "method": f.method} for f in d.fields]
            ok = [f for f in fields if f["status"] not in ("uncertain", "unparseable")]
            if d.processing_status == "processed" and ok:
                r["items"][2].append({"kind": "fields", "effect": "supports", "document_id": d.id, "doc_type": t,
                                      "label": label, "fields": fields})
            elif d.processing_status == "processed" and (d.analysis or {}).get("rows"):
                r["items"][2].append({"kind": "fields", "effect": "supports", "document_id": d.id, "doc_type": t,
                                      "label": label, "fields": fields,
                                      "rows": len((d.analysis or {}).get("rows") or [])})
            else:
                r["items"][2].append({"kind": "fields", "effect": "inconclusive", "document_id": d.id,
                                      "doc_type": t, "label": label, "fields": fields,
                                      "note": "No field could be read with confidence."})
            for a in attempts_by_doc.get(d.id, []):
                lvl = CHANNEL_LEVEL.get(a.channel)
                if lvl is None:
                    continue
                code = f"VER-{a.channel.upper()}-{a.status.upper()}"
                fnd = next((f for f in by_code.get(code, []) if f.document_id == d.id), None)
                effect = STATUS_EFFECT.get(a.status, "inconclusive")
                note = None
                if a.channel == "applicant_signature" and th["id"] != "affidavit" and effect != "against":
                    # The institution's own DSC proves who uploaded the file, not who issued it
                    effect, note = "info", "The institution's own signature: it shows who uploaded the file, not who issued it."
                r["items"][lvl].append(_attempt_item(a, effect, fnd, note))
            if t == "faculty_list":
                r["items"][3].append(_faculty_registry(db, app, d))
                r["expected"].add(3)
        # Findings that are not rule outcomes or attempts
        doc_ids = {latest[t].id: t for t in r["doc_types"] if t in latest}
        for f in findings:
            if f.document_id not in doc_ids or f.code in rules_by_id:
                continue
            pos = _finding_level(f)
            if pos is None:
                continue
            lvl, effect = pos
            r["items"][lvl].append({"kind": "finding", "effect": effect, **_brief_finding(f),
                                    "document_id": f.document_id})
        if r["doc_types"] and not r["items"][0]:
            r["items"][0].append({"kind": "claim", "effect": "supports",
                                  "text": "Submitted under the checklist and affirmed in the Affidavit 2 "
                                          "self-disclosure."})

    out_rows = []
    order = {th["id"]: i for i, th in enumerate([*THEMES, OTHER_THEME])}
    for r in sorted(rows.values(), key=lambda r: order[r["theme"]["id"]]):
        if not r["applies"]:
            continue
        out_rows.append(_finish_row(rs, r, required))
    return {"levels": LEVELS, "rows": out_rows, "summary": _summary(out_rows),
            "groups": [{"id": "checklist", "label": f"{checklist.get('label', 'Checklist')} documents",
                        "source": checklist.get("source")},
                       {"id": "claims", "label": "Claims, norms and records", "source": None}]}


def _faculty_registry(db: Session, app: Application, d: Document) -> dict[str, Any]:
    ids = [r.get("faculty_id") for r in (d.analysis or {}).get("rows") or [] if r.get("faculty_id")]
    recs = {r.key: r for r in db.scalars(select(ReferenceRecord).where(
        ReferenceRecord.record_type == "faculty", ReferenceRecord.key.in_(ids or ["-"])))}
    here = [i for i in ids if i in recs and recs[i].institution_id == app.institution_id]
    elsewhere = [i for i in ids if i in recs and recs[i].institution_id != app.institution_id]
    missing = [i for i in ids if i not in recs]
    if not ids:
        effect, text = "not_checked", "No faculty IDs were read from the roster."
    elif elsewhere:
        names = sorted({recs[i].data.get("institution_name", "another institution") for i in elsewhere})
        effect = "against"
        text = (f"{len(elsewhere)} of {len(ids)} faculty IDs are registered to {_join(names)} in the AICTE "
                "faculty registry.")
    elif missing:
        effect, text = "inconclusive", f"{len(missing)} of {len(ids)} faculty IDs are not in the AICTE faculty registry."
    else:
        effect, text = "supports", f"All {len(ids)} faculty IDs on the roster are registered to this institution."
    return {"kind": "registry_check", "effect": effect, "source": "AICTE faculty registry", "text": text,
            "checked": len(ids), "matched": len(here), "elsewhere": elsewhere[:12], "missing": missing[:12],
            "document_id": d.id}


def _finish_row(rs: Ruleset, r: dict[str, Any], required: list[str]) -> dict[str, Any]:
    levels = []
    for i in range(6):
        items = r["items"][i]
        effects = {x["effect"] for x in items}
        state = next((e for e in EFFECT_ORDER if e in effects), None)
        if state is None:
            state = "not_checked" if i in r["expected"] else "none"
        partial = state in ("inconclusive", "not_checked") and "supports" in effects
        levels.append({"level": i, "state": state, "partial": partial, "items": items})
    # A rung counts as reached when something there supports the requirement, even if an indicator at the
    # same level still needs a look (partial)
    strongest = max((lv["level"] for lv in levels if lv["state"] == "supports" or lv["partial"]), default=-1)
    against = [lv for lv in levels if lv["state"] == "against"]
    pending = [lv for lv in levels if lv["state"] == "inconclusive" and (lv["level"] > strongest or lv["partial"])]
    if against:
        phrases = [_against_phrase(x, lv["level"]) for lv in sorted(against, key=lambda v: -v["level"])
                   for x in lv["items"] if x["effect"] == "against"]
        own = all(lv["level"] == 0 for lv in against)
        verdict = {"kind": "contradicted", "level": against[-1]["level"],
                   "text": "Falls short on the institution's own figures" if own
                   else f"Contradicted by {_join(phrases[:3])}"}
    elif strongest >= 3:
        verdict = {"kind": "proven", "level": strongest,
                   "text": f"Proven by {PROVEN_BY[strongest]}"}
    elif strongest == 2:
        verdict = {"kind": "read", "level": 2, "text": "Read from the document; no record or issuer confirms it"}
    elif strongest == 1:
        verdict = {"kind": "present", "level": 1, "text": "Uploaded but not read"}
    else:
        verdict = {"kind": "declared", "level": 0, "text": "Rests on the institution's own declaration"}
    notes = []
    if pending and verdict["kind"] != "contradicted":
        notes.append("Waiting on the issuer or a manual confirmation" if any(lv["level"] >= 4 for lv in pending)
                     else "An indicator needs a look")
    for lv in levels:
        for x in lv["items"]:
            if x.get("code") == SESSION_CODE:
                notes.append(x["title"])
    th = r["theme"]
    docs = [{"doc_type": t, "label": rs.doc_types.get(t, {}).get("label", t), "required": t in required,
             "present": any(x.get("doc_type") == t for x in r["items"][1])} for t in r["doc_types"]]
    return {"id": th["id"], "label": th["label"], "group": "checklist" if any(d["required"] for d in docs) else "claims",
            "documents": docs, "rule_count": r["rules"], "levels": levels, "strongest": strongest,
            "verdict": verdict, "notes": notes}


def _summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(rows)
    proven = [r for r in rows if r["verdict"]["kind"] == "proven"]
    contradicted = [r for r in rows if r["verdict"]["kind"] == "contradicted"]
    declared_only = [r for r in rows if r["verdict"]["kind"] == "declared"]
    parts = [f"{len(proven)} of {total} requirements are proven by an AICTE record or stronger"]
    for r in contradicted[:2]:
        v = r["verdict"]["text"]
        parts.append(f"{r['label'].lower()} {'is ' if v.startswith('Contradicted') else ''}{v[0].lower()}{v[1:]}")
    if len(contradicted) > 2:
        parts.append(f"{len(contradicted) - 2} more {'is' if len(contradicted) == 3 else 'are'} contradicted")
    if declared_only:
        parts.append(f"only declarations support {_join([r['label'].lower() for r in declared_only])}")
    return {"text": "; ".join(parts) + ".", "total": total, "proven": len(proven),
            "contradicted": [r["id"] for r in contradicted], "declared_only": [r["id"] for r in declared_only]}


# ---------------------------------------------------------------- coverage calendar


def coverage(db: Session, app: Application, run: ValidationRun, rs: Ruleset, docs: list[Document],
             attempts: list[VerificationAttempt], findings: list[Finding], today: date | None = None
             ) -> dict[str, Any] | None:
    s = session_window(rs, app.academic_year)
    if not s:
        return None
    as_of = _parse_date((run.summary or {}).get("as_of")) or (app.submitted_at or app.created_at).date()
    latest = _latest_by_type(docs)
    certs, open_ended = [], []
    tbs = time_bound_types(rs)
    for t, tb in tbs.items():
        d = latest.get(t)
        if d is None:
            continue
        w = cert_window(d, tb)
        status, months = classify(w["end"], as_of, s)
        label = rs.doc_types[t].get("label", t)
        alts = _alternatives(db, app, d, w["end"], attempts, findings)
        conflict = any(a["differs"] for a in alts)
        # What the other sources would make of the session, so a conflict that changes the answer shows
        for a in alts:
            a["status"] = classify(_parse_date(a["date"]), as_of, s)[0]
        fnd = next((f for f in findings if f.document_id == d.id and (
            f.code == SESSION_CODE or (tb["rule"] and f.code == tb["rule"]["id"] and f.outcome == "fail"))), None)
        certs.append({
            "doc_type": t, "label": label, "document_id": d.id, "filename": d.original_filename,
            "start": _point(w["start"], w["start_field"], "Valid from" if tb["start_field"] == "valid_from" else "Issued"),
            "end": {**_point(w["end"], w["end_field"], "Valid until"), "basis": w["basis"],
                    "rule": ({"id": tb["rule"]["id"], "title": tb["rule"]["title"], "days": tb["days"],
                              "citation": _citation(rs, tb["rule"])} if tb["rule"] else None)},
            "status": status, "months_into_session": round(months, 1) if months is not None else None,
            "headline": _headline(status, months, w["end"], as_of, s), "alternatives": alts, "conflict": conflict,
            "finding_id": fnd.id if fnd else None,
        })
    for t, spec in rs.doc_types.items():
        if t in tbs or t not in latest:
            continue
        names = {f["name"] for f in spec.get("fields", [])}
        if "issue_date" in names:
            d = latest[t]
            ctype = _field(d, "certificate_type")
            ff = _field(d, "issue_date")
            open_ended.append({"doc_type": t, "label": spec.get("label", t), "document_id": d.id,
                               "issued": _point(_parse_date(ff.value) if ff and ff.value else None, ff, "Issued"),
                               "certificate_type": ctype.value if ctype else None,
                               "note": "No validity period is printed or set by a rule"
                                       + (f" ({ctype.value} certificate)" if ctype and ctype.value else "") + "."})
    counts: dict[str, int] = {}
    for c in certs:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    return {"as_of": as_of.isoformat(), "today": (today or date.today()).isoformat(),
            "session": {**s, "start": s["start"].isoformat(), "end": s["end"].isoformat()},
            "certificates": certs, "open_ended": open_ended, "counts": counts,
            "summary": _coverage_summary(certs, s)}


def _point(d: date | None, f: Any, label: str) -> dict[str, Any]:
    return {"date": d.isoformat() if d else None, "label": label, "field": f.name if f else None,
            "raw": f.raw if f else None, "page": f.page if f else None, "bbox": f.bbox if f else None,
            "method": f.method if f else None}


def _headline(status: str, months: float | None, end: date | None, as_of: date, s: dict[str, Any]) -> str:
    if status == "unknown":
        return "No validity date could be read"
    if status == "expired_at_submission":
        return f"Expired {(as_of - end).days} days before submission"
    if status == "lapses_before_session":
        return "Valid at submission, lapses before the session starts"
    if status == "expires_in_session":
        return f"Expires {months_phrase(months)}"
    return "Valid through the whole session"


def _alternatives(db: Session, app: Application, d: Document, end: date | None,
                  attempts: list[VerificationAttempt], findings: list[Finding]) -> list[dict[str, Any]]:
    out = []
    for a in attempts:
        if a.document_id != d.id:
            continue
        if a.channel == "signed_qr":
            v = ((a.response or {}).get("payload") or {}).get("valid_until")
            if v:
                out.append({"source": "Signed QR", "kind": "signed_qr", "date": v, "simulated": a.simulated,
                            "attempt_id": a.id, "verification": a.status})
        elif a.channel == "issuer_registry":
            c = next((c for c in a.comparison or [] if c.get("field") == "valid_until" and c.get("authoritative")), None)
            if c:
                out.append({"source": "Issuer registry", "kind": "issuer_registry", "date": c["authoritative"],
                            "simulated": a.simulated, "attempt_id": a.id, "verification": a.status})
    if d.declared_type == "nba_certificate":
        prog = _field(d, "programme_code")
        for r in db.scalars(select(ReferenceRecord).where(ReferenceRecord.record_type == "accreditation",
                                                          ReferenceRecord.institution_id == app.institution_id)):
            if prog and r.data.get("programme_code") == prog.value and r.data.get("valid_until"):
                out.append({"source": "Accreditation register (AICTE record)", "kind": "record",
                            "date": r.data["valid_until"], "simulated": False, "record_id": r.id})
    for f in findings:
        if f.document_id != d.id or f.code != "FX-FIELD-OVERWRITTEN":
            continue
        for e in f.evidence or []:
            if str(e.get("label", "")).startswith("drawn over") and "valid" in str(e.get("label")):
                v = _parse_date(e.get("value"))
                if v:
                    out.append({"source": "Shown on the page", "kind": "page_overlay", "date": v.isoformat(),
                                "simulated": False, "finding_id": f.id, "page": e.get("page"), "bbox": e.get("bbox"),
                                "note": "Drawn over the original value in a later revision"})
    for a in out:
        dd = _parse_date(a["date"])
        a["date"] = dd.isoformat() if dd else None
        a["differs"] = bool(dd and end and dd != end)
    return out


def _coverage_summary(certs: list[dict[str, Any]], s: dict[str, Any]) -> str:
    if not certs:
        return "No time-bound certificate was uploaded."
    by = {k: [c for c in certs if c["status"] == k] for k in
          ("expired_at_submission", "lapses_before_session", "expires_in_session", "unknown", "covers_session")}
    parts = []
    for c in by["expired_at_submission"]:
        parts.append(f"the {c['label']} had already expired on the submission date")
    for c in by["lapses_before_session"]:
        parts.append(f"the {c['label']} lapses before the session starts")
    for c in by["expires_in_session"]:
        parts.append(f"the {c['label']} expires {months_phrase(c['months_into_session'])}")
    for c in by["unknown"]:
        parts.append(f"no validity date could be read for the {c['label']}")
    conflicts = [(c, a) for c in certs for a in c["alternatives"] if a["differs"]]
    if not parts:
        text = (f"All {len(certs)} time-bound certificates stay valid through the assumed {s['label']} session"
                if len(certs) > 1 else f"The {certs[0]['label']} stays valid through the assumed {s['label']} session")
    else:
        text = _join(parts)
        text = text[0].upper() + text[1:]
    for c, a in conflicts[:2]:
        what = "the page shows" if a["kind"] == "page_overlay" else f"the {a['source'].lower()} says"
        text += f"; for the {c['label']}, {what} {_long(a['date'])}, not {_long(c['end']['date'])}"
    return text + "."


def _long(iso: str | None) -> str:
    d = _parse_date(iso)
    return d.strftime("%d %b %Y").lstrip("0") if d else "no date"


# ---------------------------------------------------------------- API and dashboard


def _context(db: Session, app: Application) -> tuple[ValidationRun | None, Ruleset, list[Document],
                                                     list[VerificationAttempt], list[Finding]]:
    from ..api.applications import latest_run
    from ..pipeline.validate import ruleset_by_hash

    run = latest_run(db, app.id)
    if run is None or run.status != "complete":
        return None, active_ruleset(), [], [], []
    rs = ruleset_by_hash(run.ruleset_hash) or active_ruleset()
    docs = list(db.scalars(select(Document).where(Document.application_id == app.id, Document.superseded.is_(False))))
    attempts = list(db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id)))
    findings = list(db.scalars(select(Finding).where(Finding.run_id == run.id)))
    return run, rs, docs, attempts, findings


@router.get("/applications/{app_id}/insights/proof")
def insights(app_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)), db: Session = Depends(get_db)):
    """Proof-strength matrix and certificate coverage for the latest complete run (officials only)."""
    app = load_application(db, user, app_id)
    run, rs, docs, attempts, findings = _context(db, app)
    if run is None:
        return {"application_id": app.id, "run_id": None, "matrix": None, "coverage": None}
    return {"application_id": app.id, "run_id": run.id, "as_of": (run.summary or {}).get("as_of"),
            "ruleset": run.ruleset_id,
            "matrix": proof_matrix(db, app, run, rs, docs, attempts, findings),
            "coverage": coverage(db, app, run, rs, docs, attempts, findings)}


def dashboard_alerts(db: Session, alerts: list[dict[str, Any]]) -> None:
    """One review-queue alert per academic session: open findings for certificates that lapse during it."""
    from ..api.applications import latest_run

    by_year: dict[str, list[tuple[Application, Finding]]] = {}
    for a in db.scalars(select(Application).order_by(Application.id)):
        run = latest_run(db, a.id)
        if run is None:
            continue
        for f in db.scalars(select(Finding).where(Finding.run_id == run.id, Finding.code == SESSION_CODE)):
            if f.review_status in OPEN_REVIEW:
                by_year.setdefault(a.academic_year, []).append((a, f))
    for year, items in sorted(by_year.items()):
        n, apps = len(items), {a.id for a, _ in items}
        first_app, first = items[0]
        alerts.append({
            "application_id": first_app.id,
            "institution": first_app.institution.name if len(apps) == 1 else f"{len(apps)} applications",
            "finding_id": first.id, "severity": "medium", "category": "validity",
            "title": f"{n} certificate{'s' if n != 1 else ''} expire{'s' if n == 1 else ''} during the {year} session",
            "kind": "session_expiry", "count": n})
