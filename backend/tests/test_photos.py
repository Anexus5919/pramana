"""Photo evidence: Content Credentials states, detector reporting, room indicators and the officer-only
campus API."""

import importlib.util
import io
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from PIL import Image, ImageDraw

from pramana.photos import credentials, demo_capture, detector
from pramana.photos.assets import SAMPLE_PHOTOS
from pramana.photos.findings import _room_findings, credential_status
from pramana.verification import base as vb

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
IST = timezone(timedelta(hours=5, minutes=30))
WORDS = re.compile(r"\b(forged|forgery|fake|fraud\w*|genuine)\b", re.I)


def _jpeg(color=(90, 120, 160)) -> bytes:
    im = Image.new("RGB", (640, 480), color)
    ImageDraw.Draw(im).rectangle([100, 120, 300, 260], fill=(30, 30, 40))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=90)
    return b.getvalue()


@pytest.fixture(scope="module")
def capture():
    ca = demo_capture.build_ca()
    dev = demo_capture.device(ca, "Campus camera 01 (DEMO)", "Test Institute (DEMO)")
    return ca[0].public_bytes(serialization.Encoding.PEM).decode(), dev


@pytest.fixture
def trust(monkeypatch, capture):
    monkeypatch.setattr(credentials, "_trust_pem", lambda: capture[0])


def test_valid_credentials_verify_against_the_demo_list(trust, capture):
    signed = demo_capture.sign_jpeg(_jpeg(), capture[1], "lab.jpg", datetime(2025, 11, 18, 10, 31, tzinfo=IST))
    c = credentials.read(signed, "image/jpeg")
    assert c["present"] and c["readable"] and c["signature_valid"] and c["trusted"] and c["hash_matches"]
    assert c["capture_time"].startswith("2025-11-18T10:31")
    assert c["signer"]["common_name"] == "Campus camera 01 (DEMO)"
    assert c["chain"][-1]["subject"] == credentials.DEMO_CA_NAME and "DEMO" in c["chain"][-1]["role"]
    status, detail, _ = credential_status(c)
    assert status == vb.VERIFIED and "DEMO" in detail


def test_pixels_edited_after_signing_break_the_signed_hash(trust, capture):
    signed = demo_capture.sign_jpeg(_jpeg(), capture[1], "lab.jpg", datetime(2025, 11, 18, 10, 31, tzinfo=IST))

    def paint(im):
        ImageDraw.Draw(im).rectangle([400, 300, 500, 400], fill=(200, 30, 30))
        return im

    c = credentials.read(demo_capture.edit_after_signing(signed, paint), "image/jpeg")
    assert c["signature_valid"] and c["hash_matches"] is False
    status, detail, _ = credential_status(c)
    assert status == vb.MISMATCH and "modified after capture" in detail


def test_missing_broken_and_untrusted_credentials(monkeypatch, capture):
    plain = _jpeg()
    assert credentials.read(plain, "image/jpeg")["present"] is False
    signed = demo_capture.sign_jpeg(plain, capture[1], "lab.jpg", datetime(2025, 11, 18, 10, 31, tzinfo=IST))
    monkeypatch.setattr(credentials, "_trust_pem", lambda: None)
    c = credentials.read(signed, "image/jpeg")
    assert c["signature_valid"] and c["hash_matches"] and not c["trusted"]
    assert credential_status(c)[0] == vb.MANUAL_REVIEW
    bad = bytearray(signed)
    i = bytes(bad).find(b"\xff\xeb")
    bad[i + 60:i + 80] = b"\x00" * 20
    c = credentials.read(bytes(bad), "image/jpeg")
    assert c["present"] and c["readable"] is False and c["error"]
    assert credential_status(c)[0] == vb.MANUAL_REVIEW


