"""Calibrate the seal-reuse match: how far apart are different offices' seals, and how far do true copies move?

Distinct seals: the fixture template (one design per issuer type, the city name changing, as many state fire
services do) for every city of the seeded and randomised worlds plus more city names. True copies: the same
image exact, re-encoded as JPEG, rescaled, blurred, and passed through a print-and-scan imitation. Every image
is embedded in a PDF and fingerprinted by forensics.seals.image_fingerprints, as the pipeline does.

    python scripts/calibrate_seals.py      # about 4 minutes; prints distributions, writes var/seal_calibration.json
"""

import io
import json
import random
import sys
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import make_fixtures as mf  # noqa: E402
from PIL import Image, ImageFilter, ImageOps  # noqa: E402
from random_identity import CITIES  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.utils import ImageReader  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402

from pramana.forensics import seals  # noqa: E402

EXTRA = ["Agra", "Ajmer", "Akola", "Aligarh", "Alwar", "Ambala", "Anand", "Anantapur", "Asansol", "Aurangabad",
         "Bareilly", "Bathinda", "Beed", "Bellary", "Bharuch", "Bhavnagar", "Bhilai", "Bhiwandi", "Bhuj", "Bidar",
         "Bijapur", "Bilaspur", "Bokaro", "Chandrapur", "Chittoor", "Cuttack", "Dehradun", "Dhanbad", "Dhule",
         "Erode", "Gandhinagar", "Gaya", "Ghaziabad", "Gorakhpur", "Gulbarga", "Guwahati", "Haridwar", "Hosur",
         "Hisar", "Ichalkaranji", "Jalna", "Jammu", "Jamnagar", "Jhansi", "Junagadh", "Kakinada", "Kalyan", "Kannur",
         "Karnal", "Kollam", "Kurnool", "Ludhiana", "Malegaon", "Mathura", "Meerut", "Moradabad", "Nadiad", "Nellore",
         "Nizamabad", "Palakkad", "Panipat", "Parbhani", "Patiala", "Patna", "Puducherry", "Raichur", "Raipur",
         "Rajahmundry", "Ranchi", "Rohtak", "Rourkela", "Sagar", "Saharanpur", "Shillong", "Shimla", "Sikar",
         "Solan", "Sonipat", "Thanjavur", "Thrissur", "Tirunelveli", "Tumakuru", "Ujjain", "Vellore", "Wardha",
         "Yavatmal"]


def fire(city: str) -> bytes:
    return mf.fire_seal({"city": city})


def municipal(city: str) -> bytes:
    return mf.municipal_seal({"city": city})


def pdf_with(img: bytes | Image.Image, fmt: str = "PNG", quality: int = 90) -> bytes:
    if isinstance(img, Image.Image):
        b = io.BytesIO()
        img.convert("RGB").save(b, fmt, **({"quality": quality} if fmt == "JPEG" else {}))
        img = b.getvalue()
    out = io.BytesIO()
    c = canvas.Canvas(out, pagesize=A4)
    c.drawImage(ImageReader(io.BytesIO(img)), 260, 165, 80, 80)
    c.save()
    return out.getvalue()


def fingerprint(img: bytes | Image.Image, **kw) -> dict:
    fps = seals.image_fingerprints(pdf_with(img, **kw))
    assert len(fps) == 1, "seal not found in the test PDF"
    return fps[0]


