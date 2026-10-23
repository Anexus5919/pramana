"""Deficiency letters: numbered items drafted from findings, each with its verbatim handbook clause.

The institution reads this letter, so item text describes what to correct without detector internals or
cross-institution indicators. The layout is deliberately neutral: no emblem, letterhead or logo.
"""

import io
import re
from datetime import date, datetime, timedelta
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from ..models import Application, DeficiencyLetter, Finding, User
from ..rules.engine import Ruleset
from .common import RECTIFIABLE_CATEGORIES, citation, doc_label, finding_doc_type, presence_rule, rules_by_id
from .settings import officer_settings

FOOTER = "Prepared with the Pramana prototype. Synthetic demo data."
INK = colors.HexColor("#1c1622")
INK_3 = colors.HexColor("#6b6475")
LINE = colors.HexColor("#dfd4d8")
QUOTE_BG = colors.HexColor("#f6f1ee")
ACCENT = colors.HexColor("#7428ea")

DEFAULT_INTRO = (
    "Scrutiny of the application listed above found the items below that need to be corrected or supplied. "
    "For each item, the handbook clause it relates to is quoted, together with what to submit and the date by "
    "which to respond. Please upload the items through the institution portal and resubmit the application."
)
CLOSING = (
    "This notice lists items to correct. It is not a decision on the application. Decisions are taken by the "
    "competent authority after the response is examined."
)
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


def default_deadline(today: date | None = None) -> date:
    return (today or date.today()) + timedelta(days=officer_settings().letter_response_days)


def fmt_day(d: date | str | None) -> str:
    if not d:
        return "not set"
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    return d.strftime("%d %B %Y").lstrip("0")


def _dates_readable(text: str) -> str:
    return _ISO.sub(lambda m: fmt_day(m.group(0)), text)


def _description(f: Finding, label: str) -> str:
    """Plain-language description for the institution."""
    if f.rule and f.outcome == "fail":
        return _dates_readable(f.message)
    if f.rule:
        return f"A value needed to check this requirement could not be read from the submitted {label}."
    if f.category == "verification":
        return {
            "expired": f"The issuing authority's record shows that the submitted {label} is no longer valid.",
            "mismatch_detected": f"The details on the submitted {label} could not be confirmed against the "
                                 "issuing authority's record.",
            "source_unavailable": f"The issuing authority could not be reached to confirm the {label}.",
            "verification_pending": f"Confirmation of the {label} from the issuing authority is pending.",
            "manual_review_required": f"The {label} could not be confirmed automatically with its issuing authority.",
        }.get(f.outcome, f"The {label} could not be confirmed with its issuing authority.")
    if f.code == "RECT-OUT-OF-SCOPE-FIELD":
        return "A declared value was changed in this round although the earlier request did not ask for it."
    if f.code == "RECT-OUT-OF-SCOPE-DOCUMENT":
        return f"The {label} was changed in this round although the earlier request did not ask for it."
    if f.code == "DOC-UNREADABLE":
        return f"Pages of the submitted {label} could not be read."
    if f.code == "DOC-TYPE-MISMATCH":
        return f"The file uploaded as the {label} does not appear to be that document."
    if f.code == "FIELD-UNCERTAIN":
        return f"A value on the submitted {label} could not be read with confidence."
    # Forensic and cross-application indicators stay under review; the institution sees a neutral request
    return f"The submitted {label} could not be accepted in its current form."


def _required(f: Finding, rs: Ruleset, doc_type: str | None, label: str) -> str:
    if f.code == "RECT-OUT-OF-SCOPE-FIELD":
        return "A written explanation of the change, or the earlier value restored, with supporting documents."
    if doc_type:
        desc = rs.doc_types.get(doc_type, {}).get("description")
        base = f"Upload the {label} as issued by the competent authority, valid on the date of resubmission."
        return f"{base} {desc}" if desc else base
    return "Corrected figures in the application form, with supporting documents for each change."


def _title(f: Finding, doc_type: str | None, label: str) -> str:
    """Rule findings keep their handbook title; anything else is named by the document it concerns."""
    if f.rule:
        return f.title
    return f"{label[0].upper()}{label[1:]} needs to be resubmitted" if doc_type else "Declared value needs clarification"


def item_wording(db: Session, f: Finding, rs: Ruleset) -> tuple[str, str]:
    """Title and description an institution may read for one finding, worded as the deficiency letter words it."""
    doc_type = finding_doc_type(db, f, rs)
    label = doc_label(rs, doc_type)
    if f.category in RECTIFIABLE_CATEGORIES:
        return _title(f, doc_type, label)[:300], _description(f, label)[:2000]
    # Indicators under review never reach the institution by name: only the document and a neutral request
    title = f"{label[0].upper()}{label[1:]} needs to be resubmitted" if doc_type else "Declared value needs clarification"
    return title, _description(f, label)[:2000]


