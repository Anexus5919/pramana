"""End-to-end over the synthetic fixture world, in an isolated data directory."""

import importlib.util
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def world():
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


def test_planted_conditions_match_ground_truth(world):
    manifest, app = world
    c = _login(app, "officer")
    for a in manifest["applications"]:
        got = {f["code"] for f in c.get(f"/api/applications/{a['id']}/findings").json()}
        assert got == set(a["expected"]), a["key"]
    titles = {f["title"] for f in c.get("/api/applications/APP-2026-000107/findings").json()}
    assert "Fire Safety Certificate: expired (signed QR)" in titles


def test_replay_reproduces_the_report(world):
    _, app = world
    c = _login(app, "officer")
    run_id = c.get("/api/applications/APP-2026-000107").json()["latest_run"]["id"]
    r = c.post(f"/api/runs/{run_id}/replay").json()
    assert r["inputs_identical"] and r["report_identical"]


def test_institutions_cannot_see_each_other(world):
    _, app = world
    c = _login(app, "inst1")
    assert [a["id"] for a in c.get("/api/applications").json()] == ["APP-2026-000101"]
    assert c.get("/api/applications/APP-2026-000107").status_code == 404
    assert c.get("/api/dashboard").status_code == 403
    assert c.post("/api/applications/APP-2026-000107/validate").status_code == 403


def test_csrf_and_reasons_are_enforced(world):
    _, app = world
    c = _login(app, "officer")
    f = c.get("/api/applications/APP-2026-000105/findings").json()[0]
    assert c.post(f"/api/findings/{f['id']}/review", json={"action": "dismiss"}).status_code == 400
    bare = TestClient(app)
    bare.cookies = c.cookies
    assert bare.post(f"/api/findings/{f['id']}/review", json={"action": "acknowledge"}).status_code == 403


def test_audit_chain_detects_tampering(world):
    _, app = world
    from pramana import audit
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent

    db = SessionLocal()
    assert audit.verify_chain(db)["intact"]
    ev = db.get(AuditEvent, 3)
    original = dict(ev.details)
    ev.details = {**original, "tampered": True}
    db.commit()
    res = audit.verify_chain(db)
    assert not res["intact"] and res["first_broken_seq"] == 3
    ev.details = original
    db.commit()
    assert audit.verify_chain(db)["intact"]
    db.close()


def test_rectification_round_resolves_and_flags_out_of_scope_changes(world):
    _, app = world
    officer = _login(app, "officer")
    aid = "APP-2026-000103"
    fire = next(f for f in officer.get(f"/api/applications/{aid}/findings").json()
                if f["code"] == "APH-617I-FIRE-VALID")
    r = officer.post(f"/api/applications/{aid}/rectification", json={"finding_ids": [fire["id"]],
                                                                    "message": "Upload a valid certificate"})
    assert r.status_code == 200 and r.json()["round"] == 2

    inst = _login(app, "inst3")
    assert [f["code"] for f in inst.get(f"/api/applications/{aid}/findings").json()]
    renewed = (ROOT / "fixtures" / "out" / "rectification" / "A3_fire_noc_renewed.pdf").read_bytes()
    up = inst.post(f"/api/applications/{aid}/documents", data={"declared_type": "fire_noc"},
                   files={"file": ("fire_noc_renewed.pdf", renewed, "application/pdf")})
    assert up.status_code == 200, up.text
    declared = inst.get(f"/api/applications/{aid}").json()["declared"]
    declared["internet_bandwidth_mbps"] = 500
    assert inst.patch(f"/api/applications/{aid}/declared", json={"declared": declared}).status_code == 200
    run = inst.post(f"/api/applications/{aid}/submit").json()["run"]
    assert run["status"] == "complete"

    codes = {f["code"] for f in officer.get(f"/api/applications/{aid}/findings").json()}
    assert "APH-617I-FIRE-VALID" not in codes
    assert "RECT-OUT-OF-SCOPE-FIELD" in codes
    scope = next(f for f in officer.get(f"/api/applications/{aid}/findings").json()
                 if f["code"] == "RECT-OUT-OF-SCOPE-FIELD")
    assert "in correction round 1, outside the items requested" in scope["message"]
    full = officer.get(f"/api/runs/{run['id']}").json()
    assert any(x["code"] == "APH-617I-FIRE-VALID" for x in full["resolved_since_previous"])

    # The round keeps the application's reference date however late the institution resubmits: the 2024-25
    # accounts still answer for the previous year, and the renewed certificate is judged on the day it was sent
    from pramana.db import SessionLocal
    from pramana.models import RectificationRequest

    db = SessionLocal()
    rect = db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == aid)).one()
    rect.responded_at = datetime(2027, 5, 3, 10, tzinfo=UTC)
    db.commit()
    db.close()
    later = officer.post(f"/api/applications/{aid}/validate").json()
    assert later["status"] == "complete" and later["as_of"] == "2025-12-10"
    codes = {f["code"] for f in officer.get(f"/api/applications/{aid}/findings").json()}
    assert not codes & {"XD-ACCOUNTS-ENTITY", "APH-A31D-FIRE-BEFORE", "APH-617I-FIRE-VALID"}
    rules = {c["rule_id"]: c for c in later["checklist"]}
    assert rules["XD-ACCOUNTS-ENTITY"]["outcome"] == "pass"
    fire_rule = rules["APH-617I-FIRE-VALID"]
    assert fire_rule["outcome"] == "pass" and "2027-05-03" in fire_rule["message"]
    assert any(i["path"] == "doc.fire_noc.submitted_on" for i in fire_rule["inputs"])
    assert rules["APH-A31D-FIRE-BEFORE"]["outcome"] == "pass"
