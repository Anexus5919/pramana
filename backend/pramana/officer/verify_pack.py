#!/usr/bin/env python3
"""Check a Pramana evidence pack offline.

    python verify_pack.py evidence-pack.zip
    python verify_pack.py path/to/extracted-folder

Needs Python 3.10 or later and the `cryptography` package; nothing is fetched from the network.

Checks:
1. every file listed in manifest.json is present with the recorded SHA-256, and no file was added;
2. signature.json holds a valid Ed25519 signature over the exact bytes of manifest.json;
3. each event in audit/events.json hashes to its recorded value from its previous hash;
4. the audit checkpoint is signed by the same key and signs the hash of the last event in the extract;
5. original documents, when included, match the source document digests in the manifest.

Exit code 0 when every check passes, 1 otherwise. A pass shows the pack is unchanged since it was signed; it
says nothing about whether the findings inside it are right. Compare the public key printed below with the
key published by the Pramana deployment that produced the pack.
"""

import base64
import hashlib
import json
import sys
import zipfile
from pathlib import Path

SIGNED_EXTRAS = {"manifest.json", "signature.json"}


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Pack:
    """Reads a pack from a ZIP file or an extracted folder; a single top-level folder is treated as the root."""

    def __init__(self, path: Path):
        self.zip = zipfile.ZipFile(path) if path.is_file() else None
        if self.zip:
            raw = [n for n in self.zip.namelist() if not n.endswith("/")]
        else:
            raw = [p.relative_to(path).as_posix() for p in path.rglob("*") if p.is_file()]
        tops = {n.split("/", 1)[0] for n in raw}
        self.prefix = f"{tops.pop()}/" if len(tops) == 1 and all("/" in n for n in raw) else ""
        self.path = path
        self._names = {n[len(self.prefix):] for n in raw}

    def names(self) -> set[str]:
        return set(self._names)

    def read(self, name: str) -> bytes:
        if self.zip:
            return self.zip.read(self.prefix + name)
        return (self.path / (self.prefix + name)).read_bytes()


def _ed25519_ok(public_key_b64: str, signature_b64: str, message: bytes) -> bool:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64)).verify(
            base64.b64decode(signature_b64), message)
        return True
    except (InvalidSignature, ValueError):
        return False


def verify(path: str | Path) -> tuple[bool, list[str]]:
    pack = Pack(Path(path))
    lines: list[str] = []
    ok = True

    def check(cond: bool, message: str) -> bool:
        nonlocal ok
        ok = ok and cond
        lines.append(f"{'PASS' if cond else 'FAIL'}  {message}")
        return cond

    names = pack.names()
    if not check("manifest.json" in names and "signature.json" in names, "manifest.json and signature.json present"):
        return False, lines
    raw = pack.read("manifest.json")
    manifest = json.loads(raw)
    sig = json.loads(pack.read("signature.json"))
    lines.append(f"      pack {manifest.get('pack_id')} for application {manifest.get('application_id')}")
    lines.append(f"      public key {sig.get('public_key')}")
    lines.append(f"      manifest SHA-256 {sha256(raw)}")

    check(sig.get("algorithm") == "Ed25519" and _ed25519_ok(sig["public_key"], sig["signature"], raw),
          "manifest signature (Ed25519) is valid")
    check(sig.get("manifest_sha256") == sha256(raw), "signature record names this manifest's SHA-256")

    listed = manifest.get("files", {})
    bad = [n for n, meta in sorted(listed.items()) if n not in names or sha256(pack.read(n)) != meta["sha256"]]
    check(not bad, f"{len(listed)} listed files match their SHA-256" + (f"; changed or missing: {', '.join(bad)}"
                                                                         if bad else ""))
    extra = sorted(names - set(listed) - SIGNED_EXTRAS)
    check(not extra, "no unlisted files" + (f"; added: {', '.join(extra)}" if extra else ""))

    events = json.loads(pack.read("audit/events.json")) if "audit/events.json" in names else []
    broken = []
    for e in events:
        body = {k: e[k] for k in ("seq", "ts", "actor", "actor_role", "action", "object_type", "object_id",
                                  "application_id", "details")}
        if sha256(e["prev_hash"].encode() + canonical(body)) != e["hash"]:
            broken.append(str(e["seq"]))
    seqs = [e["seq"] for e in events]
    check(bool(events) and not broken and seqs == sorted(set(seqs)),
          f"{len(events)} audit events recompute to their chain hashes"
          + (f"; broken at seq {', '.join(broken)}" if broken else ""))

    if "audit/checkpoint.json" in names:
        cp = json.loads(pack.read("audit/checkpoint.json"))
        check(_ed25519_ok(cp["public_key"], cp["signature"], f"{cp['seq']}:{cp['head_hash']}".encode()),
              f"audit checkpoint at seq {cp['seq']} is signed")
        check(cp["public_key"] == sig.get("public_key"), "checkpoint and manifest are signed by the same key")
        last = events[-1] if events else None
        check(bool(last) and last["seq"] == cp["seq"] and last["hash"] == cp["head_hash"],
              "checkpoint signs the last event in the extract")
    else:
        check(False, "audit checkpoint present")

    for d in manifest.get("documents", []):
        if d.get("file"):
            check(d["file"] in names and sha256(pack.read(d["file"])) == d["sha256"],
                  f"original {d['file']} matches the submitted document digest")
    return ok, lines


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    try:
        ok, lines = verify(argv[1])
    except ImportError:
        print("This check needs the 'cryptography' package: pip install cryptography")
        return 2
    print("\n".join(lines))
    print("RESULT: pack verified" if ok else "RESULT: verification FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
