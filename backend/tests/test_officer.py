"""Officer tools: deficiency letters, evidence packs and Ask why, over the synthetic fixture world."""

import importlib.util
import io
import json
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def app():
    from pramana.config import get_settings

    # Reuse the world when the end-to-end module already seeded this session's data directory
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


def _pdf_text(data: bytes) -> str:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


# ---- deficiency letters


def test_letter_quotes_the_ruleset_and_finalises_into_the_rectification_flow(app):
    from pramana.rules.engine import active_ruleset

    officer = _login(app, "officer")
    aid = "APP-2026-000102"
    r = officer.post(f"/api/applications/{aid}/letters", json={})
    assert r.status_code == 200, r.text
    letter = r.json()
    assert letter["status"] == "draft" and letter["items"]
    rules = {x["id"]: x for x in active_ruleset().rules}
    item = next(i for i in letter["items"] if "APH-A21-SSC-REQUIRED" in i["codes"])
    assert item["citation"]["quote"] == rules["APH-A21-SSC-REQUIRED"]["source"]["quote"]
    assert item["citation"]["page"] == 97 and item["respond_by"]

    draft_pdf = officer.get(f"/api/letters/{letter['id']}/pdf").content
    text = _pdf_text(draft_pdf)
    assert "DRAFT" in text and "Prepared with the Pramana prototype. Synthetic demo data." in text

    body = {"subject": "Items to correct", "intro": "Please correct the items below.", "items": [
        {"finding_ids": i["finding_ids"], "title": i["title"], "description": i["description"],
         "required": i["required"], "rule_id": (i["citation"] or {}).get("rule_id"), "respond_by": i["respond_by"]}
        for i in letter["items"]]}
    bad = json.loads(json.dumps(body))
    bad["items"][0]["description"] = "This certificate looks fake."
    assert officer.put(f"/api/letters/{letter['id']}", json=bad).status_code == 400
    past = json.loads(json.dumps(body))
    past["items"][0]["respond_by"] = "2020-01-01"
    assert officer.put(f"/api/letters/{letter['id']}", json=past).status_code == 400
    r = officer.put(f"/api/letters/{letter['id']}", json=body)
    assert r.status_code == 200 and r.json()["subject"] == "Items to correct"

    inst = _login(app, "inst2")
    assert inst.get(f"/api/letters/{letter['id']}").status_code == 404
    assert inst.get(f"/api/applications/{aid}/letters").json() == []
    assert inst.put(f"/api/letters/{letter['id']}", json=body).status_code == 403
    assert officer.post(f"/api/letters/{letter['id']}/finalise", json={"reason": "short"}).status_code == 422

    r = officer.post(f"/api/letters/{letter['id']}/finalise",
                     json={"reason": "Structural stability certificate missing for a 1991 building"})
    assert r.status_code == 200, r.text
    final = r.json()["letter"]
    assert final["status"] == "final" and final["rectification_id"]
    detail = officer.get(f"/api/applications/{aid}").json()
    assert detail["status"] == "rectification_requested"
    assert any(x["id"] == final["rectification_id"] for x in detail["rectifications"])
    assert officer.put(f"/api/letters/{letter['id']}", json=body).status_code == 409

    events = officer.get(f"/api/applications/{aid}/audit").json()
    sealed = next(e for e in events if e["action"] == "letter.finalised")
    assert sealed["details"]["sha256"] == final["final_sha256"]

    listed = inst.get(f"/api/applications/{aid}/letters").json()
    assert [x["id"] for x in listed] == [letter["id"]] and "final_reason" not in listed[0]
    got = inst.get(f"/api/letters/{letter['id']}/pdf")
    assert got.status_code == 200
    import hashlib

    assert hashlib.sha256(got.content).hexdigest() == final["final_sha256"]
    assert "DRAFT" not in _pdf_text(got.content)
    other = _login(app, "inst5")
    assert other.get(f"/api/letters/{letter['id']}/pdf").status_code == 404


