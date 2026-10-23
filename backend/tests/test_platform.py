"""Background runs and their event stream, the parser sandbox, sign-in throttling, secure cookies, envelope
encryption with key rotation, and retention."""

import importlib.util
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
A7, A1, A11 = "APP-2026-000107", "APP-2026-000101", "APP-2026-000111"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def app():
    """Reuse the world test_e2e seeded; seed without validation when this module runs alone."""
    from pramana.db import SessionLocal, engine, init_db
    from pramana.models import User

    init_db()
    db = SessionLocal()
    seeded = db.scalars(select(User).where(User.username == "officer")).first() is not None
    db.close()
    # Release the SQLite file so the seed script can replace it (Windows keeps open files locked)
    engine.dispose()
    if not seeded:
        if not (ROOT / "fixtures" / "out" / "manifest.json").exists():
            _load("make_fixtures").main()
        _load("seed").main(validate=False)
    from pramana import sandbox
    from pramana.main import app as fastapi_app

    yield fastapi_app
    sandbox.shutdown()


@pytest.fixture
def settings():
    from pramana.config import get_settings

    s = get_settings()
    saved = s.model_dump()
    yield s
    for k, v in saved.items():
        setattr(s, k, v)


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200, r.text
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def _wait(c, run_id, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        p = c.get(f"/api/runs/{run_id}/progress").json()
        if p["done"]:
            return p
        time.sleep(0.3)
    raise AssertionError(f"run {run_id} did not finish in {timeout} s")


def _ensure_complete_run(app_id):
    from pramana.db import SessionLocal
    from pramana.models import Application, ValidationRun
    from pramana.pipeline.validate import run_validation

    db = SessionLocal()
    try:
        if not db.scalars(select(ValidationRun).where(ValidationRun.application_id == app_id,
                                                      ValidationRun.status == "complete")).first():
            run_validation(db, db.get(Application, app_id), "system", "system")
    finally:
        db.close()


# ---------- background runs ----------


def test_background_run_streams_events_and_matches_the_synchronous_report(app, settings):
    _ensure_complete_run(A7)
    settings.background_runs = True
    c = _login(app, "officer")
    before = c.get(f"/api/applications/{A7}").json()["latest_run"]
    t0 = time.perf_counter()
    r = c.post(f"/api/applications/{A7}/validate")
    assert r.status_code == 200 and r.json()["background"] is True
    assert time.perf_counter() - t0 < 2.0, "the request must return before the run does its work"
    rid = r.json()["id"]
    assert r.json()["status"] in ("queued", "running", "complete")
    # A second click attaches to the same run instead of starting another
    again = c.post(f"/api/applications/{A7}/validate").json()
    assert again["id"] == rid or again["status"] == "queued"

    done = _wait(c, rid)
    assert done["run"]["status"] == "complete"
    events = c.get(f"/api/runs/{rid}/progress").json()["events"]
    kinds = [e["kind"] for e in events]
    assert kinds[0] == "run.queued" and kinds[1] == "run.started" and kinds[-1] == "run.finished"
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    stages = [e["data"]["stage"] for e in events if e["kind"] == "stage.finished"]
    assert stages == ["document_processing", "extraction_checks", "verification", "rules", "forensics",
                      "cross_application"]
    checks = [e["data"] for e in events if e["kind"] == "check"]
    assert any(ch["channel"] == "issuer_signature" and ch["status"] == "mismatch_detected" for ch in checks)
    assert kinds.count("doc.done") == len(events[1]["data"]["documents"])
    summary = next(e["data"] for e in events if e["kind"] == "findings")

    full = c.get(f"/api/runs/{rid}").json()
    assert summary["total"] == full["findings"]
    # Same inputs and same report as the synchronous run it follows
    assert full["input_digest"] == before["input_digest"] and full["report_digest"] == before["report_digest"]

    with c.stream("GET", f"/api/runs/{rid}/events") as s:
        body = s.read().decode()
    assert s.headers["content-type"].startswith("text/event-stream")
    streamed = [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: {\"seq\"")]
    assert [e["seq"] for e in streamed] == [e["seq"] for e in events]
    assert "event: end" in body
    with c.stream("GET", f"/api/runs/{rid}/events", headers={"Last-Event-ID": str(len(events) - 2)}) as s:
        tail = [json.loads(line[6:]) for line in s.read().decode().splitlines() if line.startswith("data: {\"seq\"")]
    assert [e["seq"] for e in tail] == [len(events) - 1, len(events)]


def test_institutions_see_stage_progress_only(app, settings):
    settings.background_runs = True
    officer = _login(app, "officer")
    rid = officer.post(f"/api/applications/{A7}/validate").json()["id"]
    _wait(officer, rid)
    inst = _login(app, "inst7")
    p = inst.get(f"/api/runs/{rid}/progress").json()
    assert set(p["run"]) <= {"id", "status", "round", "started_at", "finished_at", "as_of", "ruleset_id"}
    kinds = {e["kind"] for e in p["events"]}
    assert kinds <= {"run.queued", "run.started", "doc.done", "stage.finished", "run.finished"}
    allowed = {"stage", "ms", "status", "documents", "declared_type", "document_id", "reason"}
    for e in p["events"]:
        assert set(e["data"]) <= allowed, e
    assert _login(app, "inst1").get(f"/api/runs/{rid}/progress").status_code == 404
    assert _login(app, "inst1").get(f"/api/runs/{rid}/events").status_code == 404


def test_crashed_job_fails_with_reason_and_can_be_retried(app, settings, monkeypatch):
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent
    from pramana.pipeline import validate

    _ensure_complete_run(A1)
    settings.background_runs = True
    c = _login(app, "officer")

    def boom(*a, **k):
        raise RuntimeError("simulated worker crash")

    monkeypatch.setattr(validate, "run_validation", boom)
    rid = c.post(f"/api/applications/{A1}/validate").json()["id"]
    p = _wait(c, rid)
    assert p["run"]["status"] == "failed" and "simulated worker crash" in p["run"]["error"]
    assert p["events"][-1]["kind"] == "run.finished"
    db = SessionLocal()
    assert db.scalars(select(AuditEvent).where(AuditEvent.object_id == rid,
                                               AuditEvent.action == "validation.failed")).first()
    db.close()
    # The workspace keeps showing the last complete result, not the failed run
    assert c.get(f"/api/applications/{A1}").json()["latest_run"]["status"] == "complete"

    monkeypatch.undo()
    r = c.post(f"/api/runs/{rid}/retry")
    assert r.status_code == 200
    assert _wait(c, r.json()["id"])["run"]["status"] == "complete"
    assert c.post(f"/api/runs/{r.json()['id']}/retry").status_code == 409


def test_runs_left_running_by_a_restart_are_marked_interrupted(app):
    from pramana import jobs
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent, ValidationRun

    db = SessionLocal()
    run = ValidationRun(application_id=A1, status="running", ruleset_id="x", ruleset_hash="x", engine_version="x")
    db.add(run)
    db.commit()
    assert jobs.recover_interrupted() >= 1
    db.refresh(run)
    assert run.status == "interrupted" and "Retry" in run.error
    assert db.scalars(select(AuditEvent).where(AuditEvent.object_id == run.id,
                                               AuditEvent.action == "validation.interrupted")).first()
    db.close()


# ---------- parser sandbox ----------


def test_sandbox_enforces_timeout_memory_cap_and_survives_crashes(app, settings):
    from pramana import sandbox

    settings.sandbox_memory_mb = 300
    sandbox.shutdown()
    try:
        with pytest.raises(sandbox.SandboxUnsafe, match="time limit"):
            sandbox.call("selftest_sleep", 10, timeout=1)
        if os.name == "nt" or sys.platform.startswith("linux"):
            with pytest.raises(sandbox.SandboxUnsafe, match="memory"):
                sandbox.call("selftest_alloc", 600)
        assert sandbox.call("selftest_alloc", 50)[0] == {"allocated_mb": 50}
        with pytest.raises(sandbox.SandboxUnsafe, match="crashed"):
            sandbox.call("selftest_exit", 7)
        # The pool replaces dead workers
        assert sandbox.call("selftest_echo", data=b"abc")[0]["bytes"] == 3
    finally:
        sandbox.shutdown()


@pytest.mark.skipif(os.name != "nt", reason="Job Object behaviour is Windows only")
def test_windows_worker_dies_with_the_server():
    code = ("import sys; sys.path.insert(0, %r); from pramana import sandbox; "
            "print(sandbox.call('selftest_echo', data=b'x')[0]['pid'], flush=True); import time; time.sleep(60)"
            % str(Path(__file__).resolve().parents[1]))
    parent = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, text=True)
    pid = int(parent.stdout.readline())
    parent.kill()
    parent.wait()
    import ctypes

    k32 = ctypes.WinDLL("kernel32")
    deadline = time.time() + 10
    while time.time() < deadline:
        h = k32.OpenProcess(0x1000, False, pid)
        if not h:
            break
        code_out = ctypes.c_ulong()
        k32.GetExitCodeProcess(h, ctypes.byref(code_out))
        k32.CloseHandle(h)
        if code_out.value != 259:  # STILL_ACTIVE
            break
        time.sleep(0.2)
    else:
        raise AssertionError(f"worker {pid} outlived its server")


