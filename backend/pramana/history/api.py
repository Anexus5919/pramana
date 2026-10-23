from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import OFFICIAL_ROLES, load_application, require_roles
from ..crypto import load_document
from ..db import get_db
from ..models import Document, User, VerificationAttempt
from . import revisions

router = APIRouter(prefix="/api", tags=["history"])


def _official_doc(db: Session, user: User, doc_id: str) -> Document:
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "document not found")
    load_application(db, user, doc.application_id)
    return doc


@router.get("/documents/{doc_id}/revisions")
def document_revisions(doc_id: str, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                       db: Session = Depends(get_db)):
    """Saved revisions of a PDF with signature coverage and text changes. Officials only: forensic detail."""
    doc = _official_doc(db, user, doc_id)
    if doc.mime != "application/pdf":
        return {"document_id": doc.id, "supported": False, "revision_count": 0, "revisions": []}
    attempts = db.scalars(select(VerificationAttempt).where(VerificationAttempt.document_id == doc.id)
                          .order_by(VerificationAttempt.started_at.desc())).all()
    return {"supported": True, **revisions.describe(doc, load_document(doc.storage_name), attempts)}


@router.get("/documents/{doc_id}/revisions/{n}/pages/{page_no}.png")
def revision_page(doc_id: str, n: int, page_no: int, user: User = Depends(require_roles(*OFFICIAL_ROLES)),
                  db: Session = Depends(get_db)):
    doc = _official_doc(db, user, doc_id)
    if doc.mime != "application/pdf" or page_no < 1 or page_no > max(doc.page_count, 1):
        raise HTTPException(404, "no such page")
    try:
        png = revisions.render(doc, load_document(doc.storage_name), n, page_no)
    except IndexError as e:
        raise HTTPException(404, "no such revision or page in that revision") from e
    return Response(png, media_type="image/png", headers={"Cache-Control": "private, max-age=600"})
