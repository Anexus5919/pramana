"""Revision time machine: a PDF as it stood at each saved revision.

An incremental update appends bytes and never rewrites earlier ones, so the file cut at a revision's
%%EOF is that revision exactly. Rendering the cut file shows the page as it was when the revision was
saved. This shows what changed and which signature covers which bytes; it does not show who wrote an
unsigned revision or when.
"""

import io
import re
from typing import Any

from pyhanko.pdf_utils.reader import PdfFileReader

from ..config import get_settings
from ..forensics.pdf_struct import revision_offsets
from ..models import Document
from ..pipeline.text import render_pdf_page
from ..verification.signature import _display_name

RENDER_DPI = 110
OBJ_RE = re.compile(rb"(?<![0-9])\d+\s+\d+\s+obj\b")


def revision_ends(data: bytes) -> list[int]:
    ends = revision_offsets(data)
    return ends or [len(data)]


def _signatures(data: bytes, ends: list[int]) -> list[dict[str, Any]]:
    """Each embedded signature with the revision whose bytes it covers (from its /ByteRange)."""
    try:
        sigs = PdfFileReader(io.BytesIO(data), strict=False).embedded_signatures
    except Exception:  # noqa: BLE001  unparseable files are reported by the forensics stage
        return []
    out = []
    for s in sigs:
        try:
            br = [int(x) for x in s.byte_range]
            signed_end = br[2] + br[3]
        except (TypeError, ValueError, IndexError):
            continue
        rev = next((i + 1 for i, e in enumerate(ends) if e >= signed_end - 2), len(ends))
        try:
            signer = _display_name(s.signer_cert) if s.signer_cert else None
        except Exception:  # noqa: BLE001
            signer = None
        t = s.self_reported_timestamp
        out.append({"field": s.field_name, "revision": rev, "signed_bytes": signed_end, "signer": signer,
                    "signing_time": t.isoformat() if t else None})
    return out


def _section_facts(section: bytes) -> dict[str, Any]:
    return {"objects_written": len(OBJ_RE.findall(section)),
            "adds_signature": b"/ByteRange" in section,
            "adds_annotations": b"/Annots" in section,
            "updates_metadata": b"/Info" in section or b"/Metadata" in section}


def describe(doc: Document, data: bytes, attempts: list[Any]) -> dict[str, Any]:
    """Revisions of a stored PDF: byte ranges, signatures, coverage and text changes per revision."""
    ends = revision_ends(data)
    sigs = _signatures(data, ends)
    # Signer role and status come from the validation run, which classified who signed
    by_field: dict[str, Any] = {}
    for a in attempts:
        f = (a.response or {}).get("field")
        if f and a.channel in ("issuer_signature", "applicant_signature") and f not in by_field:
            by_field[f] = a
    for s in sigs:
        a = by_field.get(s["field"])
        s["role"] = (a.response or {}).get("signer_role", "unknown") if a else "unknown"
        s["status"] = a.status if a else None
        s["simulated"] = bool(a.simulated) if a else None
        s["detail"] = a.detail if a else None
        if a and (a.response or {}).get("signer"):
            s["signer"] = a.response["signer"]
    diffs = ((doc.analysis or {}).get("forensic_facts") or {}).get("revision_diffs") or []
    signed_through = max((s["revision"] for s in sigs), default=0)
    revisions = []
    start = 0
    for i, end in enumerate(ends):
        n = i + 1
        changes = [{k: d.get(k) for k in ("page", "added_text", "removed_text", "text_underneath", "bbox")}
                   for d in diffs if d.get("to_revision") == n]
        signed_here = [s for s in sigs if s["revision"] == n]
        covering = [s["field"] for s in sigs if s["revision"] >= n]
        facts = _section_facts(data[start:end])
        kind = "original" if n == 1 else "edit" if changes else "signature" if signed_here else "update"
        revisions.append({
            "n": n, "start": start, "end": end, "bytes": end - start, "kind": kind, **facts,
            "signatures": signed_here, "covered_by": covering,
            "after_last_signature": bool(sigs) and n > signed_through,
            "changes": changes,
        })
        start = end
    pages = [{"page_no": p.page_no, "width": p.width, "height": p.height} for p in doc.pages]
    return {
        "document_id": doc.id, "size_bytes": len(data), "revision_count": len(ends),
        "page_count": max(doc.page_count or 0, len(pages), 1), "pages": pages,
        "revisions": revisions, "signatures": sigs, "signed_through": signed_through or None,
        "trailing_bytes": len(data) - ends[-1],
        "limitations": [
            "Each revision is the file cut at its end-of-file marker and rendered as is. Unsigned revisions carry no "
            "proof of who saved them or when.",
            "Text changes are compared through the text layer. A change drawn as an image or vector shapes shows on "
            "the rendered page but not in the list of text changes.",
        ],
    }


def render(doc: Document, data: bytes, n: int, page_no: int) -> bytes:
    """PNG of one page as it stood at revision n, cached like the current page images."""
    ends = revision_ends(data)
    if n < 1 or n > len(ends):
        raise IndexError("no such revision")
    cache = get_settings().cache_dir / f"{doc.id}_r{n}_p{page_no}.png"
    if not cache.exists():
        img = render_pdf_page(data[: ends[n - 1]], page_no - 1, RENDER_DPI)
        img.save(cache, "PNG", optimize=True)
    return cache.read_bytes()
