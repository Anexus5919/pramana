"""Download a real DSC-signed Government of India e-Gazette PDF to demonstrate India PKI validation.

The file is fetched from egazette.gov.in and checked against a pinned SHA-256; it is not redistributed
with the repository.

    python scripts/fetch_real_samples.py
"""

import hashlib
import sys
import urllib.request
from pathlib import Path

SAMPLES = [
    ("https://egazette.gov.in/WriteReadData/2025/260000.pdf", "egazette_2025_260000.pdf",
     "c64d090c960d3a5a41dd8b6b277c1c0f240ccb76c825cf2e61da063d37af0e25"),
]
OUT = Path(__file__).resolve().parents[2] / "fixtures" / "real"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for url, name, sha in SAMPLES:
        dest = OUT / name
        if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == sha:
            print(f"ok (cached) {dest}")
            continue
        req = urllib.request.Request(url, headers={"User-Agent": "Pramana-prototype/0.3"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        got = hashlib.sha256(data).hexdigest()
        if got != sha:
            print(f"hash mismatch for {url}: {got}", file=sys.stderr)
            return 1
        dest.write_bytes(data)
        print(f"ok {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
