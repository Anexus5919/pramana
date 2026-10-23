"""Issuer documents that arrive without the issuer's own signature, or only as an image.

The ruleset names the documents an issuing authority signs (`verification.issuer_signers`): the fire NOC and
the occupancy certificate. A copy of one without that signature, with only the applicant's own signature, or
as a photo, scan or print of the page cannot show that its content is the issuer's. Editing a certificate in
Word or LibreOffice, or printing it to PDF, produces exactly such a copy. These are indicators for review: the
remedy is the issuer's original, and the issuer registry and signed QR still decide what the values should be.
"""

from typing import Any

from ..forensics.pdf_struct import editors_named
from . import base as vb

STATUS_WORDS = {vb.VERIFIED: "verified", vb.MISMATCH: "mismatch detected", vb.EXPIRED: "expired",
                vb.PENDING: "pending", vb.SOURCE_UNAVAILABLE: "source unavailable",
                vb.MANUAL_REVIEW: "manual review", vb.NOT_CHECKED: "not checked"}


def editor_named(info: dict[str, Any]) -> str | None:
    """The Producer or Creator, when it names a desktop editor, converter or online PDF tool."""
    for key in ("Producer", "Creator"):
        v = str(info.get(key) or "")
        if v and editors_named(v):
            return v
    return None


def is_image_only(doc: Any) -> bool:
    """A photo or scan, or a PDF with no fonts at all whose pages had to be read by OCR."""
    if doc.mime.startswith("image/"):
        return True
    facts = (doc.analysis or {}).get("forensic_facts") or {}
    fonts = (facts.get("metadata") or {}).get("fonts")
    return doc.mime == "application/pdf" and fonts == [] and doc.text_source in ("ocr", "unreadable", "mixed")


def _checked(results: list[vb.VerificationResult], ocr: bool) -> str:
    qr = [r for r in results if r.channel == "signed_qr"]
    reg = [r for r in results if r.channel == "issuer_registry"]
    parts = []
    if qr:
        parts.append(f"the issuer-signed QR ({STATUS_WORDS.get(qr[0].status, qr[0].status)})")
    if reg:
        parts.append(f"the issuer registry ({STATUS_WORDS.get(reg[0].status, reg[0].status)})")
    how = "read by OCR and " if ocr else ""
    if not parts:
        return f"Its values were {how}not compared with any issuer source."
    return f"Its values were {how}compared with " + " and ".join(parts) + "."


def findings(doc: Any, spec: dict[str, Any], results: list[vb.VerificationResult], fp) -> list[dict[str, Any]]:
    """Indicators for an issuer-signed document type that carries no issuer signature."""
    vspec = spec.get("verification") or {}
    signers = vspec.get("issuer_signers") or []
    if not signers or doc.processing_status != "processed":
        return []
    if any(r.channel == "issuer_signature" and r.status != vb.NOT_CHECKED for r in results):
        return []  # an issuer signature is present; whether it holds is reported by the signature check
    label = spec.get("label", doc.declared_type)
    applicant = [r for r in results if r.channel == "applicant_signature" and r.status != vb.NOT_CHECKED]
    info = (((doc.analysis or {}).get("forensic_facts") or {}).get("metadata") or {}).get("info") or {}
    editor = editor_named(info)
    expected = f"The {label} is issued as a PDF signed by the issuing authority ({', '.join(signers)})"
    evidence = [{"kind": "document", "document_id": doc.id},
                *[{"kind": "verification", "channel": r.channel, "source": r.source_name, "simulated": r.simulated,
                   "comparisons": [c.as_dict() for c in r.comparisons]}
                  for r in results if r.channel in ("signed_qr", "issuer_registry")]]
    if is_image_only(doc):
        what = "a photo or scanned image" if doc.mime.startswith("image/") else "an image-only PDF, as a scan or a " \
                                                                                 "print to PDF produces"
        message = (f"{expected}, but this copy arrived as {what}: it has no text layer and no issuer signature. "
                   + (f"Its metadata names '{editor}'. " if editor else "")
                   + _checked(results, doc.text_source == "ocr" or doc.mime.startswith("image/"))
                   + " The file may have been re-created or edited before it was imaged; ask for the issuer's "
                     "original.")
        return [{"code": "FX-IMAGE-ONLY-ISSUER-DOC", "fingerprint": fp("copy", doc.declared_type, "image"),
                 "category": "forensic", "evidence_class": "structural", "severity": "medium",
                 "outcome": "indicator", "title": f"{label}: image-only copy of a signed document",
                 "message": message,
                 "limitation": "An issuer may hand out a scanned copy, and a photo of the issued paper certificate "
                               "looks the same. Image-only copies cannot carry a signature, so only the registry, "
                               "the signed QR or the original can confirm the values.",
                 "evidence": evidence, "document_id": doc.id}]
    if applicant:
        who = f"only the applicant's own signature ({applicant[0].response.get('signer', 'applicant')})"
    else:
        who = "no signature at all"
    message = (f"{expected}, but this file carries {who}. "
               + (f"Its metadata names '{editor}', a desktop editor or converter, as the program that wrote it. "
                  if editor else "")
               + "No issuer signature: the file may have been re-created; ask for the issuer's original. "
               + _checked(results, False))
    return [{"code": "VER-ISSUER-SIGNATURE-ABSENT", "fingerprint": fp("copy", doc.declared_type, "unsigned"),
             "category": "verification", "evidence_class": "structural", "severity": "medium",
             "outcome": "indicator", "title": f"{label}: no issuer signature",
             "message": message,
             "limitation": "Some issuers still send unsigned PDFs, and saving a signed file in another program "
                           "drops the signature without changing content. Confirm the values with the issuer.",
             "evidence": evidence, "document_id": doc.id}]
