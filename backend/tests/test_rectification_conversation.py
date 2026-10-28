"""Correction-round conversation: roles, what an institution may read, the outcome block, attachments,
notifications and the audit trail (docs/features/rectification-conversation.md)."""

import hashlib
import importlib.util
import json
import sqlite3
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIX = ROOT / "fixtures" / "out"
A4 = "APP-2026-000104"
A8 = "APP-2026-000108"
A9 = "APP-2026-000109"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


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
    """The validated seed world; the database is put back afterwards, since these tests open rounds and record an
    outcome that later modules must not see."""
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
    saved = live.with_name("pramana.conversation-tests.db")
    engine.dispose()
    _copy_db(live, saved)
    yield app
    engine.dispose()
    _copy_db(saved, live)
    saved.unlink()


@pytest.fixture(autouse=True)
def _fresh_limits():
    from pramana import ratelimit

    ratelimit.reset()
    yield


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200, r.text
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def _post(c, thread_id, body, kind=None, file=None):
    data = {"body": body, **({"kind": kind} if kind else {})}
    files = {"file": file} if file else None
    return c.post(f"/api/rectification-threads/{thread_id}/messages", data=data, files=files)


def _threads(c, app_id):
    r = c.get(f"/api/applications/{app_id}/rectification/threads")
    assert r.status_code == 200, r.text
    return r.json()


def _item(payload, no):
    return next(t for t in payload["threads"] if t["item_no"] == no)


def _notes(c):
    return c.get("/api/notifications?limit=50").json()


@pytest.fixture(scope="module")
def a4(world):
    """A4 with a final deficiency letter over every finding of its latest run, forensic ones included."""
    officer = _login(world, "officer")
    ids = [f["id"] for f in officer.get(f"/api/applications/{A4}/findings").json()]
    letter = officer.post(f"/api/applications/{A4}/letters", json={"finding_ids": ids})
    assert letter.status_code == 200, letter.text
    r = officer.post(f"/api/letters/{letter.json()['id']}/finalise", json={"reason": "Deficiencies in the documents"})
    assert r.status_code == 200, r.text
    return {"codes": {f["code"] for f in officer.get(f"/api/applications/{A4}/findings").json()},
            "letter_id": letter.json()["id"]}


def test_a_final_letter_opens_one_thread_per_item_and_tells_the_institution(world, a4):
    officer, inst = _login(world, "officer"), _login(world, "inst4")
    letter = officer.get(f"/api/letters/{a4['letter_id']}").json()
    t = _threads(officer, A4)
    assert [x["item_no"] for x in t["threads"]] == [*range(1, len(letter["items"]) + 1), 0]
    assert t["round"]["letter_id"] == a4["letter_id"] and t["round"]["respond_by"] and t["can_set_status"]
    assert [x["title"] for x in t["threads"][:-1]] == [i["title"] for i in letter["items"]]
    got = [n for n in _notes(inst)["items"] if n["event"] == "letter_finalised"]
    assert got and got[0]["link"] == f"/portal/applications/{A4}?show=letter"
    assert not [n for n in _notes(officer)["items"] if n["event"] == "letter_finalised"]


def test_roles_keep_institutions_apart_and_the_verifier_read_only(world, a4):
    inst, other, verifier = _login(world, "inst4"), _login(world, "inst5"), _login(world, "verifier")
    officer, admin = _login(world, "officer"), _login(world, "admin")
    item1 = _item(_threads(inst, A4), 1)["id"]
    assert other.get(f"/api/applications/{A4}/rectification/threads").status_code == 404
    assert _post(other, item1, "Not my application").status_code == 404
    assert other.get(f"/api/applications/{A4}/outcome").status_code == 404

    seen = _threads(verifier, A4)
    assert seen["threads"] and not seen["can_post"] and not seen["can_set_status"]
    assert _post(verifier, item1, "A verifier writes").status_code == 403
    assert verifier.post(f"/api/rectification-threads/{item1}/status",
                         json={"status": "resolved", "note": "ok"}).status_code == 403
    assert inst.post(f"/api/rectification-threads/{item1}/status",
                     json={"status": "resolved", "note": "We fixed it"}).status_code == 403
    # Each side writes only its own kinds
    assert _post(inst, item1, "Pretending to be the cell", kind="cell_reply").status_code == 400
    assert _post(officer, item1, "An officer reply", kind="reply").status_code == 400
    assert TestClient(world).get(f"/api/applications/{A4}/rectification/threads").status_code == 401
    assert _post(admin, item1, "Administrators reply as the cell too.").status_code == 200


