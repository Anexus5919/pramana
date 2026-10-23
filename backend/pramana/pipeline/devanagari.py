"""Devanagari text (Hindi, Marathi) on scanned pages and broken text layers.

The default PP-OCR recogniser reads Latin script and digits; on Devanagari it returns fragments or
nothing. Pages that carry Devanagari are also read with the PP-OCRv5 Devanagari recogniser (Apache-2.0
weights). Its character set covers digits and Latin letters too, but it confuses 'I' and 'l', so on each
text line words without Devanagari are taken from the default recogniser and Devanagari words from this
one. The model file is fetched on first use, checked against a pinned SHA-256 and cached; without it the
page keeps the default reading and says that its Hindi text was not read.
"""

import hashlib
import logging
import re
import threading
import unicodedata
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np

from ..config import get_settings

log = logging.getLogger(__name__)

MODEL = {
    "name": "devanagari_PP-OCRv5_rec_mobile.onnx",
    "url": "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/rec/"
           "devanagari_PP-OCRv5_rec_mobile.onnx",
    "sha256": "d6f0a906580e3fa6b324a318718f1f31f268b6ea8ef985f91c2012a37f52c91e",
    "licence": "Apache-2.0 (PaddleOCR PP-OCRv5 weights, ONNX export from the RapidOCR v3.10.0 model zoo)",
}
LETTER = re.compile(r"[ऄ-हऽॐक़-ॡॲ-ॿ]")
# Vowel signs, virama and nasal marks attach to a preceding letter; no word starts with one
SIGN = re.compile(r"[ऀ-ःऺ-ॏ॑-ॗॢॣ]")
PUA_SHARE = 0.03
TEXT_SCORE = 0.5  # RapidOCR's default line threshold
PROBE_CROPS = 6
PROBE_MIN_LETTERS = 6

_lock = threading.Lock()
_state: dict[str, Any] = {"engine": None, "tried": False, "error": None}


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_model(timeout: float = 60) -> Path:
    """Download the recogniser into models_dir and verify it; raises on any failure."""
    s = get_settings()
    dest = s.models_dir / MODEL["name"]
    if dest.exists() and _sha256(dest) == MODEL["sha256"]:
        return dest
    s.models_dir.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".part")
    req = urllib.request.Request(MODEL["url"], headers={"User-Agent": "Pramana-prototype/0.3"})
    with urllib.request.urlopen(req, timeout=timeout) as r, tmp.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    got = _sha256(tmp)
    if got != MODEL["sha256"]:
        tmp.unlink(missing_ok=True)
        raise ValueError(f"hash mismatch for {MODEL['name']}: {got}")
    tmp.replace(dest)
    return dest


def model_path() -> Path | None:
    s = get_settings()
    p = s.models_dir / MODEL["name"]
    if p.exists():
        return p
    if not s.fetch_models:
        _state["error"] = f"{MODEL['name']} is not in {s.models_dir} and fetching is off"
        return None
    try:
        return fetch_model()
    except Exception as e:  # noqa: BLE001  offline or blocked: fall back, never fail the document
        _state["error"] = f"could not fetch {MODEL['name']}: {e}"
        log.warning("Devanagari recogniser unavailable: %s", _state["error"])
        return None


def engine():
    """The Devanagari RapidOCR engine, or None when its model cannot be loaded."""
    if not _state["tried"]:
        with _lock:
            if not _state["tried"]:
                _state["tried"] = True
                p = model_path()
                if p is not None:
                    try:
                        from rapidocr import RapidOCR
                        from rapidocr.utils.typings import LangRec, ModelType, OCRVersion

                        _state["engine"] = RapidOCR(params={
                            "Global.use_cls": False, "Global.log_level": "warning",
                            "Rec.lang_type": LangRec.DEVANAGARI, "Rec.ocr_version": OCRVersion.PPOCRV5,
                            "Rec.model_type": ModelType.MOBILE, "Rec.model_path": str(p)})
                    except Exception as e:  # noqa: BLE001
                        _state["error"] = f"Devanagari recogniser failed to load: {e}"
                        log.error(_state["error"])
    return _state["engine"]


def unavailable_reason() -> str | None:
    return _state["error"]


def has_devanagari(text: str) -> bool:
    return bool(LETTER.search(text))


def text_layer_hint(words: list[str]) -> str | None:
    """Why this page's text layer should be read from the image with the Devanagari recogniser, or None."""
    text = "".join(words)
    if not text:
        return None
    pua = sum(1 for ch in text if 0xE000 <= ord(ch) <= 0xF8FF or ch == "�")
    if pua / len(text) >= PUA_SHARE:
        return (f"{pua} of {len(text)} characters in the text layer are Private Use Area code points, as legacy "
                "Hindi fonts produce")
    letters = len(LETTER.findall(text))
    starts = sum(1 for w in words if SIGN.match(w))
    if letters >= 5 and starts >= 2:
        return (f"the Devanagari text layer has {starts} words that start with a vowel sign, so it stores glyphs "
                "in visual order and does not read correctly")
    return None


# ---- OCR passes. RapidOCR keeps call switches between calls, so every call states all of them.


def _call(eng, arr, *, det: bool = True, rec: bool = True, words: bool = True, score: float = TEXT_SCORE):
    return eng(arr, use_det=det, use_cls=False, use_rec=rec, return_word_box=words, text_score=score)


def _quad_box(q) -> list[float]:
    xs = [p[0] for p in q]
    ys = [p[1] for p in q]
    return [float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys))]


