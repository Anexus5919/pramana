"""Analyse any document: the per-document pipeline on a file outside any application, held only in memory."""

import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
OUT = ROOT / "fixtures" / "out"
REAL = ROOT / "fixtures" / "real"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seeded() -> bool:
    from sqlalchemy.exc import OperationalError

    from pramana.db import SessionLocal, engine
    from pramana.models import User

    db = SessionLocal()
    try:
        return db.query(User).filter(User.username == "officer").first() is not None
    except OperationalError:
        return False
    finally:
        db.close()
        engine.dispose()


@pytest.fixture(scope="module")
def app():
    # Reuse the world an earlier module seeded; seed it when this module runs alone
    if not _seeded():
        if not (OUT / "manifest.json").exists():
            _load("make_fixtures").main()
        _load("seed").main(validate=False)
    from pramana.db import engine
    from pramana.main import app

    yield app
    # Release the database file, so a later module can reseed it (Windows will not delete an open file)
    engine.dispose()


@pytest.fixture(autouse=True)
def _fresh_limits():
    from pramana import ratelimit
    from pramana.analyse import store

    ratelimit.reset()
    store.clear()
    yield


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def _analyse(c, path: Path, name: str | None = None):
    mime = "application/pdf" if path.suffix == ".pdf" else "image/jpeg"
    return c.post("/api/analyse", files={"file": (name or path.name, path.read_bytes(), mime)})


def _counts():
    from pramana.config import get_settings
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent, Document

    db = SessionLocal()
    try:
        files = sum(1 for _ in get_settings().storage_dir.iterdir())
        return db.query(Document).count(), files, db.query(AuditEvent).count()
    finally:
        db.close()


def test_edited_certificate_gets_every_per_document_check_and_nothing_is_filed(app):
    c = _login(app, "officer")
    docs, files, events = _counts()
    r = _analyse(c, OUT / "A7" / "fire_noc.pdf")
    assert r.status_code == 200, r.text
    a = r.json()

    assert a["doc_type"]["type"] == "fire_noc" and a["text"]["source"] == "digital"
    fields = {f["name"]: f for f in a["document"]["fields"]}
    assert fields["noc_number"]["value"] == "FES/KOL/2025/04519" and fields["noc_number"]["bbox"]
    assert len({f["id"] for f in a["document"]["fields"]}) == len(fields)
    # The issuer's signature holds for the revision it signed; the later edit is outside it
    (sig,) = a["signatures"]
    assert sig["status"] == "mismatch_detected" and sig["response"]["signer_role"] == "issuer"
    assert sig["response"]["intact"] and sig["response"]["demo_anchor"] is True
    assert "modified after signing" in sig["detail"]
    codes = {s["code"] for s in a["document"]["forensic_signals"]}
    assert {"FX-PDF-REVISION-TEXT-CHANGE", "FX-PDF-OVERLAID-TEXT", "FX-FONT-MISMATCH"} <= codes
    (qr,) = a["qr"]
    assert qr["signed"] and qr["status"] == "expired" and qr["simulated"]
    assert a["registry"]["queried"] and a["registry"]["simulated"] and a["registry"]["result"]["status"] == "expired"
    assert a["revision_count"] == 3
    edited = a["revisions"]["revisions"][2]
    assert edited["after_last_signature"] and edited["changes"][0]["added_text"] == "30-06-2027"
    assert [s["status"] for s in a["revisions"]["signatures"]] == ["mismatch_detected"]
    assert {s["step"] for s in a["steps"]} >= {"read", "extract", "forensics", "qr", "signatures", "revisions"}
    assert any(k["what"] == "Rules" for k in a["cannot_know"])

    # Page images and each revision come from memory; revision 2 is the signed page before the edit
    tok = a["token"]
    page = c.get(f"/api/analyse/{tok}/pages/1.png")
    assert page.status_code == 200 and page.content[:8] == b"\x89PNG\r\n\x1a\n"
    revs = [c.get(f"/api/analyse/{tok}/revisions/{n}/pages/1.png") for n in (2, 3)]
    assert all(x.status_code == 200 for x in revs) and revs[0].content != revs[1].content
    assert c.get(f"/api/analyse/{tok}/revisions/4/pages/1.png").status_code == 404
    assert c.get(f"/api/analyse/{tok}/pages/2.png").status_code == 404

    # No document row or stored file; one audit event that names the file only by its hash
    d2, f2, e2 = _counts()
    assert (d2, f2) == (docs, files) and e2 == events + 1
    from sqlalchemy import select

    from pramana.db import SessionLocal
    from pramana.models import AuditEvent

    db = SessionLocal()
    ev = db.scalars(select(AuditEvent).order_by(AuditEvent.seq.desc())).first()
    db.close()
    assert ev.action == "tool.analyse" and ev.details["sha256"] == a["sha256"] and ev.actor == "officer"
    assert set(ev.details) == {"sha256", "mime", "pages", "detected_type", "signatures", "signals", "incomplete"}