def test_sandbox_returns_what_in_process_parsing_returns(app):
    from pramana import sandbox
    from pramana.forensics import pdf_struct
    from pramana.pipeline.text import extract_pdf

    for f in ("A7/fire_noc.pdf", "A2/audited_accounts.pdf"):
        data = (ROOT / "fixtures" / "out" / f).read_bytes()
        local, boxed = extract_pdf(data), sandbox.read_pages(data, "application/pdf")

        def shape(pages):
            return [(p.source, p.text, [[w[0], *(round(v, 1) for v in w[1:5])] for w in p.words_json()]) for p in pages]

        assert shape(local) == shape(boxed)
    data = (ROOT / "fixtures" / "out" / "A7" / "fire_noc.pdf").read_bytes()
    signals, facts = pdf_struct.analyse(data)
    b_signals, b_facts = sandbox.forensics(data, "application/pdf", None, None)
    assert [s.code for s in signals] == [s.code for s in b_signals]
    assert json.loads(json.dumps(facts, default=str)) == b_facts


def test_unreadable_file_goes_to_manual_review_not_a_crash(app, settings):
    from pramana.db import SessionLocal
    from pramana.models import Application, Document, Finding
    from pramana.pipeline.validate import run_validation

    db = SessionLocal()
    doc = db.scalars(select(Document).where(Document.application_id == A1, Document.superseded.is_(False))
                     .order_by(Document.uploaded_at)).first()
    doc.processing_status = "pending"
    db.commit()
    settings.sandbox_timeout_s = 0.01
    run = run_validation(db, db.get(Application, A1), "system", "system")
    assert run.status == "complete"
    db.refresh(doc)
    assert doc.processing_status == "failed" and doc.processing_error.startswith("Could not be read safely")
    f = db.scalars(select(Finding).where(Finding.run_id == run.id, Finding.code == "DOC-PROCESSING-FAILED")).one()
    assert f.outcome == "manual_review" and f.document_id == doc.id
    settings.sandbox_timeout_s = 120
    again = run_validation(db, db.get(Application, A1), "system", "system")
    db.refresh(doc)
    assert doc.processing_status == "processed"
    assert not db.scalars(select(Finding).where(Finding.run_id == again.id, Finding.code == "DOC-PROCESSING-FAILED")).first()
    db.close()


