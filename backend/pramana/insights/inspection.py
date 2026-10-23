"""Inspection brief: a printable site-visit brief for the Expert Visit Committee, built from an application's open
findings, its documents, the campus point on record and its photos.

It lists what to see and ask; it decides nothing. Every item points back to the finding or document it comes from.
"""

import io
import math
from datetime import datetime
from typing import Any
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from reportlab.graphics.shapes import Circle, Drawing, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..auth import load_application, require_roles
from ..db import get_db
from ..models import Application, Document, Finding, User, utcnow
from ..officer.common import doc_label, latest_run, run_findings
from ..photos.campus import payload as campus_payload
from ..rules.engine import active_ruleset

router = APIRouter(prefix="/api", tags=["insights"])

FOOTER = "Prepared with the Pramana prototype. Synthetic demo data."
OPEN = {"open", "acknowledged", "evidence_requested"}
SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
# Findings that say the file in hand may not be the issuer's original
ORIGINAL_CATEGORIES = {"forensic", "verification", "authenticity"}
ORIGINAL_CLASSES = {"cryptographic", "issuer", "structural"}
MAX_QUESTIONS = 10


def _brief_finding(f: Finding) -> dict[str, Any]:
    return {"id": f.id, "code": f.code, "title": f.title, "severity": f.severity, "category": f.category}


def _question(f: Finding, label: str | None) -> str:
    what = label or "document"
    c = f.code
    if c.startswith(("FX-PDF-REVISION", "FX-FIELD-OVERWRITTEN", "VER-ISSUER_SIGNATURE-MISMATCH", "FX-PDF-OVERLAID",
                     "FX-PDF-WHITEOUT", "FX-FONT")):
        return f"The {what} was changed after it was signed or printed. Who made the change, when, and why?"
    if c.startswith(("VER-ISSUER-SIGNATURE-ABSENT", "VER-APPLICANT_SIGNATURE")):
        return f"The {what} carries no signature from its issuer. Can the issuer's signed original be shown?"
    if c.startswith(("VER-ISSUER_REGISTRY", "VER-SIGNED_QR")):
        return (f"The issuer's register or signed QR does not support the {what} as submitted. Is there a renewed or "
                "amended certificate, and can the issuer confirm it?")
    if f.outcome in ("fail", "insufficient_evidence") and f.category in ("compliance", "validity", "completeness",
                                                                          "consistency"):
        how = "is not met on" if f.outcome == "fail" else "could not be checked from"
        return f"The rule '{f.title}' {how} the documents submitted. What record shows that it is met?"
    if c.startswith("PH-"):
        return f"{f.title}. Can the room be shown as it is today, and the original photo file produced?"
    if c.startswith("FX-IMG"):
        return f"{f.title}. Where and when was this photo taken, and by whom?"
    if c.startswith("XA-"):
        return f"{f.title}. How does the institution explain this?"
    if c.startswith("YOY-"):
        return f"{f.title}. What changed since last year, and what records show it?"
    return f"{f.title}. What is the institution's explanation, and what record supports it?"


