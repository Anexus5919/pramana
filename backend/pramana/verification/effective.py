"""A document's verification status as officials read it now.

A validation run stores each document's status in its summary: the record of what validation found, which also
feeds the report digest, so it is never rewritten. Officials can act afterwards: a manual confirmation records
the outcome of an offline check on one attempt, and an officer review records that an official examined a
document no outside source can confirm. The effective status is the stored one with those later records applied.
"""

from collections import namedtuple
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ValidationRun, VerificationAttempt
from . import base as vb

MANUAL = "manual_confirmation"
OFFICER_REVIEW = "officer_review"
# Attempts an official records after a run, as opposed to the channels a run checks
FOLLOW_UP_CHANNELS = (MANUAL, OFFICER_REVIEW)

_Check = namedtuple("_Check", "channel status")


def _when(v: VerificationAttempt):
    return v.completed_at or v.started_at


def later_records(db: Session, run: ValidationRun) -> list[VerificationAttempt]:
    """Manual confirmations and officer reviews recorded on this run after it finished, oldest first."""
    if run.finished_at is None:
        return []
    rows = db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id,
                                                        VerificationAttempt.channel.in_(FOLLOW_UP_CHANNELS))).all()
    return sorted((v for v in rows if _when(v) and _when(v) >= run.finished_at), key=_when)


def followed_ids(attempts: list[VerificationAttempt]) -> set[str]:
    """Ids of the attempts a manual confirmation has followed, so they no longer wait for one."""
    return {f for v in attempts if v.channel == MANUAL and isinstance(f := (v.request or {}).get("follows"), str)}


def effective_document_status(db: Session, run: ValidationRun | None) -> dict[str, str]:
    """Each document's status on a run: the stored status, with later confirmations and reviews applied.

    A manual confirmation stands in for the attempt it follows and the document's status is aggregated again
    the way validation does, so confirming one channel never hides a mismatch on another. An officer review
    applies only while the result is still not_checked, and it never reads as verified."""
    stored: dict[str, Any] = dict(((run.summary or {}) if run else {}).get("document_status") or {})
    if not stored or run is None:
        return stored
    later = later_records(db, run)
    if not later:
        return stored
    confirmed: dict[str, str] = {}
    reviewed: set[str] = set()
    for v in later:
        if v.channel == MANUAL and isinstance(f := (v.request or {}).get("follows"), str):
            confirmed[f] = v.status
        elif v.channel == OFFICER_REVIEW and v.document_id:
            reviewed.add(v.document_id)
    docs = {v.document_id for v in later if v.document_id in stored}
    own: dict[str, list[tuple[str, str, str]]] = {}
    if confirmed:
        for a in db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id,
                                                              VerificationAttempt.document_id.in_(docs))):
            if a.channel not in FOLLOW_UP_CHANNELS:
                own.setdefault(a.document_id, []).append((a.id, a.channel, a.status))
    out = dict(stored)
    for d in docs:
        status = stored[d]
        if any(i in confirmed for i, _, _ in own.get(d, [])):
            status = vb.document_status([_Check(c, confirmed.get(i, s)) for i, c, s in own[d]])
        if status == vb.NOT_CHECKED and d in reviewed:
            status = vb.OFFICER_REVIEWED
        out[d] = status
    return out
