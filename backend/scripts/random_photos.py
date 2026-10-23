"""Procedural classroom and lab photos for randomised worlds.

Each call draws a different room: wall and floor colours, windows, a board, a perspective grid of desks
with or without monitors, cupboards and posters, lighting and sensor noise. Two calls with different seeds
give photos that look like different rooms, so a photo-reuse finding between them would be a false alarm.
"""

import io
import random

from PIL import Image, ImageDraw, ImageFilter

W, H = 1280, 960


def _shade(c: tuple[int, int, int], k: float) -> tuple[int, int, int]:
    return tuple(max(0, min(255, int(v * k))) for v in c)


def _colour(r: random.Random, lo: int = 60, hi: int = 235) -> tuple[int, int, int]:
    return (r.randint(lo, hi), r.randint(lo, hi), r.randint(lo, hi))


def room_image(seed: int) -> Image.Image:
    r = random.Random(seed)
    img = Image.new("RGB", (W, H))
    dr = ImageDraw.Draw(img)
    wall, floor = _colour(r, 120, 235), _colour(r, 50, 170)
    horizon = r.randint(int(H * 0.35), int(H * 0.6))
    light = r.uniform(0.75, 1.15)
    tilt = r.uniform(-0.25, 0.25)
    for y in range(H):
        base = wall if y < horizon else floor
        k = light * (1.0 - 0.25 * abs(y - horizon) / H) + tilt * (y / H - 0.5)
        dr.line([(0, y), (W, y)], fill=_shade(base, k))
    # Side wall in perspective, on a random side
    side = r.choice([0, 1])
    sw = r.randint(80, 320)
    pts = [(0, 0), (sw, r.randint(40, 160)), (sw, horizon + r.randint(-20, 40)), (0, H)] if side == 0 else \
        [(W, 0), (W - sw, r.randint(40, 160)), (W - sw, horizon + r.randint(-20, 40)), (W, H)]
    dr.polygon(pts, fill=_shade(wall, r.uniform(0.6, 0.9)))
    for _ in range(r.randint(0, 4)):
        x = r.randint(0, W - 200)
        y = r.randint(20, max(30, horizon - 220))
        dr.rectangle([x, y, x + r.randint(90, 220), y + r.randint(80, 200)], fill=_colour(r, 170, 255),
                     outline=_shade(wall, 0.5), width=r.randint(3, 10))
    if r.random() < 0.85:
        bx = r.randint(40, W - 600)
        by = r.randint(30, max(40, horizon - 330))
        board = r.choice([(32, 64, 48), (20, 30, 40), (235, 235, 230), (40, 60, 90)])
        dr.rectangle([bx, by, bx + r.randint(420, 900), by + r.randint(180, 320)], fill=board,
                     outline=(90, 70, 50), width=6)
    for _ in range(r.randint(0, 5)):
        x, y = r.randint(0, W - 120), r.randint(20, max(30, horizon - 120))
        dr.rectangle([x, y, x + r.randint(40, 120), y + r.randint(50, 140)], fill=_colour(r))
    if r.random() < 0.6:
        cx = r.choice([r.randint(0, 120), r.randint(W - 240, W - 120)])
        dr.rectangle([cx, horizon - r.randint(160, 300), cx + r.randint(90, 160), horizon + 40],
                     fill=_colour(r, 60, 180), outline=(30, 30, 30), width=3)
    rows, cols = r.randint(2, 6), r.randint(3, 8)
    desk = _colour(r, 60, 200)
    monitors = r.random() < 0.6
    spread = r.uniform(0.7, 1.25)
    for row in range(rows):
        depth = (row + 1) / (rows + 1)
        y = int(horizon + 20 + depth * (H - horizon - 60))
        scale = 0.45 + 0.75 * depth
        dw = int(W / (cols + 1) * 0.8 * scale * spread)
        dh = max(10, int(34 * scale))
        off = r.randint(-60, 60)
        for col in range(cols):
            x = int((col + 0.6) * W / (cols + 0.2) * spread + off - (spread - 1) * W / 2)
            if x > W or x + dw < 0:
                continue
            dr.rectangle([x, y, x + dw, y + dh], fill=_shade(desk, r.uniform(0.85, 1.1)))
            if monitors:
                mw, mh = int(dw * 0.45), int(60 * scale)
                mx = x + (dw - mw) // 2
                dr.rectangle([mx, y - mh - 4, mx + mw, y - 4], fill=(28, 28, 32))
                dr.rectangle([mx + 4, y - mh, mx + mw - 4, y - 8], fill=_colour(r, 40, 160))
    img = img.filter(ImageFilter.GaussianBlur(r.uniform(0.6, 1.6)))
    px = img.load()
    for _ in range(25000):
        x, y = r.randint(0, W - 1), r.randint(0, H - 1)
        p = px[x, y]
        n = r.randint(-16, 16)
        px[x, y] = (max(0, min(255, p[0] + n)), max(0, min(255, p[1] + n)), max(0, min(255, p[2] + n)))
    return img


def room_jpeg(seed: int, exif: Image.Exif, quality: int = 88) -> bytes:
    b = io.BytesIO()
    room_image(seed).save(b, "JPEG", quality=quality, exif=exif)
    return b.getvalue()
