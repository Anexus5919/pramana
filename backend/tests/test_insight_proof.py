"""Proof-strength matrix, certificate coverage calendar and the in-session expiry finding."""

import importlib.util
import json
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
A1, A7, A8, A10 = (f"APP-2026-{n:06d}" for n in (101, 107, 108, 110))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seeded() -> bool:
    from sqlalchemy.exc import OperationalError

    from pramana.db import SessionLocal, engine
    from pramana.models import Application

    db = SessionLocal()
    try:
        return db.get(Application, A10) is not None
    except OperationalError:
        return False
    finally:
        db.close()
        engine.dispose()


@pytest.fixture(scope="module")
def world():
    # Reuse a world another module seeded in this session; seed it when this module runs alone
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


def _insights(app, app_id):
    r = _login(app, "officer").get(f"/api/applications/{app_id}/insights/proof")
    assert r.status_code == 200
    return r.json()


def _row(data, row_id):
    return next(r for r in data["matrix"]["rows"] if r["id"] == row_id)


# ---------------------------------------------------------------- pure helpers


def test_session_window_and_time_bound_types_come_from_the_ruleset():
    from pramana.insights import proof
    from pramana.rules.engine import active_ruleset

    rs = active_ruleset()
    s = proof.session_window(rs, "2026-27")
    assert (s["start"], s["end"], s["assumed"]) == (date(2026, 7, 1), date(2027, 6, 30), True)
    assert proof.session_window(rs, "not a year") is None
    tb = proof.time_bound_types(rs)
    # Printed validity dates, and a validity period read from the rule that judges the certificate
    assert tb["fire_noc"]["end_field"] == "valid_until" and tb["nba_certificate"]["start_field"] == "valid_from"
    assert tb["structural_stability"]["days"] == 1826 and tb["structural_stability"]["rule"]["id"] == "APH-617H-SSC-VALID"
    assert "occupancy_certificate" not in tb
    as_of = date(2025, 12, 13)
    assert proof.classify(date(2026, 9, 30), as_of, s)[0] == "expires_in_session"
    assert round(proof.classify(date(2026, 9, 30), as_of, s)[1]) == 3
    assert proof.classify(date(2026, 3, 1), as_of, s)[0] == "lapses_before_session"
    assert proof.classify(date(2025, 6, 30), as_of, s)[0] == "expired_at_submission"
    assert proof.classify(date(2027, 6, 30), as_of, s)[0] == "covers_session"
    assert proof.classify(None, as_of, s)[0] == "unknown"


def _fake_doc(valid_until: str, doc_type: str = "fire_noc"):
    fields = [SimpleNamespace(name="issue_date", value="2024-10-01", raw="01-10-2024", page=1, bbox=[1, 2, 3, 4]),
              SimpleNamespace(name="valid_until", value=valid_until, raw=valid_until, page=1, bbox=[5, 6, 7, 8])]
    return SimpleNamespace(id="doc_x", declared_type=doc_type, processing_status="processed", fields=fields, round=1,
                           uploaded_at=datetime(2025, 12, 1))


def test_session_finding_only_for_certificates_that_lapse_before_the_session_ends():
    from pramana.insights import proof
    from pramana.rules.engine import active_ruleset

    rs = active_ruleset()
    app = SimpleNamespace(academic_year="2026-27")
    as_of = date(2025, 12, 13)
    fp = lambda *p: "|".join(map(str, p))  # noqa: E731
    out = proof.session_findings(rs, app, [_fake_doc("2026-09-30")], as_of, fp)
    assert len(out) == 1
    f = out[0]
    assert (f["code"], f["severity"], f["evidence_class"], f["category"]) == (
        "XD-CERT-EXPIRES-IN-SESSION", "medium", "rule", "validity")
    assert "3 months into the session" in f["message"] and "30-09-2026" in f["message"]
    assert f["rule"]["citation"]["doc"] == "APH" and "configuration" in f["limitation"]
    assert f["evidence"][0] == {"kind": "region", "document_id": "doc_x", "page": 1, "bbox": [5, 6, 7, 8],
                                "label": "valid_until", "value": "2026-09-30", "raw": "2026-09-30"}
    # Valid through the session, or already expired (the submission-date rule covers that): no finding
    assert proof.session_findings(rs, app, [_fake_doc("2028-03-11")], as_of, fp) == []
    assert proof.session_findings(rs, app, [_fake_doc("2025-06-30")], as_of, fp) == []
    before = proof.session_findings(rs, app, [_fake_doc("2026-04-30")], as_of, fp)
    assert before[0]["title"] == "Fire Safety Certificate lapses before the 2026-27 session starts"


# ---------------------------------------------------------------- over the seeded world


