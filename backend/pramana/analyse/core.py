"""Everything Pramana can determine about one file without an application.

The file goes through process_document, the function a validation run uses, so intake, text and OCR
(including Devanagari), classification, fields, fingerprints, forensics and QR decoding are the same as for
an application document, including any check added there later. Signatures, signed QR codes, the
SIMULATED issuer registry and the revision time machine come from the verification and history modules.
Rules, cross-application links and declared values need an application, so they are not run.
"""

import logging
import time
from collections.abc import Callable
from datetime import UTC, date, datetime
from typing import Any

from .. import sandbox
from .. import serializers as ser
from ..crypto import sha256_hex
from ..forensics.pdf_struct import revision_offsets
from ..history.revisions import describe
from ..insights.story import build_story, pramana_event
from ..models import Document, Institution
from ..photos.findings import credential_status
from ..pipeline.intake import IntakeResult
from ..pipeline.process import process_document
from ..pipeline.validate import _qr_compare, _signer_role
from ..rules.engine import active_ruleset
from ..verification import base as vb
from ..verification.issuer import adapters
from ..verification.signature import validate_signatures
from ..verification.signed_qr import verify_token

CANNOT_KNOW = [
    {"what": "Rules", "why": "The handbook rules compare documents with each other and with what the institution "
                             "declared. A single file has neither, so no rule is evaluated and nothing here is a "
                             "compliance outcome."},
    {"what": "Declared values", "why": "Whether the printed values match the application form needs the form."},
    {"what": "Cross-application links", "why": "Shared certificate numbers, reused seals and photos, and file hashes "
                                               "seen in other applications are found only when the file is part of "
                                               "an application."},
    {"what": "Who the applicant is", "why": "Without an application Pramana cannot tell an institution's own DSC from "
                                            "an issuer's, so a signature is shown with what the certificate says."},
    {"what": "Campus distance", "why": "A photo's geotag is shown as recorded; distance from the campus needs the "
                                       "campus on record."},
]

log = logging.getLogger(__name__)


class _NoSession:
    """process_document flushes its session; an analysed file belongs to none, so there is nothing to flush."""

    def flush(self) -> None:
        pass


def _result(r: vb.VerificationResult) -> dict[str, Any]:
    return {"channel": r.channel, "status": r.status, "source_name": r.source_name, "simulated": r.simulated,
            "detail": r.detail, "claim": r.claim, "request": r.request, "response": r.response,
            "comparisons": [c.as_dict() for c in r.comparisons]}


def _signatures(data: bytes, vspec: dict[str, Any]) -> list[vb.VerificationResult]:
    """Cryptographic results as validate_signatures reports them; the expected issuer is named when the type has one."""
    results = validate_signatures(data)
    expected = vspec.get("issuer_signers") or []
    if expected:
        nobody = Institution(name="", society_name=None, attributes={})
        for r in results:
            if r.status != vb.NOT_CHECKED:
                role = _signer_role(r.response.get("signer", ""), vspec, nobody)
                r.response["signer_role"] = role
                r.response["expected_signers"] = expected
    return results


def _qr(doc: Document, vspec: dict[str, Any], today: date) -> list[dict[str, Any]]:
    out = []
    for tok in (doc.analysis or {}).get("qr", []):
        item: dict[str, Any] = {"page": tok["page"], "bbox": tok["bbox"], "length": len(tok["text"])}
        chk = verify_token(tok["text"])
        if chk.payload is None and not chk.ok:
            # Not a signed token, for example a link; shown as text only, never followed
            out.append({**item, "signed": False, "status": vb.NOT_CHECKED, "text": tok["text"][:300],
                        "detail": "This QR code does not carry a signed token, so there is nothing to verify."})
            continue
        item.update(signed=True, kid=chk.kid, payload=chk.payload,
                    issuer=chk.issuer["issuer"] if chk.issuer else None,
                    simulated=bool(chk.issuer.get("simulated")) if chk.issuer else True)
        if not chk.ok:
            item.update(status=vb.MANUAL_REVIEW if chk.issuer is None else vb.MISMATCH, comparisons=[],
                        detail=f"QR token on page {tok['page']}: {chk.error}.")
            out.append(item)
            continue
        mapping = vspec.get("qr_fields", {})
        comps = _qr_compare(doc, chk.payload, mapping)
        bad = [c for c in comps if c.match is False]
        to = chk.payload.get("valid_until")
        if bad:
            status, detail = vb.MISMATCH, ("The issuer-signed QR verifies, but its signed values disagree with the "
                                           "printed text: " + "; ".join(f"{c.field} printed '{c.submitted}' vs "
                                                                         f"signed '{c.authoritative}'" for c in bad))
        elif to and date.fromisoformat(to) < today:
            status, detail = vb.EXPIRED, f"Signed QR verifies; the validity it certifies ended {to}."
        elif not mapping:
            status, detail = vb.VERIFIED, (f"Signed QR from {chk.issuer['issuer']} verifies. The document type was not "
                                           "recognised, so its signed values were not compared with the printed text.")
        else:
            status, detail = vb.VERIFIED, (f"Signed QR from {chk.issuer['issuer']} verifies and matches "
                                           f"{len(comps)} printed fields.")
        item.update(status=status, detail=detail, comparisons=[c.as_dict() for c in comps],
                    claim="Signature over the QR payload verified with the issuer's published key.")
        out.append(item)
    return out