def test_the_institution_never_sees_officer_names_or_forensic_data(world, a4):
    officer, inst = _login(world, "officer"), _login(world, "inst4")
    item1 = _item(_threads(officer, A4), 1)["id"]
    r = _post(officer, item1, "Upload the certificate issued by the competent authority.")
    assert r.status_code == 200, r.text
    mine = _threads(inst, A4)
    raw = json.dumps(mine)
    cell = [e for t in mine["threads"] for e in t["entries"] if e.get("side") == "cell"]
    assert cell and all(e["author"] == "AICTE Scrutiny Cell" and "author_name" not in e for e in cell)
    for leak in ("R. Sharma", "S. Rao", '"officer"', "author_name", "finding_ids", "evidence_class", "severity",
                 *a4["codes"]):
        assert leak not in raw, leak
    official = _threads(officer, A4)
    assert any(e.get("author_name") == "R. Sharma (Scrutiny Officer)" for t in official["threads"] for e in t["entries"])
    assert _item(official, 1)["finding_ids"]


def test_attachments_are_checked_by_their_bytes_and_stored_encrypted(world, a4):
    from pramana.config import get_settings
    from pramana.conversation.models import RectMessage
    from pramana.db import SessionLocal

    inst, other = _login(world, "inst4"), _login(world, "inst5")
    general = _item(_threads(inst, A4), 0)["id"]
    assert _post(inst, general, "Scan attached", file=("scan.pdf", PNG, "application/pdf")).status_code == 422
    assert _post(inst, general, "Notes attached", file=("notes.pdf", b"plain text, not a PDF", "application/pdf")).status_code == 422
    assert _post(inst, general, "Script", file=("run.exe", b"MZ\x90\x00" * 8, "application/octet-stream")).status_code == 422
    big = PDF + b"0" * (get_settings().max_upload_mb * 1024 * 1024)
    assert _post(inst, general, "Large scan", file=("big.pdf", big, "application/pdf")).status_code == 422
    ok = _post(inst, general, "Our renewal receipt is attached.", kind="question", file=("receipt.pdf", PDF, "application/pdf"))
    assert ok.status_code == 200, ok.text
    msg = next(e for e in _item(ok.json(), 0)["entries"] if e.get("id") == ok.json()["message_id"])
    assert msg["attachment"]["sha256"] == hashlib.sha256(PDF).hexdigest() and msg["attachment"]["mime"] == "application/pdf"
    assert _post(inst, general, "Campus photo", file=("photo.png", PNG, "image/png")).status_code == 200

    got = inst.get(msg["attachment"]["url"])
    assert got.status_code == 200 and got.content == PDF and got.headers["x-content-type-options"] == "nosniff"
    assert other.get(msg["attachment"]["url"]).status_code == 404
    db = SessionLocal()
    stored = db.get(RectMessage, msg["id"]).attachment_storage
    db.close()
    assert not (get_settings().storage_dir / stored).read_bytes().startswith(b"%PDF")


