"""Public scan-to-verify: anyone holding a certificate can check its issuer-signed QR from a photo, or by
opening the scan link the QR carries with any phone camera.

No login. The photo lives only for the request: it is decoded in memory, never stored, and only its
SHA-256 goes into the audit trail; a link's token is treated the same way. A verified signature proves that
the issuer's key signed the data in the QR, nothing about the paper the QR is printed on, and the response
says so.
"""

import hashlib
import io
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from .. import audit
from ..db import get_db
from ..pipeline import intake  # noqa: F401  sets Pillow's decompression-bomb limit
from ..ratelimit import limit
from ..sim import issuers as sim
from ..verification.signed_qr import decode_qr, link_parts, verify_token

router = APIRouter(prefix="/api/public", tags=["public"])

MAX_BYTES = 10 * 1024 * 1024
# A signed token is a few hundred characters; anything far larger is not one
MAX_TOKEN_CHARS = 4096
MAX_TOKEN_BODY = 8 * 1024
MAX_SIDE = 2400
IMAGE_TYPES = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG\r\n\x1a\n": "image/png"}
# Labels for the payload keys issuers put in their tokens; anything else is shown with its raw key
LABELS = {
    "noc": "Certificate number", "ref": "Reference number", "issued_to": "Issued to", "inst": "Institution code",
    "programme_code": "Programme", "issue_date": "Date of issue", "valid_from": "Valid from",
    "valid_until": "Valid until",
}
DATE_KEYS = {"issue_date", "valid_from", "valid_until"}
# Which simulated registry answers for which signing key, and the payload field that holds its reference
REGISTRY = {"fire-sim-2025": ("FIRE-SERVICES", "noc")}

DOES_NOT_PROVE = [
    "That the paper or screen in front of you shows the same values. A QR can be copied onto a different "
    "certificate, and printed text can be edited while the QR stays as issued. Compare every value below "
    "with the printed certificate yourself.",
    "That the certificate is still in force today beyond the dates it states. The issuer may have withdrawn "
    "it; only the issuer's own records can say that.",
    "Anything about the premises, people or facts the certificate describes.",
]


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _sniff(data: bytes) -> str | None:
    for magic, mime in IMAGE_TYPES.items():
        if data.startswith(magic):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _load(data: bytes) -> Image.Image:
    if _sniff(data) is None:
        raise HTTPException(415, "Send a photo as JPEG, PNG or WebP. If your phone saves HEIC, take a screenshot "
                                 "of the QR or switch the camera to the most compatible format.")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im).convert("RGB")
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, SyntaxError) as e:
        raise HTTPException(422, "The image could not be read.") from e
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE))
    return im


def _decode(im: Image.Image) -> list[str]:
    """QR texts, trying a few scales as the document pipeline tries a few DPIs, then upscaled copies."""
    for scale in (1.0, 0.6, 1.6, 0.35):
        img = im if scale == 1.0 else im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))))
        found = decode_qr(img, upscale=False)
        if found:
            return list(dict.fromkeys(t for t, _ in found))
    return list(dict.fromkeys(t for t, _ in decode_qr(im)))


