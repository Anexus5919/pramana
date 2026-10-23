"""Year-over-year comparison with the institution's previous application.

The previous year's application is an AICTE record (a synthetic stand-in in the prototype). Most
differences between consecutive years are ordinary: faculty move, bandwidth is upgraded, a fire NOC is
renewed under a new number. A few are hard to explain and are raised as record-class indicators:
land that shrinks, a roster that is mostly new, a certificate number reused with a new validity date,
or seats that appear in an Extension of Approval without an increase being approved.
"""

from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..crypto import sha256_hex
from ..models import Application, Document, ReferenceRecord
from ..pipeline.facts_builder import latest_by_type
from ..rules.engine import Ruleset, active_ruleset

RECORD_TYPE = "previous_application"
# Configuration, not law: share of last year's roster that must be gone before it is raised
TURNOVER_THRESHOLD = 0.5
AREA_TOLERANCE = {"land_area_acres": 0.01, "built_up_area_sqm": 1.0}
SCALARS = [
    ("land_area_acres", "Land area", "acres"),
    ("built_up_area_sqm", "Built-up area", "sq m"),
    ("administrative_area_sqm", "Administrative area", "sq m"),
    ("amenities_area_sqm", "Amenities area", "sq m"),
    ("internet_bandwidth_mbps", "Internet bandwidth", "Mbps"),
    ("faculty_count", "Faculty declared", None),
]
# Certificates compared by number; the field that holds the number and the rule that governs validity
CERTIFICATES = {
    "fire_noc": ("noc_number", "APH-617I-FIRE-VALID"),
    "occupancy_certificate": ("certificate_no", None),
    "structural_stability": ("certificate_no", "APH-617H-SSC-VALID"),
    "nba_certificate": ("nba_ref", "XR-NBA-CLAIMS"),
    "affidavit_2": ("estamp_certificate_no", None),
    "audited_accounts": ("udin", None),
}
CONFIG_CITATION = {"doc": "CONFIG", "section": "Year-over-year comparison (configuration)", "page": None,
                   "quote": None, "doc_title": "Pramana configuration (not a regulatory requirement)", "doc_url": None}


def _fp(*parts: Any) -> str:
    return sha256_hex("|".join(str(p) for p in parts).encode())


def previous_record(db: Session, app: Application) -> ReferenceRecord | None:
    recs = db.scalars(select(ReferenceRecord).where(ReferenceRecord.institution_id == app.institution_id,
                                                    ReferenceRecord.record_type == RECORD_TYPE)).all()
    earlier = [r for r in recs if str(r.data.get("academic_year", "")) < app.academic_year]
    return max(earlier, key=lambda r: r.data.get("academic_year", ""), default=None)


