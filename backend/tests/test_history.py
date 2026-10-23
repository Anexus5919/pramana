"""Revision time machine, re-verification watch and year-over-year comparison, over the fixture world."""

import importlib.util
import io
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pdfplumber
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
A1, A2, A6, A7, A8, A9, A10 = (f"APP-2026-{n:06d}" for n in (101, 102, 106, 107, 108, 109, 110))
A6_NOC = "FES/KAR/2025/04502"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seeded() -> bool:
    from sqlalchemy.exc import OperationalError

    from pramana.db import SessionLocal, engine
    from pramana.history.models import ScrutinyOutcome
    from pramana.models import Application

    db = SessionLocal()
    try:
        return db.get(Application, A6) is not None and db.query(ScrutinyOutcome).count() > 0
    except OperationalError:
        return False
    finally:
        db.close()
        engine.dispose()


@pytest.fixture(scope="module")
def world():
    # Reuse the world test_e2e seeded in this session; seed it when this module runs alone
    if not _seeded():
        if not (ROOT / "fixtures" / "out" / "manifest.json").exists():
            _load("make_fixtures").main()
        _load("seed").main(validate=True)
    from pramana.main import app

    return json.loads((ROOT / "fixtures" / "out" / "manifest.json").read_text(encoding="utf-8")), app


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def _doc(c, app_id, doc_type):
    return next(d for d in c.get(f"/api/applications/{app_id}").json()["documents"]
                if d["declared_type"] == doc_type and not d["superseded"])


# ---- revision time machine


def test_time_machine_shows_the_date_overwritten_after_signing(world):
    _, app = world
    c = _login(app, "officer")
    doc = _doc(c, A7, "fire_noc")
    r = c.get(f"/api/documents/{doc['id']}/revisions").json()
    assert r["supported"] and r["revision_count"] == 3
    original, signed, edited = r["revisions"]
    assert original["kind"] == "original" and not original["after_last_signature"]
    assert [s["role"] for s in signed["signatures"]] == ["issuer"] and r["signed_through"] == 2
    assert edited["kind"] == "edit" and edited["after_last_signature"] and edited["covered_by"] == []
    change = edited["changes"][0]
    assert (change["added_text"], change["text_underneath"]) == ("30-06-2027", "30-06-2025")
    assert edited["start"] == signed["end"] and edited["end"] == r["size_bytes"]

    pngs = [c.get(f"/api/documents/{doc['id']}/revisions/{n}/pages/1.png") for n in (2, 3)]
    assert all(p.status_code == 200 and p.content[:8] == b"\x89PNG\r\n\x1a\n" for p in pngs)
    assert pngs[0].content != pngs[1].content
    assert c.get(f"/api/documents/{doc['id']}/revisions/4/pages/1.png").status_code == 404

    # The cut file is the revision: revision 2 has no trace of the later date
    from pramana.crypto import load_document
    from pramana.db import SessionLocal
    from pramana.history.revisions import revision_ends
    from pramana.models import Document

    db = SessionLocal()
    data = load_document(db.get(Document, doc["id"]).storage_name)
    db.close()
    ends = revision_ends(data)
    pages = []
    for e in ends[1:]:
        with pdfplumber.open(io.BytesIO(data[:e])) as pdf:
            pages.append((pdf.pages[0].extract_text(), len(pdf.pages[0].chars)))
    assert "30-06-2025" in pages[0][0] and "2027" not in pages[0][0]
    # Revision 3 draws ten more glyphs over the old date, which stays in the text layer underneath
    assert pages[1][1] - pages[0][1] == len("30-06-2027")


def test_time_machine_is_for_officials_only(world):
    _, app = world
    officer = _login(app, "officer")
    doc = _doc(officer, A7, "fire_noc")
    for user in ("inst7", "inst1"):
        c = _login(app, user)
        assert c.get(f"/api/documents/{doc['id']}/revisions").status_code == 403
        assert c.get(f"/api/documents/{doc['id']}/revisions/3/pages/1.png").status_code == 403
    # The owner's ordinary document view carries no forensic facts either
    assert "forensic_facts" not in _login(app, "inst7").get(f"/api/documents/{doc['id']}").json()
    assert officer.get("/api/documents/doc_missing/revisions").status_code == 404
    photo = _doc(officer, A1, "infrastructure_photo")
    assert officer.get(f"/api/documents/{photo['id']}/revisions").json()["supported"] is False


# ---- re-verification watch


