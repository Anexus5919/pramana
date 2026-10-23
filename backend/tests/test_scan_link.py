"""Scan links in issuer QR codes ({base}/scan#t=<token>), the token endpoint and low-resolution QR decoding."""

import base64
import hashlib
import io
import json
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from pramana.verification import signed_qr
from pramana.verification.signed_qr import decode_qr, extract_token, link_parts, scan_link, sign_payload

PAYLOAD = {"noc": "FES/PUN/2025/04417", "issued_to": "Shree Dnyaneshwar Institute of Technology",
           "issue_date": "2025-03-12", "valid_until": "2027-03-11"}
LAN = "http://192.168.0.103:8000"


def _b64(obj: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj, separators=(",", ":")).encode()).rstrip(b"=").decode()


@pytest.fixture
def issuer(monkeypatch):
    k = Ed25519PrivateKey.generate()
    pub = base64.b64encode(k.public_key().public_bytes(serialization.Encoding.Raw,
                                                        serialization.PublicFormat.Raw)).decode()
    keys = {"fire-sim-2025": {"issuer": "State Fire and Emergency Services (SIMULATED)", "public_key": pub,
                              "simulated": True}}
    monkeypatch.setattr(signed_qr, "issuer_keys", lambda: keys)
    return k


@pytest.fixture
def client(issuer):
    from fastapi.testclient import TestClient

    from pramana import ratelimit
    from pramana.main import app

    ratelimit.reset()
    with TestClient(app) as c:
        yield c


def _tampered(tok: str) -> str:
    h, _, sig = tok.split(".")
    return f"{h}.{_b64({**PAYLOAD, 'valid_until': '2032-03-11'})}.{sig}"


def test_link_and_bare_forms_give_the_same_token():
    from pramana.config import get_settings

    tok = "aGVhZA.Ym9keQ.c2ln"
    assert extract_token(tok) == tok and extract_token(f"  {tok}\n") == tok
    assert scan_link(tok, LAN + "/") == f"{LAN}/scan#t={tok}"
    assert link_parts(scan_link(tok, LAN)) == (tok, "192.168.0.103:8000")
    assert scan_link(tok).startswith(get_settings().public_base_url.rstrip("/") + "/scan#t=")
    assert extract_token(f"https://verify.example/scan?t={tok}") == tok
    assert extract_token(f"https://verify.example/scan?lang=en#v=1&t={tok}") == tok
    # The fragment wins over the query, and a link without t is returned untouched
    assert extract_token(f"https://verify.example/scan?t=other#t={tok}") == tok
    assert link_parts("https://example.org/verify?ref=FES-1") == ("https://example.org/verify?ref=FES-1", None)
    assert link_parts("https://example.org/scan#t=") == ("https://example.org/scan#t=", None)


def test_only_the_signature_decides_never_the_host(issuer):
    tok = sign_payload(PAYLOAD, issuer, "fire-sim-2025")
    for base in (LAN, "https://pramana.aicte-india.org", "https://anything.example"):
        chk = signed_qr.verify_token(scan_link(tok, base))
        assert chk.ok and chk.payload == PAYLOAD
    chk = signed_qr.verify_token(scan_link(_tampered(tok), LAN))
    assert not chk.ok and chk.error == "signature does not match payload"
    bad = signed_qr.verify_token("https://example.org/scan#t=not-a-token")
    assert not bad.ok and bad.payload is None


