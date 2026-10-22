"""Key handling, canonical hashing and encrypted document storage."""

import base64
import hashlib
import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from .config import get_settings

log = logging.getLogger(__name__)


def _default(o: Any) -> Any:
    if isinstance(o, datetime | date):
        return o.isoformat()
    if isinstance(o, set):
        return sorted(o)
    raise TypeError(f"not serialisable: {type(o)}")


def canonical_json(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=_default).encode()


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest(obj: Any) -> str:
    return sha256_hex(canonical_json(obj))


def _read_or_create(path: Path, factory) -> bytes:
    if path.exists():
        return path.read_bytes()
    data = factory()
    path.write_bytes(data)
    log.warning("generated development key at %s; set it explicitly outside a demo", path)
    return data


def fernet() -> Fernet:
    s = get_settings()
    key = s.storage_key.encode() if s.storage_key else _read_or_create(s.keys_dir / "storage.key", Fernet.generate_key)
    return Fernet(key)


def audit_signing_key() -> Ed25519PrivateKey:
    s = get_settings()
    raw = _read_or_create(
        s.keys_dir / "audit_ed25519.pem",
        lambda: Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
        ),
    )
    return serialization.load_pem_private_key(raw, password=None)


def public_key_b64(pk: Ed25519PublicKey) -> str:
    return base64.b64encode(pk.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()


def store_document(name: str, data: bytes) -> None:
    path = get_settings().storage_dir / name
    path.write_bytes(fernet().encrypt(data))


def load_document(name: str) -> bytes:
    path = get_settings().storage_dir / name
    return fernet().decrypt(path.read_bytes())


def delete_document(name: str) -> None:
    (get_settings().storage_dir / name).unlink(missing_ok=True)
