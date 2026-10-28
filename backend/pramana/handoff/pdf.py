"""The report PDF an Executive Committee member reads: the outcome, the findings and provisions, verification,
the correction rounds, the integrity digests and what happens next. Rendered once from the stored report record."""

import io
from datetime import datetime
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from ..officer.letter import ACCENT, LINE, QUOTE_BG, _NumberedCanvas
from ..officer.report import SEV_COLOR, _kv, _p, _styles

FULL_W = 170 * mm
GROUP_WORDS = {"open": "Open", "acknowledged": "Acknowledged", "resolved": "Resolved", "dismissed": "Dismissed"}
REVIEW_WORDS = {"evidence_requested": "asked of the institution", "escalated": "referred for inspection",
                "accepted": "accepted", "acknowledged": "acknowledged", "dismissed": "dismissed",
                "resolved": "resolved", "open": "open"}


def _when(iso: str | None) -> str:
    if not iso:
        return "not given"
    return datetime.fromisoformat(iso).strftime("%d %b %Y, %H:%M UTC").lstrip("0")


def _day(iso: str | None) -> str:
    return datetime.fromisoformat(iso).strftime("%d %b %Y").lstrip("0") if iso else "not given"


def _grid(rows: list[list[Any]], widths: list[float], st, *, header: bool = True) -> Table:
    t = Table(rows, colWidths=widths, hAlign="LEFT", repeatRows=1 if header else 0)
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 3),
             ("RIGHTPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 2.5),
             ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]
    if header:
        style += [("LINEBELOW", (0, 0), (-1, 0), 0.6, LINE)]
    style += [("LINEBELOW", (0, i), (-1, i), 0.3, LINE) for i in range(1, len(rows))]
    t.setStyle(TableStyle(style))
    return t


def _box(text: str, st) -> Table:
    t = Table([[_p(text, st["notice"])]], colWidths=[FULL_W], hAlign="LEFT")
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), QUOTE_BG), ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
                           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


def _counts(d: dict[str, int]) -> str:
    parts = [f"{n} {GROUP_WORDS.get(k, k).lower()}" for k, n in d.items() if n]
    return ", ".join(parts) or "none"


def _matrix(title: str, data: dict[str, dict[str, int]], labels: dict[str, str], st) -> list[Any]:
    head = [_p(x, st["label"]) for x in (title.upper(), "OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED")]
    rows = [head]
    for k, v in data.items():
        rows.append([_p(labels.get(k, k.replace("_", " ").capitalize()), st["base"]),
                     *[_p(v.get(g, 0) or "", st["base"]) for g in GROUP_WORDS]])
    if len(rows) == 1:
        rows.append([_p("No findings on this run.", st["small"]), "", "", "", ""])
    return [_grid(rows, [62 * mm, 27 * mm, 27 * mm, 27 * mm, 27 * mm], st)]