def test_letter_keeps_forensic_and_cross_institution_detail_away_from_the_institution(app):
    officer = _login(app, "officer")
    aid = "APP-2026-000110"
    ids = [f["id"] for f in officer.get(f"/api/applications/{aid}/findings").json()]
    letter = officer.post(f"/api/applications/{aid}/letters", json={"finding_ids": ids}).json()
    r = officer.post(f"/api/letters/{letter['id']}/finalise", json={"reason": "Photo and map need clarification"})
    assert r.status_code == 200, r.text
    inst = _login(app, "inst10")
    seen = json.dumps(inst.get(f"/api/applications/{aid}").json()["rectifications"])
    seen += json.dumps(inst.get(f"/api/applications/{aid}/letters").json())
    seen += _pdf_text(inst.get(f"/api/letters/{letter['id']}/pdf").content)
    for leak in ("Shree Dnyaneshwar", "perceptual", "Geotag", "FX-IMG-GEOTAG-FAR", "finding_ids"):
        assert leak not in seen, leak


# ---- evidence packs


def test_evidence_pack_verifies_offline_and_detects_tampering(app, tmp_path):
    from pramana.officer import verify_pack

    officer = _login(app, "officer")
    aid = "APP-2026-000107"
    r = officer.post(f"/api/applications/{aid}/evidence-packs", json={"include_originals": True})
    assert r.status_code == 200, r.text
    res = r.json()
    names = {f["name"] for f in res["files"]}
    assert {"report.pdf", "manifest.json", "signature.json", "audit/events.json", "audit/checkpoint.json",
            "VERIFY.txt", "verify_pack.py"} <= names
    assert any(n.startswith("documents/") for n in names)
    z = officer.get(res["download_url"])
    assert z.status_code == 200
    path = tmp_path / "pack.zip"
    path.write_bytes(z.content)
    ok, lines = verify_pack.verify(path)
    assert ok, lines

    manifest = json.loads(zipfile.ZipFile(path).read(f"{res['pack_id']}/manifest.json"))
    assert manifest["latest_run_id"] and manifest["runs"][-1]["report_digest"]
    assert all(d["sha256"] for d in manifest["documents"])

    folder = tmp_path / "x"
    zipfile.ZipFile(path).extractall(folder)
    root = folder / res["pack_id"]
    report = root / "report.pdf"
    report.write_bytes(report.read_bytes() + b"%tampered")
    ok, lines = verify_pack.verify(root)
    assert not ok and any(ln.startswith("FAIL") and "report.pdf" in ln for ln in lines)

    zipfile.ZipFile(path).extractall(tmp_path / "y")
    root = tmp_path / "y" / res["pack_id"]
    ev = json.loads((root / "audit" / "events.json").read_text(encoding="utf-8"))
    ev[0]["details"] = {**ev[0]["details"], "edited": True}
    (root / "audit" / "events.json").write_text(json.dumps(ev), encoding="utf-8")
    ok, lines = verify_pack.verify(root)
    assert not ok and any("broken at seq" in ln for ln in lines)

    without = officer.post(f"/api/applications/{aid}/evidence-packs", json={}).json()
    assert not any(f["name"].startswith("documents/") for f in without["files"])
    actions = [e["action"] for e in officer.get(f"/api/applications/{aid}/audit").json()]
    assert actions.count("evidence_pack.exported") >= 2 and "evidence_pack.sealed" in actions

    inst = _login(app, "inst7")
    assert inst.post(f"/api/applications/{aid}/evidence-packs", json={}).status_code == 403
    assert inst.get(res["download_url"]).status_code == 403
    assert _login(app, "verifier").post(f"/api/applications/{aid}/evidence-packs", json={}).status_code == 403
    assert officer.get(res["download_url"].replace(aid, "APP-2026-000101")).status_code == 404


# ---- Ask why