def test_token_endpoint_gives_the_scan_states(client, issuer, monkeypatch):
    from pramana.api import public

    monkeypatch.setattr(public.sim, "lookup", lambda code, ref: {
        "simulated": True, "issuer": "Fire registry (SIMULATED)", "found": True, "mode": "sync",
        "record": {"status": "valid", "fields": {"institution_name": PAYLOAD["issued_to"]}}})
    tok = sign_payload(PAYLOAD, issuer, "fire-sim-2025")
    old = sign_payload({**PAYLOAD, "valid_until": "2025-03-11"}, issuer, "fire-sim-2025")
    stranger = sign_payload(PAYLOAD, Ed25519PrivateKey.generate(), "fire-sim-2023")

    def check(text: str):
        return client.post("/api/public/scan/token", json={"token": text})

    r = check(scan_link(tok, LAN)).json()
    assert r["status"] == "verified" and r["source"] == "link" and r["stored"] is False and r["qr_found"] == 1
    res = r["results"][0]
    assert res["token"] == tok and res["link_host"] == "192.168.0.103:8000" and res["signed"] is True
    assert {f["key"]: f["value"] for f in res["fields"]}["valid_until"] == "2027-03-11"
    assert res["proves"] and res["does_not_prove"]
    assert r["token_sha256"] == hashlib.sha256(tok.encode()).hexdigest() and r["image_sha256"] is None
    bare = check(tok).json()
    assert bare["status"] == "verified" and bare["results"][0]["link_host"] is None
    assert check(f"https://verify.example/scan?t={tok}").json()["status"] == "verified"
    assert check(scan_link(old, LAN)).json()["status"] == "expired"
    assert check(scan_link(_tampered(tok), LAN)).json()["status"] == "bad_signature"
    assert check(scan_link(stranger, LAN)).json()["status"] == "unknown_key"
    for junk in ("https://example.org/scan#t=garbage", "https://example.org/scan", "hello"):
        nr = check(junk).json()
        assert nr["status"] == "not_signed" and "link" in nr["results"][0]["detail"]
    assert check("   ").status_code == 422
    assert client.post("/api/public/scan/token", content=b"not json",
                       headers={"Content-Type": "application/json"}).status_code == 422
    assert check("x" * 5000).status_code == 413
    assert client.post("/api/public/scan/token", content=b'{"token": "' + b"a" * 9000 + b'"}',
                       headers={"Content-Type": "application/json"}).status_code == 413
    # The registry lookup takes the link form as well
    reg = client.post("/api/public/scan/registry", json={"token": scan_link(tok, LAN)}).json()
    assert reg["found"] is True and reg["ref"] == PAYLOAD["noc"]


def test_token_endpoint_audits_only_a_hash_and_is_rate_limited(client, issuer):
    from sqlalchemy import select

    from pramana.db import SessionLocal
    from pramana.models import AuditEvent

    tok = sign_payload(PAYLOAD, issuer, "fire-sim-2025")
    assert client.post("/api/public/scan/token", json={"token": scan_link(tok, LAN)}).status_code == 200
    db = SessionLocal()
    ev = db.scalars(select(AuditEvent).where(AuditEvent.action == "public.scan_token")
                    .order_by(AuditEvent.seq.desc())).first()
    assert ev.details == {"sha256": hashlib.sha256(tok.encode()).hexdigest(), "form": "link",
                          "status": "verified", "kid": "fire-sim-2025"}
    assert tok not in json.dumps(ev.details) and tok.split(".")[1] not in (ev.object_id or "")
    db.close()
    codes = [client.post("/api/public/scan/token", json={"token": tok}).status_code for _ in range(35)]
    assert 429 in codes


def _phone_photo(text: str) -> bytes:
    """A QR as a phone camera sees it: on a grey page, perspective-warped, slightly blurred, JPEG."""
    import cv2
    import numpy as np
    import segno
    from PIL import Image, ImageFilter

    q = io.BytesIO()
    segno.make(text, error="m", micro=False).save(q, kind="png", scale=6, border=4)
    code = Image.open(io.BytesIO(q.getvalue())).convert("RGB")
    page = Image.new("RGB", (code.width + 420, code.height + 360), (236, 232, 226))
    page.paste(code, (240, 150))
    w, h = page.size
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([[0.04 * w, 0.02 * h], [0.97 * w, 0.06 * h], [0.93 * w, 0.97 * h], [0.02 * w, 0.92 * h]])
    warped = cv2.warpPerspective(np.array(page), cv2.getPerspectiveTransform(src, dst), (w, h),
                                 borderValue=(200, 196, 190))
    photo = Image.fromarray(warped).filter(ImageFilter.GaussianBlur(1.1))
    b = io.BytesIO()
    photo.save(b, "JPEG", quality=82)
    return b.getvalue()