def render(c: dict[str, Any], report_sha256: str) -> bytes:
    from .report import CATEGORY_LABEL, DOC_STATUS_LABEL

    st = _styles()
    a, o, f, v, r, p = (c["application"], c["outcome"], c["findings"], c["verification"], c["correction_rounds"],
                        c["evidence_pack"])
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
                            bottomMargin=24 * mm, title=f"Scrutiny report {a['id']} version {c['version']}",
                            author="Pramana prototype", subject="Scrutiny report for the Executive Committee",
                            creator="Pramana prototype")
    story: list[Any] = [
        _p("SCRUTINY REPORT FOR THE EXECUTIVE COMMITTEE", st["label"]), Spacer(1, 2), _p(a["institution"], st["h1"]),
        Spacer(1, 4),
        _p(f"Application {a['id']}, {a['category_label']}, academic year {a['academic_year']}. "
           f"Report version {c['version']}" + (", replacing the earlier version" if c.get("supersedes") else "")
           + f", prepared {_when(c['prepared_at'])}.", st["base"]),
        Spacer(1, 8), _box(c["notice"], st), Spacer(1, 10),
        _p("Scrutiny outcome", st["h2"]), Spacer(1, 2),
        _kv([("Outcome", o["label"]), ("Reasons", o["reason"]),
             ("Recorded by", (o["recorded_by"] or {}).get("name") or "an official"),
             ("Recorded", _when(o["recorded_at"])), ("Round", o["round_label"]), ("Validation run", o["run_id"])],
            st, widths=(36 * mm, 134 * mm), mono_keys=("Validation run",)),
        Spacer(1, 8), _p("At a glance", st["h2"]), Spacer(1, 2),
    ]
    docs_line = ", ".join(f"{n} {DOC_STATUS_LABEL.get(k, k).lower()}" for k, n in v["counts"].items()) or "none"
    rr = r["review_requests"]
    rounds_line = ("No correction round" if not r["rounds"] else
                   f"{len(r['rounds'])} correction round{'s' if len(r['rounds']) != 1 else ''}; "
                   + ("no review request was made" if rr == 0 else
                      f"{r['review_requests_answered']} of {rr} review request{'s' if rr != 1 else ''} answered"
                      + (" (every one)" if r["all_review_requests_answered"] else "")))
    story.append(_kv([
        ("Findings", f"{f['total']} on the run: {_counts(f['by_group'])}"),
        ("Provisions", f"{len(f['provisions'])} provision{'s' if len(f['provisions']) != 1 else ''} of the AICTE Act, "
                       "the Approval Regulations and the handbook relate to these findings"),
        ("Documents", docs_line + (". Issuer registries in this prototype are SIMULATED."
                                   if v["simulated_sources"] else "")),
        ("Correction rounds", rounds_line),
        ("Evidence pack", f"{p['pack_id']}, signed, built when this report was prepared"),
    ], st, widths=(36 * mm, 134 * mm), mono_keys=()))
    story += [Spacer(1, 8), _p("Integrity", st["h2"]), Spacer(1, 2),
              _kv([("Report SHA-256", report_sha256), ("Evidence pack ZIP", p["zip_sha256"]),
                   ("Pack manifest", p["manifest_sha256"]), ("Audit public key", p["public_key"])], st,
                  widths=(36 * mm, 134 * mm),
                  mono_keys=("Report SHA-256", "Evidence pack ZIP", "Pack manifest", "Audit public key")),
              Spacer(1, 3),
              _p("The report SHA-256 is computed over the stored report record, which Pramana never changes; a later "
                 "outcome adds a new version. The evidence pack verifies offline with verify_pack.py inside it, and "
                 "both digests are recorded in the audit chain.", st["small"])]

    story += [PageBreak(), _p("Findings", st["h2"]),
              _p("Findings on the validation run the outcome was recorded against, by the review status officials gave "
                 "them. Asked of the institution and referred for inspection count as open.", st["small"]),
              Spacer(1, 6)]
    story += _matrix("Severity", f["by_severity"], {s: s.capitalize() for s in SEV_COLOR}, st)
    story += [Spacer(1, 8)]
    story += _matrix("Category", f["by_category"], CATEGORY_LABEL, st)
    story += [Spacer(1, 10), _p("Provisions the findings relate to", st["h3"]),
              _p("From Pramana's regulatory basis, quoted verbatim. A finding relates to a provision; whether a "
                 "provision is met is for the competent authority.", st["small"]), Spacer(1, 4)]
    if not f["provisions"]:
        story.append(_p("None of the findings maps to a provision.", st["small"]))
    for pr in f["provisions"]:
        story.append(KeepTogether([
            _p(f"{pr['cite']}, page {pr['page']}: {pr['open_or_acknowledged']} open or acknowledged of "
               f"{pr['findings']} finding{'s' if pr['findings'] != 1 else ''}", st["label"]),
            _p(f"“{pr['quote']}”", st["quote"]), Spacer(1, 5)]))
    story += [Spacer(1, 6), _p("Findings in detail", st["h3"]), Spacer(1, 4)]
    rows = [[_p(x, st["label"]) for x in ("#", "FINDING", "SEVERITY", "STATUS", "RELATES TO")]]
    for it in f["items"]:
        sev = (f"<font color='{SEV_COLOR.get(it['severity'], '#9a8f9f')}'><b>{escape(it['severity'].upper())}</b>"
               "</font>")
        rows.append([_p(it["no"], st["small"]),
                     [_p(it["title"], st["base"]),
                      _p(f"{CATEGORY_LABEL.get(it['category'], it['category'])}, {it['code']}", st["small"])],
                     Paragraph(sev, st["small"]),
                     _p(REVIEW_WORDS.get(it["review_status"], it["review_status"].replace("_", " ")), st["base"]),
                     _p("; ".join(it["relates_to"]) or "none mapped", st["small"])])
    if len(rows) == 1:
        rows.append(["", _p("No findings on this run.", st["small"]), "", "", ""])
    story.append(_grid(rows, [8 * mm, 74 * mm, 20 * mm, 28 * mm, 40 * mm], st))

    story += [PageBreak(), _p("Verification", st["h2"]),
              _p("Each current document's status as officials read it when the outcome was recorded: the validation "
                 "run's result with later manual confirmations and officer reviews applied."
                 + (" SIMULATED: issuer registries in this prototype are simulated; their results are not real-world "
                    "confirmations." if v["simulated_sources"] else ""), st["small"]), Spacer(1, 6)]
    vrows = [[_p(x, st["label"]) for x in ("DOCUMENT", "STATUS", "SHA-256")]]
    for d in v["documents"]:
        vrows.append([_p(d["label"], st["base"]), _p(DOC_STATUS_LABEL.get(d["status"], d["status"]), st["base"]),
                      _p(d["sha256"][:16] + "...", st["mono"])])
    story.append(_grid(vrows, [84 * mm, 46 * mm, 40 * mm], st))

    story += [Spacer(1, 12), _p("Correction rounds", st["h2"]),
              _p("Each round the AICTE Scrutiny Cell opened, and whether the institution's review requests had the "
                 "cell's answer. An outcome cannot be recorded while a review request waits.", st["small"]),
              Spacer(1, 6)]
    if not r["rounds"]:
        story.append(_p("No correction round was opened for this application.", st["base"]))
    else:
        crow = [[_p(x, st["label"]) for x in ("ROUND", "ITEMS", "LETTER", "RESPONSE", "REVIEW REQUESTS")]]
        for x in r["rounds"]:
            crow.append([_p(x["label"], st["base"]), _p(x["items"], st["base"]),
                         _p(f"Finalised {_day(x['letter']['finalised_at'])}" if x["letter"] else "No letter",
                            st["base"]),
                         _p(f"Resubmitted {_day(x['responded_at'])}" if x["responded_at"] else "Not resubmitted",
                            st["base"]),
                         _p("None" if not x["review_requests"] else
                            f"{x['review_requests_answered']} of {x['review_requests']} answered", st["base"])])
        story.append(_grid(crow, [40 * mm, 16 * mm, 38 * mm, 40 * mm, 36 * mm], st))

    story += [Spacer(1, 12), _p("What happens next", st["h2"]),
              _p("Pramana covers the scrutiny stage. The decision and its ratification are AICTE's.", st["small"]),
              Spacer(1, 6)]
    srows = [[_p(x, st["label"]) for x in ("STAGE", "BY", "WHAT HAPPENS", "BASIS")]]
    for s in c["process"]:
        srows.append([_p(s["stage"], st["h3"]), _p(s["by"], st["base"]), _p(s["what"], st["base"]),
                      _p(s["basis"], st["small"])])
    story.append(_grid(srows, [24 * mm, 36 * mm, 66 * mm, 44 * mm], st))
    story += [Spacer(1, 8), _box("Approval Process Handbook 2024-27, clause 1.10(a), PDF page 24: “The Executive "
                                 "Committee (EC) after considering the recommendations of the Committee and views of "
                                 "the Regulation Bureau shall take decision either to grant of approval or otherwise. "
                                 "The decisions of the Executive Committee shall be ratified by the Council.”", st)]

    canvas_cls = type("EcReportCanvas", (_NumberedCanvas,), {"draft": False})
    doc.build(story, canvasmaker=canvas_cls)
    return buf.getvalue()
