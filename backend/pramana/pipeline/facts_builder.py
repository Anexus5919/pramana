"""Assemble the fact store a validation run evaluates: institution master, declared form values,
document claims and reference records, each tagged with where it came from."""

import math
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Application, Document, ReferenceRecord
from ..rules.engine import Ruleset
from ..rules.facts import FactStore


def _typed(value: str | None, vtype: str) -> Any:
    if value is None:
        return None
    if vtype == "date":
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    if vtype in ("number", "amount", "integer"):
        try:
            f = float(value)
            return int(f) if f.is_integer() else f
        except ValueError:
            return None
    return value


def latest_by_type(docs: list[Document]) -> dict[str, Document]:
    out: dict[str, Document] = {}
    for d in sorted(docs, key=lambda d: (d.round, d.uploaded_at)):
        out[d.declared_type] = d
    return out


def build_facts(db: Session, app: Application, docs: list[Document], rs: Ruleset | None = None,
                ver: dict[str, dict[str, tuple]] | None = None, as_of: date | None = None,
                doc_dates: dict[str, date] | None = None) -> FactStore:
    """doc_dates: the day each document sent in a rectification round was submitted, by document id."""
    fs = FactStore()
    as_of = as_of or (app.submitted_at or app.created_at).date()
    inst = app.institution
    src = {"record": "AICTE institution master"}
    for k in ("name", "aicte_id", "aishe_code", "society_name", "address", "state", "district", "pincode",
              "institution_type", "women_only", "established_year", "latitude", "longitude"):
        fs.add(f"inst.{k}", getattr(inst, k), "reference", **src)
    for k, v in (inst.attributes or {}).items():
        fs.add(f"inst.{k}", v, "reference", **src)

    fs.add("app.id", app.id, "declared", form_field="id")
    fs.add("app.category", app.category, "declared", form_field="category")
    fs.add("app.academic_year", app.academic_year, "declared", form_field="academic_year")
    if app.submitted_at:
        fs.add("app.submitted_on", app.submitted_at.date(), "declared", form_field="submitted_at")
    fs.add("app.round", app.round, "declared", form_field="round")
    decl = app.declared or {}
    for k, v in decl.items():
        if isinstance(v, str | int | float | bool):
            fs.add(f"app.{k}", _typed(v, "date") if k.endswith("_date") and isinstance(v, str) else v,
                   "declared", form_field=k)
    progs = decl.get("programmes") or []
    if progs:
        fs.add("app.programme_count", len(progs), "declared", form_field="programmes")
        fs.add("app.total_proposed_intake", sum(int(p.get("proposed_intake", 0)) for p in progs), "declared",
               form_field="programmes[].proposed_intake")
        fs.add("app.total_approved_intake_claimed", sum(int(p.get("approved_intake", 0)) for p in progs),
               "declared", form_field="programmes[].approved_intake")
        fs.add("app.intake_increase_requested",
               any(int(p.get("proposed_intake", 0)) > int(p.get("approved_intake", 0)) for p in progs),
               "declared", form_field="programmes")
        fs.add("app.programme_codes", sorted(p.get("code") for p in progs), "declared", form_field="programmes")

    for t, d in latest_by_type(docs).items():
        fs.add(f"doc.{t}.document_id", d.id, "document", document_id=d.id, filename=d.original_filename)
        if d.id in (doc_dates or {}):
            # Rules marked `as_of: document` judge this document on the day it was submitted
            fs.add(f"doc.{t}.submitted_on", doc_dates[d.id], "declared", document_id=d.id, round=d.round,
                   form_field="submitted_at")
        for f in d.fields:
            v = _typed(f.value, f.value_type)
            if v is not None:
                fs.add(f"doc.{t}.{f.name}", v, "document", document_id=d.id, field_id=f.id, page=f.page,
                       bbox=f.bbox, method=f.method, raw=f.raw)
        rows = (d.analysis or {}).get("rows")
        if rows is not None:
            fs.add(f"doc.{t}.row_count", len(rows), "document", document_id=d.id, method="table rows")

    refs = db.scalars(select(ReferenceRecord).where(ReferenceRecord.institution_id == inst.id)).all()
    by_type: dict[str, list[ReferenceRecord]] = {}
    for r in refs:
        by_type.setdefault(r.record_type, []).append(r)

    hist = sorted(by_type.get("approval_history", []), key=lambda r: r.data.get("academic_year", ""))
    if hist:
        last = hist[-1]
        p = {"record_id": last.id, "record": last.source}
        fs.add("ref.approval.academic_year", last.data.get("academic_year"), "reference", **p)
        fs.add("ref.approval.status", last.data.get("status"), "reference", **p)
        fs.add("ref.approval.total_intake", last.data.get("total_intake"), "reference", **p)
        fs.add("ref.approval.programme_codes", sorted(x["code"] for x in last.data.get("programmes", [])),
               "reference", **p)
        for prog in last.data.get("programmes", []):
            fs.add(f"ref.approval.intake.{prog['code']}", prog.get("intake"), "reference", **p)

    for r in by_type.get("fee_payment", []):
        if r.data.get("application_id") == app.id:
            p = {"record_id": r.id, "record": r.source}
            for k in ("status", "amount", "txn_id", "paid_on"):
                v = r.data.get(k)
                fs.add(f"ref.fee.{k}", _typed(v, "date") if k == "paid_on" and v else v, "reference", **p)

    fac = by_type.get("faculty", [])
    if fac:
        fs.add("ref.faculty.registered_count", sum(1 for r in fac if r.data.get("active", True)), "reference",
               record="AICTE faculty registry", records=len(fac))

    for r in by_type.get("accreditation", []):
        code = r.data.get("programme_code")
        if code:
            p = {"record_id": r.id, "record": r.source}
            fs.add(f"ref.nba.{code}.valid_until", _typed(r.data.get("valid_until"), "date"), "reference", **p)
            fs.add(f"ref.nba.{code}.status", r.data.get("status"), "reference", **p)

    open_def = [r for r in by_type.get("deficiency", []) if r.data.get("status") == "open"]
    fs.add("ref.deficiency.open_count", len(open_def), "reference", record="AICTE deficiency register")

    for t, channels in (ver or {}).items():
        for ch, (status, doc_id, source) in channels.items():
            fs.add(f"ver.{t}.{ch}", status, "verified", document_id=doc_id, checked_by=source)
    _derived(fs, decl, rs, as_of, by_type)
    return fs


