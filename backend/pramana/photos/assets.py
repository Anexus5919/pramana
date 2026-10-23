"""Downloaded assets for photo analysis, each pinned by SHA-256 and stored in gitignored paths.

- YOLOX-M object detector (Apache-2.0), ONNX export from the official Megvii-BaseDetection release
- openly licensed sample photos of computer labs from Wikimedia Commons, used as demo fixture photos
"""

import hashlib
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

USER_AGENT = "Pramana-prototype/0.3 (Smart India Hackathon 2026 demo; fixture and model fetch)"


@dataclass(frozen=True)
class Asset:
    name: str
    url: str
    sha256: str
    licence: str
    author: str
    page: str
    title: str = ""


DETECTOR = Asset(
    "yolox_m.onnx",
    "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_m.onnx",
    "21ff6cfdeb53b013bac2249599e55f00bff3cfdfdab37ed7a4620818c1d15b3f",
    "Apache-2.0", "Megvii BaseDetection (YOLOX authors)",
    "https://github.com/Megvii-BaseDetection/YOLOX/releases/tag/0.1.1rc0", "YOLOX-M, COCO 80 classes")

# Licences checked on each file page (wikitext licence template) on 2026-10-23
SAMPLE_PHOTOS = {
    "cmi_lab": Asset(
        "cmi_computer_lab.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/9/96/Computer_lab_in_Chennai_Mathematical_Institute.JPG",
        "ef8cb33e588c9efa05378ac24afb46e306ad2d260a2c507bd4ea3afc6f2bfdee",
        "CC BY-SA 3.0", "Kprateek88",
        "https://commons.wikimedia.org/wiki/File:Computer_lab_in_Chennai_Mathematical_Institute.JPG",
        "Computer lab in Chennai Mathematical Institute"),
    "baramati_lab": Asset(
        "baramati_computer_lab.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/e/e3/Baramati%2C_Maharashtra%2C_India._Computers_in_a_lab.jpg",
        "9fac3df9dc6289ae4b5c3c7edc107b2972a90c8f35833fbdcbdaa0e0912f081f",
        "CC BY-SA 4.0", "Fredericknoronha",
        "https://commons.wikimedia.org/wiki/File:Baramati,_Maharashtra,_India._Computers_in_a_lab.jpg",
        "Baramati, Maharashtra, India. Computers in a lab"),
    "kmclu_lab": Asset(
        "kmclu_computer_lab.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/9/9f/Computer_Lab_KMCLU_Urdu_Department.jpg",
        "ed31de0bd0882d9c1b2e6b8d2bd16ee24b0849a61a659ed4593ed208f8130ada",
        "CC0 1.0", "Doorwaytoknowledge",
        "https://commons.wikimedia.org/wiki/File:Computer_Lab_KMCLU_Urdu_Department.jpg",
        "Computer Lab KMCLU Urdu Department"),
}


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(asset: Asset, dest_dir: Path, *, retries: int = 4) -> Path:
    """Download once and check the pinned hash; a cached file with the right hash is reused."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / asset.name
    if dest.exists() and sha256_file(dest) == asset.sha256:
        return dest
    req = urllib.request.Request(asset.url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            break
        except urllib.error.HTTPError as e:
            # Wikimedia rate-limits bursts with 429; back off politely
            if e.code != 429 or attempt == retries - 1:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 5 * (attempt + 1))
    got = hashlib.sha256(data).hexdigest()
    if got != asset.sha256:
        raise ValueError(f"hash mismatch for {asset.url}: {got}")
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return dest


def attribution_text() -> str:
    lines = ["# Sample photo attributions", "",
             "Openly licensed photos from Wikimedia Commons, used as demo fixture photos for synthetic "
             "institutions. They are resized and given synthetic EXIF capture data by scripts/make_fixtures.py.",
             ""]
    for a in SAMPLE_PHOTOS.values():
        lines.append(f"- {a.name}: \"{a.title}\" by {a.author}, {a.licence}, {a.page}")
    lines += ["", f"Detector: {DETECTOR.title} by {DETECTOR.author}, {DETECTOR.licence}, {DETECTOR.page}", ""]
    return "\n".join(lines)
