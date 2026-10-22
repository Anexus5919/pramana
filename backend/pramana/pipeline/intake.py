"""Upload validation following the OWASP File Upload Cheat Sheet.

Originals are never re-encoded: re-encoding would destroy signatures, revision history and the
forensic signals the reviewer relies on. They are stored encrypted and only parsed, never executed.
"""

import io
from dataclasses import dataclass, field

import pikepdf
from PIL import Image

from ..config import get_settings

ALLOWED_EXT = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
Image.MAX_IMAGE_PIXELS = 60_000_000  # decompression-bomb guard

# PDF name objects that make a document active rather than passive content
ACTIVE_KEYS = {
    "/JavaScript": "embedded JavaScript",
    "/JS": "embedded JavaScript",
    "/Launch": "launch action (runs an external program)",
    "/EmbeddedFile": "embedded file attachment",
    "/RichMedia": "rich media (Flash/video)",
    "/SubmitForm": "form submission to a URL",
    "/ImportData": "data import action",
    "/AA": "automatic action trigger",
    "/OpenAction": "action on open",
}


class UploadRejected(ValueError):
    pass


@dataclass
class IntakeResult:
    mime: str
    page_count: int
    active_content: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def sniff_mime(data: bytes) -> str | None:
    head = data[:1024]
    if b"%PDF-" in head:
        return "application/pdf"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return None


def _scan_active(pdf: pikepdf.Pdf) -> list[dict]:
    found: dict[str, int] = {}
    for obj in pdf.objects:
        if isinstance(obj, pikepdf.Dictionary):
            for k in obj.keys():
                if k in ACTIVE_KEYS:
                    found[k] = found.get(k, 0) + 1
            if obj.get("/S") in ("/JavaScript", "/Launch", "/SubmitForm", "/ImportData"):
                found[str(obj.get("/S"))] = found.get(str(obj.get("/S")), 0) + 1
    out = []
    for k, n in found.items():
        # An OpenAction that only sets the initial view is benign; it is reported with its target type
        out.append({"key": k, "count": n, "meaning": ACTIVE_KEYS.get(k, k)})
    return out


def validate_upload(filename: str, data: bytes) -> IntakeResult:
    s = get_settings()
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        raise UploadRejected(f"file type {ext or '(none)'} not allowed; use PDF, JPEG or PNG")
    if len(data) == 0:
        raise UploadRejected("empty file")
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise UploadRejected(f"file exceeds {s.max_upload_mb} MB")
    mime = sniff_mime(data)
    if mime is None or mime != ALLOWED_EXT[ext]:
        raise UploadRejected(f"content does not match extension {ext} (detected {mime or 'unknown'})")

    if mime == "application/pdf":
        try:
            pdf = pikepdf.open(io.BytesIO(data))
        except pikepdf.PasswordError as e:
            raise UploadRejected("password-protected PDF cannot be scrutinised; upload an unprotected copy") from e
        except pikepdf.PdfError as e:
            raise UploadRejected(f"malformed PDF: {e}") from e
        with pdf:
            n = len(pdf.pages)
            if n == 0:
                raise UploadRejected("PDF has no pages")
            if n > s.max_pdf_pages:
                raise UploadRejected(f"PDF has {n} pages; limit is {s.max_pdf_pages}")
            active = [a for a in _scan_active(pdf) if a["key"] != "/OpenAction"]
            return IntakeResult(mime=mime, page_count=n, active_content=active)

    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
    except (Image.DecompressionBombError, OSError, SyntaxError) as e:
        raise UploadRejected(f"unreadable or unsafe image: {e}") from e
    return IntakeResult(mime=mime, page_count=1)
