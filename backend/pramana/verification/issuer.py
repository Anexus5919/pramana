"""Issuer verification adapters.

Each adapter answers one question: does the issuing authority hold a record matching what was
submitted? New authorized integrations implement `IssuerAdapter` and register in `ADAPTERS`; the rest
of the system only sees `VerificationResult`.
"""

import re
from datetime import date
from typing import Any, Protocol

from rapidfuzz import fuzz

from ..sim import issuers as sim
from .base import EXPIRED, MANUAL_REVIEW, MISMATCH, PENDING, SOURCE_UNAVAILABLE, VERIFIED, Comparison, VerificationResult


def norm_text(v: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(v).lower())


def compare_values(field: str, submitted: Any, authoritative: Any) -> Comparison:
    if submitted is None:
        return Comparison(field, None, authoritative, None, "not found in submitted document")
    if isinstance(authoritative, date) or re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(authoritative)):
        ok = str(submitted)[:10] == str(authoritative)[:10]
        return Comparison(field, submitted, authoritative, ok)
    a, b = norm_text(submitted), norm_text(authoritative)
    if a == b:
        return Comparison(field, submitted, authoritative, True)
    score = fuzz.token_sort_ratio(str(submitted).lower(), str(authoritative).lower())
    if score >= 92:
        return Comparison(field, submitted, authoritative, True, f"minor formatting difference (similarity {score:.0f})")
    return Comparison(field, submitted, authoritative, False, f"similarity {score:.0f}")


class IssuerAdapter(Protocol):
    code: str
    name: str
    simulated: bool

    def verify(self, ref_no: str, submitted: dict[str, Any], as_of: date) -> VerificationResult: ...


class SimulatedRegistryAdapter:
    simulated = True

    def __init__(self, code: str, name: str, compare_fields: list[str]):
        self.code, self.name, self.compare_fields = code, name, compare_fields

    def verify(self, ref_no: str, submitted: dict[str, Any], as_of: date) -> VerificationResult:
        req = {"issuer": self.code, "ref_no": ref_no}
        try:
            resp = sim.lookup(self.code, ref_no)
        except sim.SourceUnavailable as e:
            return VerificationResult(
                "issuer_registry", SOURCE_UNAVAILABLE, self.name, True,
                f"{e}. Routed to the verification cell for manual confirmation.", req,
                {"simulated": True, "error": str(e)},
            )
        if resp.get("mode") == "async":
            return VerificationResult(
                "issuer_registry", PENDING, self.name, True,
                "Request lodged with the issuer; this authority confirms asynchronously. Awaiting response.",
                req, resp,
            )
        if not resp["found"]:
            return VerificationResult(
                "issuer_registry", MISMATCH, self.name, True,
                f"The issuer has no record of reference number '{ref_no}'.", req, resp,
                claim="Issuer registry (simulated) does not recognise this reference number.",
            )
        rec = resp["record"]
        comps = [compare_values(f, submitted.get(f), rec["fields"].get(f)) for f in self.compare_fields
                 if f in rec["fields"]]
        if rec.get("status") in ("revoked", "cancelled", "suspended"):
            return VerificationResult(
                "issuer_registry", MISMATCH, self.name, True,
                f"The issuer reports this document as {rec['status']}.", req, resp, comps,
            )
        bad = [c for c in comps if c.match is False]
        if bad:
            return VerificationResult(
                "issuer_registry", MISMATCH, self.name, True,
                "Issuer record differs from the submitted document: "
                + "; ".join(f"{c.field} submitted '{c.submitted}' vs issuer '{c.authoritative}'" for c in bad),
                req, resp, comps,
            )
        valid_until = rec["fields"].get("valid_until")
        if valid_until and date.fromisoformat(valid_until) < as_of:
            return VerificationResult(
                "issuer_registry", EXPIRED, self.name, True,
                f"Issuer record matches but validity ended on {valid_until}.", req, resp, comps,
            )
        unknown = [c for c in comps if c.match is None]
        if unknown:
            return VerificationResult(
                "issuer_registry", MANUAL_REVIEW, self.name, True,
                "Issuer record found but some fields could not be read from the document: "
                + ", ".join(c.field for c in unknown), req, resp, comps,
            )
        return VerificationResult(
            "issuer_registry", VERIFIED, self.name, True,
            f"Reference '{ref_no}' and {len(comps)} fields match the issuer record.", req, resp, comps,
            claim="Matches the simulated issuer registry. Not a real-world confirmation.",
        )


def adapters() -> dict[str, SimulatedRegistryAdapter]:
    out = {}
    for i in sim.list_issuers():
        out[i["code"]] = SimulatedRegistryAdapter(i["code"], i["name"], i.get("compare_fields", []))
    return out