def test_rows_derive_from_the_ruleset_and_every_rule_lands_once(world):
    from pramana.api.applications import latest_run
    from pramana.db import SessionLocal
    from pramana.models import Application

    _, app = world
    data = _insights(app, A1)
    m = data["matrix"]
    assert [lv["id"] for lv in m["levels"]] == ["declared", "present", "read", "record", "issuer", "crypto"]
    assert m["levels"][4]["simulated"] is True
    db = SessionLocal()
    try:
        run = latest_run(db, db.get(Application, A1).id)
        applied = [c for c in run.summary["checklist"] if c["outcome"] != "not_applicable"]
    finally:
        db.close()
    assert sum(r["rule_count"] for r in m["rows"]) == len(applied)
    ids = [r["id"] for r in m["rows"]]
    assert {"fire", "building", "faculty", "intake", "fees", "affidavit", "nba"} <= set(ids) and "other" not in ids
    assert all(len(r["levels"]) == 6 for r in m["rows"])
    # The clean application: nothing contradicted, fire safety proven by the issuer's signature and QR
    assert m["summary"]["contradicted"] == []
    fire = _row(data, "fire")
    assert fire["strongest"] == 5 and fire["verdict"]["kind"] == "proven"
    assert {i["channel"] for i in fire["levels"][5]["items"] if i["kind"] == "attempt"} >= {"issuer_signature", "signed_qr"}
    assert m["summary"]["text"].startswith(f"{m['summary']['proven']} of {len(ids)} requirements are proven")


def test_signature_modified_after_signing_shows_as_contradiction_at_every_issuer_level(world):
    _, app = world
    data = _insights(app, A7)
    fire = _row(data, "fire")
    states = [lv["state"] for lv in fire["levels"]]
    assert states[2] == "against" and states[4] == "against" and states[5] == "against"
    assert fire["verdict"]["kind"] == "contradicted"
    assert "the issuer's signature" in fire["verdict"]["text"] and "the issuer registry" in fire["verdict"]["text"]
    assert "fire safety is contradicted by the issuer's signature" in data["matrix"]["summary"]["text"]
    crypto = fire["levels"][5]["items"]
    sig = next(i for i in crypto if i["kind"] == "attempt" and i["channel"] == "issuer_signature")
    assert sig["status"] == "mismatch_detected" and sig["finding_id"]
    rule = next(i for i in fire["levels"][2]["items"] if i["kind"] == "rule" and i["rule_id"] == "APH-617I-FIRE-VALID")
    assert rule["effect"] == "against" and rule["citation"]["section"].startswith("Cl. 6.17(i)") and rule["finding_id"]
    # Coverage: the text layer, QR and registry agree on 30-06-2025; the page shows the overwritten 2027 date
    cov = data["coverage"]
    c = next(x for x in cov["certificates"] if x["doc_type"] == "fire_noc")
    assert c["status"] == "expired_at_submission" and c["end"]["date"] == "2025-06-30" and c["end"]["page"]
    overlay = next(a for a in c["alternatives"] if a["kind"] == "page_overlay")
    assert overlay["date"] == "2027-06-30" and overlay["differs"] and overlay["status"] == "covers_session"
    assert not any(a["differs"] for a in c["alternatives"] if a["kind"] in ("signed_qr", "issuer_registry"))
    assert "the page shows 30 Jun 2027, not 30 Jun 2025" in cov["summary"]


def test_applicant_signature_alone_never_counts_as_issuer_proof(world):
    _, app = world
    fire = _row(_insights(app, A8), "fire")
    assert fire["levels"][4]["state"] == "against"
    assert fire["levels"][5]["state"] != "supports"
    applicant = [i for i in fire["levels"][5]["items"] if i["kind"] == "attempt" and i["channel"] == "applicant_signature"]
    assert applicant and all(i["effect"] == "info" for i in applicant)


def test_in_session_expiry_is_a_finding_a_calendar_bar_and_a_queue_alert(world):
    _, app = world
    c = _login(app, "officer")
    fs = c.get(f"/api/applications/{A10}/findings").json()
    f = next(x for x in fs if x["code"] == "XD-CERT-EXPIRES-IN-SESSION")
    assert (f["severity"], f["evidence_class"], f["category"]) == ("medium", "rule", "validity")
    assert f["title"] == "Fire Safety Certificate expires during the 2026-27 session"
    data = _insights(app, A10)
    cert = next(x for x in data["coverage"]["certificates"] if x["doc_type"] == "fire_noc")
    assert cert["status"] == "expires_in_session" and cert["end"]["date"] == "2026-09-30"
    assert cert["headline"] == "Expires 3 months into the session" and cert["finding_id"] == f["id"]
    assert data["coverage"]["session"] == {"label": "2026-27", "start": "2026-07-01", "end": "2027-06-30",
                                           "basis": "configuration", "source": "CONFIG", "assumed": True}
    assert any("expires during the 2026-27 session" in n for n in _row(data, "fire")["notes"])
    alert = next(a for a in c.get("/api/dashboard").json()["alerts"] if a["kind"] == "session_expiry")
    assert alert["title"] == "1 certificate expires during the 2026-27 session"
    assert (alert["application_id"], alert["finding_id"], alert["severity"]) == (A10, f["id"], "medium")
    # Apps whose certificates cover the session carry no such finding
    assert not any(x["code"] == "XD-CERT-EXPIRES-IN-SESSION" for x in c.get(f"/api/applications/{A1}/findings").json())


def test_institutions_never_see_the_officer_insights(world):
    _, app = world
    r = _login(app, "inst10").get(f"/api/applications/{A10}/insights/proof")
    assert r.status_code == 403