def build_brief(db: Session, app: Application) -> dict[str, Any]:
    rs = active_ruleset()
    run = latest_run(db, app.id)
    findings = sorted([f for f in run_findings(db, run) if f.review_status in OPEN],
                      key=lambda f: (SEV_RANK.get(f.severity, 9), f.code))
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.application_id == app.id,
                                                               Document.superseded.is_(False)))}
    label = {d.id: doc_label(rs, d.declared_type) for d in docs.values()}

    originals: dict[str, dict[str, Any]] = {}
    for f in findings:
        d = docs.get(f.document_id or "")
        if not d or d.mime.startswith("image/") or SEV_RANK.get(f.severity, 9) > 2:
            continue
        if f.category not in ORIGINAL_CATEGORIES and f.evidence_class not in ORIGINAL_CLASSES:
            continue
        o = originals.setdefault(d.id, {"document_id": d.id, "label": label[d.id], "filename": d.original_filename,
                                        "severity": f.severity, "findings": []})
        o["findings"].append(_brief_finding(f))
    for o in originals.values():
        o["ask"] = (f"The original {o['label'].lower()} as issued, or a copy certified by the issuer, to compare with "
                    f"the file uploaded as {o['filename']}.")

    campus = campus_payload(db, app)
    count: list[dict[str, Any]] = []
    for p in campus["photos"]:
        fac, room = p.get("declared_facility"), p.get("room") or {}
        if not fac:
            continue
        seen = (room.get("counts") or {}).get("workstation") if room.get("status") == "analysed" else None
        declared = fac.get("workstations")
        count.append({"what": fac.get("name") or p["filename"], "declared": f"{declared} workstations" if declared
                      else fac.get("room_type", "").replace("_", " "),
                      "evidence": f"{seen} visible in {p['filename']}" if seen is not None else "Photo not analysed",
                      "document_id": p["document_id"], "how": "Count the working workstations in the room."})
    dec = app.declared or {}
    labs = dec.get("labs") or []
    if labs:
        count.append({"what": "Laboratories", "declared": f"{len(labs)} labs", "evidence": ", ".join(map(str, labs[:8]))
                      + ("..." if len(labs) > 8 else ""), "document_id": None,
                      "how": "Visit each declared lab and note equipment in working order."})
    for key, what, unit, how in (
        ("faculty_count", "Faculty", "", "Meet the faculty on the roster and check identity and appointment letters."),
        ("built_up_area_sqm", "Built-up area", " sq m", "Compare with the occupancy certificate and building plan."),
        ("land_area_acres", "Land", " acres", "Compare with the land documents and the boundary on site."),
        ("internet_bandwidth_mbps", "Internet bandwidth", " Mbps", "Check the service agreement and a live speed test."),
    ):
        if dec.get(key) is not None:
            count.append({"what": what, "declared": f"{dec[key]:,}{unit}" if isinstance(dec[key], int) else
                          f"{dec[key]}{unit}", "evidence": "Declared in the application", "document_id": None,
                          "how": how})

    retake = []
    for p in campus["photos"]:
        why = [x["title"] for x in p.get("findings") or []]
        if p.get("geotag") == "outside" and not any("geotag" in w.lower() for w in why):
            why.append(f"Geotag {p['distance_km']} km from the campus on record")
        elif p.get("geotag") == "none":
            why.append("No geotag, so where it was taken cannot be checked")
        if (p.get("c2pa") or {}).get("hash_matches") is False and not any("Content Credentials" in w for w in why):
            why.append("Changed after its Content Credentials were signed")
        if why:
            retake.append({"document_id": p["document_id"], "filename": p["filename"],
                           "facility": (p.get("declared_facility") or {}).get("name"), "why": list(dict.fromkeys(why))})

    questions: list[dict[str, Any]] = []
    seen_q: set[str] = set()
    for f in findings:
        q = _question(f, label.get(f.document_id or ""))
        if q in seen_q:
            continue
        seen_q.add(q)
        questions.append({"question": q, "finding": _brief_finding(f)})
        if len(questions) >= MAX_QUESTIONS:
            break

    far = [p for p in campus["photos"] if p.get("geotag") == "outside"]
    rec = campus.get("record")
    high = sum(1 for f in findings if SEV_RANK.get(f.severity, 9) <= 1)
    todo = [f"ask for {len(originals)} original document{'s' if len(originals) != 1 else ''}" if originals else None,
            f"retake {len(retake)} photo{'s' if len(retake) != 1 else ''}" if retake else None,
            f"visit the campus point on record at {rec['lat']:.5f}, {rec['lon']:.5f}" if rec else None]
    todo = [t for t in todo if t]
    summary = (f"{len(findings)} open finding{'s' if len(findings) != 1 else ''}, {high} high or critical. "
               + (("On site, " + ", ".join(todo[:-1]) + (" and " if len(todo) > 1 else "") + todo[-1] + ".")
                  if todo else "Nothing on the evidence so far needs a site check beyond the routine visit.")
               + (f" {len(far)} photo geotag{'s are' if len(far) != 1 else ' is'} far from the campus." if far else ""))
    inst = app.institution
    return {
        "application_id": app.id, "institution": inst.name, "aicte_id": inst.aicte_id, "category": app.category,
        "academic_year": app.academic_year, "round": app.round, "status": app.status,
        "address": ", ".join(x for x in (inst.address, inst.district, inst.state) if x),
        "run_id": run.id if run else None, "ruleset_id": run.ruleset_id if run else None,
        "prepared_at": utcnow().isoformat(), "summary": summary,
        "originals": sorted(originals.values(), key=lambda o: SEV_RANK.get(o["severity"], 9)),
        "count": count, "retake": retake, "questions": questions,
        "gps": {"record": rec, "declared": campus.get("declared"), "threshold_km": campus.get("threshold_km"),
                "photos": [{"document_id": p["document_id"], "filename": p["filename"], "gps": p["exif"]["gps"],
                            "distance_km": p.get("distance_km"), "geotag": p.get("geotag")} for p in campus["photos"]]},
        "footer": FOOTER,
        "note": "A brief for the visit, not a decision. Pramana never approves or rejects an application.",
    }


