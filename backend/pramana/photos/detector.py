"""Object counts in facility photos with YOLOX-M (Apache-2.0) on CPU through onnxruntime.

The detector knows the 80 COCO classes. It has no "desk" or "monitor" class, so screens are counted from
"tv" and "laptop" and tables from "dining table". Cubicle partitions are often read as chairs, people
hide furniture, and a photo shows only part of a room. Counts are indicators for an officer, never
measurements, and the room type is a rough reading of the object mix.
"""

import io
import logging
import threading
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps

from ..config import get_settings
from .assets import DETECTOR, sha256_file

log = logging.getLogger(__name__)

COCO = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
        "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
        "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
        "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard",
        "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
        "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch",
        "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard",
        "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors",
        "teddy bear", "hair drier", "toothbrush"]
# COCO label -> counted group; everything else is ignored
GROUPS = {"tv": "screen", "laptop": "screen", "keyboard": "keyboard", "chair": "seat", "bench": "seat",
          "couch": "seat", "dining table": "table", "book": "book", "person": "person"}
GROUP_LABEL = {"screen": "screens (tv or laptop)", "keyboard": "keyboards", "seat": "chairs or benches",
               "table": "tables or desks", "book": "books", "person": "people"}
SIZE = 640
SCORE_MIN = 0.3
NMS_IOU = 0.45
MAX_SIDE = 4096
ROOM_LABEL = {"computer_lab": "Computer lab", "classroom": "Classroom", "library": "Library", "unclear": "Unclear"}
_lock = threading.Lock()


def model_path() -> Path:
    return get_settings().models_dir / DETECTOR.name


@lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort

    p = model_path()
    if not p.exists():
        raise FileNotFoundError(f"detector weights not installed ({p.name}); run scripts/fetch_photo_assets.py")
    if sha256_file(p) != DETECTOR.sha256:
        raise ValueError(f"{p.name} does not match its pinned SHA-256")
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    return ort.InferenceSession(str(p), opts, providers=["CPUExecutionProvider"])


def available() -> bool:
    return model_path().exists()


def _nms(boxes: np.ndarray, scores: np.ndarray, iou: float) -> list[int]:
    order = scores.argsort()[::-1]
    keep: list[int] = []
    area = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    while order.size:
        i = int(order[0])
        keep.append(i)
        xx0 = np.maximum(boxes[i, 0], boxes[order[1:], 0])
        yy0 = np.maximum(boxes[i, 1], boxes[order[1:], 1])
        xx1 = np.minimum(boxes[i, 2], boxes[order[1:], 2])
        yy1 = np.minimum(boxes[i, 3], boxes[order[1:], 3])
        inter = np.clip(xx1 - xx0, 0, None) * np.clip(yy1 - yy0, 0, None)
        ov = inter / (area[i] + area[order[1:]] - inter + 1e-9)
        order = order[1:][ov <= iou]
    return keep


def _infer(rgb: np.ndarray) -> list[tuple[str, float, np.ndarray]]:
    """Letterbox to 640, run YOLOX, decode the grid outputs, per-class NMS (as the official ONNX demo)."""
    h, w = rgb.shape[:2]
    r = min(SIZE / h, SIZE / w)
    nh, nw = int(h * r), int(w * r)
    # Same preprocessing as the official demo: cv2 linear resize, BGR, 0-255, grey padding, no normalisation
    resized = cv2.resize(rgb[:, :, ::-1], (nw, nh), interpolation=cv2.INTER_LINEAR)
    pad = np.full((SIZE, SIZE, 3), 114, dtype=np.uint8)
    pad[:nh, :nw] = resized
    x = pad.transpose(2, 0, 1)[None].astype(np.float32)
    sess = _session()
    with _lock:
        out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    grids, strides = [], []
    for st in (8, 16, 32):
        n = SIZE // st
        xv, yv = np.meshgrid(np.arange(n), np.arange(n))
        grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
        strides.append(np.full((n * n, 1), st))
    g, s = np.concatenate(grids), np.concatenate(strides)
    xy = (out[:, :2] + g) * s
    wh = np.exp(out[:, 2:4]) * s
    boxes = np.concatenate([xy - wh / 2, xy + wh / 2], axis=1) / r
    scores = out[:, 4:5] * out[:, 5:]
    cls, conf = scores.argmax(1), scores.max(1)
    keep = conf >= SCORE_MIN
    boxes, cls, conf = boxes[keep], cls[keep], conf[keep]
    res = []
    for c in np.unique(cls):
        if COCO[c] not in GROUPS:
            continue
        m = np.where(cls == c)[0]
        for i in _nms(boxes[m], conf[m], NMS_IOU):
            res.append((COCO[c], float(conf[m][i]), boxes[m][i]))
    return res