def print_scan(im: Image.Image, r: random.Random) -> Image.Image:
    """Printed, scanned at a different resolution, slightly rotated, blurred and noisy, then cropped back."""
    w, h = im.size
    g = im.convert("RGB").resize((int(w * 0.7), int(h * 0.7)), Image.BICUBIC)
    g = g.rotate(r.uniform(-2.0, 2.0), resample=Image.BICUBIC, fillcolor="white", expand=False)
    g = g.filter(ImageFilter.GaussianBlur(r.uniform(0.6, 1.2)))
    px = g.load()
    for _ in range(g.width * g.height // 12):
        x, y = r.randrange(g.width), r.randrange(g.height)
        n = r.randint(-35, 35)
        p = px[x, y]
        px[x, y] = tuple(max(0, min(255, v + n)) for v in p)
    g = ImageOps.autocontrast(g, cutoff=1)
    dx, dy = r.randint(-3, 3), r.randint(-3, 3)
    g = g.crop((max(0, dx), max(0, dy), g.width + min(0, dx), g.height + min(0, dy)))
    return g


def copies(png: bytes, r: random.Random) -> dict[str, dict]:
    im = Image.open(io.BytesIO(png)).convert("RGB")
    out = {"exact": fingerprint(png)}
    for q in (95, 75, 50):
        out[f"jpeg{q}"] = fingerprint(im, fmt="JPEG", quality=q)
    for s in (0.5, 0.75, 1.5):
        out[f"scale{s}"] = fingerprint(im.resize((int(im.width * s), int(im.height * s)), Image.BICUBIC))
    for b in (0.8, 1.5):
        out[f"blur{b}"] = fingerprint(im.filter(ImageFilter.GaussianBlur(b)))
    for i in range(3):
        out[f"print_scan{i}"] = fingerprint(print_scan(im, r), fmt="JPEG", quality=80)
    return out


def metrics(a: dict, b: dict) -> dict[str, int]:
    h = seals._h
    p, d = int(h(a["phash"]) - h(b["phash"])), int(h(a["dhash"]) - h(b["dhash"]))
    # max: the earlier rule, both 256-bit hashes; fine: the 1024-bit hash the match now uses
    return {"phash": p, "dhash": d, "max": max(p, d), "fine": int(h(a["phash32"]) - h(b["phash32"])),
            "exact": int(a["sha256"] == b["sha256"])}


def main() -> None:
    cities = sorted({c[0] for c in CITIES} | {i["city"] for i in mf.INSTITUTIONS} | set(EXTRA))
    distinct = [(f"fire:{c}", fingerprint(fire(c))) for c in cities] + \
               [(f"muni:{c}", fingerprint(municipal(c))) for c in cities]
    pairs = [(x, y, metrics(a, b)) for (x, a), (y, b) in combinations(distinct, 2)]
    r = random.Random(26261)
    sample = r.sample(cities, 40)
    copy_rows = []
    for c in sample:
        for make, kind in ((fire, "fire"), (municipal, "muni")):
            png = make(c)
            base = fingerprint(png)
            for name, fp in copies(png, r).items():
                copy_rows.append((f"{kind}:{c}", name, metrics(base, fp)))

    def summary(values: list[int]) -> str:
        v = sorted(values)
        return (f"min {v[0]}, p1 {v[len(v) // 100]}, p5 {v[len(v) // 20]}, median {v[len(v) // 2]}, "
                f"p95 {v[int(len(v) * .95)]}, max {v[-1]}")

    print(f"{len(cities)} cities, {len(distinct)} distinct seals, {len(pairs)} distinct pairs, "
          f"{len(copy_rows)} copies")
    for m in ("max", "fine"):
        print(f"distinct {m:6}: {summary([p[2][m] for p in pairs])}")
    kinds = sorted({k for _, k, _ in copy_rows}, key=lambda k: (k.rstrip('0123456789.'), k))
    for k in kinds:
        rows = [m for _, kk, m in copy_rows if kk == k]
        print(f"copy {k:12}: earlier rule (of 256) max {max(m['max'] for m in rows):3}   "
              f"fine (of 1024) max {max(m['fine'] for m in rows):3}")
    close = sorted(pairs, key=lambda p: p[2]["fine"])[:8]
    print("closest distinct pairs, fine:", [(x, y, m["fine"]) for x, y, m in close])
    out = Path(__file__).resolve().parents[2] / "var" / "seal_calibration.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"distinct": [{"a": x, "b": y, **m} for x, y, m in pairs],
                               "copies": [{"seal": s, "kind": k, **m} for s, k, m in copy_rows]}), encoding="utf-8")


if __name__ == "__main__":
    main()