def test_items_move_through_their_statuses_and_a_review_request_blocks_the_outcome(world, a4):
    officer, inst = _login(world, "officer"), _login(world, "inst4")
    item1 = _item(_threads(inst, A4), 1)["id"]
    assert _post(inst, item1, "We have applied for the corrected record.", kind="reply").status_code == 200
    assert _item(_threads(officer, A4), 1)["status"] == "responded"
    assert _item(_threads(officer, A4), 1)["awaiting_reply"]
    assert officer.post(f"/api/rectification-threads/{item1}/status",
                        json={"status": "still_open", "note": "This looks fake"}).status_code == 400
    r = officer.post(f"/api/rectification-threads/{item1}/status",
                     json={"status": "still_open", "note": "The corrected record is still needed."})
    assert r.status_code == 200, r.text
    seen = _item(_threads(inst, A4), 1)
    assert seen["status"] == "still_open" and seen["status_note"] == "The corrected record is still needed."
    assert _post(inst, item1, "Too short", kind="review_request").status_code == 400
    general = _item(_threads(inst, A4), 0)["id"]
    assert _post(inst, general, "We disagree with the round as a whole.", kind="review_request").status_code == 400
    r = _post(inst, item1, "Our record was correct when we submitted; the register shows the same figure.",
              kind="review_request")
    assert r.status_code == 200
    assert _item(r.json(), 1)["status"] == "review_requested" and _item(r.json(), 1)["pending_review"]

    # Due-date reminders: once, when the portal loads
    from pramana.db import SessionLocal
    from pramana.models import DeficiencyLetter

    db = SessionLocal()
    lt = db.get(DeficiencyLetter, a4["letter_id"])
    lt.items = [{**i, "respond_by": (date.today() + timedelta(days=2)).isoformat()} for i in lt.items]
    db.commit()
    db.close()
    due = [n for n in _notes(inst)["items"] if n["event"] == "deadline_soon"]
    assert len(due) == 1 and due[0]["title"] == "Response due in 2 days"
    assert len([n for n in _notes(inst)["items"] if n["event"] == "deadline_soon"]) == 1

    sub = inst.post(f"/api/applications/{A4}/submit")
    assert sub.status_code == 200, sub.text
    blocked = officer.post(f"/api/applications/{A4}/scrutiny-outcome",
                           json={"outcome": "deficiencies_recorded", "reason": "Deficiencies remain on the record."})
    assert blocked.status_code == 409
    assert blocked.json()["detail"].startswith("Reply to the institution's review request first")
    assert officer.get(f"/api/applications/{A4}/rectification/threads").json()["counts"]["pending_reviews_all_rounds"] == 1

    assert _post(officer, item1, "We have read your reason. The figure must match the AICTE record.").status_code == 200
    ok = officer.post(f"/api/applications/{A4}/scrutiny-outcome",
                      json={"outcome": "deficiencies_recorded", "reason": "The intake figure differs from the AICTE record."})
    assert ok.status_code == 200, ok.text
    # The report for the Executive Committee records the round and that its review request had the cell's answer
    ec = officer.get(f"/api/applications/{A4}/ec-reports").json()["latest"]
    assert ec["summary"]["correction_rounds"] == 1 and ec["outcome"]["code"] == "deficiencies_recorded"
    assert ec["summary"]["review_requests"] == ec["summary"]["review_requests_answered"] == 1
    assert inst.get(f"/api/applications/{A4}/ec-reports").status_code == 403

    view = inst.get(f"/api/applications/{A4}/outcome").json()["outcome"]
    assert view["reasons"] == "The intake figure differs from the AICTE record." and view["what_next"]
    assert view["label"] == "Scrutiny complete, deficiencies recorded" and "recorded_by" not in view
    assert officer.get(f"/api/applications/{A4}/outcome").json()["outcome"]["recorded_by"]
    assert [n for n in _notes(inst)["items"] if n["event"] == "outcome_recorded"]
    # The decision is made: the institution's round is closed for new messages, the cell can still answer
    late = _post(inst, item1, "One more thing.")
    assert late.status_code == 409 and "outcome" in late.json()["detail"]
    assert not _threads(inst, A4)["can_post"]


def test_another_rectification_stays_possible_while_a_review_request_waits(world):
    officer, inst = _login(world, "officer"), _login(world, "inst9")
    fs = [f for f in officer.get(f"/api/applications/{A9}/findings").json()
          if f["category"] in ("completeness", "compliance", "validity")]
    r = officer.post(f"/api/applications/{A9}/rectification",
                     json={"finding_ids": [f["id"] for f in fs[:1]], "message": "Please correct the item below."})
    assert r.status_code == 200, r.text
    t = _threads(inst, A9)
    assert t["round"]["letter_id"] is None and [x["item_no"] for x in t["threads"]] == [1, 0]
    assert [n for n in _notes(inst)["items"] if n["event"] == "rectification_requested"]
    item1 = _item(t, 1)["id"]
    assert _post(inst, item1, "We believe this item was already satisfied in our first submission.",
                 kind="review_request").status_code == 200
    again = officer.post(f"/api/applications/{A9}/rectification", json={"message": "Please also add a cover note."})
    assert again.status_code == 200, again.text
    # The earlier round stays answerable by the cell, and the institution now writes in the new round
    assert len(_threads(officer, A9)["rounds"]) == 2
    assert _post(inst, item1, "Still about the first round.").status_code == 409
    assert _post(officer, item1, "Noted; the new round asks only for a cover note.").status_code == 200