def _fields(payload: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for k, v in payload.items():
        out.append({"key": k, "label": LABELS.get(k, k.replace("_", " ").capitalize()), "value": v,
                    "kind": "date" if k in DATE_KEYS else "text"})
    return out


def _validity(payload: dict[str, Any], today: date) -> dict[str, Any]:
    def parse(k):
        try:
            return date.fromisoformat(str(payload[k])) if payload.get(k) else None
        except ValueError:
            return None

    # Certificates without a separate start date are in force from their date of issue
    frm, until = parse("valid_from") or parse("issue_date"), parse("valid_until")
    state = "none"
    if until and until < today:
        state = "expired"
    elif frm and frm > today:
        state = "not_yet_valid"
    elif until or frm:
        state = "valid"
    return {"from": frm.isoformat() if frm else None, "until": until.isoformat() if until else None,
            "state": state, "checked_on": today.isoformat()}


def assess(token: str, today: date, source: str = "qr") -> dict[str, Any]:
    """What a single QR token shows, in the words the scan page uses."""
    chk = verify_token(token)
    if chk.payload is None and not chk.ok:
        if source == "link":
            return {"status": "not_signed", "detail": "This link does not carry an issuer-signed token, so nothing "
                    "in it can be verified here.", "text_preview": token[:120]}
        return {"status": "not_signed", "detail": "This QR does not carry an issuer-signed token. It may be a link "
                "or plain text; nothing in it can be verified here.", "text_preview": token[:120]}
    issuer = {"kid": chk.kid, "name": chk.issuer["issuer"] if chk.issuer else None,
              "simulated": bool(chk.issuer.get("simulated")) if chk.issuer else None}
    fields = _fields(chk.payload or {})
    if not chk.ok:
        if chk.issuer is None and chk.error and chk.error.startswith("unknown issuer key"):
            return {"status": "unknown_key", "issuer": issuer, "fields": fields, "signed": False,
                    "detail": f"The QR is signed with a key ('{chk.kid}') that is not among the issuer keys this "
                              "service knows. The values below are what the QR says, unverified."}
        if chk.issuer is None:
            return {"status": "unsupported", "issuer": issuer, "fields": fields, "signed": False,
                    "detail": f"The QR token could not be checked: {chk.error}."}
        return {"status": "bad_signature", "issuer": issuer, "fields": fields, "signed": False,
                "detail": f"The signature does not match the data in the QR. Either the QR content was altered or "
                          f"it was not signed by {issuer['name']}. Treat the values below as unverified."}
    validity = _validity(chk.payload, today)
    status = {"expired": "expired", "not_yet_valid": "not_yet_valid"}.get(validity["state"], "verified")
    window = (f" The validity it states runs from {validity['from'] or 'an unstated date'} to "
              f"{validity['until'] or 'an unstated date'}.") if validity["state"] != "none" else ""
    proves = [f"The values shown here were signed with the published key of {issuer['name']} (key '{chk.kid}') "
              f"and have not been changed since.{window}"]
    if issuer["simulated"]:
        proves.append("This issuer key is SIMULATED for the prototype, so the check shows how verification works, "
                      "not that a real authority issued anything.")
    return {"status": status, "issuer": issuer, "fields": fields, "signed": True, "validity": validity,
            "proves": proves, "does_not_prove": DOES_NOT_PROVE,
            "registry_available": chk.kid in REGISTRY}


def _result(text: str, today: date, source: str = "qr") -> dict[str, Any]:
    """assess() plus the bare token (for the registry lookup) and, for a scan link, the host it points at.
    The host is reported so a person can judge it; it is never contacted and plays no part in the result."""
    token, host = link_parts(text)
    return {**assess(text, today, source), "token": token if token.count(".") == 2 else None, "link_host": host}


@router.post("/scan")
async def scan(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    limit(f"scan:{_client(request)}", 20, 60)
    limit("scan:all", 600, 60)
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"The photo is larger than {MAX_BYTES // (1024 * 1024)} MB.")
    if not data:
        raise HTTPException(422, "The upload was empty.")
    sha = hashlib.sha256(data).hexdigest()
    texts = _decode(_load(data))
    today = datetime.now(UTC).date()
    results = [_result(t, today) for t in texts[:4]]
    status = results[0]["status"] if results else "no_qr"
    audit.record(db, actor="public", actor_role="anonymous", action="public.scan", object_type="image",
                 object_id=sha[:16], details={"sha256": sha, "qr_found": len(texts), "status": status,
                                               "kid": next((r["issuer"]["kid"] for r in results if r.get("issuer")),
                                                           None)})
    db.commit()
    return {"status": status, "source": "image", "qr_found": len(texts), "results": results, "image_sha256": sha,
            "checked_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "stored": False,
            "detail": None if results else "No QR code was found in the photo. Fill the frame with the QR, keep it "
                                           "flat and in focus, avoid glare, and try again."}


class TokenQuery(BaseModel):
    token: str


async def _body(request: Request, cap: int) -> bytes:
    """The request body, refused with 413 as soon as it passes cap bytes."""
    try:
        declared = int(request.headers.get("content-length") or 0)
    except ValueError:
        declared = 0
    if declared > cap:
        raise HTTPException(413, "The link is too long to be a certificate token.")
    data = bytearray()
    async for chunk in request.stream():
        data += chunk
        if len(data) > cap:
            raise HTTPException(413, "The link is too long to be a certificate token.")
    return bytes(data)


@router.post("/scan/token")
async def scan_token(request: Request, db: Session = Depends(get_db)):
    """Verify the token from a scan link ({base}/scan#t=<token>) or a bare token: the same answer a photo of
    the QR gives. The page reads the token from the URL fragment, which never reaches a server log; here only
    its SHA-256 is recorded."""
    limit(f"scan-token:{_client(request)}", 30, 60)
    limit("scan:all", 600, 60)
    try:
        text = TokenQuery.model_validate_json(await _body(request, MAX_TOKEN_BODY)).token.strip()
    except ValidationError as e:
        raise HTTPException(422, "Send the token as JSON: {\"token\": \"...\"}.") from e
    if len(text) > MAX_TOKEN_CHARS:
        raise HTTPException(413, "The link is too long to be a certificate token.")
    if not text:
        raise HTTPException(422, "The link does not carry a token.")
    token, host = link_parts(text)
    sha = hashlib.sha256(token.encode()).hexdigest()
    result = _result(text, datetime.now(UTC).date(), "link")
    audit.record(db, actor="public", actor_role="anonymous", action="public.scan_token", object_type="token",
                 object_id=sha[:16], details={"sha256": sha, "form": "link" if host else "token",
                                              "status": result["status"],
                                              "kid": (result.get("issuer") or {}).get("kid")})
    db.commit()
    return {"status": result["status"], "source": "link", "qr_found": 1, "results": [result], "image_sha256": None,
            "token_sha256": sha, "checked_at": datetime.now(UTC).isoformat(timespec="seconds"), "stored": False,
            "detail": None}


class RegistryQuery(BaseModel):
    token: str


@router.post("/scan/registry")
def scan_registry(body: RegistryQuery, request: Request, db: Session = Depends(get_db)):
    """Look the certificate up in the issuer's registry (SIMULATED). Only a validly signed token is accepted,
    so the endpoint cannot be used to probe reference numbers."""
    limit(f"scan-registry:{_client(request)}", 10, 60)
    if len(body.token) > MAX_TOKEN_CHARS:
        raise HTTPException(413, "token too long")
    chk = verify_token(body.token)
    if not chk.ok or chk.kid not in REGISTRY:
        raise HTTPException(422, "Only a QR with a valid signature from an issuer with a registry can be looked up.")
    code, ref_key = REGISTRY[chk.kid]
    ref = str(chk.payload.get(ref_key) or "")
    try:
        resp = sim.lookup(code, ref)
    except sim.SourceUnavailable as e:
        return {"simulated": True, "available": False, "detail": str(e), "ref": ref}
    except KeyError as e:
        raise HTTPException(404, "unknown issuer registry") from e
    compare = []
    if resp["found"]:
        rec = resp["record"]["fields"]
        for pk, rk in (("issued_to", "institution_name"), ("issue_date", "issue_date"),
                       ("valid_until", "valid_until")):
            if pk in chk.payload and rk in rec:
                compare.append({"label": LABELS.get(pk, pk), "signed": chk.payload[pk], "registry": rec[rk],
                                "match": str(chk.payload[pk]).strip().lower() == str(rec[rk]).strip().lower()})
    audit.record(db, actor="public", actor_role="anonymous", action="public.scan_registry", object_type="issuer",
                 object_id=code, details={"ref": ref, "found": resp["found"]})
    db.commit()
    return {"simulated": True, "available": True, "registry": resp["issuer"], "ref": ref, "found": resp["found"],
            "status": (resp.get("record") or {}).get("status"), "compare": compare}