def lines_of(res) -> list[dict[str, Any]]:
    """Recognised lines with box, text, score and words (text, box, confidence)."""
    out = []
    boxes = [] if getattr(res, "boxes", None) is None else [_quad_box(b) for b in res.boxes]
    word_lines = [list(_words(wl)) for wl in (getattr(res, "word_results", None) or ())]
    aligned = len(word_lines) == len(boxes)
    for i, box in enumerate(boxes):
        if aligned:
            ws = word_lines[i]
        else:  # RapidOCR drops lines without word boxes from word_results only; pair by position instead
            ws = next((wl for wl in word_lines if wl and _iou(_union(w[1] for w in wl), box) > 0.5), [])
        out.append({"box": box, "text": res.txts[i], "score": float(res.scores[i]), "words": ws})
    return out


def _words(line):
    """(text, box, confidence) per word; RapidOCR can return a one-word line unnested."""
    items = [line] if len(line) == 3 and isinstance(line[0], str) else line
    for item in items:
        if isinstance(item, tuple | list) and len(item) == 3 and isinstance(item[0], str) and item[0].strip():
            yield (unicodedata.normalize("NFC", item[0]), _quad_box(item[2]), float(item[1]))


def _union(boxes) -> list[float]:
    bs = list(boxes)
    return [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)]


def _iou(a: list[float], b: list[float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def merge(dev_lines: list[dict], lat_lines: list[dict]) -> list[tuple[str, list[float], float]]:
    """Per text line: Devanagari words from the Devanagari pass, other words from the default pass."""
    out = []
    used = set()
    for dl in dev_lines:
        j = max(range(len(lat_lines)), key=lambda k: _iou(dl["box"], lat_lines[k]["box"]), default=None)
        ll = lat_lines[j] if j is not None and _iou(dl["box"], lat_lines[j]["box"]) > 0.5 else None
        if ll is not None:
            used.add(j)
        if not has_devanagari(dl["text"]):
            out.extend((ll or dl)["words"])
            continue
        for w in dl["words"]:
            if has_devanagari(w[0]) or ll is None:
                out.append(w)
                continue
            out.extend(_latin(w, ll["words"]))
    out.extend(w for k, ll in enumerate(lat_lines) if k not in used for w in ll["words"])
    return out


def _latin(w: tuple, lat_words: list[tuple]) -> list[tuple]:
    """A word without Devanagari on a Devanagari line, as read by whichever recogniser is more credible.

    The default recogniser's reading of the same span wins when it is confident (it keeps I and l apart);
    when both read the same text, the higher confidence is kept."""
    alt = [lw for lw in lat_words if w[1][0] - 2 <= (lw[1][0] + lw[1][2]) / 2 <= w[1][2] + 2]
    if not alt or any(has_devanagari(a[0]) for a in alt):
        return [w]
    conf = sum(a[2] for a in alt) / len(alt)
    if " ".join(a[0] for a in alt) == w[0]:
        return [(w[0], w[1], max(w[2], conf))]
    return alt if conf >= 0.8 else [w]


def probe(arr: np.ndarray, lines: list[dict]) -> int:
    """Devanagari letters found by reading a few doubtful lines of a page with the Devanagari recogniser.

    Doubtful lines are those the default pass scored below its threshold or read as short fragments."""
    dev = engine()
    if dev is None:
        return 0
    doubtful = [ln["box"] for ln in lines if ln["score"] < TEXT_SCORE or
                (ln["words"] and sum(len(w[0]) for w in ln["words"]) / len(ln["words"]) <= 2.5)]
    doubtful.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    found = 0
    for b in doubtful[:PROBE_CROPS]:
        x0, y0, x1, y1 = (int(v) for v in b)
        crop = arr[max(0, y0 - 2):y1 + 2, max(0, x0 - 2):x1 + 2]
        if crop.size == 0:
            continue
        r = _call(dev, crop, det=False, words=False, score=0.0)
        for t, s in zip(r.txts or (), r.scores or (), strict=False):
            if s >= 0.7:
                found += len(LETTER.findall(t))
    return found


def read(arr: np.ndarray, all_lines: list[dict], hint: str | None) -> tuple[list, dict[str, Any]]:
    """Words (text, box, confidence) for a page and a note on how its script was handled.

    `all_lines` is the default recogniser's reading of the image before its score threshold is applied."""
    info: dict[str, Any] = {"script": "latin", "recogniser": "default"}
    default_lines = [ln for ln in all_lines if ln["score"] >= TEXT_SCORE]
    default_words = [w for ln in default_lines for w in ln["words"]]
    reason = hint
    if reason is None:
        letters = probe(arr, all_lines)
        if letters < PROBE_MIN_LETTERS:
            return default_words, info
        reason = f"a first pass found {letters} Devanagari letters in lines the default recogniser could not read"
    info.update({"script": "devanagari", "reason": reason})
    dev = engine()
    if dev is None:
        info.update({"read": False, "note": "Devanagari text on this page was not read: the Devanagari recogniser "
                     f"is not available ({unavailable_reason()}). Only Latin text and digits were read."})
        return default_words, info
    dev_lines = lines_of(_call(dev, arr))
    if not any(has_devanagari(ln["text"]) for ln in dev_lines):
        info.update({"script": "latin", "read": True, "note": "The Devanagari recogniser found no Devanagari text."})
        return default_words, info
    info.update({"read": True, "recogniser": "devanagari+default",
                 "model": MODEL["name"],
                 "lines_devanagari": sum(1 for ln in dev_lines if has_devanagari(ln["text"]))})
    return merge(dev_lines, default_lines), info