def test_every_event_notifies_the_other_side_and_read_state_is_per_user(world, a4):
    from pramana.conversation.models import Notification
    from pramana.db import SessionLocal

    officer, admin, inst = _login(world, "officer"), _login(world, "admin"), _login(world, "inst4")
    verifier = _login(world, "verifier")
    events = {e: 0 for e in ("institution_message", "review_requested", "cell_reply", "status_changed")}
    db = SessionLocal()
    for n in db.scalars(select(Notification).where(Notification.application_id == A4)):
        if n.event in events:
            events[n.event] += 1
    db.close()
    assert all(events.values()), events
    cell = [n for n in _notes(officer)["items"]
            if n["application_id"] == A4 and n["event"] in ("institution_message", "review_requested")]
    assert cell and all(n["link"].startswith(f"/applications/{A4}/rectification?thread=") for n in cell)
    assert [n for n in _notes(admin)["items"] if n["event"] == "review_requested"]
    assert _notes(verifier)["items"] == []
    mine = _notes(inst)
    assert {"cell_reply", "status_changed"} <= {n["event"] for n in mine["items"]}
    assert all("R. Sharma" not in n["title"] + n["body"] for n in mine["items"])

    first = mine["items"][0]
    assert officer.post(f"/api/notifications/{first['id']}/read").status_code == 404
    r = inst.post(f"/api/notifications/{first['id']}/read")
    assert r.status_code == 200 and r.json()["read"]
    assert _notes(inst)["unread"] == mine["unread"] - 1
    assert inst.post("/api/notifications/read-all").json()["marked"] == mine["unread"] - 1
    assert _notes(inst)["unread"] == 0 and _notes(officer)["unread"] > 0


def test_messages_and_status_changes_are_audited_by_id_and_digest(world, a4):
    from pramana import audit
    from pramana.conversation.models import RectMessage, RectStatusChange
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent

    db = SessionLocal()
    posted = {e.object_id: e for e in db.scalars(select(AuditEvent).where(AuditEvent.action == "rectification.message_posted"))}
    msgs = db.scalars(select(RectMessage).where(RectMessage.application_id == A4)).all()
    assert msgs and all(m.id in posted for m in msgs)
    for m in msgs:
        d = posted[m.id].details
        assert d["kind"] == m.kind and d["side"] == m.side and d["thread_id"] == m.thread_id
        assert d["body_sha256"] == hashlib.sha256(m.body.encode()).hexdigest()
        assert m.body not in json.dumps(d)
    changes = db.scalars(select(RectStatusChange).where(RectStatusChange.application_id == A4)).all()
    logged = db.scalars(select(AuditEvent).where(AuditEvent.action == "rectification.item_status_changed",
                                                 AuditEvent.application_id == A4)).all()
    assert len(logged) == len(changes) >= 3
    assert all("note" not in e.details for e in logged)
    assert db.scalars(select(AuditEvent).where(AuditEvent.action == "rectification.attachment_downloaded")).first()
    assert audit.verify_chain(db)["intact"]
    db.close()


def test_posting_is_rate_limited(world, a4):
    officer = _login(world, "officer")
    general = _item(_threads(officer, A4), 0)["id"]
    codes = [_post(officer, general, f"Note {n} for the institution.").status_code for n in range(13)]
    assert codes[:12] == [200] * 12 and codes[12] == 429


def test_the_demo_round_has_an_exchange_and_one_open_question(world):
    from pramana.conversation import demo
    from pramana.db import SessionLocal

    db = SessionLocal()
    demo.seed_round(db, A8)
    db.close()
    officer, inst = _login(world, "officer"), _login(world, "inst8")
    t = _threads(officer, A8)
    item1, general = _item(t, 1), _item(t, 0)
    assert [e["side"] for e in item1["entries"]] == ["institution", "cell"] and item1["status"] == "responded"
    assert not item1["awaiting_reply"] and general["awaiting_reply"] and general["entries"][0]["kind"] == "question"
    queue = officer.get("/api/rectification/awaiting").json()
    assert any(i["application_id"] == A8 and i["item_no"] == 0 and i["kind"] == "question" for i in queue["items"])
    assert inst.get("/api/rectification/awaiting").status_code == 403
