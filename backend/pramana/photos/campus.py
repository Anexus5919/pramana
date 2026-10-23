"""Campus map payload for the officer-only Campus tab: the campus location on record, the point declared
on the uploaded satellite map, and each photo's geotag with its distance, reuse matches, Content
Credentials and room reading."""

import inspect
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..forensics import image as img_forensics
from ..models import Application, Document, Finding, ValidationRun
from ..pipeline.facts_builder import latest_by_type
from ..rules.engine import active_ruleset
from .detector import GROUP_LABEL, ROOM_LABEL
from .findings import declared_facilities

# The geotag check's threshold, read from its signature so the map rings follow any change
GEOTAG_MAX_KM = float(inspect.signature(img_forensics.analyse).parameters["max_km"].default)
REUSE_CODES = ("XA-PHOTO-REUSED", "XA-PHOTO-REUSED-LATER")
OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'


def _map_tolerance_km() -> float | None:
    rule = next((r for r in active_ruleset().rules if r.get("id") == "XD-SATMAP-LOCATION"), None)
    m = re.search(r"<=\s*([0-9.]+)", str((rule or {}).get("check", {}).get("expr", "")))
    return float(m.group(1)) if m else None


def _num(v: str | None) -> float | None:
    try:
        return float(v) if v is not None else None
    except ValueError:
        return None


def _km(a: tuple[float, float] | None, b: tuple[float, float] | None) -> float | None:
    return round(img_forensics.haversine_km(a, b), 2) if a and b else None


def _latest_run(db: Session, app_id: str) -> ValidationRun | None:
    return db.scalars(select(ValidationRun).where(ValidationRun.application_id == app_id)
                      .order_by(ValidationRun.started_at.desc()).limit(1)).first()


def payload(db: Session, app: Application) -> dict[str, Any]:
    inst = app.institution
    s = get_settings()
    rec = (inst.latitude, inst.longitude) if inst.latitude is not None and inst.longitude is not None else None
    docs = list(db.scalars(select(Document).where(Document.application_id == app.id,
                                                  Document.superseded.is_(False)).order_by(Document.uploaded_at)))
    sat = latest_by_type(docs).get("satellite_map")
    declared = None
    if sat:
        f = {x.name: x for x in sat.fields}
        lat, lon = _num(getattr(f.get("latitude"), "value", None)), _num(getattr(f.get("longitude"), "value", None))
        if lat is not None and lon is not None:
            declared = {"lat": lat, "lon": lon, "label": "Declared map point",
                        "source": "Satellite map uploaded with this application", "document_id": sat.id,
                        "distance_km": _km((lat, lon), rec)}
    dec = (declared["lat"], declared["lon"]) if declared else None

    run = _latest_run(db, app.id)
    findings = list(db.scalars(select(Finding).where(Finding.run_id == run.id))) if run else []
    facilities = declared_facilities(app)
    photos = []
    for d in docs:
        if not d.mime.startswith("image/"):
            continue
        an = d.analysis or {}
        meta = an.get("forensic_facts") or {}
        ph = an.get("photo") or {}
        gps = meta.get("gps")
        dist = _km(tuple(gps), rec) if gps else None
        reuse = []
        for fd in findings:
            if fd.document_id != d.id or fd.code not in REUSE_CODES:
                continue
            peer = next((e for e in fd.evidence if e.get("kind") == "peer_document"), {})
            other = db.get(Application, peer.get("application_id")) if peer.get("application_id") else None
            reuse.append({"code": fd.code, "finding_id": fd.id, "title": fd.title, "message": fd.message,
                          "severity": fd.severity, "other_application": peer.get("application_id"),
                          "other_institution": other.institution.name if other else None,
                          "peer_document_id": peer.get("document_id"),
                          "direction": "later" if fd.code == "XA-PHOTO-REUSED-LATER" else "earlier"})
        room = ph.get("room") or {"status": "not_analysed", "reason": "Photo not processed with this version"}
        photos.append({
            "document_id": d.id, "filename": d.original_filename, "sha256": d.sha256,
            "width": meta.get("width"), "height": meta.get("height"),
            "exif": {"captured": meta.get("DateTimeOriginal") or meta.get("DateTime"),
                     "camera": " ".join(x for x in (meta.get("Make"), meta.get("Model")) if x) or None,
                     "software": meta.get("Software"), "gps": gps},
            "attribution": ph.get("exif_text") or None,
            "distance_km": dist, "distance_declared_km": _km(tuple(gps), dec) if gps and dec else None,
            "geotag": "none" if not gps else ("outside" if dist is not None and dist > GEOTAG_MAX_KM else
                                              "within" if dist is not None else "unknown"),
            "reuse": reuse, "c2pa": ph.get("c2pa") or {"present": None},
            "room": room, "declared_facility": facilities.get(d.original_filename),
            "findings": [{"id": fd.id, "code": fd.code, "title": fd.title, "severity": fd.severity,
                          "evidence_class": fd.evidence_class} for fd in findings if fd.document_id == d.id],
        })
    return {
        "application_id": app.id, "run_id": run.id if run else None,
        "institution": {"name": inst.name, "address": inst.address, "district": inst.district, "state": inst.state},
        "record": {"lat": rec[0], "lon": rec[1], "label": "Campus on record",
                   "source": "AICTE institution master (synthetic)", "address": inst.address} if rec else None,
        "declared": declared, "threshold_km": GEOTAG_MAX_KM, "map_tolerance_km": _map_tolerance_km(),
        "photos": photos, "room_labels": ROOM_LABEL, "group_labels": GROUP_LABEL,
        "tiles": {"url": s.map_tile_url, "attribution": OSM_ATTRIBUTION, "max_zoom": 19} if s.map_tile_url else None,
    }
