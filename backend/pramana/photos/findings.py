"""Photo evidence in a validation run: Content Credentials results and room indicators against the
declaration.

- Valid credentials become a verification attempt (cryptographic, DEMO trust list), never a finding.
- Credentials that no longer match the file, or cannot be validated, become PH-C2PA-* findings.
- Missing credentials are normal today and produce nothing.
- Detector counts are compared with the declared facility for that photo and can only raise low-severity
  model indicators, worded so that a partial view of a room is never read as a shortfall.
"""

from typing import Any

from sqlalchemy.orm import Session

from ..crypto import sha256_hex
from ..models import Application, Document, ValidationRun, VerificationAttempt, utcnow
from ..verification import base as vb
from .credentials import DEMO_CA_NAME, TRUST_LIST_LABEL
from .detector import ROOM_LABEL

CHANNEL = "content_credentials"
# Fewer visible workstations than this share of the declared number raises an indicator
FEW_WORKSTATIONS_SHARE = 1 / 3
ROOM_TYPES = {"computer_lab", "classroom", "library"}


def _fp(*parts: Any) -> str:
    return sha256_hex("|".join(str(p) for p in parts).encode())


def declared_facilities(app: Application) -> dict[str, dict[str, Any]]:
    """Declared facilities keyed by the photo file name they point to."""
    out = {}
    for f in (app.declared or {}).get("facilities") or []:
        if isinstance(f, dict) and f.get("photo"):
            out[str(f["photo"])] = f
    return out


def credential_status(c: dict[str, Any]) -> tuple[str, str, str]:
    """(verification status, detail, claim) for a photo that carries a manifest."""
    signer = (c.get("signer") or {}).get("common_name") or "an unnamed signer"
    org = (c.get("signer") or {}).get("organization")
    who = f"{signer}{f' ({org})' if org else ''}"
    if not c.get("readable"):
        return (vb.MANUAL_REVIEW, f"Content Credentials are present but could not be read or validated: "
                f"{c.get('error') or 'unknown error'}.", "Nothing can be concluded from these credentials.")
    if not c.get("signature_valid"):
        return (vb.MISMATCH, f"The Content Credentials signature by {who} does not validate.",
                "The manifest cannot be relied on.")
    if c.get("hash_matches") is False:
        return (vb.MISMATCH, f"The Content Credentials signed by {who} are intact, but the image file no longer "
                "matches the hash they signed: the file was modified after capture.",
                "The signed manifest is authentic; the current pixels or metadata are not the ones it covered.")
    if not c.get("trusted"):
        return (vb.MANUAL_REVIEW, f"Content Credentials signed by {who} are intact and match the file, but the "
                "signer does not chain to the demo capture trust list.", "Integrity holds, signer identity unconfirmed.")
    when = f" Capture time stated in the manifest: {c['capture_time']}." if c.get("capture_time") else ""
    return (vb.VERIFIED, f"Content Credentials signed by {who} are intact, match the file and chain to the "
            f"{DEMO_CA_NAME}.{when} The trust list is a DEMO list, not a real one.",
            "The file is unchanged since the named capture device signed it (DEMO trust list).")


