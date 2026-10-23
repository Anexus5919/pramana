"""Master key rotation and migration for per-document envelope encryption.

    python scripts/keys.py status            # active key, master keys, files per key, files still in the old format
    python scripts/keys.py rotate            # new master key; rewrap every data key; files are not re-encrypted
    python scripts/keys.py rotate --retire   # also delete master keys that no longer wrap any data key
    python scripts/keys.py migrate           # convert files stored before envelope encryption

Each run writes an audit event. Run it with the same PRAMANA_DATA_DIR as the server.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _dirs():
    from pramana.config import get_settings

    s = get_settings()
    return [s.storage_dir, s.cache_dir]


def _audit(action: str, details: dict) -> None:
    from pramana import audit
    from pramana.db import SessionLocal, init_db

    init_db()
    db = SessionLocal()
    try:
        audit.record(db, actor="key-admin", actor_role="admin", action=action, object_type="keyring", details=details)
        db.commit()
    finally:
        db.close()


def status() -> dict:
    from pramana import keyring

    return keyring.inventory(_dirs())


def rotate(retire: bool = False) -> dict:
    from pramana import keyring
    from pramana.config import get_settings

    if get_settings().master_key:
        raise SystemExit("PRAMANA_MASTER_KEY is set: rotate it in your secret store, keep the old key as "
                         "keys/master/<kid>.key, then run this script to rewrap")
    old = keyring.active_kid()
    new = keyring.new_master_key()
    keyring.set_active(new)
    stats = keyring.rewrap_all(_dirs(), new)
    retired = []
    if retire and not stats["failed"]:
        used = keyring.inventory(_dirs())["files_by_kid"]
        for kid in keyring.ring():
            if kid != new and kid not in used and not kid.startswith("env-"):
                (get_settings().keys_dir / "master" / f"{kid}.key").unlink(missing_ok=True)
                retired.append(kid)
    out = {"previous_kid": old, "active_kid": new, **stats, "retired": retired}
    _audit("keys.rotated", out)
    return out


def migrate() -> dict:
    from pramana import keyring
    from pramana.config import get_settings
    from pramana.crypto import fernet

    s = get_settings()
    converted, previews = 0, 0
    for p in sorted(s.storage_dir.iterdir()):
        if not p.is_file() or p.name.endswith((".key", ".tmp", ".purged")) or keyring.key_path(p).exists():
            continue
        blob = p.read_bytes()
        if keyring.is_envelope(blob):
            continue
        keyring.seal_to(p, fernet().decrypt(blob))
        converted += 1
    # Older previews were plain PNG files; drop them so they are rendered again, encrypted
    for p in sorted(s.cache_dir.glob("*.png")):
        if not keyring.key_path(p).exists():
            p.unlink()
            previews += 1
    out = {"documents_converted": converted, "plain_previews_removed": previews, "active_kid": keyring.active_kid()}
    _audit("keys.migrated", out)
    return out


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else "status"
    if cmd == "status":
        out = status()
    elif cmd == "rotate":
        out = rotate(retire="--retire" in argv)
    elif cmd == "migrate":
        out = migrate()
    else:
        raise SystemExit(__doc__)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
