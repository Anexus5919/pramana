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


def _extract_one(pages: list[PageText], f: dict[str, Any]) -> Extracted:
    name, vtype = f["name"], f.get("type", "text")
    for pat in f.get("patterns", []):
        rx = re.compile(pat, re.IGNORECASE)
        for page in pages:
            for line in page.lines:
                m = rx.search(line.text)
                if not m:
                    continue
                g = "v" if "v" in rx.groupindex else 0
                raw = m.group(g)
                val = normalise(raw, vtype)
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