# ---------------------------------------------------------------- PDF

INK, INK_3, LINE, RED = colors.HexColor("#17171c"), colors.HexColor("#5c5c68"), colors.HexColor("#d5d5dc"), \
    colors.HexColor("#c4342d")


def _styles() -> dict[str, ParagraphStyle]:
    base = ParagraphStyle("b", fontName="Helvetica", fontSize=9.5, leading=13, textColor=INK)
    return {"base": base, "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=17, leading=21),
            "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=11.5, leading=15,
                                 spaceBefore=10, spaceAfter=4),
            "small": ParagraphStyle("s", parent=base, fontSize=8, leading=10.5, textColor=INK_3),
            "bold": ParagraphStyle("bd", parent=base, fontName="Helvetica-Bold")}


def _p(t: Any, st: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(t if t is not None else "")), st)


def _table(rows: list[list[Any]], widths: list[float]) -> Table:
    t = Table(rows, colWidths=widths, hAlign="LEFT", repeatRows=1)
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
                           ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                           ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return t


def _plot(gps: dict[str, Any], size: float = 70 * mm) -> Drawing | None:
    """The campus point at the centre, rings at the geotag threshold, photos placed by bearing; far points are
    pinned to the edge with their real distance written beside them."""
    rec = gps.get("record")
    if not rec:
        return None
    d = Drawing(size, size)
    c = size / 2
    thr = float(gps.get("threshold_km") or 2)
    reach = thr * 2
    scale = (size / 2 - 12) / reach
    for km, dash in ((thr, None), (reach, [2, 2])):
        d.add(Circle(c, c, km * scale, strokeColor=LINE, fillColor=None, strokeWidth=0.8, strokeDashArray=dash))
        d.add(String(c + km * scale * 0.71 + 2, c + km * scale * 0.71 + 2, f"{km:g} km", fontSize=6.5,
                     fillColor=INK_3))

    def place(lat: float, lon: float) -> tuple[float, float, float, bool]:
        dx = (lon - rec["lon"]) * 111.32 * math.cos(math.radians(rec["lat"]))
        dy = (lat - rec["lat"]) * 110.57
        dist = math.hypot(dx, dy)
        if dist <= reach or dist == 0:
            return c + dx * scale, c + dy * scale, dist, False
        return c + dx / dist * reach * scale, c + dy / dist * reach * scale, dist, True

    dec = gps.get("declared")
    if dec:
        x, y, _, _ = place(dec["lat"], dec["lon"])
        d.add(Polygon([x, y + 3.5, x + 3.5, y, x, y - 3.5, x - 3.5, y], fillColor=None, strokeColor=INK, strokeWidth=0.8))
    for p in gps.get("photos") or []:
        if not p.get("gps"):
            continue
        x, y, dist, off = place(p["gps"][0], p["gps"][1])
        col = RED if p.get("geotag") == "outside" else INK_3
        d.add(Circle(x, y, 2.6, fillColor=col, strokeColor=colors.white, strokeWidth=0.6))
        if off:
            real = p.get("distance_km") if p.get("distance_km") is not None else dist
            d.add(String(x + 4, y - 2, f"{real:.0f} km", fontSize=6.5, fillColor=col))
    d.add(Rect(c - 3, c - 3, 6, 6, fillColor=INK, strokeColor=colors.white, strokeWidth=0.6))
    return d


