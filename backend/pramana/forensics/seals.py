"""Embedded seal images and their reuse across applications.

Issuers stamp certificates with a seal or logo that is often a raster image inside the PDF. A copied
certificate tends to carry the image lifted from a real one. Each seal-sized image is hashed (exact pixels
and a perceptual hash) and compared across institutions. The same seal on certificates attributed to
different issuers is reported; the same issuer reusing its own seal is normal and is not.
"""

import hashlib
import io
import logging
import re
from functools import lru_cache
from typing import Any

import imagehash
import pdfplumber
import pikepdf
from PIL import Image, ImageOps

from ..verification.signed_qr import decode_qr

log = logging.getLogger(__name__)

MAX_PAGES = 3
MAX_AREA_SHARE = 0.12  # larger images are photos, maps or full-page scans, not seals
MIN_SIDE_PT = 28
HASH_SIZE = 16
# Of 256 bits, for both hashes. Seals of one template differ only in their text, so this stays tight:
# rescaling and recompression move a seal by about 4, different issuers' seals sit 10 or more apart.
PHASH_MAX_DISTANCE = 8
COMMON_ISSUERS = 3  # an image under this many distinct issuers is shared artwork (an emblem), not a seal
ISSUER_FIELDS = ("issuing_authority",)


def _pixels(pdf: pikepdf.Pdf, img: dict) -> Image.Image | None:
    stream = img.get("stream")
    objid = getattr(stream, "objid", None)
    if not objid:
        return None
    try:
        obj = pdf.get_object(objid, getattr(stream, "genno", 0) or 0)
        return pikepdf.PdfImage(obj).as_pil_image()
    except Exception as e:  # noqa: BLE001  unusual colour spaces or filters are skipped, not fatal
        log.debug("image %s not decoded: %s", objid, e)
        return None


def _flat(im: Image.Image) -> Image.Image:
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, "white")
        im = Image.alpha_composite(bg, im)
    return im.convert("RGB")


def _is_qr(rgb: Image.Image) -> bool:
    """Embedded QR images are often cropped to a thin quiet zone and few pixels; pad and enlarge them first."""
    hist = ImageOps.grayscale(rgb).histogram()
    if sum(hist[60:196]) > 0.08 * sum(hist):
        return False  # a QR is black modules on white; inked seals and photos have many mid tones
    if decode_qr(rgb):
        return True
    k = max(1, 600 // max(rgb.size))
    big = rgb.resize((rgb.width * k, rgb.height * k), Image.NEAREST)
    pad = Image.new("RGB", (big.width + 80, big.height + 80), "white")
    pad.paste(big, (40, 40))
    return bool(decode_qr(pad))


def image_fingerprints(data: bytes) -> list[dict[str, Any]]:
    """Seal-sized raster images: page, box in PDF points, exact pixel hash and perceptual hash."""
    out = []
    with pdfplumber.open(io.BytesIO(data)) as doc, pikepdf.open(io.BytesIO(data)) as pdf:
        for pno, page in enumerate(doc.pages[:MAX_PAGES], start=1):
            area = float(page.width) * float(page.height)
            for img in page.images:
                w, h = img["x1"] - img["x0"], img["bottom"] - img["top"]
                if min(w, h) < MIN_SIDE_PT or w * h > MAX_AREA_SHARE * area or not 0.5 <= w / max(h, 1e-6) <= 2:
                    continue
                im = _pixels(pdf, img)
                if im is None or min(im.size) < 24:
                    continue
                rgb = _flat(im)
                gray = ImageOps.grayscale(rgb)
                lo, hi = gray.getextrema()
                if hi - lo < 40:
                    continue  # blank or flat colour block
                if _is_qr(rgb):
                    continue  # QR codes differ by payload but share finder patterns; they are checked elsewhere
                out.append({
                    "page": pno,
                    "bbox": [round(img["x0"], 2), round(img["top"], 2), round(img["x1"], 2), round(img["bottom"], 2)],
                    "sha256": hashlib.sha256(rgb.tobytes()).hexdigest(),
                    "phash": str(imagehash.phash(gray, hash_size=HASH_SIZE)),
                    "dhash": str(imagehash.dhash(gray, hash_size=HASH_SIZE)),
                    "px": list(rgb.size),
                })
    return out


def issuer_of(fields: dict[str, Any]) -> str | None:
    """The authority a document says issued it, from its extracted fields."""
    for name in ISSUER_FIELDS:
        v = fields.get(name)
        if v:
            return str(v).strip()
    return None


def issuer_key(issuer: str) -> str:
    """The issuing organisation: 'Chief Fire Officer, Pune Fire Brigade' and 'Divisional Fire Officer, Pune Fire
    Brigade' are one issuer, so a signatory's title does not make the same office look like two."""
    org = issuer.rsplit(",", 1)[-1] if "," in issuer else issuer
    return re.sub(r"[^a-z0-9]", "", org.lower())


@lru_cache(maxsize=4096)
def _h(hexstr: str) -> imagehash.ImageHash:
    return imagehash.hex_to_hash(hexstr)


def distance(a: dict[str, Any], b: dict[str, Any]) -> int:
    """The larger of the two perceptual distances, so both hashes must agree before images match."""
    if a["sha256"] == b["sha256"]:
        return 0
    # imagehash returns a numpy integer, which the finding's JSON evidence cannot hold
    return int(max(_h(a["phash"]) - _h(b["phash"]), _h(a["dhash"]) - _h(b["dhash"])))