def test_held_bytes_are_private_forgettable_and_expire(app, monkeypatch):
    officer, verifier = _login(app, "officer"), _login(app, "verifier")
    tok = _analyse(officer, OUT / "A1" / "ter_receipt.pdf").json()["token"]
    assert verifier.get(f"/api/analyse/{tok}/pages/1.png").status_code == 404
    assert verifier.delete(f"/api/analyse/{tok}").json() == {"forgotten": False}
    assert officer.delete(f"/api/analyse/{tok}").json() == {"forgotten": True}
    assert officer.get(f"/api/analyse/{tok}/pages/1.png").status_code == 404

    import time

    from pramana.analyse import store

    tok = _analyse(officer, OUT / "A1" / "ter_receipt.pdf").json()["token"]
    assert officer.get(f"/api/analyse/{tok}/pages/1.png").status_code == 200
    later = time.monotonic() + store.TTL_S + 1
    monkeypatch.setattr(store.time, "monotonic", lambda: later)
    assert officer.get(f"/api/analyse/{tok}/pages/1.png").status_code == 404


def test_a_reading_timeout_keeps_the_signature_and_a_crash_stops_the_analysis(app, monkeypatch):
    from pramana import sandbox

    c = _login(app, "officer")

    def stopped(reason):
        def op(*_a, **_k):
            raise sandbox.SandboxUnsafe(reason)
        return op

    monkeypatch.setattr(sandbox, "read_pages", stopped("the parser exceeded the 120 s time limit and was stopped"))
    a = _analyse(c, OUT / "A7" / "fire_noc.pdf").json()
    assert "time limit" in a["incomplete"]["reason"] and a["document"]["fields"] == []
    assert a["signatures"][0]["status"] == "mismatch_detected" and a["revision_count"] == 3

    monkeypatch.setattr(sandbox, "read_pages", stopped("the parser crashed (exit code 3) and was stopped"))
    r = _analyse(c, OUT / "A7" / "fire_noc.pdf")
    assert r.status_code == 422 and "Review this file manually" in r.json()["detail"]


def test_store_is_bounded_by_entries_and_bytes(monkeypatch):
    from pramana.analyse import store

    store.clear()
    for i in range(store.MAX_ENTRIES + 3):
        store.put(f"t{i}", "u", b"x" * 10, "application/pdf", 1, [10])
    assert store.held_count() == store.MAX_ENTRIES and store.get("t0", "u") is None
    monkeypatch.setattr(store, "MAX_BYTES", 25)
    store.put("big", "u", b"y" * 20, "application/pdf", 1, [20])
    assert store.get("big", "u") is not None and store.held_count() == 1
    store.clear()


def test_only_officials_and_only_safe_files_within_the_limit(app, monkeypatch):
    ter = OUT / "A1" / "ter_receipt.pdf"
    assert TestClient(app).post("/api/analyse", files={"file": ("x.pdf", ter.read_bytes(), "application/pdf")}).status_code == 401
    assert _analyse(_login(app, "inst1"), ter).status_code == 403
    c = _login(app, "verifier")
    assert _analyse(c, ter, "receipt.png").status_code == 422
    r = c.post("/api/analyse", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 422 and "not allowed" in r.json()["detail"]
    from pramana import ratelimit
    from pramana.analyse import api

    # Every attempt counts, rejected ones included; start a fresh window for this check
    ratelimit.reset()
    monkeypatch.setattr(api, "MAX_PER_WINDOW", 1)
    assert _analyse(c, ter).status_code == 200
    r = _analyse(c, ter)
    assert r.status_code == 429 and r.headers.get("retry-after")


def test_bilingual_certificate_reads_hindi_and_a_photo_gets_its_own_checks(app):
    c = _login(app, "officer")
    a = _analyse(c, OUT / "A2" / "occupancy_certificate.pdf").json()
    assert a["doc_type"]["type"] == "occupancy_certificate" and a["text"]["source"] == "ocr"
    assert a["text"]["hindi_pages"] == 1 and a["text"]["hindi_lines"] > 5
    assert {f["name"]: f["value"] for f in a["document"]["fields"]}["issue_date"] == "1991-02-20"

    photo = next(OUT.glob("A1/*.jpg"))
    p = _analyse(c, photo).json()
    assert p["photo"] and p["signatures"] == [] and p["revisions"] is None
    assert p["photo"]["exif"]["gps"] and p["photo"]["c2pa"]["present"] is not None
    assert p["photo"]["room"]["status"] in ("analysed", "not_analysed")
    jpg = c.get(f"/api/analyse/{p['token']}/photo.jpg")
    assert jpg.status_code == 200 and jpg.content[:3] == b"\xff\xd8\xff"


@pytest.mark.skipif(not (REAL / "egazette_2025_260000.pdf").exists(), reason="run scripts/fetch_real_samples.py first")
def test_real_egazette_chains_to_india_pki_without_an_application(app):
    a = _analyse(_login(app, "officer"), REAL / "egazette_2025_260000.pdf").json()
    (sig,) = a["signatures"]
    r = sig["response"]
    assert sig["status"] == "verified" and not sig["simulated"]
    assert r["trust_anchor"].startswith("India PKI (CCA)") and r["demo_anchor"] is False
    assert r["coverage"] == "ENTIRE_FILE" and r["modification_level"] == "NONE"
    assert "signer_role" not in r and a["doc_type"]["type"] is None and a["registry"]["queried"] is False
    assert a["revision_count"] == 1 and a["text"]["hindi_lines"] > 0
