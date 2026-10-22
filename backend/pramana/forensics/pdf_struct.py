"""Deterministic PDF structure forensics.

Each signal is an observable fact about the file (revision boundaries, what changed between them,
overlapping glyphs, metadata). None of them proves forgery on its own: legitimate workflows also
append revisions (signing, form filling) and re-save files. They tell a reviewer where to look.
"""

import io
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pdfplumber
import pikepdf

from ..pipeline.text import Word, bbox_of, group_lines

EOF_RE = re.compile(rb"%%EOF[ \t]*(\r\n|\r|\n)?")
# Producer/Creator strings of general-purpose editors. Their presence is context, not an accusation.
EDITOR_HINTS = [
    "ilovepdf", "smallpdf", "sejda", "pdf-xchange", "foxit phantompdf", "foxit pdf editor", "nitro",
    "pdfescape", "pdffiller", "acrobat pro", "adobe acrobat", "microsoft: print to pdf", "canva", "photoshop",
    "wondershare", "pdfelement", "libreoffice", "pikepdf", "pypdf",
]


@dataclass
class Signal:
    code: str
    title: str
    detail: str
    severity: str  # info | low | medium | high
    evidence: list[dict[str, Any]] = field(default_factory=list)
    limitation: str | None = None


def revision_offsets(data: bytes) -> list[int]:
    """Byte offsets where each revision ends (just after its %%EOF marker)."""
    ends = [m.end() for m in EOF_RE.finditer(data)]
    # Trailing junk after the last EOF is not a revision; neither is an EOF inside a linearised header
    if len(ends) >= 2 and b"/Linearized" in data[: ends[0]]:
        ends = ends[1:]
    return ends


def _chars(data: bytes) -> list[list[dict]]:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return [[{k: c[k] for k in ("text", "x0", "top", "x1", "bottom", "size")} for c in page.chars
                 if c["text"].strip()] for page in pdf.pages]


def _ckey(c: dict) -> tuple:
    return (c["text"], round(c["x0"], 1), round(c["top"], 1))


def chars_to_words(chars: list[dict]) -> list[Word]:
    """Rebuild words from loose characters (a gap wider than ~20% of the font size splits words)."""
    words: list[Word] = []
    for c in sorted(chars, key=lambda c: (round(c["top"]), c["x0"])):
        last = words[-1] if words else None
        gap = 0.2 * (c.get("size") or 10)
        if last and abs(c["top"] - last.top) < 2 and -1 <= c["x0"] - last.x1 < gap:
            last.text += c["text"]
            last.x1 = c["x1"]
            last.bottom = max(last.bottom, c["bottom"])
        else:
            words.append(Word(c["text"], c["x0"], c["top"], c["x1"], c["bottom"]))
    return words