def brief_pdf(b: dict[str, Any]) -> bytes:
    st = _styles()
    buf = io.BytesIO()

    def footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(INK_3)
        canvas.drawString(18 * mm, 10 * mm, FOOTER)
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title=f"Inspection brief {b['application_id']}",
                            author="Pramana prototype")
    w = A4[0] - 36 * mm
    prepared = datetime.fromisoformat(b["prepared_at"]).strftime("%d %b %Y, %H:%M UTC")
    out: list[Any] = [
        _p("Inspection brief", st["h1"]), Spacer(1, 3),
        _p(f"{b['institution']} ({b['aicte_id']}), {b['address']}", st["base"]),
        _p(f"Application {b['application_id']}, {str(b['category']).replace('_', ' ').capitalize()}, AY {b['academic_year']}, round {b['round']}. "
           f"Prepared {prepared} from validation run {b['run_id']}.", st["small"]),
        Spacer(1, 6), _p("Summary", st["h2"]), _p(b["summary"], st["base"]), _p(b["note"], st["small"]),
    ]
    out.append(_p("Original documents to ask for", st["h2"]))
    if b["originals"]:
        rows = [[_p("Document", st["bold"]), _p("Why", st["bold"]), _p("Ask for", st["bold"])]]
        for o in b["originals"]:
            rows.append([_p(o["label"], st["base"]), _p("; ".join(f["title"] for f in o["findings"][:4]), st["base"]),
                         _p(o["ask"], st["small"])])
        out.append(_table(rows, [38 * mm, 70 * mm, w - 108 * mm]))
    else:
        out.append(_p("No document needs its original on the evidence so far.", st["small"]))
    out.append(_p("What to count or see on site", st["h2"]))
    if b["count"]:
        rows = [[_p("Item", st["bold"]), _p("Declared", st["bold"]), _p("Evidence so far", st["bold"]),
                 _p("On site", st["bold"])]]
        rows += [[_p(c["what"], st["base"]), _p(c["declared"], st["base"]), _p(c["evidence"], st["small"]),
                  _p(c["how"], st["small"])] for c in b["count"]]
        out.append(_table(rows, [34 * mm, 30 * mm, 46 * mm, w - 110 * mm]))
    gps = b["gps"]
    out.append(_p("Where to go", st["h2"]))
    rec = gps.get("record")
    plot = _plot(gps)
    lines = [f"Campus point on record: {rec['lat']:.5f}, {rec['lon']:.5f}." if rec else "No campus point on record."]
    if gps.get("declared"):
        dd = gps["declared"]
        lines.append(f"Point declared on the satellite map: {dd['lat']:.5f}, {dd['lon']:.5f}"
                     + (f", {dd['distance_km']} km from the record." if dd.get("distance_km") is not None else "."))
    for p in gps.get("photos") or []:
        if p.get("gps"):
            lines.append(f"{p['filename']}: geotag {p['gps'][0]:.5f}, {p['gps'][1]:.5f}"
                         + (f", {p['distance_km']} km from the campus." if p.get("distance_km") is not None else "."))
        else:
            lines.append(f"{p['filename']}: no geotag.")
    lines.append(f"Square: campus on record. Diamond: declared map point. Dots: photo geotags; red when more than "
                 f"{gps.get('threshold_km')} km away. Points beyond the outer ring sit on its edge, labelled with "
                 "their real distance.")
    text = [_p(x, st["base"] if i < len(lines) - 1 else st["small"]) for i, x in enumerate(lines)]
    if plot:
        t = Table([[plot, text]], colWidths=[74 * mm, w - 74 * mm], hAlign="LEFT")
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
        out.append(t)
    else:
        out += text
    out.append(_p("Photos to retake", st["h2"]))
    if b["retake"]:
        rows = [[_p("Photo", st["bold"]), _p("Why", st["bold"])]]
        rows += [[_p(r["filename"] + (f" ({r['facility']})" if r.get("facility") else ""), st["base"]),
                  _p("; ".join(r["why"]), st["base"])] for r in b["retake"]]
        out.append(_table(rows, [58 * mm, w - 58 * mm]))
    else:
        out.append(_p("No photo needs retaking on the evidence so far.", st["small"]))
    out.append(_p("Questions to ask", st["h2"]))
    rows = [[_p(f"{i}.", st["base"]), _p(q["question"], st["base"])] for i, q in enumerate(b["questions"], start=1)]
    if rows:
        out.append(_table(rows, [8 * mm, w - 8 * mm]))
    else:
        out.append(_p("No open finding raises a question.", st["small"]))
    doc.build(out, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def _audit(db: Session, user: User, app: Application, b: dict[str, Any], fmt: str) -> None:
    audit.record(db, actor=user.username, actor_role=user.role, action="inspection_brief.generated",
                 object_type="application", object_id=app.id, application_id=app.id,
                 details={"format": fmt, "run_id": b["run_id"], "originals": len(b["originals"]),
                          "retake": len(b["retake"]), "questions": len(b["questions"])})
    db.commit()


@router.post("/applications/{app_id}/inspection-brief")
def inspection_brief(app_id: str, user: User = Depends(require_roles("officer")), db: Session = Depends(get_db)):
    """Prepare the site-visit brief for the Expert Visit Committee. Officers only; audited."""
    app = load_application(db, user, app_id)
    b = build_brief(db, app)
    _audit(db, user, app, b, "view")
    return b


@router.get("/applications/{app_id}/inspection-brief.pdf")
def inspection_brief_pdf(app_id: str, user: User = Depends(require_roles("officer")), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    b = build_brief(db, app)
    pdf = brief_pdf(b)
    _audit(db, user, app, b, "pdf")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="inspection-brief-{app.id}.pdf"'})