def _num(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def current_values(app: Application, docs: list[Document]) -> dict[str, Any]:
    """This year's comparable values: declared form data, the faculty roster and certificate numbers."""
    decl = app.declared or {}
    latest = latest_by_type([d for d in docs if not d.superseded])
    roster = latest.get("faculty_list")
    rows = ((roster.analysis or {}).get("rows") or []) if roster else []
    certs = {}
    for t, (fname, _) in CERTIFICATES.items():
        d = latest.get(t)
        if d is None:
            continue
        fields = {f.name: f for f in d.fields}
        num, vu = fields.get(fname), fields.get("valid_until")
        certs[t] = {"number": num.value if num else None, "valid_until": vu.value if vu else None,
                    "document_id": d.id, "page": vu.page if vu else (num.page if num else None),
                    "bbox": vu.bbox if vu else (num.bbox if num else None)}
    return {
        "programmes": decl.get("programmes") or [],
        "faculty_ids": [r["faculty_id"] for r in rows if r.get("faculty_id")] if roster else None,
        "roster_document_id": roster.id if roster else None,
        "labs": decl.get("labs"),
        "certificates": certs,
        **{k: decl.get(k) for k, _, _ in SCALARS},
    }


def compare(prev: dict[str, Any], cur: dict[str, Any]) -> dict[str, Any]:
    """Added, removed and changed values between last year's application and this one."""
    scalars = []
    for k, label, unit in SCALARS:
        b, a = prev.get(k), cur.get(k)
        nb, na = _num(b), _num(a)
        delta = round(na - nb, 2) if nb is not None and na is not None else None
        scalars.append({"key": k, "label": label, "unit": unit, "before": b, "after": a, "delta": delta,
                        "pct": round(100 * delta / nb, 1) if delta is not None and nb else None,
                        "status": "unknown" if delta is None else "same" if abs(delta) < 1e-9 else
                        "increased" if delta > 0 else "decreased"})
    pb = {p["code"]: p for p in prev.get("programmes", [])}
    pa = {p["code"]: p for p in cur.get("programmes", [])}
    progs = []
    for code in list(pb) + [c for c in pa if c not in pb]:
        b, a = pb.get(code), pa.get(code)
        bi = int(b.get("approved_intake", 0)) if b else None
        ai = int(a.get("approved_intake", 0)) if a else None
        ap = int(a.get("proposed_intake", 0)) if a else None
        progs.append({"code": code, "name": (a or b).get("name"), "before_approved": bi, "after_approved": ai,
                      "after_proposed": ap, "delta_proposed": ap - bi if ap is not None and bi is not None else None,
                      "before_nba": bool(b and b.get("nba_accredited")), "after_nba": bool(a and a.get("nba_accredited")),
                      "status": "added" if b is None else "removed" if a is None else
                      "changed" if (bi, bool(b.get("nba_accredited"))) != (ap, bool(a.get("nba_accredited"))) else "same"})
    fb, fa = prev.get("faculty_ids") or [], cur.get("faculty_ids")
    faculty = None
    if fa is not None:
        sb, sa = set(fb), set(fa)
        removed = [x for x in fb if x not in sa]
        faculty = {"before": len(fb), "after": len(fa), "retained": len(sb & sa),
                   "added": [x for x in fa if x not in sb], "removed": removed,
                   "replaced_share": round(len(removed) / len(fb), 3) if fb else None}
    lb, la = prev.get("labs") or [], cur.get("labs")
    labs = None if la is None else {"before": len(lb), "after": len(la), "added": [x for x in la if x not in lb],
                                    "removed": [x for x in lb if x not in la]}
    certs = []
    pc, cc = prev.get("certificates") or {}, cur.get("certificates") or {}
    for t in CERTIFICATES:
        b, a = pc.get(t), cc.get(t)
        if not b and not a:
            continue
        bn, an = (b or {}).get("number"), (a or {}).get("number")
        bv, av = (b or {}).get("valid_until"), (a or {}).get("valid_until")
        same = bool(bn and an and _norm(bn) == _norm(an))
        status = ("not_read" if a and not an else "new" if not b else "missing" if not a else
                  "reused_new_validity" if same and bv and av and bv != av else "unchanged" if same else "new_number")
        certs.append({"type": t, "before_number": bn, "after_number": an, "before_valid_until": bv,
                      "after_valid_until": av, "status": status, "document_id": (a or {}).get("document_id"),
                      "page": (a or {}).get("page"), "bbox": (a or {}).get("bbox")})
    return {"scalars": scalars, "programmes": progs, "faculty": faculty, "labs": labs, "certificates": certs}


def _norm(s: str) -> str:
    return "".join(ch for ch in str(s).upper() if ch.isalnum())


def _citation(rs: Ruleset, rule_id: str | None) -> dict[str, Any]:
    rule = next((r for r in rs.rules if r["id"] == rule_id), None) if rule_id else None
    if rule is None:
        return dict(CONFIG_CITATION)
    src = dict(rule.get("source") or {})
    doc = rs.sources.get(src.get("doc", ""), {})
    return {**src, "doc_title": doc.get("title"), "doc_url": doc.get("url"), "related_rule": rule_id}


def _ref_ev(rec: ReferenceRecord, label: str, value: Any) -> dict[str, Any]:
    return {"kind": "reference_record", "record_id": rec.id, "source": rec.source, "label": label, "value": value}


def indicators(rec: ReferenceRecord, app: Application, cmp: dict[str, Any], rs: Ruleset) -> list[dict[str, Any]]:
    """Changes between the two years that need an explanation. Indicators, not conclusions."""
    prev = rec.data
    year, prev_id = prev.get("academic_year"), prev.get("application_id")
    since = f"the {year} application{f' ({prev_id})' if prev_id else ''}"
    out = []

    def add(code: str, sev: str, title: str, message: str, limitation: str, rule_id: str | None,
            evidence: list[dict[str, Any]], document_id: str | None = None, key: str = "") -> None:
        out.append({"code": code, "fingerprint": _fp("yoy", code, key), "category": "consistency",
                    "evidence_class": "record", "severity": sev, "outcome": "indicator", "title": title,
                    "message": message, "limitation": limitation,
                    "rule": {"id": code, "version": 1, "citation": _citation(rs, rule_id)},
                    "evidence": evidence, "trace": {"source": "year-over-year comparison", "record_id": rec.id,
                                                    "previous_application": prev_id, "previous_year": year},
                    "document_id": document_id})

    by_key = {s["key"]: s for s in cmp["scalars"]}
    land = by_key["land_area_acres"]
    if land["delta"] is not None and land["delta"] < -AREA_TOLERANCE["land_area_acres"]:
        add("YOY-LAND-AREA-DECREASED", "medium", "Declared land area decreased since last year",
            f"Land area declared as {land['after']} acres, down from {land['before']} acres in {since}. Land held by a "
            "campus rarely shrinks between two applications; ask whether land was sold or leased out, or which "
            "figure is wrong.",
            "Land can change legitimately (a sale, or acquisition for a road). The handbook's land norms are not "
            "encoded here, so this does not say the campus is now below them.", None,
            [{"kind": "declared", "field": "land_area_acres", "label": "land area this year", "value": land["after"]},
             _ref_ev(rec, f"land area in {year}", land["before"])], key="land")
    built = by_key["built_up_area_sqm"]
    if built["delta"] is not None and built["delta"] < -AREA_TOLERANCE["built_up_area_sqm"]:
        add("YOY-BUILT-UP-AREA-DECREASED", "medium", "Declared built-up area decreased since last year",
            f"Built-up area declared as {built['after']} sq m, down from {built['before']} sq m in {since}.",
            "Demolition or a corrected figure can explain a decrease; compare with the occupancy certificate.",
            "XD-OC-AREA",
            [{"kind": "declared", "field": "built_up_area_sqm", "label": "built-up area this year",
              "value": built["after"]}, _ref_ev(rec, f"built-up area in {year}", built["before"])], key="built")
    fac = cmp["faculty"]
    if fac and fac["replaced_share"] is not None and fac["replaced_share"] > TURNOVER_THRESHOLD:
        share = round(100 * fac["replaced_share"])
        add("YOY-FACULTY-TURNOVER", "high", "More than half of last year's faculty roster has been replaced",
            f"{len(fac['removed'])} of the {fac['before']} faculty IDs listed in {since} ({share}%) are not on this "
            f"year's roster, and {len(fac['added'])} IDs are new. A roster that turns over this much in a year is a "
            "known pattern of faculty listed only for approval; check joining dates and the faculty registry.",
            f"Threshold {round(100 * TURNOVER_THRESHOLD)}% is configuration. Institutions do restructure; this "
            "asks for an explanation, it does not conclude anything.", "XD-FACULTY-COUNT",
            [{"kind": "document", "document_id": cmp.get("roster_document_id")},
             _ref_ev(rec, f"faculty roster in {year}", f"{fac['before']} IDs, {len(fac['removed'])} not listed now")],
            cmp.get("roster_document_id"), key="faculty")
    for c in cmp["certificates"]:
        if c["status"] != "reused_new_validity":
            continue
        _, rule_id = CERTIFICATES[c["type"]]
        label = rs.doc_types.get(c["type"], {}).get("label", c["type"])
        ev: list[dict[str, Any]] = []
        if c.get("page") and c.get("bbox"):
            ev.append({"kind": "region", "document_id": c["document_id"], "page": c["page"], "bbox": c["bbox"],
                       "label": "validity this year", "value": c["after_valid_until"]})
        ev.append(_ref_ev(rec, f"{c['type'].replace('_', ' ')} in {year}",
                          f"{c['before_number']}, valid until {c['before_valid_until']}"))
        add("YOY-CERT-REUSED-NEW-VALIDITY", "high", f"{label} number reused from last year with a new validity date",
            f"{label} number {c['after_number']} was also submitted in {since}, valid until {c['before_valid_until']}. "
            f"This year the same number carries validity until {c['after_valid_until']}. A renewal is normally issued "
            "under a new number; confirm the renewal with the issuer.",
            "Some issuers extend validity under the same number. The issuer registry result for this document is in "
            "the verification tab.", rule_id, ev, c["document_id"], key=c["type"])
    if app.category == "EOA":
        jumps = [p for p in cmp["programmes"] if p["before_approved"] is not None and p["after_proposed"] is not None
                 and p["after_proposed"] > p["before_approved"]]
        if jumps:
            parts = "; ".join(f"{p['code']} {p['before_approved']} to {p['after_proposed']}" for p in jumps)
            add("YOY-INTAKE-JUMP", "high", "Intake rises above last year's approved intake in an Extension of Approval",
                f"Compared with {since}: {parts}. An Extension of Approval continues the approved intake; more seats "
                "need an Increase in Intake application, which is verified by an expert visit.",
                "Uses the intake approved last year as recorded in the previous application.", "XR-EOA-NO-INCREASE",
                [{"kind": "declared", "field": "programmes", "label": "proposed intake this year",
                  "value": {p["code"]: p["after_proposed"] for p in jumps}},
                 _ref_ev(rec, f"approved intake in {year}", {p["code"]: p["before_approved"] for p in jumps})],
                key="intake")
    return out


def findings(db: Session, app: Application, docs: list[Document], rs: Ruleset) -> list[dict[str, Any]]:
    """Indicators for a validation run; nothing when no previous application is on record."""
    rec = previous_record(db, app)
    if rec is None:
        return []
    cur = current_values(app, docs)
    cmp = compare(rec.data, cur)
    cmp["roster_document_id"] = cur.get("roster_document_id")
    return indicators(rec, app, cmp, rs)


def comparison(db: Session, app: Application) -> dict[str, Any]:
    rec = previous_record(db, app)
    if rec is None:
        return {"available": False, "academic_year": app.academic_year}
    docs = list(db.scalars(select(Document).where(Document.application_id == app.id)))
    cur = current_values(app, docs)
    cmp = compare(rec.data, cur)
    cmp["roster_document_id"] = cur.get("roster_document_id")
    rs = active_ruleset()
    return {"available": True, "academic_year": app.academic_year,
            "previous": {"academic_year": rec.data.get("academic_year"), "application_id": rec.data.get("application_id"),
                         "category": rec.data.get("category"), "submitted_on": rec.data.get("submitted_on"),
                         "record_id": rec.id, "source": rec.source, "provenance": rec.provenance},
            **cmp, "indicators": indicators(rec, app, cmp, rs),
            "as_of": date.today().isoformat()}
