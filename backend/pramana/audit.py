"""Hash-chained audit trail with signed checkpoints.

Every event commits to the previous event's hash, so editing or deleting a row breaks the chain from
that point on. Checkpoints sign the chain head with Ed25519 so truncating the tail is also detectable.
"""

import base64
from datetime import UTC
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .crypto import audit_signing_key, canonical_json, public_key_b64, sha256_hex
from .models import AuditCheckpoint, AuditEvent, utcnow

GENESIS = "0" * 64


def _event_body(e: AuditEvent) -> dict[str, Any]:
    ts = e.ts if e.ts.tzinfo else e.ts.replace(tzinfo=UTC)
    return {
        "seq": e.seq,
        "ts": ts.isoformat(),
        "actor": e.actor,
        "actor_role": e.actor_role,
        "action": e.action,
        "object_type": e.object_type,
        "object_id": e.object_id,
        "application_id": e.application_id,
        "details": e.details,
    }


def _hash(prev_hash: str, body: dict[str, Any]) -> str:
    return sha256_hex(prev_hash.encode() + canonical_json(body))


def record(
    db: Session,
    *,
    actor: str,
    actor_role: str,
    action: str,
    object_type: str,
    object_id: str | None = None,
    application_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    """Append an event. Caller commits; the chain is serialised by SQLite's single writer, and on PostgreSQL by
    a transaction-level advisory lock held until that commit."""
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(726272)"))
    last = db.scalars(select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)).first()
    prev = last.hash if last else GENESIS
    seq = (last.seq + 1) if last else 1
    e = AuditEvent(
        seq=seq,
        ts=utcnow(),
        actor=actor,
        actor_role=actor_role,
        action=action,
        object_type=object_type,
        object_id=object_id,
        application_id=application_id,
        details=details or {},
        prev_hash=prev,
    )
    e.hash = _hash(prev, _event_body(e))
    db.add(e)
    db.flush()
    return e


def checkpoint(db: Session) -> AuditCheckpoint | None:
    last = db.scalars(select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)).first()
    if not last:
        return None
    key = audit_signing_key()
    sig = key.sign(f"{last.seq}:{last.hash}".encode())
    cp = AuditCheckpoint(
        seq=last.seq,
        head_hash=last.hash,
        signature=base64.b64encode(sig).decode(),
        public_key=public_key_b64(key.public_key()),
    )
    db.add(cp)
    db.flush()
    return cp


def verify_chain(db: Session) -> dict[str, Any]:
    prev = GENESIS
    count = 0
    first_bad: int | None = None
    for e in db.scalars(select(AuditEvent).order_by(AuditEvent.seq)):
        count += 1
        if e.prev_hash != prev or _hash(prev, _event_body(e)) != e.hash:
            first_bad = e.seq
            break
        prev = e.hash
    head = prev
    cps = []
    for cp in db.scalars(select(AuditCheckpoint).order_by(AuditCheckpoint.id)):
        ok = True
        try:
            pk = Ed25519PublicKey.from_public_bytes(base64.b64decode(cp.public_key))
            pk.verify(base64.b64decode(cp.signature), f"{cp.seq}:{cp.head_hash}".encode())
        except (InvalidSignature, ValueError):
            ok = False
        ev = db.get(AuditEvent, cp.seq)
        cps.append(
            {
                "seq": cp.seq,
                "signature_valid": ok,
                "matches_chain": bool(ev and ev.hash == cp.head_hash),
                "created_at": cp.created_at.isoformat(),
            }
        )
    return {
        "events_checked": count,
        "intact": first_bad is None and all(c["signature_valid"] and c["matches_chain"] for c in cps),
        "first_broken_seq": first_bad,
        "head_hash": head,
        "checkpoints": cps,
    }
