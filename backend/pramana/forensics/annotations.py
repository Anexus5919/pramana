"""Annotations drawn over printed values.

Comment tools (Edge's Add text and Draw, a reader's text box, rectangle and stamp tools) and form fields do
not change a page's text. They add annotations, whose appearance every viewer paints on top of the page. Text
extraction, the signed QR comparison and the issuer registry then read the printed value underneath, while a
person reading the file sees the annotation. This finds annotations that visibly cover an extracted key value
or other printed text, says what the page shows there, and in which revision each annotation was added.

Links, sticky-note icons, highlights and other markup that leaves the text readable are not considered, and
neither are annotations that cover no printed text.
"""

import io
import re
from collections import Counter
from typing import Any

import pdfplumber
import pikepdf

from .pdf_struct import Signal, chars_to_words, revision_offsets

MAX_PAGES = 5
RENDER_DPI = 100
OCR_DPI = 220
# Subtypes whose appearance can hide or replace what is printed under them
COVERING = {"/FreeText", "/Square", "/Circle", "/Polygon", "/PolyLine", "/Line", "/Ink", "/Stamp", "/Widget", "/Redact"}
KIND = {"/FreeText": "text box", "/Square": "rectangle", "/Circle": "ellipse", "/Polygon": "polygon",
        "/PolyLine": "drawn line", "/Line": "line", "/Ink": "freehand drawing", "/Stamp": "stamp",
        "/Widget": "form field", "/Redact": "redaction mark"}
MIN_FIELD_SHARE = 0.3  # of a value's box under the annotation
MIN_VISIBLE_SHARE = 0.02  # of the pixels in a box that the annotations paint or change
PIXEL_DELTA = 40
FLAG_HIDDEN, FLAG_PRINT, FLAG_NOVIEW = 2, 4, 32
TAG_RE = re.compile(r"<[^>]+>")
TEXT_OPS = {"Tj", "TJ", "'", '"'}
MIN_OCR_CONF = 0.7


def _rect(a: pikepdf.Dictionary, box: list[float]) -> list[float] | None:
    try:
        x0, y0, x1, y1 = (float(v) for v in a.Rect)
    except (AttributeError, TypeError, ValueError):
        return None
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    # Top-left origin in points, as pdfplumber and the extracted fields use
    return [round(x0 - box[0], 2), round(box[3] - y1, 2), round(x1 - box[0], 2), round(box[3] - y0, 2)]


def _text(v: Any) -> str:
    if v is None:
        return ""
    try:
        return str(v).strip()
    except Exception:  # noqa: BLE001  undecodable strings are left out
        return ""


def _is_signature(a: pikepdf.Dictionary) -> bool:
    node, hops = a, 0
    while node is not None and hops < 8:
        if node.get("/FT") == "/Sig":
            return True
        node, hops = node.get("/Parent"), hops + 1
    return False


def _draws_text(ap: Any, depth: int = 0) -> bool:
    """Whether an appearance stream (or a form it draws) shows text, rather than only shapes or images."""
    if ap is None or depth > 2:
        return False
    streams = [ap] if isinstance(ap, pikepdf.Stream) else [v for v in ap.values() if isinstance(v, pikepdf.Stream)]
    for st in streams[:4]:
        try:
            ops = pikepdf.parse_content_stream(st)
        except Exception:  # noqa: BLE001  an unparseable appearance draws nothing readable
            continue
        xobjects = (st.get("/Resources") or {}).get("/XObject") or {}
        for operands, op in ops:
            if str(op) in TEXT_OPS:
                return True
            if str(op) == "Do" and operands:
                x = xobjects.get(str(operands[0]))
                if x is not None and x.get("/Subtype") == "/Form" and _draws_text(x, depth + 1):
                    return True
    return False


