"""Offline verification of issuer-signed QR codes.

The QR carries a compact JWS (RFC 7515) signed with EdDSA/Ed25519 (RFC 8037). Verification needs only
the issuer's published public key. If the visible text was edited but the QR was left as issued, the
signed payload disagrees with the page, which is strong, explainable evidence of alteration.

The QR holds either the bare token or a scan link, {public_base_url}/scan#t={token}, which any phone camera
opens. Only the token is ever trusted: the host in a link is neither trusted nor contacted.
"""

import base64
import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from urllib.parse import parse_qs, urlsplit

import cv2
import numpy as np
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from PIL import Image

from ..config import get_settings


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_payload(payload: dict[str, Any], key: Ed25519PrivateKey, kid: str) -> str:
    header = {"alg": "EdDSA", "typ": "JWT", "kid": kid}
    h = _b64u(json.dumps(header, separators=(",", ":")).encode())
    p = _b64u(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
    sig = key.sign(f"{h}.{p}".encode())
    return f"{h}.{p}.{_b64u(sig)}"


@dataclass
class QrCheck:
    ok: bool
    kid: str | None
    issuer: dict[str, Any] | None
    payload: dict[str, Any] | None
    error: str | None


@lru_cache
def issuer_keys() -> dict[str, dict[str, Any]]:
    """Published issuer keys. In the prototype every entry is a simulated issuer and says so."""
    p = get_settings().data_dir / "sim" / "issuer_keys.json"
    if not p.exists():
        return {}
    return json.loads(p.read_text())


def scan_link(token: str, base_url: str | None = None) -> str:
    """The link a QR carries: the token rides in the fragment, which browsers never send to a server."""
    return f"{(base_url or get_settings().public_base_url).rstrip('/')}/scan#t={token}"


def link_parts(text: str) -> tuple[str, str | None]:
    """(token, link host) for QR text: a scan link gives its t parameter (fragment first, then query) and the
    host it points at; anything else comes back unchanged with no host."""
    text = text.strip()
    if "://" not in text[:16]:
        return text, None
    try:
        u = urlsplit(text)
    except ValueError:
        return text, None
    for part in (u.fragment, u.query):
        t = parse_qs(part).get("t")
        if t and t[0].strip():
            return t[0].strip(), u.netloc or None
    return text, None


def extract_token(text: str) -> str:
    return link_parts(text)[0]


def verify_token(token: str) -> QrCheck:
    parts = extract_token(token).split(".")
    if len(parts) != 3:
        return QrCheck(False, None, None, None, "QR does not contain a signed token")
    try:
        header = json.loads(_unb64u(parts[0]))
        payload = json.loads(_unb64u(parts[1]))
    except (ValueError, json.JSONDecodeError):
        return QrCheck(False, None, None, None, "QR token is not valid base64url JSON")
    kid = header.get("kid")
    if header.get("alg") != "EdDSA":
        return QrCheck(False, kid, None, payload, f"unsupported algorithm {header.get('alg')}")
    issuer = issuer_keys().get(kid or "")
    if not issuer:
        return QrCheck(False, kid, None, payload, f"unknown issuer key '{kid}'")
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(issuer["public_key"])).verify(
            _unb64u(parts[2]), f"{parts[0]}.{parts[1]}".encode()
        )
    except (InvalidSignature, ValueError):
        return QrCheck(False, kid, issuer, payload, "signature does not match payload")
    return QrCheck(True, kid, issuer, payload, None)


def decode_qr(img: Image.Image) -> list[tuple[str, list[float]]]:
    """Return (text, bbox in image pixels) for each QR code found."""
    arr = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)
    det = cv2.QRCodeDetector()
    out = []
    ok, texts, points, _ = det.detectAndDecodeMulti(arr)
    if ok and texts is not None:
        for t, pts in zip(texts, points, strict=False):
            if t:
                xs, ys = pts[:, 0], pts[:, 1]
                out.append((t, [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]))
    if not out:
        t, pts, _ = det.detectAndDecode(arr)
        if t and pts is not None:
            pts = pts.reshape(-1, 2)
            out.append((t, [float(pts[:, 0].min()), float(pts[:, 1].min()),
                            float(pts[:, 0].max()), float(pts[:, 1].max())]))
    if not out and hasattr(cv2, "QRCodeDetectorAruco"):
        # The default detector misses some dense codes and phone photos that the ArUco-based one reads
        ok, texts, points, _ = cv2.QRCodeDetectorAruco().detectAndDecodeMulti(arr)
        if ok and texts is not None:
            for t, pts in zip(texts, points, strict=False):
                if t:
                    xs, ys = pts[:, 0], pts[:, 1]
                    out.append((t, [float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]))
    return out