def test_credential_findings_carry_their_evidence_class():
    from pramana.photos.findings import photo_stage

    added = []
    db = SimpleNamespace(add=added.append)
    app = SimpleNamespace(id="APP-X", declared={})
    run = SimpleNamespace(id="run_x")
    ok = {"present": True, "readable": True, "signature_valid": True, "hash_matches": True, "trusted": True,
          "signer": {"common_name": "Campus camera 01 (DEMO)"}}

    def photo(name, c2pa):
        return SimpleNamespace(id=f"doc_{name}", original_filename=name, mime="image/jpeg", processing_status="processed",
                               analysis={"photo": {"c2pa": c2pa, "room": {"status": "not_analysed"}}})

    docs = [photo("a.jpg", ok), photo("b.jpg", {**ok, "hash_matches": False}),
            photo("c.jpg", {"present": True, "readable": False, "error": "Verify: expected JUMD"}),
            photo("d.jpg", {"present": False})]
    status: dict[str, str] = {}
    found = {f["document_id"]: f for f in photo_stage(db, app, run, docs, status)}
    assert set(found) == {"doc_b.jpg", "doc_c.jpg"}
    assert found["doc_b.jpg"]["code"] == "PH-C2PA-MODIFIED-AFTER-SIGNING"
    assert found["doc_b.jpg"]["evidence_class"] == "cryptographic"
    assert found["doc_c.jpg"]["code"] == "PH-C2PA-MANIFEST-INVALID"
    assert found["doc_c.jpg"]["evidence_class"] == "structural"
    assert [a.status for a in added] == [vb.VERIFIED, vb.MISMATCH, vb.MANUAL_REVIEW]
    assert all(a.simulated and a.channel == "content_credentials" for a in added)
    assert "doc_d.jpg" not in status and status["doc_a.jpg"] == vb.VERIFIED


def test_room_reading_from_object_mix():
    assert detector.room_reading({"workstation": 9, "seat": 4})[0] == "computer_lab"
    assert detector.room_reading({"workstation": 0, "seat": 12, "table": 3})[0] == "classroom"
    assert detector.room_reading({"workstation": 1, "book": 30})[0] == "library"
    assert detector.room_reading({"seat": 2})[0] == "unclear"


def test_detector_reports_not_analysed_instead_of_guessing(monkeypatch, tmp_path):
    monkeypatch.setattr(detector, "model_path", lambda: tmp_path / "missing.onnx")
    detector._session.cache_clear()
    try:
        r = detector.analyse(_jpeg())
    finally:
        detector._session.cache_clear()
    assert r["status"] == "not_analysed" and "not installed" in r["reason"]
    assert detector.analyse(b"not an image")["status"] == "not_analysed"


def test_room_indicators_are_low_weight_model_evidence():
    doc = SimpleNamespace(id="doc_x", original_filename="lab_photo.jpg")
    room = {"status": "analysed", "counts": {"workstation": 9, "seat": 12, "table": 2}, "room_type": "computer_lab",
            "room_basis": "9 visible workstations", "model": {"name": "YOLOX-M"}, "latency_ms": 200}
    fac = {"name": "Computer Lab 2 (EE)", "room_type": "computer_lab", "workstations": 60, "photo": "lab_photo.jpg"}
    out = _room_findings(doc, room, fac)
    assert [f["code"] for f in out] == ["PH-ROOM-FEW-WORKSTATIONS"]
    f = out[0]
    assert f["evidence_class"] == "model" and f["severity"] == "low" and f["outcome"] == "indicator"
    assert "Counted 9 visible workstations in 'lab_photo.jpg'; the declaration lists 60" in f["message"]
    assert "may not show the whole room" in f["message"]
    assert not _room_findings(doc, room, {**fac, "workstations": 24})
    classroom = {**room, "counts": {"workstation": 0, "seat": 14, "table": 4}, "room_type": "classroom",
                 "room_basis": "14 chairs or benches and 4 tables or desks, with no workstations"}
    codes = {x["code"] for x in _room_findings(doc, classroom, fac)}
    assert codes == {"PH-ROOM-TYPE-DIFFERS", "PH-ROOM-FEW-WORKSTATIONS"}
    for x in out + _room_findings(doc, classroom, fac):
        assert not WORDS.search(x["title"] + x["message"] + x["limitation"])


@pytest.mark.skipif(not detector.available() or not (ROOT / "fixtures" / "real" / "photos" /
                                                      SAMPLE_PHOTOS["baramati_lab"].name).exists(),
                    reason="run scripts/fetch_photo_assets.py for the detector weights and sample photos")