def _registry(doc_type: str | None, vspec: dict[str, Any], fields: dict[str, Any], today: date) -> dict[str, Any]:
    code = vspec.get("issuer")
    if not code:
        return {"queried": False, "reason": "The document type was not recognised, so no issuer registry applies."
                if not doc_type else "No issuer registry is configured for this document type."}
    adapter = adapters().get(code)
    ref_field = vspec.get("ref_field")
    ref = fields.get(ref_field)
    if adapter is None:
        return {"queried": False, "issuer_code": code, "simulated": True,
                "reason": "No adapter is configured for this issuer."}
    if not ref:
        return {"queried": False, "issuer_code": code, "issuer": adapter.name, "simulated": True, "ref_field": ref_field,
                "reason": f"The reference number ({ref_field}) could not be read, so the issuer was not queried."}
    return {"queried": True, "issuer_code": code, "issuer": adapter.name, "simulated": True, "ref_field": ref_field,
            "ref_no": ref, "result": _result(adapter.verify(ref, fields, today))}


def _photo(doc: Document) -> dict[str, Any]:
    an = doc.analysis or {}
    meta = an.get("forensic_facts") or {}
    ph = an.get("photo") or {}
    c2pa = ph.get("c2pa") or {"present": None}
    cred = None
    if c2pa.get("present"):
        status, detail, claim = credential_status(c2pa)
        cred = {"status": status, "detail": detail, "claim": claim}
    return {
        "width": meta.get("width"), "height": meta.get("height"),
        "exif": {"captured": meta.get("DateTimeOriginal") or meta.get("DateTime"),
                 "captured_original": meta.get("DateTimeOriginal"),
                 "camera": " ".join(x for x in (meta.get("Make"), meta.get("Model")) if x) or None,
                 "software": meta.get("Software"), "gps": meta.get("gps")},
        "attribution": ph.get("exif_text") or None, "c2pa": c2pa, "c2pa_status": cred,
        "room": ph.get("room") or {"status": "not_analysed", "reason": "The photo was not analysed."},
    }


def _timed(steps: list[dict[str, Any]], name: str, fn: Callable[[], Any]) -> Any:
    t0 = time.perf_counter()
    out = fn()
    steps.append({"step": name, "ms": round((time.perf_counter() - t0) * 1000)})
    return out


