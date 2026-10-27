"""A document's verification status as officials read it: later confirmations reaching the application payload,
the review queue counter and Ask why, while the stored run summary stays the record of what validation found.

The module name sorts last on purpose: it records confirmations on the shared seeded world, which the counts in
earlier modules (Drishti's awaiting queue, for one) assume untouched."""

import copy
import importlib.util
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
A1, A9, A11 = "APP-2026-000101", "APP-2026-000109", "APP-2026-000111"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def app():
    from pramana.config import get_settings

    if not (get_settings().data_dir / "pramana.db").exists():
        if not (ROOT / "fixtures" / "out" / "manifest.json").exists():
            _load("make_fixtures").main()
        _load("seed").main(validate=True)
    from pramana.db import init_db
    from pramana.main import app as fastapi_app

    init_db()
    return fastapi_app


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def _doc(payload, doc_type):
    return next(d for d in payload["documents"] if d["declared_type"] == doc_type and not d["superseded"])


def _stored(run_id):
    """The run as validation stored it, read straight from the database."""
    from pramana.db import SessionLocal
    from pramana.models import ValidationRun

    db = SessionLocal()
    try:
        r = db.get(ValidationRun, run_id)
        return copy.deepcopy(r.summary), r.report_digest
    finally:
        db.close()


def _context(app_id, question=""):
    from pramana.db import SessionLocal
    from pramana.models import Application
    from pramana.officer.ask import build_context

    db = SessionLocal()
    try:
        return build_context(db, db.get(Application, app_id), question)["items"]
    finally:
        db.close()


def _answer(app_id, question):
    from pramana.db import SessionLocal
    from pramana.models import Application
    from pramana.officer.ask import answer

    db = SessionLocal()
    try:
        return answer(db, db.get(Application, app_id), question, use_model=False)
    finally:
        db.close()


def _awaiting(dash):
    c = dash["verification_counts"]
    return sum(c.get(s, 0) for s in ("manual_review_required", "source_unavailable", "verification_pending"))


def test_manual_confirmation_reaches_the_documents_table_counter_and_ask_why(app):
    officer = _login(app, "officer")
    payload = officer.get(f"/api/applications/{A9}").json()
    run_id = payload["latest_run"]["id"]
    occ, ssc = _doc(payload, "occupancy_certificate"), _doc(payload, "structural_stability")
    before = payload["latest_run"]["document_status"]
    assert before[occ["id"]] == "source_unavailable" and before[ssc["id"]] == "verification_pending"
    summary, digest = _stored(run_id)
    dash = officer.get("/api/dashboard").json()
    att = next(a for a in officer.get(f"/api/applications/{A9}/verifications").json()
               if a["document_id"] == occ["id"] and a["status"] == "source_unavailable")
    assert any(x.get("attempt_id") == att["id"] for x in dash["alerts"])

    r = officer.post(f"/api/verifications/{att['id']}/manual",
                     json={"status": "verified", "note": "Municipal office confirmed the certificate by letter"})
    assert r.status_code == 200, r.text
    after = officer.get(f"/api/applications/{A9}").json()["latest_run"]["document_status"]
    assert after[occ["id"]] == "verified" and after[ssc["id"]] == "verification_pending"
    assert officer.get(f"/api/runs/{run_id}").json()["document_status"][occ["id"]] == "verified"
    row = next(x for x in officer.get("/api/dashboard").json()["applications"] if x["id"] == A9)
    assert row["latest_run"]["document_status"][occ["id"]] == "verified"
    assert next(x for x in officer.get("/api/applications").json() if x["id"] == A9)[
        "latest_run"]["document_status"][occ["id"]] == "verified"

    # The queue counter and its alert drop the confirmed attempt
    dash2 = officer.get("/api/dashboard").json()
    assert _awaiting(dash2) == _awaiting(dash) - 1
    assert dash2["verification_counts"].get("source_unavailable", 0) == dash["verification_counts"]["source_unavailable"] - 1
    assert not any(x.get("attempt_id") == att["id"] for x in dash2["alerts"])

    items = _context(A9)
    d = next(i for i in items.values() if i["kind"] == "document" and i["target"]["document_id"] == occ["id"])
    assert d["statuses"] == ["verified"]
    assert _stored(run_id) == (summary, digest) and summary["document_status"][occ["id"]] == "source_unavailable"


def test_a_confirmation_never_hides_a_mismatch_on_another_channel(app):
    """Confirming one channel re-aggregates the document's checks rather than overwriting its status."""
    from pramana.api.applications import latest_run
    from pramana.db import SessionLocal
    from pramana.models import Document, VerificationAttempt
    from pramana.verification.effective import effective_document_status

    db = SessionLocal()
    try:
        run = latest_run(db, A11)
        fire = next(d for d in db.query(Document).filter_by(application_id=A11, declared_type="fire_noc", superseded=False))
        assert run.summary["document_status"][fire.id] == "manual_review_required"
        reg = next(a for a in db.query(VerificationAttempt).filter_by(run_id=run.id, document_id=fire.id,
                                                                    channel="issuer_registry"))
        now = datetime.now(UTC)
        db.add(VerificationAttempt(application_id=A11, document_id=fire.id, run_id=run.id, channel="manual_confirmation",
                                   source_name="test", status="verified", request={"follows": reg.id},
                                   response={}, completed_at=now))
        db.flush()
        assert effective_document_status(db, run)[fire.id] == "verified"
        # The same confirmation next to a mismatch on another channel leaves the mismatch showing
        db.add(VerificationAttempt(application_id=A11, document_id=fire.id, run_id=run.id, channel="signed_qr",
                                   source_name="test", status="mismatch_detected", completed_at=now))
        db.flush()
        assert effective_document_status(db, run)[fire.id] == "mismatch_detected"
        # A record from before the run finished is not a later confirmation
        db.rollback()
        db.add(VerificationAttempt(application_id=A11, document_id=fire.id, run_id=run.id, channel="manual_confirmation",
                                   source_name="test", status="verified", request={"follows": reg.id},
                                   response={}, completed_at=run.finished_at.replace(year=2000)))
        db.flush()
        assert effective_document_status(db, run)[fire.id] == "manual_review_required"
    finally:
        db.rollback()
        db.close()