def _intersects(c: dict, box: list[float]) -> bool:
    cx, cy = (c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2
    return box[0] <= cx <= box[2] and box[1] <= cy <= box[3]


def _word_chars(w: Word, chars: list[dict]) -> list[dict]:
    return [c for c in chars if c["x0"] >= w.x0 - 0.01 and c["x1"] <= w.x1 + 0.01 and abs(c["top"] - w.top) < 2]


def _take_extra(chars: list[dict], extra: Counter) -> list[dict]:
    """The last `extra[key]` glyphs with each key, in drawing order (later draws sit on top)."""
    left = Counter(extra)
    out = []
    for c in reversed(chars):
        k = _ckey(c)
        if left[k] > 0:
            out.append(c)
            left[k] -= 1
    return list(reversed(out))


def diff_revisions(data: bytes) -> list[dict[str, Any]]:
    """Character-level difference between consecutive revisions, with page and box of each change."""
    ends = revision_offsets(data)
    if len(ends) < 2:
        return []
    out = []
    prev: list[list[dict]] | None = None
    for i, end in enumerate(ends):
        try:
            cur = _chars(data[:end])
        except Exception:  # noqa: BLE001  a truncated revision may not parse on its own
            cur = None
        if prev is not None and cur is not None:
            for p in range(max(len(prev), len(cur))):
                b = prev[p] if p < len(prev) else []
                a = cur[p] if p < len(cur) else []
                # Multiset difference: a glyph redrawn at the exact spot of an identical glyph is still an addition
                bk, ak = Counter(_ckey(c) for c in b), Counter(_ckey(c) for c in a)
                added = _take_extra(a, ak - bk)
                removed = _take_extra(b, bk - ak)
                if not added and not removed:
                    continue
                aw, rw = chars_to_words(added), chars_to_words(removed)
                box = bbox_of(aw or rw)
                # Earlier text still present underneath the new text: the cover-and-overwrite pattern
                kept = chars_to_words([c for c in b if _ckey(c) in ak])
                under = [w for w in kept if box and any(_intersects(c, box) for c in _word_chars(w, b))]
                out.append({
                    "from_revision": i,
                    "to_revision": i + 1,
                    "page": p + 1,
                    "added_text": " ".join(ln.text for ln in group_lines(aw)),
                    "removed_text": " ".join(ln.text for ln in group_lines(rw)),
                    "text_underneath": " ".join(ln.text for ln in group_lines(under)),
                    "bbox": box,
                })
        prev = cur if cur is not None else prev
    return out


def overlapping_text(data: bytes) -> list[dict[str, Any]]:
    """Glyphs drawn on top of different glyphs: the signature of cover-and-overwrite edits."""
    hits = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            # Rotated glyphs (circular seals, stamps) crowd each other legitimately; compare upright text only
            chars = [c for c in page.chars if c["text"].strip() and _horizontal(c)]
            chars.sort(key=lambda c: (round(c["top"]), c["x0"]))
            clusters: list[list[dict]] = []
            for i, a in enumerate(chars):
                for b in chars[i + 1:]:
                    if b["top"] > a["bottom"]:
                        break
                    ox = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
                    oy = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
                    wa = a["x1"] - a["x0"]
                    if ox > 0.5 * wa and oy > 0.5 * (a["bottom"] - a["top"]) and a["text"] != b["text"]:
                        clusters.append([a, b])
            if clusters:
                xs0 = min(min(a["x0"], b["x0"]) for a, b in clusters)
                ys0 = min(min(a["top"], b["top"]) for a, b in clusters)
                xs1 = max(max(a["x1"], b["x1"]) for a, b in clusters)
                ys1 = max(max(a["bottom"], b["bottom"]) for a, b in clusters)
                hits.append({"page": pno, "bbox": [round(xs0, 2), round(ys0, 2), round(xs1, 2), round(ys1, 2)],
                             "overlapping_glyph_pairs": len(clusters)})
    return hits


def _horizontal(c: dict) -> bool:
    m = c.get("matrix") or (1, 0, 0, 1, 0, 0)
    return abs(m[1]) < 1e-3 and abs(m[2]) < 1e-3


def covered_text(data: bytes) -> list[dict[str, Any]]:
    """Text that sits under an opaque white rectangle drawn later in the page."""
    hits = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            whites = [r for r in page.rects if r.get("fill") and _is_white(r.get("non_stroking_color"))
                      and (r["x1"] - r["x0"]) < page.width * 0.9]
            if not whites:
                continue
            for r in whites:
                inside = [c for c in page.chars if c["x0"] >= r["x0"] - 1 and c["x1"] <= r["x1"] + 1
                          and c["top"] >= r["top"] - 1 and c["bottom"] <= r["bottom"] + 1]
                if inside:
                    hits.append({"page": pno, "bbox": [round(r["x0"], 2), round(r["top"], 2),
                                                       round(r["x1"], 2), round(r["bottom"], 2)],
                                 "text_under_or_over": "".join(c["text"] for c in inside)})
    return hits


def _is_white(color) -> bool:
    if color is None:
        return False
    vals = color if isinstance(color, list | tuple) else [color]
    try:
        nums = [float(v) for v in vals]
    except (TypeError, ValueError):
        return False
    if len(nums) == 4:  # CMYK white is 0,0,0,0
        return all(v <= 0.02 for v in nums)
    return all(v >= 0.98 for v in nums)


def parse_pdf_date(s: str | None) -> datetime | None:
    if not s:
        return None
    m = re.match(r"D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?", str(s))
    if not m:
        return None
    parts = [int(p) if p else d for p, d in zip(m.groups(), (0, 1, 1, 0, 0, 0), strict=True)]
    try:
        return datetime(*parts, tzinfo=UTC)
    except ValueError:
        return None


def metadata(data: bytes) -> dict[str, Any]:
    with pikepdf.open(io.BytesIO(data)) as pdf:
        info = {str(k).lstrip("/"): str(v) for k, v in pdf.docinfo.items()} if pdf.docinfo else {}
        xmp: dict[str, str] = {}
        try:
            with pdf.open_metadata() as m:
                for k in ("xmp:CreatorTool", "pdf:Producer", "xmp:CreateDate", "xmp:ModifyDate",
                          "xmpMM:DocumentID", "xmpMM:InstanceID"):
                    if k in m:
                        xmp[k] = str(m[k])
        except Exception:  # noqa: BLE001  broken XMP is itself reported via mismatch below
            pass
        fonts = set()
        for page in pdf.pages:
            res = page.get("/Resources") or {}
            for _, f in (res.get("/Font") or {}).items():
                fonts.add(str(f.get("/BaseFont", "?")))
    return {"info": info, "xmp": xmp, "fonts": sorted(fonts)}


def analyse(data: bytes, doc_issue_date: datetime | None = None) -> tuple[list[Signal], dict[str, Any]]:
    signals: list[Signal] = []
    ends = revision_offsets(data)
    meta = metadata(data)
    facts: dict[str, Any] = {"revisions": len(ends), "metadata": meta}

    diffs = diff_revisions(data) if len(ends) > 1 else []
    facts["revision_diffs"] = diffs
    if len(ends) > 1:
        if diffs:
            for d in diffs:
                signals.append(Signal(
                    "FX-PDF-REVISION-TEXT-CHANGE",
                    "Visible text changed in a later revision",
                    f"Revision {d['to_revision']} changed text on page {d['page']}: added '{d['added_text']}'"
                    + (f" over existing text '{d['text_underneath']}'" if d["text_underneath"] else "")
                    + (f", removed '{d['removed_text']}'" if d["removed_text"] else "") + ".",
                    "high",
                    [{"kind": "region", "page": d["page"], "bbox": d["bbox"], "label": "changed in later revision"},
                     {"kind": "revision_diff", **d}],
                    "Issuers sometimes amend documents legitimately; confirm the amendment with the issuer.",
                ))
        else:
            signals.append(Signal(
                "FX-PDF-INCREMENTAL-UPDATE",
                "File has incremental updates without visible text change",
                f"{len(ends)} revisions found. No visible text differs between them, which is typical of signing, "
                "form filling or metadata updates.",
                "info",
            ))

    overlaps = overlapping_text(data)
    facts["overlapping_text"] = overlaps
    for o in overlaps:
        signals.append(Signal(
            "FX-PDF-OVERLAID-TEXT",
            "Different characters drawn on top of each other",
            f"{o['overlapping_glyph_pairs']} glyph pairs overlap on page {o['page']}. Overwriting text in place "
            "leaves both the old and new characters in the text layer.",
            "high",
            [{"kind": "region", "page": o["page"], "bbox": o["bbox"], "label": "overlapping glyphs"}],
            "Some generators draw bold or shadow text by overprinting; check the region visually.",
        ))

    covered = covered_text(data)
    facts["covered_text"] = covered
    for c in covered:
        signals.append(Signal(
            "FX-PDF-WHITEOUT",
            "Opaque white box overlaps text",
            f"A white filled rectangle on page {c['page']} overlaps characters '{c['text_under_or_over']}'.",
            "medium",
            [{"kind": "region", "page": c["page"], "bbox": c["bbox"], "label": "white box over text"}],
            "Templates also use white boxes as backgrounds; meaningful mainly together with other signals.",
        ))

    producer = (meta["info"].get("Producer", "") + " " + meta["info"].get("Creator", "")).lower()
    editors = [h for h in EDITOR_HINTS if h in producer]
    created = parse_pdf_date(meta["info"].get("CreationDate"))
    modified = parse_pdf_date(meta["info"].get("ModDate"))
    facts["created"] = created.isoformat() if created else None
    facts["modified"] = modified.isoformat() if modified else None
    if editors:
        signals.append(Signal(
            "FX-PDF-EDITOR-PRODUCER",
            "Produced or re-saved by a general-purpose PDF editor",
            f"Producer/Creator metadata: '{meta['info'].get('Producer', '')}' / '{meta['info'].get('Creator', '')}'.",
            "low",
            limitation="Many institutions legitimately scan or merge files with these tools. Metadata is easy to "
                       "strip or forge, so its absence proves nothing either.",
        ))
    if created and modified and (modified - created).days > 2:
        signals.append(Signal(
            "FX-PDF-MODIFIED-AFTER-CREATION",
            "Modified well after creation",
            f"CreationDate {created.date()} but ModDate {modified.date()} ({(modified - created).days} days later).",
            "medium" if doc_issue_date and modified.date() > doc_issue_date.date() else "low",
            limitation="Re-saving a file updates ModDate without changing content.",
        ))
    if created and doc_issue_date and created.date() < doc_issue_date.date():
        signals.append(Signal(
            "FX-PDF-CREATED-BEFORE-ISSUE",
            "File created before the date printed on it",
            f"File CreationDate {created.date()} precedes the stated issue date {doc_issue_date.date()}.",
            "medium",
            limitation="Templates prepared in advance can explain this; check against issuer records.",
        ))
    return signals, facts