def test_scrutiny_outcome_needs_an_officer_and_a_reason(world):
    _, app = world
    officer, verifier = _login(app, "officer"), _login(app, "verifier")
    url = f"/api/applications/{A9}/scrutiny-outcome"
    assert verifier.post(url, json={"outcome": "no_deficiency", "reason": "A long enough reason"}).status_code == 403
    assert officer.post(url, json={"outcome": "approve", "reason": "A long enough reason"}).status_code == 400
    assert officer.post(url, json={"outcome": "no_deficiency", "reason": "ok"}).status_code == 400
    r = officer.post(url, json={"outcome": "referred_for_visit", "reason": "Faculty shortfall needs an expert visit."})
    assert r.status_code == 200
    w = r.json()
    assert w["outcome"]["recorded_by"] and w["items"]
    assert all(i["baseline"]["status"] == "verified" and i["simulated"] for i in w["items"])
    # Unavailable and pending sources were never confirmed, so they are not watched
    assert "MUNICIPAL-OC" not in {i["issuer_code"] for i in w["items"]}
    assert "approv" not in json.dumps(w).lower()
    events = officer.get(f"/api/applications/{A9}/audit").json()
    assert any(e["action"] == "scrutiny.outcome_recorded" and e["details"]["reason"] for e in events)


def test_watch_reports_a_revocation_and_its_restoration(world):
    _, app = world
    c = _login(app, "officer")
    w = c.get(f"/api/applications/{A6}/watch").json()
    assert w["outcome"] and A6_NOC in {i["ref_no"] for i in w["items"]}
    assert _login(app, "verifier").post("/api/sim/issuers/FIRE-SERVICES/records/status",
                                        json={"ref_no": A6_NOC, "status": "revoked"}).status_code == 403
    assert c.post("/api/sim/issuers/FIRE-SERVICES/records/status",
                  json={"ref_no": "FES/NONE/1", "status": "revoked"}).status_code == 404

    r = c.post("/api/sim/issuers/FIRE-SERVICES/records/status",
               json={"ref_no": A6_NOC, "status": "revoked", "note": "Hydrant system not working"})
    assert r.status_code == 200 and r.json()["simulated"]
    run = c.post("/api/watch/run").json()
    assert [(x["application_id"], x["change"]) for x in run["changes"]] == [(A6, "revoked")]
    assert c.post("/api/watch/run").json()["changes"] == []  # reported once, not on every pass

    f = next(f for f in c.get(f"/api/applications/{A6}/findings").json() if f["code"] == "WATCH-ISSUER-REVOKED")
    assert f["evidence_class"] == "issuer" and f["severity"] == "high" and "SIMULATED" in f["limitation"]
    assert "Hydrant system not working" in f["message"] and "an official decides" in f["message"]
    alerts = c.get("/api/dashboard").json()["alerts"]
    assert alerts[0]["kind"] == "watch_change" and alerts[0]["application_id"] == A6
    assert sum(a["finding_id"] == f["id"] for a in alerts) == 1
    assert any(e["action"] == "watch.change_detected" for e in c.get(f"/api/applications/{A6}/audit").json())

    c.post("/api/sim/issuers/FIRE-SERVICES/records/status", json={"ref_no": A6_NOC, "status": "valid"})
    assert [x["change"] for x in c.post("/api/watch/run").json()["changes"]] == ["restored"]
    assert not any(a["kind"] == "watch_change" for a in c.get("/api/dashboard").json()["alerts"])
    assert c.get("/api/audit/verify").json()["intact"]


def test_watch_checks_validity_against_today_and_keeps_a_schedule(world):
    _, app = world
    from pramana.history import watch

    later = watch.run_watch("manual", "test", today=date(2028, 3, 12))
    expired = {(x["application_id"], x["change"]) for x in later["changes"]}
    assert (A6, "expired") in expired and (A1, "expired") in expired
    again = watch.run_watch("manual", "test")
    assert {x["change"] for x in again["changes"]} == {"restored"}

    # A registry that stops answering is reported as unavailable, never as a mismatch
    from pramana.sim import issuers as sim

    sim.set_availability("FIRE-SERVICES", False)
    try:
        down = watch.run_watch("manual", "test")
    finally:
        sim.set_availability("FIRE-SERVICES", True)
    assert {x["change"] for x in down["changes"]} == {"source_unavailable"}
    assert all(x["severity"] == "medium" for x in down["changes"])
    assert {x["change"] for x in watch.run_watch("manual", "test")["changes"]} == {"restored"}

    c = _login(app, "officer")
    s = c.get("/api/watch").json()
    last = datetime.fromisoformat(s["last_run"]["finished_at"])
    assert datetime.fromisoformat(s["next_check"]) - last == timedelta(hours=s["interval_hours"])


