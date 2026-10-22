"""Photo evidence checks: capture metadata, geotag distance and editing traces.

EXIF is easy to strip or forge and messaging apps remove it routinely, so a missing or odd value is a
prompt for more evidence, never proof. Geotag distance only says where the camera claimed to be.
"""

import io
import math
from datetime import datetime
from typing import Any

from PIL import ExifTags, Image

from .pdf_struct import Signal

GPS_TAG = 34853
EDIT_SOFTWARE = ["photoshop", "gimp", "snapseed", "picsart", "lightroom", "canva", "pixlr", "facetune"]


def _ratio(x) -> float:
    try:
        return float(x)
    except (TypeError, ValueError, ZeroDivisionError):
        return float("nan")


def _dms(v, ref) -> float | None:
    try:
        d, m, s = (_ratio(x) for x in v)
    except (TypeError, ValueError):
        return None
    out = d + m / 60 + s / 3600
    return -out if ref in ("S", "W") else out


def exif(data: bytes) -> dict[str, Any]:
    with Image.open(io.BytesIO(data)) as im:
        raw = im.getexif()
        out: dict[str, Any] = {"width": im.width, "height": im.height, "format": im.format}
        if not raw:
            return out
        named = {ExifTags.TAGS.get(k, str(k)): v for k, v in raw.items()}
        sub = raw.get_ifd(0x8769)
        named.update({ExifTags.TAGS.get(k, str(k)): v for k, v in sub.items()})
        for k in ("Make", "Model", "Software", "DateTime", "DateTimeOriginal"):
            if k in named:
                out[k] = str(named[k]).strip("\x00 ")
        gps = raw.get_ifd(GPS_TAG)
        if gps:
            g = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps.items()}
            lat = _dms(g.get("GPSLatitude"), g.get("GPSLatitudeRef"))
            lon = _dms(g.get("GPSLongitude"), g.get("GPSLongitudeRef"))
            if lat is not None and lon is not None and not (math.isnan(lat) or math.isnan(lon)):
                out["gps"] = [round(lat, 6), round(lon, 6)]
        return out


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def analyse(data: bytes, campus: tuple[float, float] | None, *, max_km: float = 2.0,
            window: tuple[datetime, datetime] | None = None) -> tuple[list[Signal], dict[str, Any]]:
    meta = exif(data)
    signals: list[Signal] = []
    if "DateTimeOriginal" not in meta and "gps" not in meta:
        signals.append(Signal(
            "FX-IMG-NO-CAPTURE-METADATA", "No capture time or location in photo",
            "The image carries no EXIF capture time or GPS position, so when and where it was taken cannot be "
            "checked from the file.", "low",
            limitation="Messaging apps and many upload tools strip EXIF from genuine photos.",
        ))
    sw = str(meta.get("Software", "")).lower()
    hits = [s for s in EDIT_SOFTWARE if s in sw]
    if hits:
        signals.append(Signal(
            "FX-IMG-EDITING-SOFTWARE", "Photo saved by image-editing software",
            f"EXIF Software field reads '{meta.get('Software')}'.", "low",
            limitation="Cropping or resizing in an editor is common and harmless.",
        ))
    if "gps" in meta and campus:
        km = haversine_km(tuple(meta["gps"]), campus)
        meta["distance_km"] = round(km, 2)
        if km > max_km:
            signals.append(Signal(
                "FX-IMG-GEOTAG-FAR", "Photo geotag is far from the registered campus",
                f"Geotag {meta['gps'][0]}, {meta['gps'][1]} is {km:.1f} km from the campus location on record "
                f"(threshold {max_km} km).", "medium",
                [{"kind": "geo", "photo": meta["gps"], "campus": list(campus), "distance_km": round(km, 2)}],
                "GPS can be inaccurate indoors and EXIF can be edited. Confirm during inspection.",
            ))
    if "DateTimeOriginal" in meta and window:
        try:
            taken = datetime.strptime(meta["DateTimeOriginal"], "%Y:%m:%d %H:%M:%S")
            if not (window[0] <= taken <= window[1]):
                signals.append(Signal(
                    "FX-IMG-CAPTURE-OUTSIDE-WINDOW", "Photo taken outside the expected period",
                    f"Captured {taken.date()}, outside {window[0].date()} to {window[1].date()}.", "low",
                    limitation="Old photos may still show current facilities; ask for recent evidence.",
                ))
        except ValueError:
            pass
    return signals, meta