def draft_items(db: Session, findings: list[Finding], rs: Ruleset, respond_by: date) -> list[dict[str, Any]]:
    """One numbered item per document (or per finding without a document), so related findings read as one ask."""
    groups: dict[str, list[tuple[Finding, str | None]]] = {}
    for f in findings:
        doc_type = finding_doc_type(db, f, rs)
        groups.setdefault(f"doc:{doc_type}" if doc_type else f"fnd:{f.id}", []).append((f, doc_type))
    rules = rules_by_id(rs)
    items = []
    for members in groups.values():
        # The failed rule leads: it carries the clause and the plainest wording
        members.sort(key=lambda m: (not (m[0].rule and m[0].outcome == "fail"), not m[0].rule))
        f, doc_type = members[0]
        label = doc_label(rs, doc_type)
        rule = rules.get((f.rule or {}).get("id", "")) or presence_rule(rs, doc_type)
        title = _title(f, doc_type, label)
        desc = list(dict.fromkeys(_description(m, label) for m, _ in members))
        items.append({"finding_ids": [m.id for m, _ in members], "codes": [m.code for m, _ in members],
                      "title": title[:300], "description": " ".join(desc)[:2000],
                      "required": _required(f, rs, doc_type, label), "citation": citation(rs, rule) if rule else None,
                      "respond_by": respond_by.isoformat()})
    return items


def default_subject(app: Application) -> str:
    return f"Deficiencies found in application {app.id} ({app.academic_year}), round {app.round}"


def letter_json(lt: DeficiencyLetter, *, for_institution: bool = False, page_count: int | None = None,
                names: dict[str, str] | None = None) -> dict[str, Any]:
    # Institutions get the letter's wording only, not finding ids or detector codes
    items = [{k: v for k, v in i.items() if k not in ("finding_ids", "codes")} for i in lt.items]         if for_institution else lt.items
    out = {"id": lt.id, "application_id": lt.application_id, "round": lt.round, "status": lt.status,
           "subject": lt.subject, "intro": lt.intro, "items": items,
           "finalised_at": lt.finalised_at.isoformat() if lt.finalised_at else None,
           "final_sha256": lt.final_sha256, "rectification_id": lt.rectification_id}
    if not for_institution:
        out.update({"created_by": (names or {}).get(lt.created_by, lt.created_by),
                    "created_at": lt.created_at.isoformat(), "updated_at": lt.updated_at.isoformat(),
                    "finalised_by": (names or {}).get(lt.finalised_by, lt.finalised_by) if lt.finalised_by else None,
                    "final_reason": lt.final_reason, "page_count": page_count})
    return out


# ------------------------------------------------------------------ PDF


def _styles() -> dict[str, ParagraphStyle]:
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=10, leading=14.2, textColor=INK, alignment=TA_LEFT)
    return {
        "base": base,
        "title": ParagraphStyle("title", parent=base, fontName="Helvetica-Bold", fontSize=17, leading=21),
        "eyebrow": ParagraphStyle("eyebrow", parent=base, fontSize=7.5, leading=10, textColor=INK_3),
        "small": ParagraphStyle("small", parent=base, fontSize=8.5, leading=11.5, textColor=INK_3),
        "subject": ParagraphStyle("subject", parent=base, fontName="Helvetica-Bold", fontSize=11, leading=15),
        "item": ParagraphStyle("item", parent=base, fontName="Helvetica-Bold", fontSize=11, leading=15),
        "label": ParagraphStyle("label", parent=base, fontName="Helvetica-Bold", fontSize=8, leading=11,
                                textColor=INK_3),
        "quote": ParagraphStyle("quote", parent=base, fontName="Helvetica-Oblique", fontSize=9.5, leading=13.5),
    }


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text or "").replace("\n", "<br/>"), style)


class _NumberedCanvas(rl_canvas.Canvas):
    """Writes "Page n of N", the footer and, on drafts, the watermark once the page count is known."""

    draft = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved: list[dict] = []

    def showPage(self):  # noqa: N802  reportlab API
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    def _decorate(self, total: int) -> None:
        w, h = A4
        self.saveState()
        self.setStrokeColor(LINE)
        self.setLineWidth(0.6)
        self.line(20 * mm, 16 * mm, w - 20 * mm, 16 * mm)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(INK_3)
        self.drawString(20 * mm, 11.5 * mm, FOOTER)
        self.drawRightString(w - 20 * mm, 11.5 * mm, f"Page {self._pageNumber} of {total}")
        if self.draft:
            self.setFillColor(colors.Color(0.55, 0.24, 1, alpha=0.11))
            self.setFont("Helvetica-Bold", 120)
            self.translate(w / 2, h / 2)
            self.rotate(40)
            self.drawCentredString(0, -40, "DRAFT")
        self.restoreState()


