"""OCR with RapidOCR (Apache-2.0 code, Apache-2.0 PP-OCR ONNX weights), CPU via onnxruntime.

Returns word boxes with recogniser confidence. If the engine is unavailable the caller marks the page
unreadable and routes it to manual review; nothing is guessed.
"""

import logging
import threading

import numpy as np
from PIL import Image

log = logging.getLogger(__name__)
_engine = None
_lock = threading.Lock()


def _get_engine():
    global _engine
    if _engine is None:
        with _lock:
            if _engine is None:
                try:
                    from rapidocr import RapidOCR

                    logging.getLogger("RapidOCR").setLevel(logging.WARNING)
                    # The orientation classifier flips short words; documents arrive upright or are deskewed
                    _engine = RapidOCR(params={"Global.use_cls": False, "Global.log_level": "warning"})
                except Exception as e:  # noqa: BLE001
                    log.error("OCR engine unavailable: %s", e)
                    _engine = False
    return _engine or None


def warmup() -> bool:
    eng = _get_engine()
    if eng is None:
        return False
    eng(Image.new("RGB", (200, 60), "white"))
    return True


def _run(eng, arr):
    # RapidOCR keeps call switches between calls, so state them all
    return eng(arr, use_det=True, use_cls=False, use_rec=True, return_word_box=True, text_score=0.5)


def _boxes(res) -> list[tuple[str, float, float, float, float, float]]:
    out = []
    for text, conf, quad in _word_items(res.word_results):
        if text.strip():
            xs = [p[0] for p in quad]
            ys = [p[1] for p in quad]
            out.append((text, float(min(xs)) - 2, float(min(ys)), float(max(xs)) + 2, float(max(ys)), float(conf)))
    return out


def ocr_image(img: Image.Image) -> list[tuple[str, float, float, float, float, float]] | None:
    """[(text, x0, top, x1, bottom, confidence)] in image pixels, or None if OCR is unavailable."""
    eng = _get_engine()
    if eng is None:
        return None
    with _lock:  # onnxruntime sessions are shared; serialise to keep memory flat on a laptop
        res = _run(eng, np.array(img.convert("RGB")))
    return _boxes(res)


def ocr_page(img: Image.Image, devanagari_hint: str | None = None) -> tuple[list | None, dict]:
    """Like ocr_image, choosing the recogniser by script, plus a note on how the script was handled."""
    from . import devanagari

    eng = _get_engine()
    if eng is None:
        return None, {}
    arr = np.array(img.convert("RGB"))
    with _lock:
        # Keep the lines below the usual score threshold: they are where another script hides
        res = eng(arr, use_det=True, use_cls=False, use_rec=True, return_word_box=True, text_score=0.0)
        words, info = devanagari.read(arr, devanagari.lines_of(res), devanagari_hint)
    return [(t, b[0] - 2, b[1], b[2] + 2, b[3], c) for t, b, c in words], info


def _word_items(word_results):
    """RapidOCR nests (text, score, quad) per line, but a one-word line can come back unnested."""
    for line in word_results or ():
        if len(line) == 3 and isinstance(line[0], str):
            yield line
            continue
        for item in line:
            if isinstance(item, tuple | list) and len(item) == 3 and isinstance(item[0], str):
                yield item
