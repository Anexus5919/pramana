"""Fingerprints for spotting the same document or photo across applications.

- sha256: byte-identical file (identity, not authenticity)
- phash: perceptual hash of the first page or the photo; survives re-saving, scaling and recompression
- minhash: text shingles, catches the same certificate retyped with a few values changed
"""

import hashlib
import io
import re
from typing import Any

import imagehash
from PIL import Image

from ..pipeline.text import render_pdf_page

NUM_PERM = 64
_MERSENNE = (1 << 61) - 1
_PERMS = [((i * 0x9E3779B97F4A7C15 + 1) % _MERSENNE, (i * 0xBF58476D1CE4E5B9 + 7) % _MERSENNE)
          for i in range(1, NUM_PERM + 1)]


def _shingles(text: str, k: int = 4) -> set[int]:
    toks = re.findall(r"[a-z0-9]+", text.lower())
    if len(toks) < k:
        return {int.from_bytes(hashlib.blake2b(" ".join(toks).encode(), digest_size=8).digest(), "big")} if toks else set()
    return {int.from_bytes(hashlib.blake2b(" ".join(toks[i:i + k]).encode(), digest_size=8).digest(), "big")
            for i in range(len(toks) - k + 1)}


def minhash(text: str) -> list[int]:
    sh = _shingles(text)
    if not sh:
        return []
    return [min((a * h + b) % _MERSENNE for h in sh) for a, b in _PERMS]


def minhash_similarity(a: list[int], b: list[int]) -> float:
    if not a or not b:
        return 0.0
    return sum(1 for x, y in zip(a, b, strict=True) if x == y) / len(a)


def phash_of(data: bytes, mime: str) -> str:
    if mime == "application/pdf":
        img = render_pdf_page(data, 0, 60)
    else:
        with Image.open(io.BytesIO(data)) as im:
            img = im.convert("RGB")
    return str(imagehash.phash(img, hash_size=16))


def phash_distance(a: str, b: str) -> int:
    return imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b)


def compute(data: bytes, mime: str, text: str) -> dict[str, Any]:
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "phash": phash_of(data, mime),
        "minhash": minhash(text) if text.strip() else [],
    }
