"""Per-document envelope encryption with a rotatable master key.

Each stored file gets its own random 256-bit data key and is encrypted with AES-256-GCM, with the storage
name as associated data so files cannot be swapped. The data key is wrapped by the master key (AES-256-GCM,
key id and storage name as associated data) and kept beside the file as `<name>.key`. Rotating the master
key rewraps those small key files; the document files are never decrypted or rewritten. Deleting a key
file makes its document unreadable even from a backup of the bytes (crypto-shredding).

Master keys live in data_dir/keys/master/<kid>.key with ACTIVE naming the current one, or come from
PRAMANA_MASTER_KEY. In production they belong in an HSM or a key management service; this module is the
seam where that would plug in. Files written before envelope encryption (Fernet with storage_key) still
open, and scripts/keys.py migrate converts them.
"""

import base64
import hashlib
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import get_settings

log = logging.getLogger(__name__)
MAGIC = b"PRM2"
NONCE = 12


class UnwrapError(RuntimeError):
    """A data key could not be unwrapped (missing master key or key file)."""


def _master_dir() -> Path:
    d = get_settings().keys_dir / "master"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _env_key() -> tuple[str, bytes] | None:
    raw = get_settings().master_key
    if not raw:
        return None
    key = base64.b64decode(raw)
    if len(key) != 32:
        raise ValueError("PRAMANA_MASTER_KEY must be 32 bytes, base64 encoded")
    return "env-" + hashlib.sha256(key).hexdigest()[:8], key


def ring() -> dict[str, bytes]:
    """All master keys this server can unwrap with, by key id."""
    out = {p.stem: base64.b64decode(p.read_text().strip()) for p in _master_dir().glob("*.key")}
    env = _env_key()
    if env:
        out[env[0]] = env[1]
    return out


def new_master_key() -> str:
    kid = "mk-" + secrets.token_hex(4)
    path = _master_dir() / f"{kid}.key"
    path.write_text(base64.b64encode(AESGCM.generate_key(bit_length=256)).decode())
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return kid


def set_active(kid: str) -> None:
    _atomic_write(_master_dir() / "ACTIVE", kid.encode())


def active_kid() -> str:
    env = _env_key()
    if env:
        return env[0]
    f = _master_dir() / "ACTIVE"
    if f.exists():
        kid = f.read_text().strip()
        if (_master_dir() / f"{kid}.key").exists():
            return kid
    kid = new_master_key()
    set_active(kid)
    log.warning("generated master key %s in %s; keep it outside the data directory in production", kid,
                _master_dir())
    return kid


def _atomic_write(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


def _aad(kind: str, kid: str, name: str) -> bytes:
    return f"pramana|{kind}|{kid}|{name}".encode()


def _wrap(dek: bytes, kid: str, master: bytes, name: str) -> str:
    nonce = os.urandom(NONCE)
    return base64.b64encode(nonce + AESGCM(master).encrypt(nonce, dek, _aad("dek", kid, name))).decode()


def _unwrap(record: dict[str, Any], name: str, keys: dict[str, bytes] | None = None) -> bytes:
    keys = keys if keys is not None else ring()
    kid = record.get("kid", "")
    if kid not in keys:
        raise UnwrapError(f"master key {kid} for {name} is not available")
    raw = base64.b64decode(record["wrapped"])
    return AESGCM(keys[kid]).decrypt(raw[:NONCE], raw[NONCE:], _aad("dek", kid, name))


def key_path(path: Path) -> Path:
    return path.with_name(path.name + ".key")


def seal_to(path: Path, data: bytes) -> None:
    """Encrypt data under a fresh data key and write the file and its wrapped key."""
    kid = active_kid()
    master = ring()[kid]
    dek = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(NONCE)
    body = MAGIC + nonce + AESGCM(dek).encrypt(nonce, data, _aad("doc", "", path.name))
    record = {"v": 1, "alg": "AES-256-GCM", "kid": kid, "wrapped": _wrap(dek, kid, master, path.name)}
    _atomic_write(key_path(path), json.dumps(record).encode())
    _atomic_write(path, body)


def is_envelope(blob: bytes) -> bool:
    return blob[:4] == MAGIC


def open_from(path: Path, blob: bytes | None = None) -> bytes:
    blob = blob if blob is not None else path.read_bytes()
    kp = key_path(path)
    if not kp.exists():
        raise UnwrapError(f"no data key for {path.name}")
    dek = _unwrap(json.loads(kp.read_text()), path.name)
    nonce = blob[4:4 + NONCE]
    return AESGCM(dek).decrypt(nonce, blob[4 + NONCE:], _aad("doc", "", path.name))


def rewrap_all(directories: list[Path], to_kid: str | None = None) -> dict[str, int]:
    """Rewrap every data key under the active (or given) master key without touching the files."""
    keys = ring()
    to = to_kid or active_kid()
    master = keys[to]
    stats = {"rewrapped": 0, "already_current": 0, "failed": 0}
    for d in directories:
        for kp in sorted(d.glob("*.key")):
            name = kp.name[:-4]
            rec = json.loads(kp.read_text())
            if rec.get("kid") == to:
                stats["already_current"] += 1
                continue
            try:
                dek = _unwrap(rec, name, keys)
            except Exception as e:  # noqa: BLE001  reported, never silently dropped
                log.error("could not unwrap %s: %s", name, e)
                stats["failed"] += 1
                continue
            _atomic_write(kp, json.dumps({**rec, "kid": to, "wrapped": _wrap(dek, to, master, name)}).encode())
            stats["rewrapped"] += 1
    return stats


def inventory(directories: list[Path]) -> dict[str, Any]:
    by_kid: dict[str, int] = {}
    legacy = 0
    for d in directories:
        for p in d.iterdir():
            if not p.is_file() or p.name.endswith((".key", ".tmp", ".purged")):
                continue
            kp = key_path(p)
            if kp.exists():
                kid = json.loads(kp.read_text()).get("kid", "?")
                by_kid[kid] = by_kid.get(kid, 0) + 1
            else:
                with p.open("rb") as f:
                    head = f.read(4)
                legacy += 0 if head == MAGIC else 1
    return {"active_kid": active_kid(), "master_keys": sorted(ring()), "files_by_kid": by_kid, "legacy_files": legacy}
