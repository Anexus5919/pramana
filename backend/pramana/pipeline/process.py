"""Per-document processing: text, classification, fields, fingerprints, forensics, QR tokens."""

import logging
import time
from collections.abc import Callable
from dataclasses import asdict
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from .. import sandbox
from ..crypto import load_document
from ..models import Document, DocumentPage, ExtractedField
from ..photos import analysis as photo_analysis
from ..rules.engine import Ruleset
from .extract import classify, extract_fields, extract_table
from .llm_extract import fill_missing, injection_lines

log = logging.getLogger(__name__)


def _qr_tokens(data: bytes, doc: Document) -> list[dict[str, Any]]:
    return sandbox.qr_tokens(data, doc.mime, doc.page_count)


def process_document(db: Session, doc: Document, rs: Ruleset, campus: tuple[float, float] | None,
                     progress: Callable[..., None] | None = None, data: bytes | None = None) -> None:
    """Untrusted parsing runs in the parser sandbox; a crash or timeout there raises sandbox.SandboxUnsafe.

    `data` passes the file's bytes directly, for a file that is analysed without being stored."""
    t0 = time.perf_counter()

    def step(name: str, **info: Any) -> None:
        nonlocal t0
        if progress:
            progress("doc.step", document_id=doc.id, declared_type=doc.declared_type, step=name,
                     ms=round((time.perf_counter() - t0) * 1000), **info)
        t0 = time.perf_counter()

    if data is None:
        data = load_document(doc.storage_name)
    doc.pages.clear()
    doc.fields.clear()
    db.flush()
    try:
        pages = sandbox.read_pages(data, doc.mime)
    except sandbox.SandboxUnsafe as e:
        raise sandbox.SandboxUnsafe(f"Could not be read safely: {e}. Review this file manually.") from e
    sources = {p.source for p in pages}
    doc.text_source = sources.pop() if len(sources) == 1 else "mixed"
    for p in pages:
        doc.pages.append(DocumentPage(
            page_no=p.page_no, width=p.width, height=p.height, text_source=p.source, text=p.text,
            words=p.words_json(), ocr_mean_confidence=p.mean_conf,
        ))
    step("read", pages=len(pages), text_source=doc.text_source)

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
    step("extract", fields=len(extracted))

    try:
        full_text = "\n".join(p.text for p in pages)
        doc.fingerprints = sandbox.fingerprints(data, doc.mime, full_text)
        step("fingerprints")

        signals, facts = sandbox.forensics(data, doc.mime, issue_date, campus)
        if doc.mime == "application/pdf":
            doc.fingerprints = {**doc.fingerprints, "images": sandbox.seal_images(data)}
            signals += sandbox.font_check(data, [{"name": e.name, "raw": e.raw, "page": e.page, "bbox": e.bbox,
                                                  "method": e.method} for e in extracted], facts)
        analysis["forensic_signals"] = [asdict(s) for s in signals]
        analysis["forensic_facts"] = facts
        if doc.mime != "application/pdf":
            # Detector and Content Credentials run after the sandbox has decoded the image once
            analysis["photo"] = photo_analysis.analyse(data, doc.mime)
        step("forensics", signals=sum(1 for s in signals if s.severity != "info"))
    except sandbox.SandboxUnsafe as e:
        raise sandbox.SandboxUnsafe(f"Could not be read safely: {e}. Review this file manually.") from e
    try:
        analysis["qr"] = _qr_tokens(data, doc)
    except sandbox.SandboxUnsafe as e:
        raise sandbox.SandboxUnsafe(f"Could not be read safely: {e}. Review this file manually.") from e
    except Exception as e:  # noqa: BLE001  QR decoding is best-effort
        log.warning("QR decode failed for %s: %s", doc.id, e)
        analysis["qr"] = []
    step("qr", tokens=len(analysis["qr"]))
    analysis["unreadable_pages"] = [p.page_no for p in pages if p.source == "unreadable"]
    analysis["ocr_scripts"] = [{"page": p.page_no, **p.ocr} for p in pages
                               if (p.ocr or {}).get("script") == "devanagari"]
    analysis["instruction_lines"] = injection_lines(pages)
    doc.analysis = analysis
    doc.processing_status = "processed"
    doc.processing_error = None
