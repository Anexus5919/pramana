"""Analyse any document: officials drop a PDF or photo and get every per-document check, without filing it.

Only an audit event with the file's SHA-256 is kept. The bytes stay in memory for the page viewer and the
revision time machine, for at most store.TTL_S, and only for the official who uploaded them.
"""

import io
import logging
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import audit, ratelimit, sandbox
from ..auth import OFFICIAL_ROLES, require_roles
from ..config import get_settings
from ..db import get_db
from ..forensics.pdf_struct import revision_offsets
from ..history.revisions import RENDER_DPI
from ..models import User
from ..pipeline.intake import UploadRejected, validate_upload
from . import core, store

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["analyse"])

MAX_PER_WINDOW = 20
WINDOW_S = 600
PREVIEW_PX = 1280
GONE = "This analysis has expired or was forgotten. Drop the file again to analyse it."


def _safe_name(name: str | None) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", (name or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1])[:120]
    return base or "upload"


def _held(token: str, user: User) -> store.Held:
    h = store.get(token, user.id)
    if h is None:
        raise HTTPException(404, GONE)
    return h


def _png(png: bytes) -> Response:
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=600"})


@router.post("/analyse")
def analyse_file(file: UploadFile = File(...), user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                 db: Session = Depends(get_db)):
    """Every per-document check on one PDF, JPEG or PNG. Nothing is filed; the check is audited by hash."""
    ratelimit.limit(f"analyse:{user.id}", MAX_PER_WINDOW, WINDOW_S)
    cap = get_settings().max_upload_mb * 1024 * 1024
    data = file.file.read(cap + 1)
    if len(data) > cap:
        raise HTTPException(413, f"file exceeds {get_settings().max_upload_mb} MB")
    name = _safe_name(file.filename)
    try:
        intake = validate_upload(name, data)
    except UploadRejected as e:
        raise HTTPException(422, str(e)) from e
    token = store.new_token()
    try:
        result = core.analyse(data, name, intake, token)
    except sandbox.SandboxError as e:
        audit.record(db, actor=user.username, actor_role=user.role, action="tool.analyse_unsafe", object_type="file",
                     object_id=None, details={"size_bytes": len(data), "mime": intake.mime, "reason": str(e)[:300]})
        db.commit()
        raise HTTPException(422, str(e) if "Review this file manually" in str(e) else
                            f"Could not be read safely: {e}. Review this file manually.") from e
    ends = revision_offsets(data) if intake.mime == "application/pdf" else []
    result["expires_at"] = store.put(token, user.id, data, intake.mime, intake.page_count, ends or [len(data)])
    sha = result["sha256"]
    audit.record(db, actor=user.username, actor_role=user.role, action="tool.analyse", object_type="file",
                 object_id=sha[:16], details={
                     "sha256": sha, "mime": intake.mime, "pages": intake.page_count,
                     "detected_type": result["doc_type"]["type"],
                     "signatures": [s["status"] for s in result["signatures"]],
                     "signals": sum(1 for s in result["document"].get("forensic_signals", []) if s["severity"] != "info"),
                     "incomplete": bool(result["incomplete"]),
                 })
    db.commit()
    return result


@router.get("/analyse/{token}/pages/{page_no}.png")
def analysed_page(token: str, page_no: int, user: User = Depends(require_roles(*OFFICIAL_ROLES))):
    h = _held(token, user)
    if page_no < 1 or page_no > max(h.page_count, 1):
        raise HTTPException(404, "no such page")
    key = f"p{page_no}"
    png = h.renders.get(key)
    if png is None:
        try:
            png = sandbox.render_png(h.data, h.mime, page_no - 1, RENDER_DPI)
        except sandbox.SandboxError as e:
            raise HTTPException(422, f"page could not be rendered safely: {e}") from e
        store.keep_render(token, key, png)
    return _png(png)


@router.get("/analyse/{token}/revisions/{n}/pages/{page_no}.png")
def analysed_revision_page(token: str, n: int, page_no: int,
                           user: User = Depends(require_roles(*OFFICIAL_ROLES))):
    """A page as it stood at revision n: the file cut at that revision's end-of-file marker, rendered."""
    h = _held(token, user)
    if h.mime != "application/pdf" or n < 1 or n > len(h.ends) or page_no < 1 or page_no > max(h.page_count, 1):
        raise HTTPException(404, "no such revision or page")
    key = f"r{n}p{page_no}"
    png = h.renders.get(key)
    if png is None:
        try:
            png = sandbox.render_png(h.data[: h.ends[n - 1]], h.mime, page_no - 1, RENDER_DPI)
        except sandbox.SandboxError as e:
            raise HTTPException(404, "no such page in that revision") from e
        store.keep_render(token, key, png)
    return _png(png)


@router.get("/analyse/{token}/photo.jpg")
def analysed_photo(token: str, user: User = Depends(require_roles(*OFFICIAL_ROLES))):
    """Upright, downscaled preview of an analysed photo, so detection boxes line up as the detector saw it."""
    h = _held(token, user)
    if not h.mime.startswith("image/"):
        raise HTTPException(404, "not a photo")
    jpg = h.renders.get("photo")
    if jpg is None:
        from PIL import Image, ImageOps

        with Image.open(io.BytesIO(h.data)) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((PREVIEW_PX, PREVIEW_PX))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=84)
        jpg = buf.getvalue()
        store.keep_render(token, "photo", jpg)
    return Response(jpg, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})


@router.delete("/analyse/{token}")
def forget(token: str, user: User = Depends(require_roles(*OFFICIAL_ROLES))):
    """Drop the held bytes and renders now instead of waiting for them to expire."""
    return {"forgotten": store.drop(token, user.id)}
