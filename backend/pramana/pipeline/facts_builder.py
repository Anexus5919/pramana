"""Assemble the fact store a validation run evaluates: institution master, declared form values,
document claims and reference records, each tagged with where it came from."""

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Application, Document, ReferenceRecord
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


def build_facts(db: Session, app: Application, docs: list[Document]) -> FactStore:
    fs = FactStore()
    inst = app.institution
    src = {"record": "AICTE institution master"}
    for k in ("name", "aicte_id", "aishe_code", "society_name", "address", "state", "district", "pincode",
              "institution_type", "women_only", "established_year"):
        fs.add(f"inst.{k}", getattr(inst, k), "reference", **src)
    for k, v in (inst.attributes or {}).items():
        fs.add(f"inst.{k}", v, "reference", **src)

    fs.add("app.id", app.id, "declared", form_field="id")
    fs.add("app.category", app.category, "declared", form_field="category")
    fs.add("app.academic_year", app.academic_year, "declared", form_field="academic_year")
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
    return fs