def _merge_screens(dets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One monitor is sometimes read as both 'tv' and 'laptop'; keep the stronger box."""
    scr = [d for d in dets if d["group"] == "screen"]
    if len(scr) < 2:
        return dets
    b = np.array([d["box"] for d in scr])
    keep = {id(scr[i]) for i in _nms(b, np.array([d["score"] for d in scr]), 0.5)}
    return [d for d in dets if d["group"] != "screen" or id(d) in keep]


def room_reading(counts: dict[str, int]) -> tuple[str, str]:
    ws, seats, tables, books = counts.get("workstation", 0), counts.get("seat", 0), counts.get("table", 0), \
        counts.get("book", 0)
    if ws >= 3:
        return "computer_lab", f"{ws} visible workstations"
    if books >= 12:
        return "library", f"{books} books and {ws} workstations visible"
    if seats + tables >= 6 and ws <= 1:
        return "classroom", f"{seats} chairs or benches and {tables} tables or desks, with no workstations"
    return "unclear", "too few distinctive objects to tell the room type"


def analyse(data: bytes) -> dict[str, Any]:
    """Detections (boxes normalised to the upright image), counts per group and a room-type reading.
    On any failure the result says 'not_analysed' with the reason; nothing is guessed."""
    model = {"name": "YOLOX-M", "classes": "COCO 80", "licence": DETECTOR.licence, "runtime": "onnxruntime CPU",
             "score_min": SCORE_MIN}
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            if max(im.size) > MAX_SIDE:
                im.thumbnail((MAX_SIDE, MAX_SIDE))
            rgb = np.asarray(im)
        _session()  # load once outside the timed inference
        t0 = time.perf_counter()
        raw = _infer(rgb)
        ms = round((time.perf_counter() - t0) * 1000)
    except Exception as e:  # noqa: BLE001  a missing model or unreadable image is reported, not guessed
        log.warning("photo detector did not run: %s", e)
        return {"status": "not_analysed", "reason": str(e)[:200], "model": model}
    h, w = rgb.shape[:2]
    dets = [{"label": lbl, "group": GROUPS[lbl], "score": round(sc, 3),
             "box": [round(float(np.clip(b[0] / w, 0, 1)), 4), round(float(np.clip(b[1] / h, 0, 1)), 4),
                     round(float(np.clip(b[2] / w, 0, 1)), 4), round(float(np.clip(b[3] / h, 0, 1)), 4)]}
            for lbl, sc, b in raw]
    dets = _merge_screens(dets)
    dets.sort(key=lambda d: -d["score"])
    counts: dict[str, int] = {}
    for d in dets:
        counts[d["group"]] = counts.get(d["group"], 0) + 1
    # A workstation is a visible screen or keyboard; both are often seen for the same seat, so take the larger
    counts["workstation"] = max(counts.get("screen", 0), counts.get("keyboard", 0))
    room, basis = room_reading(counts)
    return {"status": "analysed", "model": model, "latency_ms": ms, "image": [w, h], "counts": counts,
            "room_type": room, "room_basis": basis, "detections": dets}
