"""Handoff to the Executive Committee: the report prepared with each scrutiny outcome, its versions, the forwarding an
official records by hand, roles, and what an institution never sees (docs/features/ec-handoff.md)."""

import hashlib
import importlib.util
import io
import json
import sqlite3
import zipfile
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIX = ROOT / "fixtures" / "out"
A1, A2, A6 = "APP-2026-000101", "APP-2026-000102", "APP-2026-000106"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _copy_db(src: Path, dst: Path) -> None:
    s, d = sqlite3.connect(src), sqlite3.connect(dst)
    with d:
        s.backup(d)
    s.close()
    d.close()


@pytest.fixture(scope="module")
def world():
    """The validated seed world; the database is put back afterwards, since these tests record outcomes and
    forwardings that later modules must not see."""
    from pramana.config import get_settings
    from pramana.db import SessionLocal, engine, init_db
    from pramana.models import ValidationRun

    init_db()
    db = SessionLocal()
    seeded = db.scalar(select(func.count()).select_from(ValidationRun)) > 0
    db.close()
    if not seeded:
        if not (FIX / "manifest.json").exists():
            _load("make_fixtures").main()
        engine.dispose()
        _load("seed").main(validate=True)
    from pramana.main import app

    live = get_settings().data_dir / "pramana.db"
    saved = live.with_name("pramana.ec-handoff-tests.db")
    engine.dispose()
    _copy_db(live, saved)
    yield app
    engine.dispose()
    _copy_db(saved, live)
    saved.unlink()


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200, r.text
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def _pdf_text(data: bytes) -> str:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def _actions(c, app_id):
    return c.get(f"/api/applications/{app_id}/audit").json()


def test_the_seeded_outcomes_have_reports_and_a1_was_forwarded_by_hand(world):
    officer = _login(world, "officer")
    a6 = officer.get(f"/api/applications/{A6}/ec-reports").json()
    assert a6["latest"]["status"] == "ready" and a6["latest"]["status_label"] == "Ready for the Executive Committee"
    assert a6["latest"]["forwarding"] is None and a6["outcome_without_report"] is False
    a1 = officer.get(f"/api/applications/{A1}/ec-reports").json()["latest"]
    assert a1["status"] == "forwarded" and a1["status_label"] == "Forwarded to the Executive Committee"
    fw = a1["forwarding"]
    assert fw["channel"] == "manual" and fw["sent_by_pramana"] is False and fw["reference"] == "RB/EC/2026-27/0041"
    assert fw["recorded_by"] and fw["forwarded_on"] == date.today().isoformat()

    queue = officer.get("/api/dashboard").json()["ec_handoff"]
    assert {i["application_id"] for i in queue["items"]} == {A6} and queue["ready"] == 1 and queue["forwarded"] == 1


