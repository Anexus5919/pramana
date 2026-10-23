"""Document classification and field extraction driven by the ruleset's document_types section.

Deterministic first: keyword scoring for type, anchored patterns for fields, each value tied to the
words it came from. Anything not found stays missing; nothing is guessed.
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from dateutil import parser as dparser

from .text import PageText, bbox_of

MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"


@dataclass
class Extracted:
    name: str
    raw: str | None
    value: Any
    value_type: str
    page: int | None
    bbox: list[float] | None
    method: str
    confidence: float | None
    status: str


def classify(pages: list[PageText], doc_types: dict[str, dict[str, Any]]) -> dict[str, Any]:
    text = " ".join(p.text for p in pages[:3]).lower()
    scores = []
    for code, spec in doc_types.items():
        c = spec.get("classify") or {}
        hits = [k for k in c.get("keywords", []) if k.lower() in text]
        neg = [k for k in c.get("exclude", []) if k.lower() in text]
        score = len(hits) - 2 * len(neg)
        if score >= c.get("min_score", 1):
            scores.append({"type": code, "score": score, "matched": hits, "excluded_by": neg})
    scores.sort(key=lambda s: -s["score"])
    best = scores[0] if scores else None
    ambiguous = len(scores) > 1 and scores[0]["score"] == scores[1]["score"]
    return {
        "type": None if (best is None or ambiguous) else best["type"],
        "candidates": scores[:4],
        "ambiguous": ambiguous,
        "method": "keyword-rules",
    }


def parse_date(s: str) -> date | None:
    s = s.strip().strip(".,;")
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return date.fromisoformat(s)
    if re.fullmatch(r"\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}", s) or re.search(MONTHS, s.lower()):
        try:
            return dparser.parse(s, dayfirst=True, fuzzy=False).date()
        except (ValueError, OverflowError):
            return None
    return None


def parse_number(s: str) -> float | None:
    t = re.sub(r"(?i)(rs\.?|inr|₹|/-|sq\.?\s*m|acres?|sqm)", "", s).replace(",", "").strip()
    m = re.search(r"-?\d+(?:\.\d+)?", t)
    return float(m.group()) if m else None


def normalise(raw: str, vtype: str) -> Any:
    if vtype == "date":
        return parse_date(raw)
    if vtype in ("number", "amount", "integer"):
        n = parse_number(raw)
        if n is None:
            return None
        return int(n) if vtype == "integer" or n.is_integer() else n
    return re.sub(r"\s+", " ", raw).strip(" :-,.")


def extract_fields(pages: list[PageText], spec: dict[str, Any]) -> list[Extracted]:
    out = []
    for f in spec.get("fields", []):
        out.append(_extract_one(pages, f))
    return out


# OCR merges and splits words ("FinancialYear: 2024-25") and confuses look-alike characters. On pages read by OCR,
# a space in a pattern also matches no space, and year ranges such as 2O24-25 are read with the usual
# confusions fixed. Text layers are matched exactly as written.
_OCR_DIGITS = str.maketrans({"O": "0", "o": "0", "D": "0", "Q": "0", "I": "1", "l": "1", "|": "1", "S": "5",
                             "Z": "2", "B": "8", "\u2013": "-", "\u2014": "-", "~": "-"})
_YEAR_RANGE = re.compile(r"(?<![\w-])[0-9ODQIl|SZB]{4}[-\u2013\u2014~][0-9ODQIl|SZB]{2}(?![\w-])")


def ocr_tolerant(pattern: str) -> str:
    """The pattern with each literal space outside a character class made optional."""
    out, in_class, escaped = [], False, False
    for ch in pattern:
        if escaped:
            out.append(ch)
            escaped = False
        elif ch == "\\":
            out.append(ch)
            escaped = True
        elif ch == "[":
            in_class = True
            out.append(ch)
        elif ch == "]":
            in_class = False
            out.append(ch)
        else:
            out.append(r"\s*" if ch == " " and not in_class else ch)
    return "".join(out)


def ocr_fixed(text: str) -> str:
    """Year ranges with look-alike characters repaired, at the same length so offsets still point at the page."""
    def fix(m: re.Match) -> str:
        s = m.group(0)
        return s.translate(_OCR_DIGITS) if sum(ch.isdigit() for ch in s) >= 4 else s
    return _YEAR_RANGE.sub(fix, text)


def _extract_one(pages: list[PageText], f: dict[str, Any]) -> Extracted:
    name, vtype = f["name"], f.get("type", "text")
    for pat in f.get("patterns", []):
        rx = re.compile(pat, re.IGNORECASE)
        rx_ocr = re.compile(ocr_tolerant(pat), re.IGNORECASE)
        for page in pages:
            ocr = page.source == "ocr"
            for line in page.lines:
                text = ocr_fixed(line.text) if ocr else line.text
                m = (rx_ocr if ocr else rx).search(text)
                if not m:
                    continue
                g = "v" if "v" in rx.groupindex else 0
                raw = line.text[m.start(g):m.end(g)]
                val = normalise(text[m.start(g):m.end(g)], vtype)
                words = line.span_words(m.start(g), m.end(g))
                confs = [w.conf for w in words if w.conf is not None]
                conf = round(sum(confs) / len(confs), 3) if confs else None
                method = "ocr+pattern" if page.source == "ocr" else "text-layer+pattern"
                if val is None:
                    return Extracted(name, raw, None, vtype, page.page_no, bbox_of(words), method, conf, "unparseable")
                status = "uncertain" if conf is not None and conf < 0.8 else "extracted"
                return Extracted(name, raw, val, vtype, page.page_no, bbox_of(words), method, conf, status)
    return Extracted(name, None, None, vtype, None, None, "pattern", None, "missing")


def extract_table(pages: list[PageText], spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Row extraction for list documents (e.g. faculty lists) using a row pattern per line."""
    rows = []
    rx = re.compile(spec["row_pattern"], re.IGNORECASE)
    for page in pages:
        for line in page.lines:
            m = rx.search(line.text)
            if m:
                row = {k: (v.strip() if v else v) for k, v in m.groupdict().items()}
                row["_page"] = page.page_no
                row["_bbox"] = bbox_of(line.words)
                rows.append(row)
    return rows