def _annotations(pdf: pikepdf.Pdf) -> list[dict[str, Any]]:
    out = []
    for pno, page in enumerate(pdf.pages[:MAX_PAGES], start=1):
        mb = [float(v) for v in page.mediabox]
        for a in page.obj.get("/Annots") or []:
            try:
                rec = _record(a, pno, mb)
            except Exception:  # noqa: BLE001  a broken entry is not an annotation anyone sees
                continue
            if rec:
                out.append(rec)
    return out


def _record(a: pikepdf.Dictionary, pno: int, mb: list[float]) -> dict[str, Any] | None:
    sub = str(a.get("/Subtype"))
    if sub not in COVERING or (sub == "/Widget" and _is_signature(a)):
        return None
    flags = int(a.get("/F", 0) or 0)
    rect = _rect(a, mb)
    if rect is None or flags & FLAG_HIDDEN or (flags & FLAG_NOVIEW and not flags & FLAG_PRINT):
        return None
    ap = a.get("/AP")
    text = _text(a.get("/Contents")) or TAG_RE.sub("", _text(a.get("/RC"))).strip()
    if sub == "/Widget":
        text = _text(a.get("/V")) or text
    normal = ap.get("/N") if isinstance(ap, pikepdf.Dictionary) else None
    return {"page": pno, "subtype": sub.lstrip("/"), "kind": KIND[sub], "rect": rect, "flags": flags,
            "has_appearance": normal is not None, "draws_text": _draws_text(normal), "text": text[:200],
            "print_only": bool(flags & FLAG_NOVIEW)}


def _identity(a: dict[str, Any]) -> tuple:
    return (a["page"], a["subtype"], *(round(v) for v in a["rect"]))


def _signatures(pdf: pikepdf.Pdf, ends: list[int]) -> list[dict[str, Any]]:
    """Signature fields with the revision their /ByteRange ends in."""
    out = []
    acro = pdf.Root.get("/AcroForm")
    stack = list(acro.get("/Fields") or []) if acro is not None else []
    seen = 0
    while stack and seen < 500:
        f = stack.pop()
        seen += 1
        stack.extend(f.get("/Kids") or [])
        v = f.get("/V")
        if f.get("/FT") != "/Sig" or v is None or "/ByteRange" not in v:
            continue
        try:
            br = [int(x) for x in v.ByteRange]
            end = br[2] + br[3]
        except (TypeError, ValueError, IndexError):
            continue
        rev = next((i + 1 for i, e in enumerate(ends) if e >= end - 2), len(ends))
        # A signature applied to this file ends where a revision ends; after a full rewrite it no longer does
        aligned = any(abs(e - end) <= 2 for e in ends)
        out.append({"field": _text(f.get("/T")) or "signature", "revision": rev, "aligned": aligned})
    return out


def _added_in(data: bytes, ends: list[int], found: list[dict[str, Any]]) -> None:
    """The first revision in which each annotation appears (1-based)."""
    for a in found:
        a["revision"] = max(len(ends), 1)
    for i, end in enumerate(ends[:-1], start=1):
        try:
            with pikepdf.open(io.BytesIO(data[:end])) as rev:
                ids = Counter(_identity(x) for x in _annotations(rev))
        except Exception:  # noqa: BLE001  a revision that does not parse alone adds nothing here
            continue
        for a in found:
            if a["revision"] > i and ids[_identity(a)]:
                a["revision"] = i


def _blanked(data: bytes, pages: set[int]) -> bytes:
    """The file with the page content emptied, so only annotation appearances remain to draw."""
    with pikepdf.open(io.BytesIO(data)) as pdf:
        for p in pages:
            pdf.pages[p - 1].obj.Contents = pdf.make_stream(b"")
        buf = io.BytesIO()
        pdf.save(buf)
        return buf.getvalue()


def _render(doc, p: int, dpi: int, annots: bool = True):
    import numpy as np

    page = doc[p - 1]
    try:
        img = page.render(scale=dpi / 72, grayscale=True, draw_annots=annots, may_draw_forms=annots).to_pil()
    finally:
        page.close()
    return np.asarray(img, dtype=np.int16)


