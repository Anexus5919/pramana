"""Pre-submission readiness check: a dry run an institution can read, with nothing officers would not see."""

import importlib.util
import json
import re
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIX = ROOT / "fixtures" / "out"
CODE = re.compile(r"\b(?:APH|ADD26|PN2627|XR|XD|XA|FX|VER|SEC|PH|YOY|RECT|DOC|FIELD)-[A-Z0-9_-]+")
SLOTS = ["fire_noc", "occupancy_certificate", "affidavit_2", "ter_receipt", "satellite_map", "audited_accounts",
         "faculty_list"]


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _copy_db(src: Path, dst: Path) -> None:
    # SQLite's backup API copies a consistent image, write-ahead log included
    s, d = sqlite3.connect(src), sqlite3.connect(dst)
    with d:
        s.backup(d)
    s.close()
    d.close()


@pytest.fixture(scope="module")
def world():
    """Reuse the world test_e2e seeded (seed it when this module runs alone), and put the database back
    afterwards: these tests open rectification rounds and add drafts that later modules must not see."""
    from pramana.config import get_settings
    from pramana.db import SessionLocal, engine, init_db
    from pramana.models import ValidationRun

    init_db()
    db = SessionLocal()
    seeded = db.scalar(select(func.count()).select_from(ValidationRun)) > 0
    db.close()
    engine.dispose()
    if not seeded:
        if not (FIX / "manifest.json").exists():
            _load("make_fixtures").main()
        _load("seed").main(validate=True)
    from pramana.main import app

    live = get_settings().data_dir / "pramana.db"
    saved = live.with_name("pramana.readiness-tests.db")
    engine.dispose()
    _copy_db(live, saved)
    manifest = json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))
    yield {a["key"]: a for a in manifest["applications"]}, app
    engine.dispose()
    _copy_db(saved, live)
    saved.unlink()


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def _draft(c, spec, year="2027-28", declared=None, files=None, slots=SLOTS):
    r = c.post("/api/applications", json={"category": spec["category"], "academic_year": year,
                                          "declared": declared or spec["declared"]})
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    paths = {d["declared_type"]: FIX / d["file"] for d in spec["documents"]}
    paths.update(files or {})
    for t in slots:
        up = c.post(f"/api/applications/{aid}/documents", data={"declared_type": t},
                    files={"file": (paths[t].name, paths[t].read_bytes(), "application/pdf")})
        assert up.status_code == 200, up.text
    return aid


def _items(res):
    return {i["id"]: i for g in res["groups"] for i in g["items"]}


def _by_title(res, text):
    return next(i for i in _items(res).values() if text in i["title"])


def test_missing_documents_point_to_their_slots_and_change_nothing(world):
    from pramana.db import SessionLocal
    from pramana.models import Application, Document, ValidationRun

    apps, app = world
    c = _login(app, "inst1")
    aid = _draft(c, apps["A1"], slots=["fire_noc", "occupancy_certificate", "affidavit_2"])
    res = c.post(f"/api/applications/{aid}/readiness").json()
    items = _items(res)
    assert res["state"] == "fix"
    for t in ("ter_receipt", "satellite_map", "audited_accounts", "faculty_list"):
        it = items[f"doc-{t}"]
        assert it["status"] == "fix" and it["action"].startswith("Upload")
        assert it["targets"] == [{"kind": "document", "key": t, "label": it["targets"][0]["label"]}]
        assert it["clause"]["page"] == 97
    assert items["doc-fire_noc"]["status"] == "met"
    # The faculty-student ratio waits for the faculty roster rather than failing
    assert _by_title(res, "Faculty-student ratio")["status"] == "waiting"
    # A dry run: no run, no status change, and the draft files keep their unprocessed state
    db = SessionLocal()
    assert db.get(Application, aid).status == "draft"
    assert db.scalar(select(func.count()).select_from(ValidationRun).where(ValidationRun.application_id == aid)) == 0
    docs = db.scalars(select(Document).where(Document.application_id == aid)).all()
    assert docs and all(d.processing_status == "pending" and not d.fields and not d.pages for d in docs)
    db.close()


