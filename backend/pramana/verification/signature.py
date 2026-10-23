"""PAdES/CMS signature validation with pyHanko against configured trust anchors.

A valid result proves that the signed bytes are unchanged since signing and that the signing
certificate chains to a configured anchor. It says nothing about whether the signer was entitled to
issue the document; that needs the issuer registry or a human.
"""

import io
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from asn1crypto import pem, x509
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.errors import SignatureValidationError
from pyhanko_certvalidator import ValidationContext

from ..config import get_settings
from .base import MANUAL_REVIEW, MISMATCH, NOT_CHECKED, VERIFIED, VerificationResult

log = logging.getLogger(__name__)


@dataclass
class Anchor:
    cert: x509.Certificate
    label: str
    demo: bool


def _load_certs(path: Path) -> list[x509.Certificate]:
    data = path.read_bytes()
    if pem.detect(data):
        return [x509.Certificate.load(der) for _, _, der in pem.unarmor(data, multiple=True)]
    return [x509.Certificate.load(data)]


@lru_cache
def trust_anchors() -> tuple[Anchor, ...]:
    """India PKI roots live in trust/india-pki; prototype-only roots in trust/demo."""
    base = get_settings().trust_dir
    out: list[Anchor] = []
    for sub, label, demo in (("india-pki", "India PKI (CCA)", False), ("demo", "DEMO anchor (prototype only)", True)):
        d = base / sub
        if not d.exists():
            continue
        for f in sorted(d.iterdir()):
            if f.suffix.lower() in (".pem", ".cer", ".crt", ".der"):
                try:
                    for c in _load_certs(f):
                        out.append(Anchor(c, f"{label}: {c.subject.human_friendly}", demo))
                except ValueError as e:
                    log.warning("skipping unreadable trust anchor %s: %s", f, e)
    return tuple(out)


def _anchor_for(chain_root: x509.Certificate | None) -> Anchor | None:
    if chain_root is None:
        return None
    for a in trust_anchors():
        if a.cert.sha256 == chain_root.sha256:
            return a
    return None


def _display_name(cert: x509.Certificate) -> str:
    """Name and organisation only; India PKI subjects also carry hashed PAN and phone fields."""
    n = cert.subject.native
    parts = [n.get("common_name"), n.get("organization_name")]
    ou = n.get("organizational_unit_name")
    if isinstance(ou, list):
        ou = ou[0] if ou else None
    if ou:
        parts.append(ou)
    return ", ".join(str(p) for p in parts if p) or cert.subject.human_friendly


def has_signatures(data: bytes) -> bool:
    try:
        return bool(PdfFileReader(io.BytesIO(data), strict=False).embedded_signatures)
    except Exception:  # noqa: BLE001  malformed PDFs are reported elsewhere
        return False


