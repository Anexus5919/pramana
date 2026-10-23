"""Helpers shared by the letter, evidence pack and Ask why modules."""

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Document, Finding, ValidationRun
from ..rules.engine import Ruleset

# Product vocabulary: Pramana never calls a document any of these
FORBIDDEN_WORDS = re.compile(r"\b(forged|forgery|forgeries|fake|faked|fakes|fraud|fraudulent|genuine|genuinely)\b",
                             re.IGNORECASE)
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
EVIDENCE_LEVEL = {"cryptographic": 1, "issuer": 2, "record": 3, "rule": 4, "structural": 5, "heuristic": 6, "model": 7}


def latest_run(db: Session, app_id: str) -> ValidationRun | None:
    return db.scalars(select(ValidationRun).where(ValidationRun.application_id == app_id)
                      .order_by(ValidationRun.started_at.desc()).limit(1)).first()


def run_findings(db: Session, run: ValidationRun | None) -> list[Finding]:
    if run is None:
        return []
    fs = db.scalars(select(Finding).where(Finding.run_id == run.id)).all()
    return sorted(fs, key=lambda f: (SEVERITY_ORDER.get(f.severity, 9), EVIDENCE_LEVEL.get(f.evidence_class, 9), f.code))


def rules_by_id(rs: Ruleset) -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in rs.rules}


def citation(rs: Ruleset, rule: dict[str, Any]) -> dict[str, Any]:
    """Verbatim clause from the ruleset; never edited by hand."""
    src = dict(rule.get("source") or {})
    doc = rs.sources.get(src.get("doc", ""), {})
    return {"rule_id": rule["id"], "rule_title": rule.get("title"), "doc": src.get("doc"),
            "doc_title": doc.get("title"), "section": src.get("section"), "page": src.get("page"),
            "quote": src.get("quote")}


def presence_rule(rs: Ruleset, doc_type: str | None) -> dict[str, Any] | None:
    """The Annexure 2.1 rule that requires a document type, used as the clause for document-level findings."""
    if not doc_type:
        return None
    for r in rs.rules:
        chk = r.get("check") or {}
        if chk.get("type") == "document_present" and chk.get("doc_type") == doc_type:
            return r
    return None


def rules_needing(rs: Ruleset, doc_type: str) -> list[dict[str, Any]]:
    """Rules that require or depend on a document type."""
    out = []
    for r in rs.rules:
        chk = r.get("check") or {}
        applies = r.get("applies_to") or {}
        if chk.get("doc_type") == doc_type or doc_type in applies.get("requires_docs", []) \
                or f"doc.{doc_type}." in str(chk.get("expr", "")):
            out.append(r)
    return out


def doc_label(rs: Ruleset, doc_type: str | None) -> str:
    if not doc_type:
        return "document"
    return rs.doc_types.get(doc_type, {}).get("label", doc_type.replace("_", " "))


def finding_doc_type(db: Session, f: Finding, rs: Ruleset) -> str | None:
    if f.document_id:
        d = db.get(Document, f.document_id)
        if d:
            return d.declared_type
    chk = (f.trace or {}).get("check") or {}
    if chk.get("doc_type"):
        return chk["doc_type"]
    rule = rules_by_id(rs).get((f.rule or {}).get("id", ""))
    if rule:
        req = (rule.get("applies_to") or {}).get("requires_docs") or []
        if req:
            return req[0]
        doc_check = (rule.get("check") or {}).get("doc_type")
        if doc_check:
            return doc_check
    return None