def test_photo_of_a_link_qr_verifies(client, issuer):
    tok = sign_payload(PAYLOAD, issuer, "fire-sim-2025")
    r = client.post("/api/public/scan", files={"file": ("p.jpg", _phone_photo(scan_link(tok, LAN)), "image/jpeg")})
    body = r.json()
    assert body["status"] == "verified" and body["source"] == "image"
    assert body["results"][0]["token"] == tok and body["results"][0]["link_host"] == "192.168.0.103:8000"
    tampered = client.post("/api/public/scan", files={"file": ("p.jpg", _phone_photo(scan_link(_tampered(tok), LAN)),
                                                                 "image/jpeg")}).json()
    assert tampered["status"] == "bad_signature"


def _small_screenshot(text: str, error: str, qr_px: int):
    """A whole certificate captured at 468 px wide, as an editor export or a phone screenshot: the dense code
    lands at well under two pixels per module."""
    import segno
    from PIL import Image, ImageDraw

    q = io.BytesIO()
    segno.make(text, error=error, micro=False).save(q, kind="png", scale=8, border=2)
    code = Image.open(io.BytesIO(q.getvalue())).convert("RGB").resize((qr_px, qr_px), Image.LANCZOS)
    page = Image.new("RGB", (468, 664), "white")
    d = ImageDraw.Draw(page)
    d.rectangle((8, 8, 459, 655), outline=(40, 60, 90), width=2)
    for i in range(14):
        d.text((50, 80 + i * 14), f"Certificate line {i}: Fire safety NOC, valid up to 12-05-2028", fill=(30, 30, 30))
    page.paste(code, (310, 445))
    return page


def test_small_screenshot_qr_needs_and_gets_the_upscaled_retry(issuer):
    from pramana.sandbox_worker import op_qr

    tok = sign_payload(PAYLOAD, issuer, "fire-sim-2025")
    shot = _small_screenshot(tok, "l", 110)
    assert decode_qr(shot, upscale=False) == []
    found = decode_qr(shot)
    assert [t for t, _ in found] == [tok]
    x0, y0, x1, y1 = found[0][1]
    assert 300 < x0 < 320 and 435 < y0 < 455 and 410 < x1 < 430 and 545 < y1 < 565
    link_shot = _small_screenshot(scan_link(tok, LAN), "m", 116)
    assert [extract_token(t) for t, _ in decode_qr(link_shot)] == [tok]
    # The document pipeline reads the same QR from the PNG and from a PDF that embeds the screenshot
    png = io.BytesIO()
    shot.save(png, "PNG")
    assert [t["text"] for t in op_qr(png.getvalue(), "image/png", 1)[0]] == [tok]
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawImage(ImageReader(shot), 0, 0, *A4)
    c.save()
    toks = op_qr(buf.getvalue(), "application/pdf", 1)[0]
    assert [t["text"] for t in toks] == [tok] and toks[0]["page"] == 1
    bx0, by0, bx1, _ = toks[0]["bbox"]
    assert 380 < bx0 < 405 and 550 < by0 < 580 and 520 < bx1 < 545


def test_printed_values_are_compared_with_a_link_qr(issuer):
    from pramana.pipeline.validate import _qr_compare

    chk = signed_qr.verify_token(scan_link(sign_payload(PAYLOAD, issuer, "fire-sim-2025"), LAN))
    printed = SimpleNamespace(fields=[SimpleNamespace(name="noc_number", value="FES/PUN/2025/04417"),
                                      SimpleNamespace(name="valid_until", value="2028-05-12"),
                                      SimpleNamespace(name="institution_name", value=PAYLOAD["issued_to"])])
    comps = _qr_compare(printed, chk.payload, {"noc": "noc_number", "valid_until": "valid_until",
                                               "issued_to": "institution_name"})
    assert chk.ok and [c.field for c in comps if c.match is False] == ["valid_until"]