def validate_signatures(data: bytes) -> list[VerificationResult]:
    try:
        reader = PdfFileReader(io.BytesIO(data), strict=False)
        sigs = reader.embedded_signatures
    except Exception as e:  # noqa: BLE001
        return [VerificationResult("pdf_signature", MANUAL_REVIEW, "pyHanko", False, f"could not parse PDF: {e}")]
    if not sigs:
        return [
            VerificationResult(
                "pdf_signature",
                NOT_CHECKED,
                "Embedded signature",
                False,
                "No embedded digital signature. A visible signature or seal image is not a cryptographic signature.",
            )
        ]
    anchors = trust_anchors()
    fetch = get_settings().pki_fetch_revocation
    results = []
    for sig in sigs:
        name = sig.field_name
        # Most Indian DSC PDFs carry no trusted timestamp, so validate at the signer-reported time (CCA
        # guidance judges a signature at the time it was applied) and say that this time is self-asserted.
        moment = getattr(sig, "self_reported_timestamp", None)
        vc = ValidationContext(trust_roots=[a.cert for a in anchors], allow_fetching=fetch,
                               revocation_mode="soft-fail", moment=moment, retroactive_revinfo=True)
        try:
            st = validate_pdf_signature(sig, signer_validation_context=vc)
        except (SignatureValidationError, ValueError) as e:
            results.append(VerificationResult("pdf_signature", MISMATCH, "pyHanko", False, f"{name}: {e}"))
            continue
        cert = st.signing_cert
        signer = _display_name(cert) if cert else "unknown"
        root = None
        try:
            path = st.validation_path
            root = path.trust_anchor.authority.certificate if path and hasattr(path.trust_anchor, "authority") else None
        except AttributeError:
            root = None
        anchor = _anchor_for(root)
        # Say exactly what revocation evidence was obtained: soft-fail mode would otherwise read as checked
        ocsp, crl = (len(vc.ocsps), len(vc.crls)) if fetch else (0, 0)
        rev_checked = fetch and (ocsp + crl) > 0
        rev_note = (f" Revocation checked online: {ocsp} OCSP and {crl} CRL responses, not revoked." if rev_checked
                    else " Revocation status could not be fetched (no OCSP or CRL response), so it was not checked."
                    if fetch else " Revocation status was not fetched (offline mode).")
        mod = str(st.modification_level.name) if st.modification_level is not None else "UNKNOWN"
        cov = str(st.coverage.name) if st.coverage is not None else "UNKNOWN"
        resp = {
            "field": name,
            "signer": signer,
            "intact": st.intact,
            "valid": st.valid,
            "trusted": st.trusted,
            "revoked": st.revoked,
            "coverage": cov,
            "modification_level": mod,
            "signing_time": st.signer_reported_dt.isoformat() if st.signer_reported_dt else None,
            "trust_anchor": anchor.label if anchor else None,
            "demo_anchor": anchor.demo if anchor else None,
            "docmdp_ok": st.docmdp_ok,
            "validated_at": moment.isoformat() if moment else "now",
            "time_source": "timestamp token" if st.timestamp_validity else
            ("signer-reported (self-asserted)" if moment else "validation time"),
            "revocation_checked": rev_checked,
            "revocation_fetching": fetch,
            "revocation_responses": {"ocsp": ocsp, "crl": crl},
        }
        src = "pyHanko PAdES validation"
        if not st.intact or not st.valid:
            results.append(VerificationResult(
                "pdf_signature", MISMATCH, src, False,
                f"Signature '{name}' by {signer} does not match the signed bytes; content changed or signature corrupt.",
                response=resp, claim="Cryptographic check failed: the signed content was altered.",
            ))
        elif st.revoked:
            results.append(VerificationResult(
                "pdf_signature", MISMATCH, src, False, f"Signer certificate for '{name}' is revoked.", response=resp,
            ))
        elif cov != "ENTIRE_FILE" and mod not in ("NONE", "LTA_UPDATES"):
            results.append(VerificationResult(
                "pdf_signature", MISMATCH, src, False,
                f"Signature '{name}' is valid for the revision it signed, but the file was modified after signing "
                f"(modification level {mod}). The later revision is not covered by the signature.",
                response=resp,
                claim="The signed revision is authentic; content added after signing is not.",
            ))
        elif not st.trusted:
            results.append(VerificationResult(
                "pdf_signature", MANUAL_REVIEW, src, False,
                f"Signature '{name}' is mathematically valid but {signer} does not chain to a configured trust anchor.",
                response=resp,
                claim="Integrity holds, signer identity unconfirmed.",
            ))
        else:
            demo = bool(anchor and anchor.demo)
            results.append(VerificationResult(
                "pdf_signature", VERIFIED, src, demo,
                f"Signature '{name}' by {signer} is intact and chains to {anchor.label if anchor else 'a trust anchor'}."
                + (" This anchor is a prototype DEMO root, not India PKI." if demo else "")
                + rev_note,
                response=resp,
                claim="Document bytes are unchanged since signing by the named certificate holder.",
            ))
    return results