def _derived(fs: FactStore, decl: dict[str, Any], rs: Ruleset | None, as_of: date,
             by_type: dict[str, list[ReferenceRecord]]) -> None:
    """Values computed from other facts. Each records the inputs and the norm it applied."""
    norms = (rs.norms if rs else {}) or {}
    progs = decl.get("programmes") or []
    ratios = norms.get("faculty_student_ratio", {})
    if progs and ratios:
        need, parts = 0.0, []
        for p in progs:
            r = ratios.get(p.get("level"))
            if not r:
                continue
            s = int(p.get("approved_intake", 0)) * int(p.get("duration_years", 4))
            need += s / r
            parts.append(f"{p.get('code')}: {s} students / {r}")
        fs.add("derived.required_faculty", math.ceil(need), "derived", rule="Annexure 5 faculty-student ratio",
               computation="; ".join(parts), rounding="ceil (rounding not specified in APH)")
    if progs:
        core = [p for p in progs if p.get("core")]
        fs.add("derived.core_branch_count", len(core), "derived", computation="programmes flagged core")
        fs.add("derived.non_cs_core_count", sum(1 for p in core if not p.get("cs_allied")), "derived",
               computation="core programmes not in CS or allied disciplines")
        hist = sorted(by_type.get("approval_history", []), key=lambda r: r.data.get("academic_year", ""))
        if hist:
            rec = {x["code"]: x.get("intake") for x in hist[-1].data.get("programmes", [])}
            bad = [f"{p.get('code')} (declared {p.get('approved_intake')}, record {rec.get(p.get('code'), 'none')})"
                   for p in progs if rec.get(p.get("code")) != int(p.get("approved_intake", -1))]
            fs.add("derived.intake_mismatches", bad, "derived", record_id=hist[-1].id,
                   computation="declared approved intake vs last approval record, per programme")
        nba = {r.data.get("programme_code"): r for r in by_type.get("accreditation", [])}
        unsupported = []
        for p in progs:
            if p.get("nba_accredited"):
                r = nba.get(p.get("code"))
                vu = r.data.get("valid_until") if r else None
                if not r or not vu or date.fromisoformat(vu) < as_of:
                    unsupported.append(p.get("code"))
        fs.add("derived.nba_claims_unsupported", unsupported, "derived",
               computation="programmes declared NBA-accredited without a valid entry in the accreditation register")
        tiers = norms.get("bandwidth_tiers_mbps")
        if tiers:
            total = sum(int(p.get("approved_intake", 0)) for p in progs)
            req = next((t["mbps"] for t in tiers if total <= t["max_intake"]), tiers[-1]["mbps"])
            fs.add("derived.required_bandwidth_mbps", req, "derived", rule="Annexure 4.1 note 5",
                   computation=f"total approved intake {total}")
    fy_end = as_of.year if as_of.month >= 4 else as_of.year - 1
    fs.add("derived.previous_fy", f"{fy_end - 1}-{fy_end % 100:02d}", "derived",
           computation="last financial year (April to March) completed before the as-of date")
    oc = fs.get("doc.occupancy_certificate.issue_date")
    if oc:
        fs.add("derived.years_since_completion", round((as_of - oc.value).days / 365.25, 1), "derived",
               computation="as-of date minus completion/occupancy certificate issue date",
               document_id=oc.provenance.get("document_id"), page=oc.provenance.get("page"),
               bbox=oc.provenance.get("bbox"))