def _renders(data: bytes, blank: bytes, pages: set[int]) -> dict[int, tuple[Any, Any, Any]]:
    """Each page drawn with and without its annotations, and the annotations alone on an empty page."""
    import pypdfium2 as pdfium

    out = {}
    doc, alone = pdfium.PdfDocument(data), pdfium.PdfDocument(blank)
    try:
        doc.init_forms()
        alone.init_forms()
        for p in pages:
            out[p] = (_render(doc, p, RENDER_DPI), _render(doc, p, RENDER_DPI, False), _render(alone, p, RENDER_DPI))
    finally:
        doc.close()
        alone.close()
    return out


def _annotation_chars(blank: bytes, pages: set[int]) -> dict[int, list[dict]]:
    """Glyphs the annotation appearances draw, read by flattening them into the emptied pages."""
    import pypdfium2 as pdfium
    import pypdfium2.raw as pdfium_c

    doc = pdfium.PdfDocument(blank)
    try:
        doc.init_forms()
        for p in pages:
            page = doc[p - 1]
            pdfium_c.FPDFPage_Flatten(page.raw, pdfium_c.FLAT_NORMALDISPLAY)
            page.close()
        buf = io.BytesIO()
        doc.save(buf)
    finally:
        doc.close()
    with pdfplumber.open(io.BytesIO(buf.getvalue())) as pdf:
        return {p: [c for c in pdf.pages[p - 1].chars if c["text"].strip()] for p in pages}