def test_detector_counts_workstations_in_a_real_lab_photo():
    data = (ROOT / "fixtures" / "real" / "photos" / SAMPLE_PHOTOS["baramati_lab"].name).read_bytes()
    r = detector.analyse(data)
    assert r["status"] == "analysed" and r["room_type"] == "computer_lab"
    assert r["counts"]["workstation"] >= 5 and r["latency_ms"] > 0
    assert all(0 <= v <= 1 for d in r["detections"] for v in d["box"])


# ---------------------------------------------------------------- API over the seeded world


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def world():
    from sqlalchemy import func, select

    from pramana.db import SessionLocal, init_db
    from pramana.models import ValidationRun

    if not (ROOT / "fixtures" / "out" / "manifest.json").exists():
        _load("make_fixtures").main()
    init_db()
    with SessionLocal() as db:
        seeded = db.scalar(select(func.count()).select_from(ValidationRun))
    if not seeded:
        _load("seed").main(validate=True)
    from pramana.main import app

    return app


def _login(app, user):
    from fastapi.testclient import TestClient

    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def test_campus_map_shows_the_a10_scenario(world):
    c = _login(world, "officer")
    m = c.get("/api/applications/APP-2026-000110/campus").json()
    assert m["record"] and m["threshold_km"] == 2.0 and m["map_tolerance_km"] == 0.5
    assert 2.3 <= m["declared"]["distance_km"] <= 2.9
    (p,) = m["photos"]
    assert p["geotag"] == "outside" and p["distance_km"] > 100
    assert p["reuse"][0]["other_application"] == "APP-2026-000101" and p["reuse"][0]["code"] == "XA-PHOTO-REUSED"
    assert p["c2pa"]["present"] is False
    r = c.get(f"/api/documents/{p['document_id']}/photo.jpg?size=thumb")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert r.content[:3] == b"\xff\xd8\xff"
    # The preview is cached encrypted, so no plaintext photo sits on disk and none counts as a legacy file
    from pramana import keyring
    from pramana.config import get_settings

    s = get_settings()
    cached = s.cache_dir / f"{p['document_id']}_thumb.jpg"
    assert keyring.is_envelope(cached.read_bytes()) and keyring.key_path(cached).exists()
    assert c.get(f"/api/documents/{p['document_id']}/photo.jpg?size=thumb").content == r.content
    assert keyring.inventory([s.storage_dir, s.cache_dir])["legacy_files"] == 0


def test_credentials_results_in_the_seeded_world(world):
    c = _login(world, "officer")
    a1 = c.get("/api/applications/APP-2026-000101/campus").json()["photos"][0]
    assert a1["c2pa"]["trusted"] and a1["c2pa"]["hash_matches"]
    ver = [v for v in c.get("/api/applications/APP-2026-000101/verifications").json()
           if v["channel"] == "content_credentials"]
    assert ver and ver[0]["status"] == "verified" and ver[0]["simulated"] is True
    assert ver[0]["response"]["evidence_class"] == "cryptographic"
    a1_codes = {f["code"] for f in c.get("/api/applications/APP-2026-000101/findings").json()}
    assert not any(x.startswith("PH-") for x in a1_codes)
    a7 = c.get("/api/applications/APP-2026-000107/findings").json()
    f = next(x for x in a7 if x["code"] == "PH-C2PA-MODIFIED-AFTER-SIGNING")
    assert f["evidence_class"] == "cryptographic" and f["severity"] == "medium"
    for x in c.get("/api/applications/APP-2026-000104/findings").json() + a7:
        if x["code"].startswith("PH-"):
            assert not WORDS.search(x["title"] + x["message"] + (x["limitation"] or ""))


def test_photo_evidence_is_officer_only(world):
    off = _login(world, "officer")
    doc = off.get("/api/applications/APP-2026-000110/campus").json()["photos"][0]["document_id"]
    inst = _login(world, "inst10")
    assert inst.get("/api/applications/APP-2026-000110/campus").status_code in (403, 404)
    assert inst.get(f"/api/documents/{doc}/photo.jpg").status_code in (403, 404)
    detail = inst.get(f"/api/documents/{doc}").json()
    assert "forensic_facts" not in detail and "photo" not in detail
    assert off.get("/api/applications/APP-NOT-THERE/campus").status_code == 404
