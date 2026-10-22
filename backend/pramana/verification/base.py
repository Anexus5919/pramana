from dataclasses import dataclass, field
from typing import Any

# Verification statuses named in the problem statement, plus "not_checked"
VERIFIED = "verified"
MISMATCH = "mismatch_detected"
EXPIRED = "expired"
PENDING = "verification_pending"
SOURCE_UNAVAILABLE = "source_unavailable"
MANUAL_REVIEW = "manual_review_required"
NOT_CHECKED = "not_checked"

STATUSES = [VERIFIED, MISMATCH, EXPIRED, PENDING, SOURCE_UNAVAILABLE, MANUAL_REVIEW, NOT_CHECKED]


@dataclass
class Comparison:
    field: str
    submitted: Any
    authoritative: Any
    match: bool | None
    note: str | None = None

    def as_dict(self) -> dict:
        return {
            "field": self.field,
            "submitted": self.submitted,
            "authoritative": self.authoritative,
            "match": self.match,
            "note": self.note,
        }


@dataclass
class VerificationResult:
    channel: str
    status: str
    source_name: str
    simulated: bool
    detail: str
    request: dict[str, Any] = field(default_factory=dict)
    response: dict[str, Any] = field(default_factory=dict)
    comparisons: list[Comparison] = field(default_factory=list)
    # The verification claim that can legitimately be made from this result, in plain words
    claim: str | None = None
