"""Content Credentials (C2PA) in uploaded photos, read and validated with the open-source c2pa-python
library (MIT OR Apache-2.0).

What a valid manifest shows: the claim was signed by the holder of the signing certificate, and the file
still matches the hash it signed. Trust is checked against the Pramana DEMO capture CA only, which is
not a real trust list. Missing credentials prove nothing: most cameras and apps do not add them yet.
"""

import io
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import get_settings

log = logging.getLogger(__name__)

DEMO_CA_FILE = "c2pa-demo-capture-ca.pem"
DEMO_CA_NAME = "Pramana demo capture CA (not a real trust list)"
TRUST_LIST_LABEL = "Pramana DEMO capture trust list (not a real trust list)"
HASH_MATCH = ("assertion.dataHash.match", "assertion.bmffHash.match", "assertion.boxesHash.match")
HASH_MISMATCH = ("assertion.dataHash.mismatch", "assertion.bmffHash.mismatch", "assertion.boxesHash.mismatch")
SIG_FAIL = ("claimSignature.mismatch", "claimSignature.missing", "signingCredential.invalid",
            "signingCredential.revoked", "claimSignature.outsideValidity")


def demo_ca_path() -> Path:
    # Kept apart from trust/demo so the capture CA never becomes a PDF signature anchor
    return get_settings().trust_dir / "demo-c2pa" / DEMO_CA_FILE


@lru_cache
def _trust_pem() -> str | None:
    p = demo_ca_path()
    return p.read_text(encoding="ascii") if p.exists() else None


def _context():
    import c2pa

    settings: dict[str, Any] = {"verify": {"verify_trust": True, "remote_manifest_fetch": False, "ocsp_fetch": False}}
    pem = _trust_pem()
    if pem:
        settings["trust"] = {"trust_anchors": pem}
    return c2pa.Context.from_dict(settings)


def _versions() -> str:
    try:
        from importlib.metadata import version

        import c2pa

        return f"c2pa-python {version('c2pa-python')}, c2pa-rs {c2pa.sdk_version()}"
    except Exception:  # noqa: BLE001
        return "c2pa-python"


def _cert_info(cr: dict[str, Any], label: str) -> dict[str, Any]:
    m = next((x for x in cr.get("manifests", []) if x.get("label") == label), None) or {}
    ci = (m.get("signature") or {}).get("certificateInfo") or {}
    subj, iss, val = ci.get("subject") or {}, ci.get("issuer") or {}, ci.get("validity") or {}
    return {"common_name": subj.get("CN"), "organization": subj.get("O"), "issuer_common_name": iss.get("CN"),
            "issuer_organization": iss.get("O"), "serial": ci.get("serialNumber"),
            "not_before": val.get("notBefore"), "not_after": val.get("notAfter")}


def _actions(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for a in manifest.get("assertions", []):
        if not str(a.get("label", "")).startswith("c2pa.actions"):
            continue
        for act in (a.get("data") or {}).get("actions", []):
            out.append({"action": act.get("action"), "when": act.get("when"),
                        "software": (act.get("softwareAgent") or {}).get("name")
                        if isinstance(act.get("softwareAgent"), dict) else act.get("softwareAgent"),
                        "digital_source_type": str(act.get("digitalSourceType") or "").rsplit("/", 1)[-1] or None})
    return out


def read(data: bytes, mime: str) -> dict[str, Any]:
    """Manifest presence, signature, signer, trust (demo list), claim generator, capture time, actions and
    whether the file still matches its signed hash."""
    import c2pa

    out: dict[str, Any] = {"present": False, "library": _versions()}
    try:
        reader = c2pa.Reader.try_create(mime, io.BytesIO(data), None, _context())
    except c2pa.C2paError as e:
        # A manifest store is there but cannot be parsed or validated as a whole
        return {**out, "present": True, "readable": False, "error": str(e)[:300]}
    if reader is None:
        return out
    with reader:
        store = json.loads(reader.json())
        state = reader.get_validation_state()
        results = (reader.get_validation_results() or {}).get("activeManifest") or {}
        try:
            cr = json.loads(reader.crjson())
        except Exception:  # noqa: BLE001  crJSON only adds certificate detail
            cr = {}
    label = store.get("active_manifest")
    manifest = (store.get("manifests") or {}).get(label) or {}
    ok = {s.get("code") for s in results.get("success", [])}
    fail = [{"code": s.get("code"), "explanation": s.get("explanation")} for s in results.get("failure", [])]
    fail_codes = {f["code"] for f in fail}
    gen = manifest.get("claim_generator_info") or []
    gen_txt = ", ".join(f"{g.get('name')} {g.get('version') or ''}".strip() for g in gen if g.get("name")) or \
        manifest.get("claim_generator")
    actions = _actions(manifest)
    created = next((a for a in actions if a["action"] in ("c2pa.created", "c2pa.opened") and a.get("when")), None)
    sig = manifest.get("signature_info") or {}
    signer = {**_cert_info(cr, label), "algorithm": sig.get("alg")}
    signer["common_name"] = signer["common_name"] or sig.get("common_name")
    signer["organization"] = signer["organization"] or sig.get("issuer")
    trusted = "signingCredential.trusted" in ok
    hash_ok = True if ok & set(HASH_MATCH) and not fail_codes & set(HASH_MISMATCH) else (
        False if fail_codes & set(HASH_MISMATCH) else None)
    sig_ok = "claimSignature.validated" in ok and not fail_codes & set(SIG_FAIL)
    chain = [{"subject": signer.get("common_name"), "organization": signer.get("organization"), "role": "signer"}]
    if signer.get("issuer_common_name"):
        chain.append({"subject": signer["issuer_common_name"], "organization": signer.get("issuer_organization"),
                      "role": "trust anchor (DEMO)" if trusted else "issuer"})
    return {
        **out, "present": True, "readable": True, "state": state, "manifest_label": label,
        "title": manifest.get("title"), "claim_generator": gen_txt, "signature_valid": sig_ok,
        "trusted": trusted, "trust_list": TRUST_LIST_LABEL if _trust_pem() else None,
        "trust_note": "Trust is checked against a DEMO capture CA only; this is not the C2PA trust list.",
        "signer": signer, "chain": chain, "hash_matches": hash_ok,
        "capture_time": created["when"] if created else None, "actions": actions,
        "failures": fail, "untrusted": "signingCredential.untrusted" in fail_codes,
        "signed_time": sig.get("time"),
    }