def photo_stage(db: Session, app: Application, run: ValidationRun, docs: list[Document],
                doc_status: dict[str, str]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    facilities = declared_facilities(app)
    for d in docs:
        if not d.mime.startswith("image/") or d.processing_status != "processed":
            continue
        ph = (d.analysis or {}).get("photo") or {}
        c = ph.get("c2pa") or {}
        if c.get("present"):
            status, detail, claim = credential_status(c)
            db.add(VerificationAttempt(
                application_id=app.id, document_id=d.id, run_id=run.id, channel=CHANNEL,
                source_name="Content Credentials (C2PA), DEMO capture trust list", simulated=True, status=status,
                request={"manifest": c.get("manifest_label"), "file": d.original_filename},
                response={"signer": (c.get("signer") or {}).get("common_name"), "trust_anchor": TRUST_LIST_LABEL,
                          "trusted": c.get("trusted"), "signature_valid": c.get("signature_valid"),
                          "hash_matches": c.get("hash_matches"), "claim_generator": c.get("claim_generator"),
                          "capture_time": c.get("capture_time"), "actions": c.get("actions", []),
                          "failures": c.get("failures", []), "evidence_class": "cryptographic",
                          "claim": claim, "note": c.get("trust_note")},
                detail=detail, actor="system", completed_at=utcnow()))
            doc_status[d.id] = status
            ev = [{"kind": "document", "document_id": d.id},
                  {"kind": "verification", "channel": CHANNEL, "source": "Content Credentials (C2PA)",
                   "simulated": True, "comparisons": []}]
            if not c.get("readable") or not c.get("signature_valid"):
                findings.append({
                    "code": "PH-C2PA-MANIFEST-INVALID", "fingerprint": _fp("c2pa", "invalid", d.original_filename),
                    "category": "forensic", "evidence_class": "structural", "severity": "medium",
                    "outcome": "indicator", "title": "Photo carries Content Credentials that could not be validated",
                    "message": f"'{d.original_filename}': {detail}",
                    "limitation": "A damaged manifest can come from a faulty tool as well as from editing. Ask for "
                                  "the original file from the capture device.",
                    "evidence": ev, "document_id": d.id})
            elif c.get("hash_matches") is False:
                findings.append({
                    "code": "PH-C2PA-MODIFIED-AFTER-SIGNING",
                    "fingerprint": _fp("c2pa", "modified", d.original_filename),
                    "category": "forensic", "evidence_class": "cryptographic", "severity": "medium",
                    "outcome": "indicator", "title": "Photo was modified after its Content Credentials were signed",
                    "message": f"'{d.original_filename}': {detail}",
                    "limitation": "Signer trust is checked against a DEMO list only. Any change after signing breaks "
                                  "the hash, including harmless metadata edits; compare with the original capture.",
                    "evidence": ev, "document_id": d.id})
        room = ph.get("room") or {}
        fac = facilities.get(d.original_filename)
        if fac and room.get("status") == "analysed":
            findings += _room_findings(d, room, fac)
    return findings


def _room_findings(d: Document, room: dict[str, Any], fac: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    name = fac.get("name") or "the declared facility"
    counts = room.get("counts", {})
    ws = counts.get("workstation", 0)
    trace = {"detector": {k: room.get(k) for k in ("model", "counts", "room_type", "room_basis", "latency_ms")},
             "declared_facility": fac}
    limitation = ("Object detector output (YOLOX, COCO classes) is a rough indicator: a photo may not show the "
                  "whole room, and furniture can be hidden or misread. Confirm during inspection.")
    want = fac.get("room_type")
    got = room.get("room_type")
    if want in ROOM_TYPES and got in ROOM_TYPES and got != want:
        out.append({
            "code": "PH-ROOM-TYPE-DIFFERS", "fingerprint": _fp("room", "type", d.original_filename),
            "category": "forensic", "evidence_class": "model", "severity": "low", "outcome": "indicator",
            "title": "Photo may not show the declared kind of room",
            "message": f"'{d.original_filename}' is declared as {name} ({ROOM_LABEL[want].lower()}). The visible "
                       f"objects ({room.get('room_basis')}) look more like a {ROOM_LABEL[got].lower()}. The photo may "
                       "show a different room or part of the facility.",
            "limitation": limitation, "trace": trace, "document_id": d.id,
            "evidence": [{"kind": "document", "document_id": d.id},
                         {"kind": "declared", "field": "facilities[].room_type", "label": f"{name}: room type",
                          "value": ROOM_LABEL[want]}]})
    try:
        declared_ws = int(fac.get("workstations") or 0)
    except (TypeError, ValueError):
        declared_ws = 0
    if want == "computer_lab" and declared_ws and ws < declared_ws * FEW_WORKSTATIONS_SHARE:
        out.append({
            "code": "PH-ROOM-FEW-WORKSTATIONS", "fingerprint": _fp("room", "ws", d.original_filename),
            "category": "forensic", "evidence_class": "model", "severity": "low", "outcome": "indicator",
            "title": "Fewer workstations visible than declared",
            "message": f"Counted {ws} visible workstation{'s' if ws != 1 else ''} in '{d.original_filename}'; the "
                       f"declaration lists {declared_ws} for {name}. A photo may not show the whole room.",
            "limitation": limitation, "trace": trace, "document_id": d.id,
            "evidence": [{"kind": "document", "document_id": d.id},
                         {"kind": "declared", "field": "facilities[].workstations", "label": f"{name}: workstations",
                          "value": declared_ws}]})
    return out
