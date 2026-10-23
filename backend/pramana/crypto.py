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
from fastapi import HTTPException

from . import keyring
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


class DocumentPurged(HTTPException):
    """The bytes were deleted under the retention policy; hashes, findings and the audit trail remain."""

    def __init__(self, name: str):
        super().__init__(410, "the document file was deleted under the retention policy; its hash and findings remain")
        self.name = name


def store_document(name: str, data: bytes) -> None:
    # Envelope encryption: a data key per file, wrapped by the master key (pramana.keyring)
    keyring.seal_to(get_settings().storage_dir / name, data)


def load_document(name: str) -> bytes:
    path = get_settings().storage_dir / name
    if not path.exists() and path.with_name(name + ".purged").exists():
        raise DocumentPurged(name)
    blob = path.read_bytes()
    if keyring.is_envelope(blob):
        return keyring.open_from(path, blob)
    # Written before envelope encryption; scripts/keys.py migrate converts these
    return fernet().decrypt(blob)


def delete_document(name: str) -> None:
    path = get_settings().storage_dir / name
    path.unlink(missing_ok=True)
    keyring.key_path(path).unlink(missing_ok=True)


def cache_get(name: str) -> bytes | None:
    """Rendered page previews are cached encrypted too, so no plaintext page image sits on disk."""
    path = get_settings().cache_dir / name
    if not path.exists() or not keyring.key_path(path).exists():
        return None
    try:
        return keyring.open_from(path)
    except Exception:  # noqa: BLE001  a stale or foreign cache entry is simply rebuilt
        return None


def cache_put(name: str, data: bytes) -> None:
    keyring.seal_to(get_settings().cache_dir / name, data)