# ---------- sign-in throttling and cookies ----------


def test_login_is_throttled_per_username_and_per_address(app, settings):
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent

    settings.login_max_failures_per_user = 3
    settings.login_max_per_ip = 8
    c = TestClient(app)
    db = SessionLocal()
    start = db.scalars(select(AuditEvent.seq).order_by(AuditEvent.seq.desc())).first()
    for _ in range(3):
        assert c.post("/api/auth/login", json={"username": "verifier", "password": "wrong"}).status_code == 401
    r = c.post("/api/auth/login", json={"username": "verifier", "password": "Pramana@2026"})
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
    assert c.post("/api/auth/login", json={"username": "verifier", "password": "Pramana@2026"}).status_code == 429
    # Another account from the same address is still allowed until the address limit
    assert c.post("/api/auth/login", json={"username": "officer", "password": "Pramana@2026"}).status_code == 200
    codes = [c.post("/api/auth/login", json={"username": f"nobody{i}", "password": "x"}).status_code for i in range(4)]
    assert codes[-1] == 429
    locks = db.scalars(select(AuditEvent).where(AuditEvent.seq > start, AuditEvent.action == "auth.locked_out")).all()
    assert sorted(e.details["scope"] for e in locks) == ["ip", "username"]
    db.close()


def test_secure_cookie_mode_uses_host_prefix_and_hsts(app, settings):
    settings.cookie_secure = True
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": "officer", "password": "Pramana@2026"})
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("__Host-pramana_session=")
    low = cookie.lower()
    assert "secure" in low and "path=/" in low and "domain=" not in low and "httponly" in low
    assert "max-age=" in r.headers["strict-transport-security"]
    token = cookie.split(";")[0].split("=", 1)[1]
    me = TestClient(app).get("/api/auth/me", headers={"cookie": f"__Host-pramana_session={token}"})
    assert me.status_code == 200
    settings.cookie_secure = False
    assert "strict-transport-security" not in TestClient(app).get("/api/health").headers


