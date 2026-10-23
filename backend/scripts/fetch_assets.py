"""Download the third-party files the Hindi path needs, each checked against a pinned SHA-256.

- Devanagari OCR recogniser (PP-OCRv5, Apache-2.0) into var/models; the pipeline also fetches it on first use.
- Noto Sans Devanagari (SIL Open Font License 1.1) into var/fonts, used only to draw the synthetic
  bilingual fixture. Its OFL.txt is saved next to the fonts.

Nothing here is committed to the repository; var/ is gitignored.

    python scripts/fetch_assets.py
"""

import hashlib
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[2]
FONT_DIR = ROOT / "var" / "fonts"
NOTO_ZIP = ("https://github.com/notofonts/devanagari/releases/download/NotoSansDevanagari-v2.007/"
            "NotoSansDevanagari-v2.007.zip",
            "820c7da45b1e63562cb41c0a8cac5d9a4202312043a3a040ed1325857ef469b1")
FONTS = {
    "NotoSansDevanagari-Regular.ttf": ("NotoSansDevanagari/unhinted/ttf/NotoSansDevanagari-Regular.ttf",
                                       "9c7d935139ea6a1e6ad9dbac4f6d27ece1e04bca8123c8888d00a0f9df4724cd"),
    "NotoSansDevanagari-Bold.ttf": ("NotoSansDevanagari/unhinted/ttf/NotoSansDevanagari-Bold.ttf",
                                    "ff2f76a23aad41e0608c2d7dbc4bacd247ff3bec78f0ec2a8fb106b561636e58"),
    "OFL.txt": ("OFL.txt", None),
}


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def fetch_fonts() -> Path:
    if all((FONT_DIR / n).exists() and (sha is None or _sha((FONT_DIR / n).read_bytes()) == sha)
           for n, (_, sha) in FONTS.items()):
        return FONT_DIR
    url, zsha = NOTO_ZIP
    req = urllib.request.Request(url, headers={"User-Agent": "Pramana-prototype/0.3"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    if _sha(data) != zsha:
        raise SystemExit(f"hash mismatch for {url}: {_sha(data)}")
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name, (member, sha) in FONTS.items():
            b = z.read(member)
            if sha and _sha(b) != sha:
                raise SystemExit(f"hash mismatch for {member}: {_sha(b)}")
            (FONT_DIR / name).write_bytes(b)
    return FONT_DIR


def main() -> int:
    from pramana.pipeline.devanagari import fetch_model

    print(f"ok {fetch_model()}")
    print(f"ok {fetch_fonts()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