def render_pdf(lt: DeficiencyLetter, app: Application, officer: User | None, *, final: bool,
               finalised_on: datetime | None = None) -> bytes:
    from ..rules.engine import active_ruleset

    st = _styles()
    category = active_ruleset().checklists.get(app.category, {}).get("label", app.category.replace("_", " "))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
                            bottomMargin=24 * mm, title=lt.subject, author="Pramana prototype",
                            subject="Deficiency letter (synthetic demo data)", creator="Pramana prototype")
    inst = app.institution
    issued = finalised_on.date() if finalised_on else date.today()
    story: list[Any] = [
        _p("DEFICIENCY NOTICE" if final else "DEFICIENCY NOTICE (DRAFT, NOT SENT)", st["eyebrow"]),
        Spacer(1, 3),
        _p("Deficiency letter", st["title"]),
        Spacer(1, 10),
    ]
    meta = [
        ["Reference", lt.id, "Date", fmt_day(issued)],
        ["Application", app.id, "Round", str(lt.round)],
        ["Category", category, "Academic year", app.academic_year],
    ]
    t = Table([[_p(a, st["label"]), _p(b, st["base"]), _p(c, st["label"]), _p(d, st["base"])] for a, b, c, d in meta],
              colWidths=[24 * mm, 62 * mm, 26 * mm, 52 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, -1), (-1, -1), 0.6, LINE),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story += [t, Spacer(1, 10), _p("To", st["label"]), _p(inst.name, st["base"]),
              _p(f"{inst.address}, {inst.state}", st["base"]), _p(f"AICTE ID {inst.aicte_id}", st["small"]),
              Spacer(1, 10), _p(f"Subject: {lt.subject}", st["subject"]), Spacer(1, 6), _p(lt.intro, st["base"]),
              Spacer(1, 10)]

    for n, it in enumerate(lt.items, start=1):
        block: list[Any] = [_p(f"{n}. {it['title']}", st["item"]), Spacer(1, 3), _p(it.get("description", ""),
                                                                                   st["base"]), Spacer(1, 5)]
        c = it.get("citation")
        if c and c.get("quote"):
            where = ", ".join(x for x in [c.get("doc_title") or c.get("doc"), c.get("section"),
                                          f"page {c['page']}" if c.get("page") else None] if x)
            q = Table([[_p(f"HANDBOOK CLAUSE ({c['rule_id']})", st["label"])], [_p(where, st["small"])],
                       [_p(f"“{c['quote']}”", st["quote"])]], colWidths=[164 * mm], hAlign="LEFT")
            q.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), QUOTE_BG),
                                   ("LINEBEFORE", (0, 0), (0, -1), 2.2, ACCENT),
                                   ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 2),
                                   ("BOTTOMPADDING", (0, -1), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, 0), 6)]))
            block += [q, Spacer(1, 5)]
        else:
            block += [_p("No handbook clause is cited for this item.", st["small"]), Spacer(1, 5)]
        req = Table([[_p("WHAT TO SUBMIT", st["label"]), _p(it.get("required", ""), st["base"])],
                     [_p("RESPOND BY", st["label"]), _p(fmt_day(it.get("respond_by")), st["base"])]],
                    colWidths=[32 * mm, 132 * mm], hAlign="LEFT")
        req.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
        block += [req, Spacer(1, 12)]
        story.append(KeepTogether(block))

    story += [_p(CLOSING, st["base"]), Spacer(1, 16)]
    who = officer.display_name if officer else "Scrutiny officer"
    story += [_p(who, st["subject"]), _p("Scrutiny officer (synthetic demo account)", st["small"])]
    if final:
        story += [Spacer(1, 8), _p(f"Finalised on {fmt_day(issued)}. The SHA-256 digest of this file is recorded in "
                                  "the Pramana audit chain.", st["small"])]

    canvas_cls = type("LetterCanvas", (_NumberedCanvas,), {"draft": not final})
    doc.build(story, canvasmaker=canvas_cls)
    return buf.getvalue()


def page_count(pdf: bytes) -> int:
    # pypdf is pure Python and safe to call from concurrent request threads
    from pypdf import PdfReader

    return len(PdfReader(io.BytesIO(pdf)).pages)