# ---------- envelope encryption ----------


def test_each_document_has_its_own_key_and_rotation_rewraps_without_rewriting(app):
    from cryptography.exceptions import InvalidTag

    from pramana import keyring
    from pramana.config import get_settings
    from pramana.crypto import delete_document, fernet, load_document, store_document

    s = get_settings()
    store_document("t-one.bin", b"first document")
    store_document("t-two.bin", b"second document")
    one, two = s.storage_dir / "t-one.bin", s.storage_dir / "t-two.bin"
    assert keyring.is_envelope(one.read_bytes())
    k1, k2 = (json.loads(keyring.key_path(p).read_text()) for p in (one, two))
    assert k1["wrapped"] != k2["wrapped"]
    assert load_document("t-one.bin") == b"first document"

    blob = bytearray(one.read_bytes())
    blob[-1] ^= 1
    one.write_bytes(bytes(blob))
    with pytest.raises(InvalidTag):
        load_document("t-one.bin")
    store_document("t-one.bin", b"first document")
    # Swapping two files' contents is detected: the storage name is bound to each ciphertext
    two_bytes = two.read_bytes()
    (s.storage_dir / "t-swap.bin").write_bytes(two_bytes)
    keyring.key_path(s.storage_dir / "t-swap.bin").write_text(keyring.key_path(two).read_text())
    with pytest.raises(InvalidTag):
        load_document("t-swap.bin")

    old = keyring.active_kid()
    before = {p.name: p.read_bytes() for p in s.storage_dir.glob("*.bin")}
    new = keyring.new_master_key()
    keyring.set_active(new)
    stats = keyring.rewrap_all([s.storage_dir, s.cache_dir])
    assert stats["failed"] <= 1 and stats["rewrapped"] >= 2  # the swapped copy cannot be unwrapped
    assert {p.name: p.read_bytes() for p in s.storage_dir.glob("*.bin")} == before
    assert json.loads(keyring.key_path(one).read_text())["kid"] == new
    delete_document("t-swap.bin")
    (s.keys_dir / "master" / f"{old}.key").unlink()
    assert load_document("t-one.bin") == b"first document" and load_document("t-two.bin") == b"second document"

    # Files written before envelope encryption still open, and migrate converts them
    (s.storage_dir / "t-legacy.bin").write_bytes(fernet().encrypt(b"legacy"))
    assert load_document("t-legacy.bin") == b"legacy"
    out = _load("keys").migrate()
    assert out["documents_converted"] >= 1 and keyring.is_envelope((s.storage_dir / "t-legacy.bin").read_bytes())
    assert load_document("t-legacy.bin") == b"legacy"
    for n in ("t-one.bin", "t-two.bin", "t-legacy.bin"):
        delete_document(n)
        assert not (s.storage_dir / n).exists() and not keyring.key_path(s.storage_dir / n).exists()


