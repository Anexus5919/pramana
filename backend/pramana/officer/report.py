"""report.pdf inside an evidence pack: summary, findings with page crops, verification results and cited rules."""

import io
from typing import Any
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .. import sandbox
from ..crypto import cache_get, cache_put, load_document
from ..models import Document
from .letter import ACCENT, INK, INK_3, LINE, QUOTE_BG, _NumberedCanvas

NOTICE = ("Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana "
          "does not approve, reject or penalise any institution. Synthetic demo data.")
EV_LABEL = {"cryptographic": "E1 Cryptographic", "issuer": "E2 Issuer", "record": "E3 Record", "rule": "E4 Rule",
            "structural": "E5 Structural", "heuristic": "E6 Heuristic", "model": "E7 Model"}
SEV_COLOR = {"critical": "#8c1236", "high": "#d43a4f", "medium": "#e8822f", "low": "#9a8f9f", "info": "#c4bcc8"}
BOX = (139, 61, 255)
FULL_W = 164 * mm
CROP_W = 62 * mm
TEXT_W = FULL_W - CROP_W - 4 * mm


def _styles() -> dict[str, ParagraphStyle]:
    base = ParagraphStyle("b", fontName="Helvetica", fontSize=9.5, leading=13.2, textColor=INK)
    return {
        "base": base,
        "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=18, leading=22),
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=13, leading=17, spaceBefore=6),
        "h3": ParagraphStyle("h3", parent=base, fontName="Helvetica-Bold", fontSize=10.5, leading=14),
        "small": ParagraphStyle("s", parent=base, fontSize=8, leading=10.8, textColor=INK_3),
        "label": ParagraphStyle("l", parent=base, fontName="Helvetica-Bold", fontSize=7.5, leading=10,
                                textColor=INK_3),
        "mono": ParagraphStyle("m", parent=base, fontName="Courier", fontSize=7.6, leading=10),
        "quote": ParagraphStyle("q", parent=base, fontName="Helvetica-Oblique", fontSize=9, leading=12.6),
        "notice": ParagraphStyle("n", parent=base, fontSize=8.5, leading=12, textColor=INK),
    }


def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(text if text is not None else "")).replace("\n", "<br/>"), style)


def _kv(rows: list[tuple[str, Any]], st, widths=(38 * mm, 126 * mm), mono_keys: tuple[str, ...] = ()) -> Table:
    t = Table([[_p(k, st["label"]), _p(v, st["mono"] if k in mono_keys else st["base"])] for k, v in rows],
              colWidths=list(widths), hAlign="LEFT")
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5), ("TOPPADDING", (0, 0), (-1, -1), 1.5)]))
    return t


def _page_image(doc: Document, page_no: int) -> Image.Image | None:
    """Same encrypted cache and sandboxed renderer as the page viewer; documents are never parsed in-process."""
    name = f"{doc.id}_p{page_no}.png"
    try:
        png = cache_get(name)
        if png is None:
            png = sandbox.render_png(load_document(doc.storage_name), doc.mime, page_no - 1, 110)
            cache_put(name, png)
        with Image.open(io.BytesIO(png)) as im:
            return im.convert("RGB")
    except Exception:  # noqa: BLE001  a purged or unrenderable page leaves the crop out, not the export
        return None


def crop_with_boxes(doc: Document, page_no: int, boxes: list[list[float]]) -> bytes | None:
    """Crop of the page around the evidence boxes, each outlined; coordinates are page units, top-left origin."""
    page = next((p for p in doc.pages if p.page_no == page_no), None)
    img = _page_image(doc, page_no)
    if page is None or img is None or not page.width:
        return None
    sx, sy = img.width / page.width, img.height / page.height
    if boxes:
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        half_w = max((x1 - x0) / 2 + 0.06 * page.width, 0.22 * page.width)
        half_h = max((y1 - y0) / 2 + 0.05 * page.height, 0.075 * page.height)
        left, right = max(0, cx - half_w), min(page.width, cx + half_w)
        top, bottom = max(0, cy - half_h), min(page.height, cy + half_h)
    else:
        left, top, right, bottom = 0, 0, page.width, page.height * 0.42
    crop = img.crop((int(left * sx), int(top * sy), int(right * sx), int(bottom * sy))).convert("RGBA")
    over = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(over)
    for b in boxes:
        r = [(b[0] - left) * sx - 3, (b[1] - top) * sy - 3, (b[2] - left) * sx + 3, (b[3] - top) * sy + 3]
        draw.rectangle(r, fill=(*BOX, 34), outline=(*BOX, 255), width=3)
    out = Image.alpha_composite(crop, over).convert("RGB")
    if out.width > 1100:
        out = out.resize((1100, int(out.height * 1100 / out.width)), Image.LANCZOS)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _regions(f) -> tuple[str | None, int | None, list[list[float]]]:
    """First document page with evidence boxes for a finding, and every box on that page."""
    regs = [e for e in (f.evidence or []) if e.get("kind") in ("region", "revision_diff") and e.get("page")
            and isinstance(e.get("bbox"), list) and len(e["bbox"]) == 4]
    for e in regs:
        doc_id = e.get("document_id") or f.document_id
        if doc_id:
            boxes = [x["bbox"] for x in regs if (x.get("document_id") or f.document_id) == doc_id
                     and x.get("page") == e["page"]]
            return doc_id, e["page"], boxes
    return f.document_id, (1 if f.document_id else None), []


