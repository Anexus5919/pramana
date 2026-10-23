"""Raster artwork for the synthetic fixtures: issuer seals and a shared emblem, drawn with Pillow.

Every image is generated here from a seed; nothing is copied from a real authority. Text uses Pillow's
bundled default font (Aileron Regular, CC0 1.0).
"""

import io
import math
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SEAL_PX = 360


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def _ring_text(img: Image.Image, text: str, cx: float, cy: float, r: float, size: int, ink) -> None:
    """Text clockwise along the top of a circle, spaced by glyph width and shrunk to leave the bottom free."""
    while True:
        font = ImageFont.load_default(size=size)
        widths = [font.getlength(ch) + size * 0.12 for ch in text]
        span = sum(widths) / r
        if span <= 1.6 * math.pi or size <= 12:
            break
        size -= 1
    a = -math.pi / 2 - span / 2
    for ch, w in zip(text, widths, strict=True):
        mid = a + w / 2 / r
        g = Image.new("L", (size * 2, size * 2), 0)
        ImageDraw.Draw(g).text((size, size), ch, font=font, fill=255, anchor="mm")
        g = g.rotate(-math.degrees(mid) - 90, resample=Image.BICUBIC)
        x, y = cx + r * math.cos(mid) - size, cy + r * math.sin(mid) - size
        img.paste(Image.new("RGB", g.size, ink), (int(x), int(y)), g)
        a += w / r


def _fit(text: str, width: float, size: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.load_default(size=size)
    while font.getlength(text) > width and size > 10:
        size -= 1
        font = ImageFont.load_default(size=size)
    return font


def _texture(img: Image.Image, seed: int, ink) -> Image.Image:
    """Uneven ink: a stamp never prints solid, and each issuer's stamp wears differently."""
    r = random.Random(seed)
    px = img.load()
    for _ in range(9000):
        x, y = r.randrange(img.width), r.randrange(img.height)
        if px[x, y] != (255, 255, 255):
            px[x, y] = tuple(min(255, v + r.randint(60, 140)) for v in ink)
    return img.filter(ImageFilter.GaussianBlur(0.7))


def seal_png(ring: str, centre: list[str], color: str, seed: int) -> bytes:
    """A round rubber-stamp seal for one issuing office."""
    ink = _hex(color)
    s = SEAL_PX
    img = Image.new("RGB", (s, s), "white")
    d = ImageDraw.Draw(img)
    c = s / 2
    d.ellipse([8, 8, s - 8, s - 8], outline=ink, width=7)
    d.ellipse([22, 22, s - 22, s - 22], outline=ink, width=3)
    d.ellipse([86, 86, s - 86, s - 86], outline=ink, width=3)
    _ring_text(img, ring.upper(), c, c, 124, 26, ink)
    r = random.Random(seed)
    # A star of a different shape per issuer between the ring text ends
    pts = []
    k = r.choice([5, 6, 8])
    for i in range(2 * k):
        a = -math.pi / 2 + i * math.pi / k
        rad = 15 if i % 2 == 0 else 7
        pts.append((c + rad * math.cos(a), s - 52 + rad * math.sin(a)))
    d.polygon(pts, fill=ink)
    lines = [ln.upper() for ln in centre]
    y0 = c - 14 * (len(lines) - 1)
    for i, ln in enumerate(lines):
        d.text((c, y0 + i * 28), ln, font=_fit(ln, 150, 24), fill=ink, anchor="mm")
    img = img.rotate(r.uniform(-12, 12), resample=Image.BICUBIC, fillcolor="white")
    img = _texture(img, seed, ink)
    b = io.BytesIO()
    img.save(b, "PNG", optimize=True)
    return b.getvalue()


def emblem_png() -> bytes:
    """One emblem printed by every simulated state authority; the same image under many issuers."""
    s = 220
    ink = _hex("#334155")
    img = Image.new("RGB", (s, s), "white")
    d = ImageDraw.Draw(img)
    c = s / 2
    d.ellipse([10, 10, s - 10, s - 10], outline=ink, width=6)
    for i in range(24):
        a = i * math.pi / 12
        d.line([(c + 30 * math.cos(a), c - 12 + 30 * math.sin(a)), (c + 62 * math.cos(a), c - 12 + 62 * math.sin(a))],
               fill=ink, width=4)
    d.ellipse([c - 22, c - 34, c + 22, c + 10], fill=ink)
    font = ImageFont.load_default(size=20)
    d.text((c, s - 40), "SIMULATED", font=font, fill=ink, anchor="mm")
    b = io.BytesIO()
    img.save(b, "PNG", optimize=True)
    return b.getvalue()