# ---------- retention ----------


def test_retention_purge_deletes_bytes_of_closed_applications_and_keeps_the_record(app, settings):
    from pramana import audit
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent, Document

    officer, admin = _login(app, "officer"), _login(app, "admin")
    assert officer.post(f"/api/applications/{A11}/close", json={"reason": "  "}).status_code == 400
    n_findings = len(officer.get(f"/api/applications/{A11}/findings").json())
    assert officer.post(f"/api/applications/{A11}/close",
                        json={"reason": "Processing concluded; decision recorded by the competent authority"}).status_code == 200
    assert officer.get("/api/admin/retention").status_code == 403

    plan = admin.get("/api/admin/retention").json()
    mine = [d for d in plan["documents"] if d["application_id"] == A11]
    assert mine and not any(d["eligible"] for d in mine)

    settings.retention_document_days = 0
    dry = admin.post("/api/admin/retention/purge", json={"dry_run": True}).json()
    assert dry["dry_run"] and dry["documents_eligible"] >= len(mine)
    doc_id = mine[0]["document_id"]
    assert officer.get(f"/api/documents/{doc_id}/file").status_code == 200

    assert admin.post("/api/admin/retention/purge", json={"dry_run": False}).status_code == 422
    done = admin.post("/api/admin/retention/purge",
                      json={"dry_run": False, "reason": "Retention period ended for closed applications"}).json()
    assert done["documents_purged"] >= len(mine)
    r = officer.get(f"/api/documents/{doc_id}/file")
    assert r.status_code == 410
    db = SessionLocal()
    d = db.get(Document, doc_id)
    assert d.sha256 == mine[0]["sha256"]
    purged = db.scalars(select(AuditEvent).where(AuditEvent.application_id == A11,
                                                 AuditEvent.action == "retention.document_purged")).all()
    assert len(purged) == len(mine)
    assert audit.verify_chain(db)["intact"]
    db.close()
    assert len(officer.get(f"/api/applications/{A11}/findings").json()) == n_findings
    assert admin.post("/api/admin/retention/purge",
                      json={"dry_run": False, "reason": "Second pass finds nothing left"}).json()["documents_purged"] == 0


def test_institutions_see_when_checks_ran_not_their_counts(app):
    _ensure_complete_run(A7)
    runs = _login(app, "inst7").get(f"/api/applications/{A7}/runs").json()
    assert runs and all(set(r) <= {"id", "status", "round", "started_at", "finished_at", "as_of", "ruleset_id"}
                        for r in runs)


def test_withdraw_needs_a_reason_and_only_the_owner(app):
    inst = _login(app, "inst10")
    assert inst.post("/api/applications/APP-2026-000110/withdraw", json={"reason": ""}).status_code == 422
    assert _login(app, "inst1").post("/api/applications/APP-2026-000110/withdraw",
                                     json={"reason": "x"}).status_code == 404
    r = inst.post("/api/applications/APP-2026-000110/withdraw", json={"reason": "Not seeking approval this year"})
    assert r.status_code == 200 and r.json()["status"] == "withdrawn"
    assert inst.post("/api/applications/APP-2026-000110/withdraw", json={"reason": "again"}).status_code == 409