def _evidence_lines(f, docs: dict[str, Document], labels: dict[str, str]) -> list[str]:
    out = []
    for e in f.evidence or []:
        k = e.get("kind")
        d = docs.get(e.get("document_id") or "")
        name = labels.get(d.declared_type, d.declared_type) if d else "document"
        if k == "region":
            v = f" = {e.get('value')}" if e.get("value") not in (None, "") else ""
            out.append(f"Region on {name}, page {e.get('page')}: {e.get('label') or 'value'}{v}")
        elif k == "revision_diff":
            out.append(f"Revision {e.get('to_revision')} of {name} added '{e.get('added_text')}' on page {e.get('page')}")
        elif k == "reference_record":
            out.append(f"Reference record {e.get('source') or ''} {e.get('record_id') or ''}: {e.get('label')} = "
                       f"{e.get('value')}")
        elif k == "declared":
            out.append(f"Declared value {e.get('field') or e.get('label')}: {e.get('value')}")
        elif k == "verification":
            tag = " (SIMULATED)" if e.get("simulated") and "SIMULATED" not in str(e.get("source")) else ""
            out.append(f"Verification via {str(e.get('channel', '')).replace('_', ' ')}: {e.get('source')}{tag}")
        elif k == "peer_document":
            out.append(f"Related document in application {e.get('application_id')} (not included in this pack)")
        elif k == "geo":
            out.append(f"Photo location {e.get('distance_km')} km from the recorded campus location")
        elif k == "document" and d:
            out.append(f"Whole document: {name} ({d.original_filename})")
    return out


