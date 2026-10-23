"""Download the photo-analysis assets, each checked against a pinned SHA-256:

- YOLOX-M ONNX weights (Apache-2.0) from the official YOLOX GitHub release into backend/models/
- openly licensed computer-lab photos from Wikimedia Commons into fixtures/real/photos/, with an
  ATTRIBUTION.md listing author, licence and file page

Both locations are gitignored; nothing is redistributed with the repository.

    python scripts/fetch_photo_assets.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pramana.config import get_settings  # noqa: E402
from pramana.photos.assets import DETECTOR, SAMPLE_PHOTOS, attribution_text, fetch  # noqa: E402

PHOTOS_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "real" / "photos"


def main() -> int:
    ok = True
    for asset, dest in [(DETECTOR, get_settings().models_dir), *((p, PHOTOS_DIR) for p in SAMPLE_PHOTOS.values())]:
        try:
            print(f"ok {fetch(asset, dest)}")
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f"failed {asset.url}: {e}", file=sys.stderr)
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    (PHOTOS_DIR / "ATTRIBUTION.md").write_text(attribution_text(), encoding="utf-8")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