# ---- year over year


def test_year_over_year_indicators_match_the_planted_conditions(world):
    manifest, app = world
    c = _login(app, "officer")
    planted = {"A2": "YOY-CERT-REUSED-NEW-VALIDITY", "A4": "YOY-INTAKE-JUMP", "A8": "YOY-FACULTY-TURNOVER",
               "A10": "YOY-LAND-AREA-DECREASED"}
    for a in manifest["applications"]:
        y = c.get(f"/api/applications/{a['id']}/since-last-year").json()
        assert y["available"] and y["previous"]["academic_year"] == "2025-26"
        got = {i["code"] for i in y["indicators"]}
        assert got == ({planted[a["key"]]} if a["key"] in planted else set()), a["key"]
        assert all(i["evidence_class"] == "record" and i["rule"]["citation"] for i in y["indicators"])
        assert {code for code in a["expected"] if code.startswith("YOY-")} == got, a["key"]

    a8 = c.get(f"/api/applications/{A8}/since-last-year").json()
    assert a8["faculty"]["replaced_share"] > 0.5 and len(a8["faculty"]["removed"]) == 22
    cite = a8["indicators"][0]["rule"]["citation"]
    assert cite["related_rule"] == "XD-FACULTY-COUNT" and cite["doc"] == "APH"
    a2 = c.get(f"/api/applications/{A2}/since-last-year").json()
    fire = next(x for x in a2["certificates"] if x["type"] == "fire_noc")
    assert fire["status"] == "reused_new_validity" and fire["before_number"] == fire["after_number"]
    # A benign institution still shows ordinary change: new numbers, an upgrade, a few faculty moving
    a1 = c.get(f"/api/applications/{A1}/since-last-year").json()
    assert {x["status"] for x in a1["certificates"]} >= {"new_number", "unchanged"}
    assert next(s for s in a1["scalars"] if s["key"] == "internet_bandwidth_mbps")["status"] == "increased"
    assert 0 < a1["faculty"]["replaced_share"] < 0.5
    assert _login(app, "inst8").get(f"/api/applications/{A8}/since-last-year").status_code == 403


def test_year_over_year_compare_flags_only_implausible_changes():
    from pramana.history.yoy import compare, indicators
    from pramana.rules.engine import active_ruleset

    prev = {"academic_year": "2025-26", "application_id": "APP-2025-1", "land_area_acres": 12.0,
            "built_up_area_sqm": 14000, "faculty_ids": [f"F{i}" for i in range(10)],
            "programmes": [{"code": "CE", "name": "CE", "approved_intake": 60}],
            "certificates": {"fire_noc": {"number": "FES/1", "valid_until": "2026-01-01"},
                             "occupancy_certificate": {"number": "OC/1"}}}
    cur = {"land_area_acres": 12.0, "built_up_area_sqm": 14500, "faculty_ids": [f"F{i}" for i in range(2, 12)],
           "programmes": [{"code": "CE", "name": "CE", "approved_intake": 60, "proposed_intake": 60}],
           "certificates": {"fire_noc": {"number": "FES/2", "valid_until": "2027-01-01"},
                            "occupancy_certificate": {"number": "OC/1"}}, "labs": []}
    rec = SimpleNamespace(id="ref_x", source="test record", data=prev)
    rs = active_ruleset()
    assert indicators(rec, SimpleNamespace(category="EOA"), compare(prev, cur), rs) == []

    cur |= {"land_area_acres": 9.5, "faculty_ids": [f"F{i}" for i in range(6, 16)],
            "programmes": [{"code": "CE", "name": "CE", "approved_intake": 120, "proposed_intake": 120}],
            "certificates": {"fire_noc": {"number": "FES/1", "valid_until": "2027-01-01"}}}
    got = {i["code"] for i in indicators(rec, SimpleNamespace(category="EOA"), compare(prev, cur), rs)}
    assert got == {"YOY-LAND-AREA-DECREASED", "YOY-FACULTY-TURNOVER", "YOY-CERT-REUSED-NEW-VALIDITY",
                   "YOY-INTAKE-JUMP"}
    # The same intake rise is the point of an Increase in Intake application
    got = {i["code"] for i in indicators(rec, SimpleNamespace(category="INCREASE_INTAKE"), compare(prev, cur), rs)}
    assert "YOY-INTAKE-JUMP" not in got