def render_report(ctx: dict[str, Any]) -> bytes:
    """ctx: app, run, runs, findings, decisions, attempts, docs, labels, rules, generated_by, generated_at, pack_id."""
    st = _styles()
    app, run = ctx["app"], ctx["run"]
    docs: dict[str, Document] = ctx["docs"]
    labels: dict[str, str] = ctx["labels"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
                            bottomMargin=24 * mm, title=f"Evidence pack {app.id}", author="Pramana prototype",
                            subject="Evidence pack (synthetic demo data)", creator="Pramana prototype")
    s = run.summary if run else {}
    story: list[Any] = [
        _p("EVIDENCE PACK", st["label"]), Spacer(1, 2), _p(app.institution.name, st["h1"]), Spacer(1, 4),
        _p(f"Application {app.id}, academic year {app.academic_year}, round {app.round}", st["base"]), Spacer(1, 8),
    ]
    nt = Table([[_p(NOTICE, st["notice"])]], colWidths=[FULL_W], hAlign="LEFT")
    nt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), QUOTE_BG), ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story += [nt, Spacer(1, 10), _p("Summary", st["h2"])]
    sev = s.get("by_severity", {})
    rows = [
        ("Pack", ctx["pack_id"]),
        ("Generated", f"{ctx['generated_at']:%d %b %Y %H:%M} UTC by {ctx['generated_by']}"),
        ("Institution", f"{app.institution.name}, {app.institution.district}, {app.institution.state} "
                        f"(AICTE ID {app.institution.aicte_id})"),
        ("Category", ctx["category_label"]),
        ("Status", app.status.replace("_", " ")),
        ("Findings", f"{len(ctx['findings'])} on the latest run: "
                     + ", ".join(f"{sev[k]} {k}" for k in ("critical", "high", "medium", "low", "info") if sev.get(k))),
        ("Documents", f"{sum(1 for d in docs.values() if not d.superseded)} current, "
                      f"{sum(1 for d in docs.values() if d.superseded)} superseded"),
    ]
    if run:
        rows += [("Latest run", run.id), ("Ruleset", f"{run.ruleset_id}"), ("Ruleset SHA-256", run.ruleset_hash),
                 ("As of", s.get("as_of")), ("Input digest", run.input_digest), ("Report digest", run.report_digest)]
    story.append(_kv(rows, st, mono_keys=("Ruleset SHA-256", "Input digest", "Report digest", "Latest run", "Pack")))

    story += [PageBreak(), _p("Findings", st["h2"]),
              _p("Each finding lists its severity, evidence class, review status and every officer decision with its "
                 "reason. The crop shows the page region the finding points at, outlined by Pramana.", st["small"]),
              Spacer(1, 6)]
    for n, f in enumerate(ctx["findings"], start=1):
        head = Table([[_p(f"F{n}", st["h3"]), _p(f.title, st["h3"])]], colWidths=[11 * mm, 153 * mm], hAlign="LEFT")
        head.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                  ("TEXTCOLOR", (0, 0), (0, 0), ACCENT)]))
        # Markup is built from escaped pieces, so it goes to Paragraph directly
        meta = (f"<font color='{SEV_COLOR.get(f.severity, '#9a8f9f')}'><b>{escape(f.severity.upper())}</b></font>"
                f"&nbsp;&nbsp; {escape(EV_LABEL.get(f.evidence_class, f.evidence_class))}&nbsp;&nbsp; outcome "
                f"{escape(f.outcome.replace('_', ' '))}&nbsp;&nbsp; review status "
                f"{escape(f.review_status.replace('_', ' '))}&nbsp;&nbsp; <font face='Courier'>{escape(f.code)}</font>")
        doc_id, page_no, boxes = _regions(f)
        d = docs.get(doc_id or "")
        png = crop_with_boxes(d, page_no, boxes) if d and page_no else None
        col = TEXT_W if png else FULL_W
        body: list[Any] = [_p(f.message, st["base"])]
        if f.limitation:
            body += [Spacer(1, 3), _p(f"Limitation: {f.limitation}", st["small"])]
        cit = (f.rule or {}).get("citation")
        if cit and cit.get("quote"):
            where = ", ".join(x for x in [cit.get("doc_title") or cit.get("doc"), cit.get("section"),
                                          f"page {cit['page']}" if cit.get("page") else None] if x)
            q = Table([[_p(f"RULE {f.rule.get('id')}: {where}", st["label"])],
                       [_p(f"“{cit['quote']}”", st["quote"])]], colWidths=[col - 2 * mm], hAlign="LEFT")
            q.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), QUOTE_BG),
                                   ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                                   ("TOPPADDING", (0, 0), (-1, 0), 5), ("BOTTOMPADDING", (0, -1), (-1, -1), 5)]))
            body += [Spacer(1, 5), q]
        decisions = ctx["decisions"].get(f.fingerprint, [])
        body += [Spacer(1, 5), _p("OFFICER DECISIONS", st["label"])]
        if decisions:
            for dd in decisions:
                note = f": “{dd['note']}”" if dd.get("note") else ""
                body.append(_p(f"{dd['at']:%d %b %Y %H:%M} UTC, {dd['actor']}, {dd['action'].replace('_', ' ')}{note}",
                               st["base"]))
        else:
            body.append(_p("No officer decisions recorded.", st["small"]))
        ev_lines = _evidence_lines(f, docs, labels)
        if ev_lines:
            body += [Spacer(1, 5), _p("EVIDENCE", st["label"])] + [_p(f"- {x}", st["small"]) for x in ev_lines]
        if not doc_id:
            body += [Spacer(1, 3), _p("No document region: this finding concerns declared values or records.",
                                      st["small"])]
        if png:
            with Image.open(io.BytesIO(png)) as im:
                w, h = im.size
            dw = CROP_W
            dh = dw * h / w
            if dh > 80 * mm:
                dh, dw = 80 * mm, 80 * mm * w / h
            cap = (f"{labels.get(d.declared_type, d.declared_type)}, page {page_no}: "
                   + (f"{len(boxes)} evidence region{'s' if len(boxes) != 1 else ''} outlined" if boxes
                      else "no specific region recorded, top of the page shown"))
            grid = Table([[body, [RLImage(io.BytesIO(png), width=dw, height=dh, hAlign="LEFT"), Spacer(1, 2),
                                  _p(cap, st["small"])]]], colWidths=[TEXT_W, CROP_W + 4 * mm], hAlign="LEFT")
            grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, -1), 0),
                                      ("LEFTPADDING", (1, 0), (1, -1), 4 * mm)]))
            body = [grid]
        story.append(KeepTogether([head, Spacer(1, 1), Paragraph(meta, st["small"]), Spacer(1, 4), *body,
                                   Spacer(1, 6), Table([[""]], colWidths=[FULL_W], rowHeights=[1], hAlign="LEFT",
                                                       style=[("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE)]),
                                   Spacer(1, 8)]))

    story += [PageBreak(), _p("Verification results", st["h2"]),
              _p("Results from the latest run. SIMULATED marks a simulated issuer service and DEMO a demo trust "
                 "anchor; neither is a real-world confirmation.", st["small"]), Spacer(1, 6)]
    vrows = [[_p(x, st["label"]) for x in ("DOCUMENT", "CHANNEL", "SOURCE", "STATUS")]]
    for v in ctx["attempts"]:
        d = docs.get(v.document_id or "")
        tag = ("DEMO" if v.channel in ("issuer_signature", "applicant_signature") else "SIMULATED") if v.simulated else ""
        tag = "" if tag and tag in v.source_name else tag
        vrows.append([_p(labels.get(d.declared_type, d.declared_type) if d else "", st["base"]),
                      _p(v.channel.replace("_", " "), st["base"]),
                      _p(f"{v.source_name} {tag}".strip(), st["base"]),
                      _p(v.status.replace("_", " "), st["base"])])
        if v.detail:
            vrows.append([_p("", st["small"]), _p(v.detail, st["small"]), "", ""])
    vt = Table(vrows, colWidths=[38 * mm, 32 * mm, 62 * mm, 32 * mm], hAlign="LEFT", repeatRows=1)
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 0.6, LINE),
             ("LEFTPADDING", (0, 0), (-1, -1), 2)]
    for i, r in enumerate(vrows):
        if i and r[2] == "":
            style += [("SPAN", (1, i), (3, i)), ("LINEBELOW", (0, i), (-1, i), 0.3, LINE)]
    vt.setStyle(TableStyle(style))
    story.append(vt)

    story += [Spacer(1, 12), _p("Cited rules", st["h2"]), Spacer(1, 4)]
    for r in ctx["rules"]:
        where = ", ".join(x for x in [r.get("doc_title") or r.get("doc"), r.get("section"),
                                      f"page {r['page']}" if r.get("page") else None] if x)
        story.append(KeepTogether([_p(f"{r['rule_id']}: {r.get('rule_title') or ''}", st["h3"]), _p(where, st["small"]),
                                   _p(f"“{r.get('quote') or ''}”", st["quote"]), Spacer(1, 6)]))

    story += [Spacer(1, 8), _p("Validation runs", st["h2"]), Spacer(1, 4)]
    for r in ctx["runs"]:
        rs = r.summary or {}
        story.append(KeepTogether([
            _p(f"{r.id}  round {r.round}  {r.status}  as of {rs.get('as_of')}"
               + (f"  replay of {rs.get('replay_of')}" if rs.get("replay_of") else ""), st["h3"]),
            _kv([("Started", r.started_at.strftime("%d %b %Y %H:%M:%S UTC") if r.started_at else ""),
                 ("Ruleset", r.ruleset_id), ("Ruleset SHA-256", r.ruleset_hash), ("Input digest", r.input_digest),
                 ("Report digest", r.report_digest)], st, mono_keys=("Ruleset SHA-256", "Input digest",
                                                                     "Report digest")),
            Spacer(1, 6)]))

    story += [Spacer(1, 8), _p("Integrity", st["h2"]),
              _p("manifest.json lists the SHA-256 of every file in this pack and of each submitted document. "
                 "signature.json signs manifest.json with the audit signing key (Ed25519), and audit/ holds this "
                 "application's audit events with their chain hashes and a signed checkpoint. Run verify_pack.py to "
                 "check all of it offline; VERIFY.txt explains each step.", st["base"]),
              Spacer(1, 4), _kv([("Audit public key", ctx["public_key"])], st, mono_keys=("Audit public key",))]

    canvas_cls = type("PackCanvas", (_NumberedCanvas,), {"draft": False})
    doc.build(story, canvasmaker=canvas_cls)
    return buf.getvalue()