def test_expired_certificate_and_norm_shortfall(world):
    apps, app = world
    c = _login(app, "inst3")
    aid = _draft(c, apps["A3"], declared={**apps["A3"]["declared"], "internet_bandwidth_mbps": 50})
    res = c.post(f"/api/applications/{aid}/readiness").json()
    fire = _by_title(res, "Fire Safety Certificate has expired")
    assert fire["status"] == "fix" and fire["group"] == "validity"
    assert fire["action"] == "Upload a Fire Safety Certificate valid until at least 30 June 2028."
    assert fire["clause"]["quote"] and fire["clause"]["page"] == 73
    assert "30 September 2025" in fire["detail"]
    bw = _by_title(res, "Internet bandwidth is below")
    assert bw["status"] == "fix" and {"kind": "figure", "key": "internet_bandwidth_mbps",
                                      "label": "Internet bandwidth"} in bw["targets"]
    assert "100 Mbps" in bw["action"]
    assert res["counts"]["fix"] == 2


def test_ready_draft_and_a_note_for_a_certificate_lapsing_in_session(world):
    apps, app = world
    c = _login(app, "inst3")
    aid = _draft(c, apps["A3"], files={"fire_noc": FIX / "rectification" / "A3_fire_noc_renewed.pdf"})
    res = c.post(f"/api/applications/{aid}/readiness").json()
    assert res["state"] == "ready" and res["counts"]["fix"] == 0 and res["counts"]["waiting"] == 0
    fire = _by_title(res, "Fire Safety Certificate is valid")
    assert fire["status"] == "met" and "19 December 2027" in fire["advice"]["text"]
    # Built in 2011, so the conditional certificate is explained rather than demanded
    assert any("Structural Stability Certificate is not needed" in n for n in res["notes"])
    # A second check reuses what was read, well inside the time budget
    again = c.post(f"/api/applications/{aid}/readiness").json()
    assert again["fresh_reads"] == 0 and again["duration_ms"] < 5000


def test_old_building_needs_the_structural_stability_certificate(world):
    apps, app = world
    c = _login(app, "inst2")
    aid = _draft(c, apps["A2"])
    item = _items(c.post(f"/api/applications/{aid}/readiness").json())["doc-structural_stability"]
    assert item["status"] == "fix" and "30 years" in item["conditional"]
    assert "thirty years" in item["clause"]["quote"]


def test_rectification_round_marks_what_aicte_asked_for(world):
    apps, app = world
    # A7's fire certificate expired; the end-to-end module already corrected A3's
    aid = apps["A7"]["id"]
    officer = _login(app, "officer")
    fire = next(f for f in officer.get(f"/api/applications/{aid}/findings").json()
                if f["code"] == "APH-617I-FIRE-VALID")
    assert officer.post(f"/api/applications/{aid}/rectification",
                        json={"finding_ids": [fire["id"]], "message": "Upload a valid certificate"}).status_code == 200
    inst = _login(app, "inst7")
    res = inst.post(f"/api/applications/{aid}/readiness").json()
    assert res["resubmission"] and res["counts"]["requested_fix"] >= 1
    item = _by_title(res, "Fire Safety Certificate has expired")
    assert item["requested"] and item["action"].endswith("30 June 2027.")
    assert res["counts"]["requested"] >= 1 and not any(i["requested"] for i in _items(res).values()
                                                        if i["group"] == "norms")
    renewed = (FIX / "rectification" / "A3_fire_noc_renewed.pdf").read_bytes()
    inst.post(f"/api/applications/{aid}/documents", data={"declared_type": "fire_noc"},
              files={"file": ("fire_noc_renewed.pdf", renewed, "application/pdf")})
    after = inst.post(f"/api/applications/{aid}/readiness").json()
    assert _by_title(after, "Fire Safety Certificate is valid")["requested"]
    assert after["counts"]["requested_fix"] == 0 and after["state"] == "ready"


