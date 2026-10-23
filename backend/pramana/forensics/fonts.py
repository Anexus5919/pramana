"""Font consistency of key values.

An issuer's template draws comparable values (numbers, dates, names) in one font and size. A value
redrawn after issue tends to land in whatever font the editing tool had at hand, so a value whose glyphs
use a font or size that no other value on the document uses is worth a closer look. Revision diffs,
overlapping glyphs and white boxes over the same spot make it stronger, but the check stands alone.
"""

import io
import re
from collections import Counter
from typing import Any

import pdfplumber

from .pdf_struct import Signal, _horizontal

MIN_ODD_CHARS = 3  # a lone symbol from a fallback font (e.g. a rupee sign) is not a redrawn value
MIN_PEERS = 2
SIZE_TOLERANCE = 0.6


def norm_font(name: str | None) -> str:
    """Drop the six-letter subset tag (ABCDEF+Helvetica) that embedding adds."""
    return re.sub(r"^[A-Z]{6}\+", "", name or "?")


def _inside(c: dict, box: list[float], pad: float = 0.8) -> bool:
    cx, cy = (c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2
    return box[0] - pad <= cx <= box[2] + pad and box[1] - pad <= cy <= box[3] + pad


def _box(chars: list[dict]) -> list[float]:
    return [round(min(c["x0"] for c in chars), 2), round(min(c["top"] for c in chars), 2),
            round(max(c["x1"] for c in chars), 2), round(max(c["bottom"] for c in chars), 2)]


def _text(chars: list[dict]) -> str:
    out, last = "", None
    for c in sorted(chars, key=lambda c: (round(c["top"]), c["x0"])):
        if last is not None and c["x0"] - last["x1"] > 0.25 * (c.get("size") or 10):
            out += " "
        out += c["text"]
        last = c
    return out


def _overlaps(a: list[float], b: list[float]) -> bool:
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def _label(name: str) -> str:
    return name.replace("_", " ")


def _fmt(font: str, size: float) -> str:
    return f"{font} {size:g} pt"


def font_mismatches(data: bytes, fields: list[Any], facts: dict[str, Any] | None = None) -> list[Signal]:
    """Signals for values drawn in a font or size used by no other key value on the document.

    `fields` are extracted values with name, raw, page, bbox and method; only text-layer values are
    compared, since OCR has no font information."""
    usable = [f for f in fields if f.bbox and f.page and f.raw and str(f.method or "").startswith("text-layer")]
    if len(usable) < MIN_PEERS + 1:
        return []
    pages = sorted({f.page for f in usable})
    chars_by_page: dict[int, list[dict]] = {}
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for p in pages:
            if p <= len(pdf.pages):
                chars_by_page[p] = [
                    {k: c[k] for k in ("text", "x0", "top", "x1", "bottom", "size", "fontname")}
                    for c in pdf.pages[p - 1].chars if c["text"].strip() and _horizontal(c)]

    values = []
    for f in usable:
        chars = [c for c in chars_by_page.get(f.page, []) if _inside(c, f.bbox)]
        if chars:
            values.append((f, chars))
    if len(values) < MIN_PEERS + 1:
        return []

    def fonts_of(chars):
        return Counter(norm_font(c["fontname"]) for c in chars)

    def sizes_of(chars):
        return Counter(round(c["size"] * 2) / 2 for c in chars)

    # Glyphs outside every value: labels, headings, body text. A font the template uses there is not odd,
    # which keeps a bold label that leaks into a value's box from being reported.
    in_values = {id(c) for _, chars in values for c in chars}
    rest_fonts: dict[int, Counter] = {}
    rest_sizes: dict[int, Counter] = {}
    for p, chars in chars_by_page.items():
        rest = [c for c in chars if id(c) not in in_values]
        rest_fonts[p], rest_sizes[p] = fonts_of(rest), sizes_of(rest)

    context = _context_boxes(facts or {})
    signals = []
    for f, chars in values:
        peers = [(g, gc) for g, gc in values if g is not f]
        peer_fonts = Counter(font for _, gc in peers for font in set(fonts_of(gc)))
        peer_sizes = [s for _, gc in peers for s in set(sizes_of(gc))]
        flagged = False
        for font, n in fonts_of(chars).items():
            if n < MIN_ODD_CHARS or peer_fonts.get(font) or rest_fonts[f.page].get(font, 0) >= MIN_ODD_CHARS:
                continue
            odd = [c for c in chars if norm_font(c["fontname"]) == font]
            signals.append(_signal(f, odd, peer_fonts.most_common(1)[0][0], peers, context, "font"))
            flagged = True
        for size, n in sizes_of(chars).items():
            # The font signal already names the size of the odd glyphs
            if flagged or n < MIN_ODD_CHARS or any(abs(size - s) <= SIZE_TOLERANCE for s in peer_sizes):
                continue
            if rest_sizes[f.page].get(size, 0) >= MIN_ODD_CHARS:
                continue
            odd = [c for c in chars if round(c["size"] * 2) / 2 == size]
            signals.append(_signal(f, odd, Counter(peer_sizes).most_common(1)[0][0], peers, context, "size"))
    return signals


def _context_boxes(facts: dict[str, Any]) -> list[tuple[int, list[float], str]]:
    out = []
    for d in facts.get("revision_diffs") or []:
        if d.get("bbox"):
            out.append((d["page"], d["bbox"], f"revision {d['to_revision']} changed the text"))
    for o in facts.get("overlapping_text") or []:
        out.append((o["page"], o["bbox"], "glyphs sit on top of other glyphs"))
    for c in facts.get("covered_text") or []:
        out.append((c["page"], c["bbox"], "a white box hides earlier text"))
    return out


def _dominant(chars: list[dict]) -> tuple[str, float]:
    font = Counter(norm_font(c["fontname"]) for c in chars).most_common(1)[0][0]
    size = Counter(round(c["size"] * 2) / 2 for c in chars).most_common(1)[0][0]
    return font, size


def _signal(f, odd: list[dict], usual, peers, context, kind: str) -> Signal:
    label = _label(f.name)
    box = _box(odd)
    font, size = _dominant(odd)

    def drawn_usual(gc: list[dict]) -> bool:
        if kind == "font":
            return usual in {norm_font(c["fontname"]) for c in gc}
        return any(abs(round(c["size"] * 2) / 2 - usual) <= SIZE_TOLERANCE for c in gc)

    # A peer value drawn the usual way, shown next to the odd one
    ref, ref_chars = next(((g, gc) for g, gc in peers if drawn_usual(gc)), peers[0])
    ref_font, ref_size = _dominant(ref_chars)
    also = sorted({why for p, b, why in context if p == f.page and _overlaps(b, box)})
    detail = (f"On page {f.page} the {label} region contains '{_text(odd)}' drawn in {_fmt(font, size)}. "
              f"None of the other {len(peers)} key values on this document uses that {kind}; they use "
              f"{_fmt(ref_font, ref_size)}, for example the {_label(ref.name)} '{ref.raw}'.")
    if also:
        detail += " Other traces at the same spot: " + "; ".join(also) + "."
    return Signal(
        "FX-FONT-MISMATCH",
        f"{label.capitalize()} drawn in a different {kind}",
        detail,
        "high" if also else "medium",
        # Labels carry no dots: the interface reads a dotted label as a fact path
        [{"kind": "region", "page": f.page, "bbox": box, "value": _text(odd),
          "label": (f"{label} drawn in {font}" if kind == "font" else f"{label} drawn at another size").replace(".", " ")},
         {"kind": "region", "page": ref.page, "bbox": _box(ref_chars), "value": ref.raw,
          "label": f"comparable value, {_label(ref.name)}, in {ref_font}".replace(".", " ")}],
        "Templates sometimes set one value in bold or another size on purpose, and a document retyped from "
        f"scratch uses one font throughout. A different {kind} says where to look closely; it does not show "
        "who changed the value or when.",
        evidence_class="structural",
    )