def _effect(renders, page: int, box: list[float]) -> float:
    """Share of pixels in `box` that the annotations paint or change on the rendered page."""
    on, off, alone = renders[page]
    s = RENDER_DPI / 72
    x0, y0 = max(0, int(box[0] * s)), max(0, int(box[1] * s))
    x1, y1 = min(on.shape[1], int(round(box[2] * s)) + 1), min(on.shape[0], int(round(box[3] * s)) + 1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    m = (abs(on[y0:y1, x0:x1] - off[y0:y1, x0:x1]) > PIXEL_DELTA) | (alone[y0:y1, x0:x1] < 255 - PIXEL_DELTA)
    return float(m.mean())


def _inside(c: dict, r: list[float], pad: float = 1.0) -> bool:
    cx, cy = (c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2
    return r[0] - pad <= cx <= r[2] + pad and r[1] - pad <= cy <= r[3] + pad


def _inter(a: list[float], b: list[float]) -> list[float] | None:
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    return [x0, y0, x1, y1] if x1 > x0 and y1 > y0 else None


def _area(b: list[float]) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _words_text(chars: list[dict]) -> str:
    lines: dict[int, list] = {}
    for w in chars_to_words(chars):
        lines.setdefault(round(w.top / 3), []).append(w)
    return " ".join(" ".join(w.text for w in sorted(ln, key=lambda w: w.x0)) for _, ln in sorted(lines.items()))


def _ocr_shown(blank: bytes, page: int, box: list[float]) -> str:
    """What an annotation without text (a stamp image, handwriting) reads as, by OCR of the annotation alone."""
    import pypdfium2 as pdfium
    from PIL import Image

    from ..pipeline.ocr import ocr_image

    doc = pdfium.PdfDocument(blank)
    try:
        doc.init_forms()
        img = Image.fromarray(_render(doc, page, OCR_DPI).astype("uint8")).convert("RGB")
    finally:
        doc.close()
    s = OCR_DPI / 72
    crop = img.crop((max(0, int((box[0] - 4) * s)), max(0, int((box[1] - 4) * s)),
                     min(img.width, int((box[2] + 4) * s)), min(img.height, int((box[3] + 4) * s))))
    words = [w for w in ocr_image(crop) or [] if w[5] >= MIN_OCR_CONF]
    text = " ".join(w[0] for w in sorted(words, key=lambda w: (round(w[2] / 20), w[1]))).strip()
    return text if sum(ch.isalnum() for ch in text) >= 2 else ""


def scan(data: bytes, fields: list[dict[str, Any]]) -> dict[str, Any]:
    """Annotations that visibly cover a key value or printed text, with what the page shows there.

    `fields` are extracted values with name, raw, page and bbox (points, top-left origin)."""
    with pikepdf.open(io.BytesIO(data)) as pdf:
        found = _annotations(pdf)
        if not found:
            return {"annotations": [], "signals": [], "signatures": []}
        ends = revision_offsets(data)
        sigs = _signatures(pdf, ends)
    if len(ends) > 1:
        _added_in(data, ends, found)
    else:
        for a in found:
            a["revision"] = 1
    pages = {a["page"] for a in found}
    blank = _blanked(data, pages)
    renders = _renders(data, blank, pages)
    drawn = _annotation_chars(blank, pages)
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        printed = {p: [c for c in pdf.pages[p - 1].chars if c["text"].strip()] for p in pages}

    keyed = [f for f in fields if f.get("bbox") and f.get("page") in pages and f.get("raw")]
    for a in found:
        r = a["rect"]
        # Viewers draw a FreeText without an appearance stream from its text; PDFium does not
        unrendered = a["subtype"] == "FreeText" and not a["has_appearance"] and bool(a["text"])
        a["visible"] = a["print_only"] or unrendered or _effect(renders, a["page"], r) >= MIN_VISIBLE_SHARE
        a["printed_under"] = _words_text([c for c in printed[a["page"]] if _inside(c, r)])
        # Overlapping annotations share the flattened glyphs, so only one that draws text claims them
        flat = _words_text([c for c in drawn[a["page"]] if _inside(c, r)]) if a["draws_text"] else ""
        if "(cid:" in flat or not any(ch.isalnum() for ch in flat):
            flat = ""  # glyphs without a Unicode mapping; the annotation's own text says more
        text = a["text"] if a["subtype"] in ("FreeText", "Widget") else ""
        a["shown"], a["shown_by"] = (flat, "appearance") if flat else (
            (text, "annotation text") if text else ("", None))
        a["covers"] = []
        for f in keyed:
            inter = _inter(r, f["bbox"]) if f["page"] == a["page"] else None
            if not inter or _area(inter) < MIN_FIELD_SHARE * _area(f["bbox"]):
                continue
            # The annotation must change what the value looks like, not merely sit in its box
            if a["print_only"] or unrendered or _effect(renders, a["page"], inter) >= MIN_VISIBLE_SHARE:
                a["covers"].append(f["name"])
        if a["covers"] and not a["shown"] and a["subtype"] == "Stamp":
            try:
                a["shown"] = _ocr_shown(blank, a["page"], r)
                a["shown_by"] = "OCR of the annotation" if a["shown"] else None
            except Exception:  # noqa: BLE001  OCR is a courtesy here; the cover itself is the finding
                a["shown"] = ""

    signals: list[Signal] = []
    for f in keyed:
        anns = [a for a in found if f["name"] in a["covers"]]
        if anns:
            signals.append(_field_signal(f, anns, sigs))
    for a in found:
        if a["covers"] or not a["visible"] or len(a["printed_under"].replace(" ", "")) < 2:
            continue
        signals.append(_text_signal(a, sigs))
    return {"annotations": found, "signals": signals, "signatures": sigs}


def _label(name: str) -> str:
    return name.replace("_", " ")


def _union(boxes: list[list[float]]) -> list[float]:
    return [round(min(b[0] for b in boxes), 2), round(min(b[1] for b in boxes), 2),
            round(max(b[2] for b in boxes), 2), round(max(b[3] for b in boxes), 2)]


def _describe(a: dict[str, Any]) -> str:
    return f"a {a['kind']} annotation ({a['subtype']})"


def _when(anns: list[dict[str, Any]], sigs: list[dict[str, Any]]) -> str:
    revs = sorted({a["revision"] for a in anns})
    which = f"revision {revs[0]}" if len(revs) == 1 else "revisions " + ", ".join(str(r) for r in revs)
    subj = "The annotations were" if len(anns) > 1 else "The annotation was"
    if not sigs:
        return f"{subj} saved in {which}; the file carries no signature."
    last = max(sigs, key=lambda s: s["revision"])
    if not last["aligned"]:
        are = "The annotations are" if len(anns) > 1 else "The annotation is"
        return (f"{are} in a file rewritten as a whole after the signature '{last['field']}' was applied (its byte "
                "range no longer matches the file), so whether it came before or after signing cannot be read.")
    if all(a["revision"] > last["revision"] for a in anns):
        return f"{subj} added in {which}, after the signature '{last['field']}' (revision {last['revision']})."
    return f"{subj} saved in {which}; the signature '{last['field']}' covers revision {last['revision']}."


def _field_signal(f: dict[str, Any], anns: list[dict[str, Any]], sigs: list[dict[str, Any]]) -> Signal:
    label = _label(f["name"])
    texty = [a for a in anns if a["shown"]]
    silent = [a for a in anns if not a["shown"]]
    shown = " ".join(dict.fromkeys(a["shown"] for a in texty))
    page = f["page"]
    if texty:
        detail = (f"On page {page} the page shows '{shown}' in {_describe(texty[0])} drawn over the printed "
                  f"'{f['raw']}' ({label})")
        if texty[0]["shown_by"] == "OCR of the annotation":
            detail += "; the annotation is an image or drawing, read here by OCR"
        rest = silent
    else:
        detail = f"On page {page} {_describe(silent[0])} is drawn over the printed '{f['raw']}' ({label})"
        rest = silent[1:]
    if rest:
        detail += ", together with " + " and ".join(_describe(a) for a in rest) + " covering the printed value"
    detail += (f". {_when(anns, sigs)} Text extraction, the signed QR comparison and the issuer registry read "
               f"the printed '{f['raw']}'")
    detail += (f"; a person reading the file sees '{shown}'." if shown
               else "; a person reading the file sees the annotation over it.")
    return Signal(
        "FX-ANNOT-OVER-FIELD",
        f"{label.capitalize()} covered by an annotation",
        detail,
        "high",
        [{"kind": "region", "page": page, "bbox": _union([a["rect"] for a in anns]), "value": shown or None,
          "label": f"annotation over {label}".replace(".", " ")},
         {"kind": "region", "page": page, "bbox": f["bbox"], "value": f["raw"],
          "label": f"printed {label}".replace(".", " ")}],
        "Reviewers and issuers also annotate files, and an annotation saved before a signature may be the "
        "signer's own. An annotation is never part of the printed certificate: ask for the issuer's original.",
        evidence_class="structural",
    )


def _text_signal(a: dict[str, Any], sigs: list[dict[str, Any]]) -> Signal:
    under, shown = a["printed_under"], a["shown"]
    what = (f"the page shows '{shown}' in {_describe(a)} drawn over the printed '{under}'" if shown
            else f"{_describe(a)} is drawn over the printed '{under}'")
    after = bool(sigs) and (a["revision"] > max(s["revision"] for s in sigs) or not all(s["aligned"] for s in sigs))
    return Signal(
        "FX-ANNOT-OVER-TEXT",
        "Annotation drawn over printed text",
        f"On page {a['page']} {what}. {_when([a], sigs)}",
        "medium" if shown or after else "low",
        [{"kind": "region", "page": a["page"], "bbox": a["rect"], "value": shown or None,
          "label": "annotation over printed text"}],
        "Comments and signatures drawn on a page are often benign; this one sits over printed text, so compare "
        "the page with the issuer's original.",
        evidence_class="structural",
    )