def test_report_holds_the_outcome_findings_verification_rounds_and_digests(world, tmp_path):
    from pramana.crypto import digest
    from pramana.db import SessionLocal
    from pramana.models import ValidationRun
    from pramana.officer import verify_pack
    from pramana.verification.effective import effective_document_status

    officer = _login(world, "officer")
    latest = officer.get(f"/api/applications/{A6}/ec-reports").json()["latest"]
    rec = officer.get(f"/api/ec-reports/{latest['id']}").json()
    c = rec["content"]
    # The report's own digest is over its stored record, which anyone given the record can recompute
    assert digest(c) == latest["report_sha256"] == rec["report"]["report_sha256"]
    assert c["format"] == "pramana-ec-report/1" and c["version"] == 1 and c["supersedes"] is None
    assert c["outcome"]["code"] == "deficiencies_recorded" and c["outcome"]["reason"].startswith("Three faculty")
    assert c["outcome"]["recorded_by"]["username"] == "officer" and c["outcome"]["round_label"] == "first submission"

    # Findings: every finding of the run the outcome was recorded against, with the provisions the finding page shows
    run_id = c["outcome"]["run_id"]
    shown = {f["id"]: f for f in officer.get(f"/api/applications/{A6}/findings", params={"run_id": run_id}).json()}
    f = c["findings"]
    assert {i["finding_id"] for i in f["items"]} == set(shown) and f["total"] == len(shown) > 0
    assert sum(f["by_group"].values()) == f["total"]
    assert sum(sum(v.values()) for v in f["by_severity"].values()) == f["total"]
    assert sum(sum(v.values()) for v in f["by_category"].values()) == f["total"]
    for it in f["items"]:
        basis = shown[it["finding_id"]]["regulatory_basis"]
        assert it["relates_to"] == [p["cite"] for p in (basis or {}).get("provisions", [])]
    assert f["provisions"] and all(p["quote"] and p["page"] >= 1 for p in f["provisions"])
    assert {p["cite"] for p in f["provisions"]} == {x for it in f["items"] for x in it["relates_to"]}

    # Verification: the effective status of every current document on that run
    db = SessionLocal()
    eff = effective_document_status(db, db.get(ValidationRun, run_id))
    db.close()
    v = c["verification"]
    assert v["documents"] and all(d["status"] == eff.get(d["document_id"], "not_checked") for d in v["documents"])
    assert sum(v["counts"].values()) == len(v["documents"]) and v["simulated_sources"] is True
    assert c["correction_rounds"] == {"rounds": [], "review_requests": 0, "review_requests_answered": 0,
                                      "all_review_requests_answered": True}
    assert [s["stage"] for s in c["process"]] == ["Scrutiny", "Decision", "Ratification", "Letter"]

    # The PDF an Executive Committee member reads is the stored one, and names its own record's digest
    pdf = officer.get(latest["pdf_url"])
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert hashlib.sha256(pdf.content).hexdigest() == latest["pdf_sha256"]
    text = _pdf_text(pdf.content)
    flat = " ".join(text.split())
    assert "SCRUTINY REPORT FOR THE EXECUTIVE COMMITTEE" in text and c["application"]["institution"] in text
    assert latest["report_sha256"] in flat.replace(" ", "") and latest["pack"]["zip_sha256"] in flat.replace(" ", "")
    assert "ratified by the Council" in flat and "clause 1.10(a)" in flat
    for word in ("fake", "forged", "genuine", "verdict", "fraud"):
        assert word not in flat.lower()

    # The evidence pack was built at that moment: its stored bytes match the digests and verify offline
    z = officer.get(latest["pack_url"])
    assert z.status_code == 200 and hashlib.sha256(z.content).hexdigest() == latest["pack"]["zip_sha256"]
    zf = zipfile.ZipFile(io.BytesIO(z.content))
    manifest = zf.read(f"{latest['pack']['pack_id']}/manifest.json")
    assert hashlib.sha256(manifest).hexdigest() == latest["pack"]["manifest_sha256"]
    assert not any("/documents/" in n for n in zf.namelist())
    (tmp_path / "pack.zip").write_bytes(z.content)
    ok, lines = verify_pack.verify(tmp_path / "pack.zip")
    assert ok, lines

    # Every step is in the audit chain
    events = _actions(officer, A6)
    prepared = next(e for e in events if e["action"] == "ec_report.prepared")
    assert prepared["details"]["report_sha256"] == latest["report_sha256"]
    assert prepared["details"]["pack_zip_sha256"] == latest["pack"]["zip_sha256"]
    assert prepared["details"]["pdf_sha256"] == latest["pdf_sha256"]
    assert any(e["action"] == "evidence_pack.exported" and e["details"].get("purpose") == "executive_committee_report"
               and e["details"]["pack_id"] == latest["pack"]["pack_id"] for e in events)
    assert any(e["action"] == "ec_report.downloaded" for e in events)
    assert any(e["action"] == "evidence_pack.downloaded" and e["details"].get("ec_report_id") == latest["id"]
               for e in events)
    from pramana import audit

    db = SessionLocal()
    assert audit.verify_chain(db)["intact"]
    db.close()


