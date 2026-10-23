"""Officer-only photo endpoints: the campus map payload and downscaled photo previews.

Institutions never see these; photo analysis is a forensic signal under review."""

import io

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..auth import OFFICIAL_ROLES, load_application, require_roles
from ..config import get_settings
from ..crypto import load_document
from ..db import get_db
from ..models import Document, User
from ..photos import campus

router = APIRouter(prefix="/api", tags=["photos"])

SIZES = {"thumb": 360, "preview": 1280}


@router.get("/applications/{app_id}/campus")
def get_campus(app_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)), db: Session = Depends(get_db)):
    app = load_application(db, user, app_id)
    return campus.payload(db, app)


@router.get("/documents/{doc_id}/photo.jpg")
def photo_preview(doc_id: str, size: str = Query("thumb", pattern="^(thumb|preview)$"),
                  user: User = Depends(require_roles(*OFFICIAL_ROLES)), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc or not doc.mime.startswith("image/"):
        raise HTTPException(404, "photo not found")
    load_application(db, user, doc.application_id)
    cache = get_settings().cache_dir / f"{doc.id}_{size}.jpg"
    if not cache.exists():
        from PIL import Image, ImageOps

        with Image.open(io.BytesIO(load_document(doc.storage_name))) as im:
            # Upright like the detector saw it, so boxes line up
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((SIZES[size], SIZES[size]))
            im.save(cache, "JPEG", quality=84)
    return Response(cache.read_bytes(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=600"})
