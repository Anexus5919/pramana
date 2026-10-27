"""A document's verification status as officials read it: officer review of documents with no outside source, and
later confirmations reaching the application payload, the review queue counter and Ask why, while the stored run
summary stays the record of what validation found.

The module name sorts last on purpose: it records confirmations on the shared seeded world, which the counts in
earlier modules (Drishti's awaiting queue, for one) assume untouched."""

import copy
import importlib.util
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
A1, A9, A11 = "APP-2026-000101", "APP-2026-000109", "APP-2026-000111"
NOTE = "Matched the amount and UTR number against the bank statement"


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


def test_officer_review_is_only_for_documents_with_no_outside_source(app):
    officer = _login(app, "officer")
    payload = officer.get(f"/api/applications/{A1}").json()
    ter, fire = _doc(payload, "ter_receipt"), _doc(payload, "fire_noc")
    status = payload["latest_run"]["document_status"]
    assert status[ter["id"]] == "not_checked" and status[fire["id"]] == "verified"
    url = f"/api/documents/{ter['id']}/officer-review"

    # A note saying what was examined is required, in product vocabulary
    assert officer.post(url, json={"note": "looked"}).status_code == 400
    assert officer.post(url, json={"note": "          short     "}).status_code == 400
    r = officer.post(url, json={"note": "The receipt looks genuine to me"})
    assert r.status_code == 400 and "instead of judging" in r.json()["detail"]
    # Documents an outside source answered for are not reviewed this way
    r = officer.post(f"/api/documents/{fire['id']}/officer-review", json={"note": NOTE})
    assert r.status_code == 409 and "no outside source" in r.json()["detail"]
    # Institutions and administrators cannot record one
    assert _login(app, "inst1").post(url, json={"note": NOTE}).status_code == 403
    assert _login(app, "admin").post(url, json={"note": NOTE}).status_code == 403
    assert officer.post("/api/documents/doc_missing/officer-review", json={"note": NOTE}).status_code == 404


def test_officer_review_reads_as_reviewed_never_verified(app):
    officer = _login(app, "officer")
    payload = officer.get(f"/api/applications/{A1}").json()
    run_id = payload["latest_run"]["id"]
    before = payload["latest_run"]["document_status"]
    summary, digest = _stored(run_id)
    dash = officer.get("/api/dashboard").json()
    proof_before = officer.get(f"/api/applications/{A1}/insights/proof").json()
    ter = _doc(payload, "ter_receipt")

    r = officer.post(f"/api/documents/{ter['id']}/officer-review", json={"note": f"  {NOTE}  "})
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["channel"] == "officer_review" and m["status"] == "officer_reviewed" and m["run_id"] == run_id
    assert m["source_name"] == "Officer review by R. Sharma (Scrutiny Officer)" and m["detail"] == NOTE and not m["simulated"]
    # One review per run: the document no longer reads as having no outside source
    again = officer.post(f"/api/documents/{ter['id']}/officer-review", json={"note": NOTE})
    assert again.status_code == 409 and "reviewed by officer" in again.json()["detail"]

    after = officer.get(f"/api/applications/{A1}").json()["latest_run"]["document_status"]
    assert after[ter["id"]] == "officer_reviewed"
    assert {k: v for k, v in after.items() if k != ter["id"]} == {k: v for k, v in before.items() if k != ter["id"]}
    assert officer.get(f"/api/runs/{run_id}").json()["document_status"][ter["id"]] == "officer_reviewed"
    assert any(x["id"] == m["id"] for x in officer.get(f"/api/applications/{A1}/verifications").json())

    # Audited with the note
    ev = [e for e in officer.get(f"/api/applications/{A1}/audit").json() if e["action"] == "verification.officer_reviewed"]
    assert ev and ev[-1]["object_id"] == m["id"]
    assert ev[-1]["details"] == {"document_id": ter["id"], "run_id": run_id, "note": NOTE}

    # The stored run is the record of what validation found
    assert _stored(run_id) == (summary, digest)
    assert summary["document_status"][ter["id"]] == "not_checked"

    # Never counted as verified: queue counts, proof matrix, Ask why
    dash2 = officer.get("/api/dashboard").json()
    assert dash2["verification_counts"].get("verified") == dash["verification_counts"].get("verified")
    assert _awaiting(dash2) == _awaiting(dash)
    proof = officer.get(f"/api/applications/{A1}/insights/proof").json()
    assert "officer_review" not in json.dumps(proof) and proof["matrix"] == proof_before["matrix"]
    items = _context(A1)
    d = next(i for i in items.values() if i["kind"] == "document" and i["target"]["document_id"] == ter["id"])
    assert d["statuses"] == ["officer_reviewed"] and "reviewed by officer" in d["text"]
    assert "reviewed by officer" in items["RUN"]["text"] and "no outside source" in items["RUN"]["text"]
    v = next(i for i in items.values() if i["kind"] == "verification" and i["target"]["attempt_id"] == m["id"])
    assert v["statuses"] == ["officer_reviewed"] and "No issuing body confirmed it" in v["text"]
    out = _answer(A1, "Which documents are still not verified?")
    texts = [s["text"] for s in out["sentences"]]
    assert any("reviewed by officer, not verified" in t for t in texts), texts
    assert any("no outside source" in t for t in texts), texts
    from pramana.officer.ask import check_sentence

    # A sentence calling the reviewed document verified does not survive the evidence check
    assert check_sentence("The TER receipt is verified.", [d["id"]], items)[1]

    # Institutions never see verification statuses or attempts
    inst = _login(app, "inst1")
    own = inst.get(f"/api/applications/{A1}").json()
    assert "document_status" not in (own["latest_run"] or {})
    assert all("document_status" not in r for r in inst.get(f"/api/applications/{A1}/runs").json())
    assert inst.get(f"/api/applications/{A1}/verifications").status_code == 403
    doc = inst.get(f"/api/documents/{ter['id']}").json()
    assert "verifications" not in doc and "officer_review" not in json.dumps(doc)
    assert all("officer_review" not in json.dumps(x) for x in inst.get("/api/applications").json())


def test_verifier_can_record_an_officer_review(app):
    verifier = _login(app, "verifier")
    sat = _doc(verifier.get(f"/api/applications/{A1}").json(), "satellite_map")
    r = verifier.post(f"/api/documents/{sat['id']}/officer-review",
                      json={"note": "Compared the plotted boundary with the declared land survey number"})
    assert r.status_code == 200, r.text
    assert verifier.get(f"/api/applications/{A1}").json()["latest_run"]["document_status"][sat["id"]] == "officer_reviewed"


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
    m = r.json()

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

    # A recorded confirmation is not confirmed again, and a confirmed document gets no officer review
    again = officer.post(f"/api/verifications/{m['id']}/manual", json={"status": "verified", "note": "Second look at it"})
    assert again.status_code == 409
    assert officer.post(f"/api/documents/{occ['id']}/officer-review", json={"note": NOTE}).status_code == 409


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