def test_ask_why_template_answers_cite_evidence_and_are_audited(app, monkeypatch):
    from pramana.officer import ask

    monkeypatch.setattr(ask, "enabled_providers", lambda: [])
    officer = _login(app, "officer")
    aid = "APP-2026-000107"
    r = officer.post(f"/api/applications/{aid}/ask", json={"question": "Why is the fire NOC flagged?"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["mode"] == "template" and out["sentences"] and out["dropped_count"] == 0
    assert all(c in out["evidence"] for s in out["sentences"] for c in s["cites"])
    assert "decides nothing" in out["notice"]
    q2 = officer.post("/api/applications/APP-2026-000109/ask", json={"question": "What is still unverified?"}).json()
    assert any("source unavailable" in s["text"] for s in q2["sentences"])
    q3 = officer.post("/api/applications/APP-2026-000101/ask", json={"question": "Which rule needs the SSC?"}).json()
    assert any("APH-A21-SSC-REQUIRED" in s["text"] for s in q3["sentences"])
    events = officer.get(f"/api/applications/{aid}/audit").json()
    assert any(e["action"] == "ask.answered" and e["details"]["question"] == "Why is the fire NOC flagged?"
               for e in events)
    assert _login(app, "inst7").post(f"/api/applications/{aid}/ask", json={"question": "Why?"}).status_code == 403


def test_ask_why_post_check_drops_unsupported_sentences(app, monkeypatch):
    from pramana.db import SessionLocal
    from pramana.models import Application
    from pramana.officer import ask

    db = SessionLocal()
    a = db.get(Application, "APP-2026-000107")
    items = ask.build_context(db, a, "fire")["items"]
    expired_f = next(k for k, v in items.items() if v["kind"] == "finding" and "expired" in v["statuses"])
    rule_f = next(k for k, v in items.items() if v["kind"] == "finding" and "APH-617I-FIRE-VALID" in v["text"])
    proposed = [
        {"text": "The fire certificate expired on 2025-06-30.", "cites": [rule_f]},
        {"text": "The validity it certifies ended 30 June 2025.", "cites": [expired_f]},
        {"text": "The certificate expired.", "cites": []},
        {"text": "The certificate expired on 2024-01-01.", "cites": [rule_f]},
        {"text": "The fire certificate is verified by the issuer.", "cites": [expired_f]},
        {"text": "This certificate is forged.", "cites": [rule_f]},
        {"text": "The application should be rejected.", "cites": [rule_f]},
        {"text": "It lists 42 floors.", "cites": [rule_f]},
        {"text": "It was issued as FES/KOL/2099/1.", "cites": [rule_f]},
        {"text": "The expiry is explained in Z9.", "cites": ["Z9"]},
    ]
    monkeypatch.setattr(ask, "call_model", lambda prompt: (proposed, "ollama", []))
    out = ask.answer(db, a, "Why is the fire NOC flagged?")
    db.close()
    assert out["mode"] == "model" and out["proposed_count"] == 10
    assert [s["text"] for s in out["sentences"]] == [proposed[0]["text"], proposed[1]["text"]]
    reasons = [d["reason"] for d in out["dropped"]]
    assert out["dropped_count"] == 8
    assert reasons[0] == "no valid citation" and "date 2024-01-01" in reasons[1]
    assert "verified" in reasons[2] and "judges" in reasons[3] and "decision" in reasons[4]
    assert "number 42" in reasons[5] and "FES/KOL/2099/1" in reasons[6] and reasons[7] == "no valid citation"


def test_ask_why_context_never_carries_injected_document_text(app):
    from pramana.db import SessionLocal
    from pramana.models import Application
    from pramana.officer import ask

    db = SessionLocal()
    a = db.get(Application, "APP-2026-000111")
    items = ask.build_context(db, a, "Why is the fire NOC flagged?")["items"]
    db.close()
    blob = " ".join(i["text"] for i in items.values()).lower()
    assert "ignore previous" not in blob and "31/12/2099" not in blob
    assert any("withheld" in i["text"] for i in items.values())