def test_a_later_outcome_adds_a_version_and_never_changes_the_first(world):
    from pramana.db import SessionLocal
    from pramana.handoff.models import EcForwarding, EcReport, ImmutableRecord

    officer = _login(world, "officer")
    before = officer.get(f"/api/applications/{A1}/ec-reports").json()["latest"]
    first = officer.get(f"/api/ec-reports/{before['id']}").json()
    r = officer.post(f"/api/applications/{A1}/scrutiny-outcome",
                     json={"outcome": "referred_for_visit", "reason": "Laboratory equipment is to be seen on campus."})
    assert r.status_code == 200, r.text
    reports = officer.get(f"/api/applications/{A1}/ec-reports").json()
    latest = reports["latest"]
    assert latest["version"] == 2 and latest["status"] == "ready" and latest["forwarding"] is None
    assert latest["outcome"]["code"] == "referred_for_visit"
    second = officer.get(f"/api/ec-reports/{latest['id']}").json()["content"]
    assert second["supersedes"] == before["id"] and second["evidence_pack"]["pack_id"] != first["content"][
        "evidence_pack"]["pack_id"]

    # Version 1 is exactly as it was, still forwarded, and now marked as replaced
    old = next(v for v in reports["versions"] if v["version"] == 1)
    again = officer.get(f"/api/ec-reports/{before['id']}").json()
    assert again["content"] == first["content"] and old["report_sha256"] == before["report_sha256"]
    assert old["status"] == "forwarded" and old["superseded_by_version"] == 2 and not old["latest"]
    assert officer.get(old["pdf_url"]).content == officer.get(before["pdf_url"]).content

    # The tables refuse changes: a version is never edited or deleted, and neither is a forwarding
    db = SessionLocal()
    row = db.get(EcReport, before["id"])
    row.outcome = "no_deficiency"
    with pytest.raises(ImmutableRecord):
        db.commit()
    db.rollback()
    with pytest.raises(ImmutableRecord):
        db.delete(db.get(EcReport, before["id"]))
        db.commit()
    db.rollback()
    fw = db.scalars(select(EcForwarding).where(EcForwarding.report_id == before["id"])).one()
    fw.reference = "changed"
    with pytest.raises(ImmutableRecord):
        db.commit()
    db.rollback()
    db.close()

    # Forwarding goes with the latest version only
    stale = officer.post(f"/api/ec-reports/{before['id']}/forwarding",
                         json={"forwarded_on": date.today().isoformat(), "reference": "RB/EC/OLD/1"})
    assert stale.status_code == 409 and "version 2" in stale.json()["detail"]


def test_forwarding_is_recorded_by_hand_with_roles_and_audit(world):
    officer, admin, verifier = _login(world, "officer"), _login(world, "admin"), _login(world, "verifier")
    latest = officer.get(f"/api/applications/{A6}/ec-reports").json()["latest"]
    url = f"/api/ec-reports/{latest['id']}/forwarding"
    today = date.today().isoformat()
    body = {"forwarded_on": today, "reference": "RB/EC/2026-27/0057", "note": "Placed for the next meeting."}

    # The verification cell reads the report but does not forward it
    assert verifier.get(f"/api/applications/{A6}/ec-reports").status_code == 200
    assert verifier.get(latest["pdf_url"]).status_code == 200
    assert verifier.get(latest["pack_url"]).status_code == 403
    assert verifier.post(url, json=body).status_code == 403
    assert officer.post(url, json={**body, "forwarded_on": (date.today() + timedelta(days=1)).isoformat()}
                        ).status_code == 400
    assert officer.post(url, json={**body, "forwarded_on": "2020-01-01"}).status_code == 400
    assert officer.post(url, json={**body, "reference": "  "}).status_code == 422
    assert officer.post(url, json={**body, "note": "The fire NOC looks fake."}).status_code == 400

    r = admin.post(url, json=body)
    assert r.status_code == 200, r.text
    got = r.json()["latest"]
    assert got["status"] == "forwarded" and got["forwarding"]["sent_by_pramana"] is False
    assert got["forwarding"]["reference"] == "RB/EC/2026-27/0057" and got["forwarding"]["recorded_by"]
    assert officer.post(url, json=body).status_code == 409
    ev = next(e for e in _actions(officer, A6) if e["action"] == "ec_report.forwarding_recorded")
    assert ev["actor_role"] == "admin" and ev["details"]["reference"] == "RB/EC/2026-27/0057"
    assert ev["details"]["sent_by_pramana"] is False and ev["details"]["report_sha256"] == latest["report_sha256"]
    queue = officer.get("/api/dashboard").json()["ec_handoff"]
    assert A6 not in {i["application_id"] for i in queue["items"]} and queue["forwarded"] >= 1


