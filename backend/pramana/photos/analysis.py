"""Per-photo analysis stored on the document at processing time: Content Credentials, detector counts and
the attribution fields some sample photos carry in EXIF."""

import io
import logging
from typing import Any

from PIL import Image

from . import credentials, detector

log = logging.getLogger(__name__)

EXIF_TEXT = {0x010E: "description", 0x013B: "artist", 0x8298: "copyright"}


def exif_text(data: bytes) -> dict[str, str]:
    try:
        with Image.open(io.BytesIO(data)) as im:
            raw = im.getexif()
            return {k: str(raw[t]).strip("\x00 ") for t, k in EXIF_TEXT.items() if raw.get(t)}
    except Exception:  # noqa: BLE001
        return {}


def analyse(data: bytes, mime: str) -> dict[str, Any]:
    try:
        c2pa = credentials.read(data, mime)
    except Exception as e:  # noqa: BLE001  the library failing must not sink document processing
        log.warning("content credentials check failed: %s", e)
        c2pa = {"present": None, "error": str(e)[:200]}
    return {"c2pa": c2pa, "room": detector.analyse(data), "exif_text": exif_text(data)}
