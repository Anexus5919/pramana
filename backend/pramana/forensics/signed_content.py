"""Cover-and-overwrite patterns that were already there when the document was signed.

Templates fill their placeholders the way an edit would: the e-Gazette masthead prints 'xxxGIDHxxx', paints an
image strip over it and prints the registration number on top. In a file whose signature covers every byte,
so nothing was added after signing, such a pattern is the signer's own content. It is reported as
information, not as an indicator of a later edit. A pattern in content added after the signature, or in a file
signed only by the applicant, keeps its severity.
"""

from typing import Any

AT_SIGNING = ("FX-PDF-OVERLAID-TEXT", "FX-PDF-WHITEOUT")


def signer_of_whole_file(results: list[Any]) -> str | None:
    """The signer whose intact, trusted signature covers the whole file, when that is not the applicant.

    The issuing authority counts; so does a signer the document type does not name, but only under the India
    PKI roots, never under a DEMO anchor. Who that signer is remains the signature check's finding."""
    for r in results:
        resp = r.response or {}
        if r.channel != "issuer_signature" or resp.get("coverage") != "ENTIRE_FILE" or resp.get("revoked"):
            continue
        if not (resp.get("intact") and resp.get("valid") and resp.get("trusted")):
            continue
        role = resp.get("signer_role")
        if role == "issuer" or (role == "unknown" and resp.get("demo_anchor") is False):
            return resp.get("signer") or r.source_name
    return None


def at_signing(code: str, signer: str | None, finding: dict[str, Any]) -> dict[str, Any]:
    """The finding as information when its pattern lies in content the whole-file signature covers."""
    if code not in AT_SIGNING or not signer:
        return finding
    return {**finding, "severity": "info",
            "title": f"{finding['title']}, present when the document was signed",
            "message": f"{finding['message']} The signature of {signer} covers the whole file and nothing was "
                       "added after it, so this was present when the document was signed, not added later. "
                       "Templates fill placeholders this way.",
            "limitation": "This shows the content predates the signature, not that the signer was entitled to "
                          "issue the document; the signature check reports who signed."}