def analyse(data: bytes, filename: str, intake: IntakeResult, token: str) -> dict[str, Any]:
    """Run the per-document stages on `data`. Raises sandbox.SandboxError when the file cannot be read safely;
    when only the time limit was reached, the result says so in `incomplete` and carries what did run."""
    steps: list[dict[str, Any]] = []

    def progress(_event: str, **info: Any) -> None:
        steps.append({"step": info.pop("step"), "ms": info.pop("ms"),
                      **{k: v for k, v in info.items() if k not in ("document_id", "declared_type")}})

    sha = sha256_hex(data)
    doc = Document(id=token, application_id=None, round=1, declared_type="", original_filename=filename,
                   sha256=sha, size_bytes=len(data), mime=intake.mime, page_count=intake.page_count,
                   storage_name="", classification={}, fingerprints={}, analysis={})
    rs = active_ruleset()
    incomplete = None
    try:
        process_document(_NoSession(), doc, rs, None, progress=progress, data=data)
    except sandbox.SandboxUnsafe as e:
        # A long OCR job can outlast the sandbox's time limit; signatures and revisions are still worth showing.
        # A crash or the memory cap stops the analysis, as it stops a validation run
        if "time limit" not in str(e):
            raise
        incomplete = {"reason": str(e), "after": steps[-1]["step"] if steps else None}
    for i, f in enumerate(doc.fields, start=1):
        f.id = f.id or f"{token}-f{i}"  # column defaults apply only on insert, and nothing is inserted
    pdf = intake.mime == "application/pdf"
    spec = rs.doc_types.get(doc.detected_type or "", {})
    vspec = spec.get("verification") or {}
    fields = {f.name: f.value for f in doc.fields}
    today = date.today()

    sigs = _timed(steps, "signatures", lambda: _signatures(data, vspec)) if pdf else []
    qr = _timed(steps, "signed_qr", lambda: _qr(doc, vspec, today))
    registry = _timed(steps, "registry", lambda: _registry(doc.detected_type, vspec, fields, today))
    revisions = None
    if pdf:
        revisions = _timed(steps, "revisions", lambda: describe(doc, data, []))
        by_field = {r.response.get("field"): r for r in sigs if r.response.get("field")}
        for s in revisions["signatures"]:
            r = by_field.get(s["field"])
            if r:
                s.update(status=r.status, detail=r.detail, simulated=r.simulated,
                         role=r.response.get("signer_role", "unknown"))

    out = ser.document(doc, detail=True)
    an = doc.analysis or {}
    story = _story(doc, data, out, revisions, sigs, vspec, steps)
    facts = an.get("forensic_facts") or {}
    ocr = an.get("ocr_scripts") or []
    labels = {k: v.get("label", k) for k, v in rs.doc_types.items()}
    return {
        "token": token, "incomplete": incomplete, "filename": filename, "sha256": sha, "size_bytes": len(data), "mime": intake.mime,
        "page_count": intake.page_count, "ruleset": {"id": rs.id, "version": rs.version},
        "intake": {"mime": intake.mime, "page_count": intake.page_count, "active_content": intake.active_content,
                   "notes": intake.notes},
        "steps": steps,
        "document": {**out, "application_id": None},
        "doc_type": {"type": doc.detected_type, "label": labels.get(doc.detected_type or ""),
                     "classification": doc.classification, "labels": labels},
        "text": {"source": doc.text_source, "unreadable_pages": an.get("unreadable_pages", []),
                 "hindi_pages": len(ocr), "hindi_lines": sum(int(n.get("lines_devanagari") or 0) for n in ocr)},
        "signatures": [_result(r) for r in sigs],
        "qr": qr,
        "registry": registry,
        "revisions": revisions,
        "revision_count": (len(revision_offsets(data)) or 1) if pdf else None,
        "metadata": (facts.get("metadata") or {}).get("info", {}) if pdf else {},
        "seal_images": (doc.fingerprints or {}).get("images", []) if pdf else [],
        "photo": None if pdf else _photo(doc),
        "cannot_know": CANNOT_KNOW,
        "story": story,
    }


def _story(doc: Document, data: bytes, out: dict[str, Any], revisions: dict[str, Any] | None,
           sigs: list[vb.VerificationResult], vspec: dict[str, Any], steps: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The life story from the in-memory analysis; a failure here never costs the rest of the report."""
    an = doc.analysis or {}
    src = {"digital": "the text layer", "ocr": "OCR", "mixed": "the text layer and OCR"}.get(doc.text_source or "",
                                                                                             "the pipeline")
    ms = sum(int(s.get("ms") or 0) for s in steps)
    own = [pramana_event("analysed", "Analysed here", f"Read with {src} and checked on this page in {ms / 1000:.1f} s. "
                         "Not filed: the bytes are released when you forget the file.", datetime.now(UTC))]
    try:
        return build_story(mime=doc.mime, data=data, fields=out["fields"], pages=out["pages"],
                           facts=an.get("forensic_facts") or {}, photo=an.get("photo") or {}, revisions=revisions,
                           signatures=[r.response for r in sigs], own=own,
                           issuer_doc=bool(vspec.get("issuer") or vspec.get("issuer_signers")))
    except Exception:  # noqa: BLE001
        log.exception("life story failed for an analysed file")
        return None
