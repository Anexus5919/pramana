"""Per-document processing: text, classification, fields, fingerprints, forensics, QR tokens."""

import logging
from dataclasses import asdict
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..crypto import load_document
from ..forensics import fingerprints, fonts, pdf_struct
from ..forensics import image as img_forensics
from ..models import Document, DocumentPage, ExtractedField
from ..rules.engine import Ruleset
from ..verification.signed_qr import decode_qr
from .extract import classify, extract_fields, extract_table
from .llm_extract import fill_missing, injection_lines
from .text import extract_image, extract_pdf, render_pdf_page

log = logging.getLogger(__name__)


def _qr_tokens(data: bytes, doc: Document) -> list[dict[str, Any]]:
    out = []
    if doc.mime == "application/pdf":
        for i in range(min(doc.page_count, 3)):
            # Dense signed tokens need more pixels per module; stop at the first resolution that decodes
            for dpi in (150, 220, 300):
                found = decode_qr(render_pdf_page(data, i, dpi))
                if found:
                    scale = dpi / 72
                    out.extend({"page": i + 1, "text": t, "bbox": [round(v / scale, 2) for v in box]}
                               for t, box in found)
                    break
    else:
        import io

        from PIL import Image

        with Image.open(io.BytesIO(data)) as im:
            for text, box in decode_qr(im):
                out.append({"page": 1, "text": text, "bbox": [round(v, 2) for v in box]})
    return out


def process_document(db: Session, doc: Document, rs: Ruleset, campus: tuple[float, float] | None) -> None:
    data = load_document(doc.storage_name)
    doc.pages.clear()
    doc.fields.clear()
    db.flush()
    pages = extract_pdf(data) if doc.mime == "application/pdf" else extract_image(data)
    sources = {p.source for p in pages}
    doc.text_source = sources.pop() if len(sources) == 1 else "mixed"
    for p in pages:
        doc.pages.append(DocumentPage(
            page_no=p.page_no, width=p.width, height=p.height, text_source=p.source, text=p.text,
            words=p.words_json(), ocr_mean_confidence=p.mean_conf,
        ))

    cls = classify(pages, rs.doc_types)
    doc.detected_type = cls["type"]
    doc.classification = cls
    use_type = doc.declared_type if doc.declared_type in rs.doc_types else cls["type"]
    spec = rs.doc_types.get(use_type or "", {})

    issue_date = None
    extracted = extract_fields(pages, spec)
    extracted, llm_report = fill_missing(pages, spec, spec.get("label", use_type or "document"), extracted)
    for e in extracted:
        doc.fields.append(ExtractedField(
            name=e.name, raw=e.raw, value=e.value.isoformat() if hasattr(e.value, "isoformat") else
            (str(e.value) if e.value is not None else None), value_type=e.value_type, page=e.page, bbox=e.bbox,
            method=e.method, confidence=e.confidence, status=e.status,
        ))
        if e.name == "issue_date" and e.value is not None:
            issue_date = datetime(e.value.year, e.value.month, e.value.day)

    analysis: dict[str, Any] = {"llm": llm_report} if llm_report else {}
    if spec.get("table"):
        analysis["rows"] = extract_table(pages, spec["table"])

    full_text = "\n".join(p.text for p in pages)
    doc.fingerprints = fingerprints.compute(data, doc.mime, full_text)

    if doc.mime == "application/pdf":
        signals, facts = pdf_struct.analyse(data, issue_date)
        signals += fonts.font_mismatches(data, extracted, facts)
    else:
        signals, facts = img_forensics.analyse(data, campus)
    analysis["forensic_signals"] = [asdict(s) for s in signals]
    analysis["forensic_facts"] = facts
    try:
        analysis["qr"] = _qr_tokens(data, doc)
    except Exception as e:  # noqa: BLE001  QR decoding is best-effort
        log.warning("QR decode failed for %s: %s", doc.id, e)
        analysis["qr"] = []
    analysis["unreadable_pages"] = [p.page_no for p in pages if p.source == "unreadable"]
    analysis["instruction_lines"] = injection_lines(pages)
    doc.analysis = analysis
    doc.processing_status = "processed"
    doc.processing_error = None