def test_institution_never_sees_the_report_or_its_internals(world):
    officer, inst = _login(world, "officer"), _login(world, "inst6")
    latest = officer.get(f"/api/applications/{A6}/ec-reports").json()["latest"]
    for path in (f"/api/applications/{A6}/ec-reports", f"/api/ec-reports/{latest['id']}", latest["pdf_url"],
                 latest["pack_url"]):
        assert inst.get(path).status_code == 403
    assert inst.post(f"/api/ec-reports/{latest['id']}/forwarding",
                     json={"forwarded_on": date.today().isoformat(), "reference": "X/1/2"}).status_code == 403
    assert inst.post(f"/api/applications/{A6}/ec-reports").status_code == 403
    # Its own outcome view carries the outcome and its reasons, nothing of the report, the pack or the officer
    view = inst.get(f"/api/applications/{A6}/outcome").json()["outcome"]
    raw = json.dumps(view).lower()
    assert view["reasons"] and "recorded_by" not in view
    for word in ("sha256", "pack", "ec_report", "finding", "sharma", "forensic", "severity"):
        assert word not in raw
    # Another institution's officer-only paths stay hidden too
    other = _login(world, "inst1")
    assert other.get(f"/api/applications/{A6}/outcome").status_code == 404


def test_stub_portal_channel_never_marks_a_report_sent(world, monkeypatch):
    from pramana.db import SessionLocal
    from pramana.handoff import channels
    from pramana.handoff.models import EcForwarding
    from pramana.handoff.settings import handoff_settings

    monkeypatch.setattr(handoff_settings(), "handoff_channels", "aicte_portal")
    assert [c.name for c in channels.channels()] == []
    with pytest.raises(NotImplementedError):
        channels.AictePortalChannel().offer(None, None, b"", b"")
    described = {c["name"]: c for c in channels.describe()}
    assert described["aicte_portal"]["available"] is False and described["manual"]["available"] is True

    officer = _login(world, "officer")
    r = officer.post(f"/api/applications/{A2}/scrutiny-outcome",
                     json={"outcome": "no_deficiency", "reason": "Documents confirmed; nothing to record."})
    assert r.status_code == 200, r.text
    latest = officer.get(f"/api/applications/{A2}/ec-reports").json()["latest"]
    assert latest["status"] == "ready" and latest["forwarding"] is None
    db = SessionLocal()
    assert db.scalars(select(EcForwarding).where(EcForwarding.report_id == latest["id"])).first() is None
    db.close()
    ev = next(e for e in _actions(officer, A2) if e["action"] == "ec_report.prepared")
    sent = {d["channel"]: d for d in ev["details"]["channels"]}
    assert sent["aicte_portal"]["sent"] is False and "not built" in sent["aicte_portal"]["detail"]
    assert sent["manual"]["sent"] is False
    assert not any(d["sent"] for d in ev["details"]["channels"])
    # Preparing again for the same outcome is refused: one report per outcome
    assert officer.post(f"/api/applications/{A2}/ec-reports").status_code == 409


def test_a_failed_preparation_keeps_the_outcome_and_can_be_retried(world, monkeypatch):
    from pramana.handoff import report as rp

    officer = _login(world, "officer")
    real = rp.prepare

    def boom(*a, **k):
        raise RuntimeError("renderer unavailable")

    monkeypatch.setattr(rp, "prepare", boom)
    r = officer.post(f"/api/applications/{A2}/scrutiny-outcome",
                     json={"outcome": "deficiencies_recorded", "reason": "The accounts statement is to be supplied."})
    assert r.status_code == 200, r.text
    state = officer.get(f"/api/applications/{A2}/ec-reports").json()
    assert state["outcome_without_report"] is True and state["latest"]["outcome"]["code"] == "no_deficiency"
    assert any(e["action"] == "ec_report.preparation_failed" for e in _actions(officer, A2))
    monkeypatch.setattr(rp, "prepare", real)
    assert _login(world, "verifier").post(f"/api/applications/{A2}/ec-reports").status_code == 403
    again = officer.post(f"/api/applications/{A2}/ec-reports")
    assert again.status_code == 200, again.text
    got = again.json()
    assert got["outcome_without_report"] is False and got["latest"]["outcome"]["code"] == "deficiencies_recorded"
    assert got["latest"]["version"] == 2
