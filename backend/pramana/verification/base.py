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
# Recorded by an official, never by a channel: an officer examined a document no outside source can confirm
OFFICER_REVIEWED = "officer_reviewed"
# Worst first: one document's status is the first of these that any of its checks reached
STATUS_ORDER = [MISMATCH, EXPIRED, SOURCE_UNAVAILABLE, MANUAL_REVIEW, PENDING, VERIFIED, NOT_CHECKED]
# Channels whose words are not their code with spaces
CHANNEL_WORDS = {"signed_qr": "signed QR"}


def channel_label(channel: str) -> str:
    """A verification channel in words: 'issuer signature', 'signed QR'."""
    return CHANNEL_WORDS.get(channel, channel.replace("_", " "))


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


def document_status(results) -> str:
    """Authenticity status of a document; the applicant's own signature only counts when it is broken.

    results: anything with .channel and .status, so validation results and stored attempts aggregate alike."""
    statuses = [r.status for r in results if r.channel != "applicant_signature" or r.status == MISMATCH]
    real = [s for s in statuses if s != NOT_CHECKED]
    if not real:
        return NOT_CHECKED
    for s in STATUS_ORDER:
        if s in real:
            return s
    return NOT_CHECKED