def test_no_forensic_consistency_or_verification_output(world):
    """Applications planted with forensic, cross-application and issuer conditions: the institution's check
    carries none of them, by code, title or wording."""
    from pramana.api.applications import latest_run
    from pramana.db import SessionLocal
    from pramana.models import Application, Finding
    from pramana.officer.common import FORBIDDEN_WORDS, RECTIFIABLE_CATEGORIES
    from pramana.pipeline.validate import run_validation

    apps, app = world
    seen_hidden = 0
    for key in ("A5", "A7", "A11", "A4"):
        spec = apps[key]
        db = SessionLocal()
        a = db.get(Application, spec["id"])
        run = latest_run(db, a.id) or run_validation(db, a, "system", "system")
        hidden = [f for f in db.scalars(select(Finding).where(Finding.run_id == run.id))
                  if f.category not in RECTIFIABLE_CATEGORIES]
        seen_hidden += len(hidden)
        a.status = "rectification_requested"
        db.commit()
        db.close()
        c = _login(app, f"inst{spec['institution'][1:]}")
        res = c.post(f"/api/applications/{spec['id']}/readiness")
        assert res.status_code == 200, res.text
        text = res.text
        assert not CODE.search(text), CODE.search(text).group(0)
        assert not FORBIDDEN_WORDS.search(text)
        for f in hidden:
            assert f.title not in text and f.message not in text, f.code
        for word in ("forensic", "indicator", "consistency", "issuer", "registry", "detector"):
            assert word not in text.lower(), word
        body = res.json()
        assert {g["id"] for g in body["groups"]} == {"documents", "validity", "norms"}
        assert all(i["status"] in ("met", "fix", "waiting") for g in body["groups"] for i in g["items"])
    assert seen_hidden >= 10  # the planted conditions were really there to leak


def test_access_and_audit_counts_only(world):
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent

    apps, app = world
    c = _login(app, "inst1")
    aid = _draft(c, apps["A1"], slots=["fire_noc"])
    assert _login(app, "officer").post(f"/api/applications/{aid}/readiness").status_code == 403
    assert _login(app, "inst2").post(f"/api/applications/{aid}/readiness").status_code == 404
    assert c.post("/api/applications/APP-2026-000101/readiness").status_code == 409
    assert c.post(f"/api/applications/{aid}/readiness").status_code == 200
    db = SessionLocal()
    ev = db.scalars(select(AuditEvent).where(AuditEvent.application_id == aid)
                    .order_by(AuditEvent.seq.desc()).limit(1)).first()
    assert ev.action == "readiness.checked"
    assert set(ev.details) == {"met", "to_fix", "waiting", "advice", "files_read"}
    assert all(isinstance(v, int) for v in ev.details.values())
    db.close()


def test_wrong_file_in_a_slot_and_missing_figures(world):
    apps, app = world
    c = _login(app, "inst1")
    aid = _draft(c, apps["A1"], declared={"faculty_count": 36}, slots=["fire_noc"],
                 files={"fire_noc": FIX / apps["A1"]["documents"][1]["file"]})
    assert apps["A1"]["documents"][1]["declared_type"] == "occupancy_certificate"
    res = c.post(f"/api/applications/{aid}/readiness").json()
    fire = _items(res)["doc-fire_noc"]
    assert fire["status"] == "fix" and "different document" in fire["title"]
    assert "Occupancy" in fire["detail"]
    bw = _by_title(res, "Internet bandwidth tier cannot be checked yet")
    assert bw["targets"] == [{"kind": "figure", "key": "internet_bandwidth_mbps", "label": "Internet bandwidth"}]
    assert _by_title(res, "Administrative and amenities areas cannot be checked yet")["targets"][0]["key"] == "programmes"
