"""Document life story: events from inside the file and Pramana's records, each with the source of its time."""

import importlib.util
import io
from datetime import UTC, datetime
from pathlib import Path

import pikepdf
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
OUT = ROOT / "fixtures" / "out"
GAZETTE = ROOT / "fixtures" / "real" / "egazette_2025_260000.pdf"
A1, A7, A8 = "APP-2026-000101", "APP-2026-000107", "APP-2026-000108"


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _seeded() -> bool:
    from sqlalchemy.exc import OperationalError

    from pramana.db import SessionLocal, engine
    from pramana.models import Application, ValidationRun

    db = SessionLocal()
    try:
        return db.get(Application, A7) is not None and db.query(ValidationRun).count() > 0
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
        _load("seed").main(validate=True)
    from pramana.db import engine
    from pramana.main import app

    yield app
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


def _doc(c, app_id, doc_type):
    return next(d for d in c.get(f"/api/applications/{app_id}").json()["documents"]
                if d["declared_type"] == doc_type and not d["superseded"])


def _by_kind(story):
    out: dict[str, list] = {}
    for e in story["events"]:
        out.setdefault(e["kind"], []).append(e)
    return out


def test_edit_after_the_issuer_signed_is_told_from_structure_with_every_time_labelled(app):
    c = _login(app, "officer")
    doc = _doc(c, A7, "fire_noc")
    r = c.get(f"/api/documents/{doc['id']}/story")
    assert r.status_code == 200, r.text
    s = r.json()
    k = _by_kind(s)

    (issued,) = k["issued"]
    assert issued["time"]["source"] == "printed" and issued["time"]["precision"] == "day"
    assert issued["time"]["at"].startswith("2023-06-30T18:30") and issued["link"]["to"] == "region"
    (created,) = k["created"]
    assert created["time"]["source"] == "metadata" and created["time"]["trust"] == "editable"
    assert "Pramana fixture generator" in created["tool"] and "claims made by the software" in created["detail"]
    (signed,) = k["signed"]
    assert signed["role"] == "issuer" and signed["revision"] == 2 and signed["time"]["source"] == "signer"
    assert "Chief Fire Officer Kolhapur" in signed["actor"] and signed["link"] == {"to": "signature", "field":
                                                                                   "IssuerSignature", "rev": 2}
    (edited,) = k["edited"]
    assert edited["revision"] == 3 and edited["after_signature"] and edited["tone"] == "warning"
    assert "'30-06-2027' was drawn over '30-06-2025'" in edited["detail"]
    assert edited["link"] == {"to": "revision", "rev": 3} and edited["region"]["page"] == 1
    # The signature's own widget annotation is part of signing, not a separate event
    assert "annotated" not in k

    # Pramana's records are the trusted clock
    (up,) = k["uploaded"]
    assert up["origin"] == "pramana" and up["time"]["trust"] == "trusted" and "still matches" in up["detail"]
    assert k["checked"] and all(e["time"]["source"] == "pramana" for e in k["checked"])

    seq = {e["id"]: e["seq"] for e in s["events"]}
    assert seq[issued["id"]] < seq[created["id"]] <= seq[signed["id"]] < seq[edited["id"]] < seq[up["id"]]

    (after,) = [a for a in s["anomalies"] if a["code"] == "STORY-AFTER-SIGNING"]
    assert after["severity"] == "high" and after["basis"] == "structure"
    assert after["from"] == signed["id"] and after["to"] == edited["id"]
    assert after["interval_s"] is not None and after["interval_s"] >= 0
    assert "after Chief Fire Officer Kolhapur signed" in after["detail"] and "self-asserted" in after["detail"]
    assert s["anomalies"][0]["code"] == "STORY-AFTER-SIGNING" and s["headline"] == "Changed after the issuer signed"
    assert s["coverage"] == [{"field": "IssuerSignature", "signer": signed["actor"], "role": "issuer",
                              "through_revision": 2, "revision_count": 3, "event": signed["id"],
                              "from_event": created["id"]}]
    words = " ".join([e["title"] + e["detail"] for e in s["events"]] + [a["title"] + a["detail"] for a in s["anomalies"]])
    for banned in ("forged", "fake", "fraud", "genuine", chr(0x2014)):
        assert banned not in words.lower()


def test_clean_issuer_signed_certificate_has_no_warning(app):
    c = _login(app, "officer")
    s = c.get(f"/api/documents/{_doc(c, A1, 'fire_noc')['id']}/story").json()
    k = _by_kind(s)
    assert [e["revision"] for e in k["signed"]] == [2] and k["signed"][0]["role"] == "issuer"
    assert s["coverage"][0]["through_revision"] == s["revision_count"] == 2
    assert not any(e.get("after_signature") for e in s["events"])
    assert all(a["severity"] == "info" for a in s["anomalies"])
    assert s["headline"] == "No gap or warning in this file's story"


def test_applicant_only_signature_and_photo_edited_after_capture(app):
    c = _login(app, "officer")
    s = c.get(f"/api/documents/{_doc(c, A8, 'fire_noc')['id']}/story").json()
    (only,) = [a for a in s["anomalies"] if a["code"] == "STORY-APPLICANT-ONLY"]
    assert only["severity"] == "medium" and s["coverage"][0]["role"] == "applicant"

    p = c.get(f"/api/documents/{_doc(c, A7, 'infrastructure_photo')['id']}/story").json()
    assert p["kind"] == "photo"
    k = _by_kind(p)
    assert k["captured"][0]["time"]["source"] == "exif" and k["credentials"][0]["time"]["source"] == "device"
    assert k["modified"][0]["time"]["source"] == "structure" and k["modified"][0]["time"]["at"] is None
    (mod,) = [a for a in p["anomalies"] if a["code"] == "STORY-PHOTO-MODIFIED"]
    assert mod["severity"] == "high" and mod["to"] == k["modified"][0]["id"]
    seq = {e["kind"]: e["seq"] for e in p["events"]}
    assert seq["credentials"] < seq["modified"] < seq["uploaded"]


def test_story_is_for_officials_only(app):
    officer = _login(app, "officer")
    doc = _doc(officer, A7, "fire_noc")
    assert _login(app, "inst7").get(f"/api/documents/{doc['id']}/story").status_code == 403
    assert officer.get("/api/documents/doc_missing/story").status_code == 404


@pytest.mark.skipif(not GAZETTE.exists(), reason="real e-Gazette sample not present")
def test_real_gazette_story_on_analyse(app):
    c = _login(app, "officer")
    r = c.post("/api/analyse", files={"file": (GAZETTE.name, GAZETTE.read_bytes(), "application/pdf")})
    assert r.status_code == 200, r.text
    s = r.json()["story"]
    k = _by_kind(s)
    (issued,) = k["issued"]
    assert issued["time"]["at"].startswith("2025-01-05T18:30") and "JANUARY 6, 2025" in issued["time"]["raw"]
    (created,) = k["created"]
    # D:20250107190806+05'30' is 13:38:06 UTC: the zone written in the file is honoured
    assert created["time"]["at"] == "2025-01-07T13:38:06+00:00" and created["time"]["zone_recorded"]
    assert "iTextSharp" in created["tool"]
    (signed,) = k["signed"]
    assert signed["revision"] == 1 and signed["time"]["source"] == "signer" and "AMIT KUMAR JAISWAL" in signed["actor"]
    assert k["analysed"][0]["origin"] == "pramana"
    assert [e["kind"] for e in s["events"]] == ["issued", "created", "signed", "analysed"]
    assert s["anomalies"] == [] and s["coverage"][0]["through_revision"] == s["revision_count"] == 1


def _pdf(producer: str, created: str) -> bytes:
    pdf = pikepdf.new()
    pdf.add_blank_page()
    pdf.docinfo["/Producer"] = producer
    pdf.docinfo["/CreationDate"] = created
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def test_word_made_issuer_document_and_dates_that_disagree():
    from pramana.insights.story import build_story, pdf_date, span

    data = _pdf("Microsoft® Word for Microsoft 365", "D:20250301101500+05'30'")
    fields = [{"name": "issue_date", "value": "2025-03-12", "raw": "12-03-2025", "page": 1, "bbox": [1, 2, 3, 4]}]
    s = build_story(mime="application/pdf", data=data, fields=fields, pages=[], issuer_doc=True)
    codes = {a["code"]: a for a in s["anomalies"]}
    assert codes["STORY-EDITOR-CREATED"]["severity"] == "medium" and "Microsoft" in codes["STORY-EDITOR-CREATED"]["detail"]
    assert codes["STORY-CREATED-BEFORE-ISSUE"]["severity"] == "medium" and "11 days" in codes["STORY-CREATED-BEFORE-ISSUE"]["detail"]
    # Not an issuer document: the tool is shown, not flagged
    plain = build_story(mime="application/pdf", data=data, fields=[], pages=[], issuer_doc=False)
    assert not plain["anomalies"] and "Microsoft" in plain["events"][0]["tool"]

    assert pdf_date("D:20250107190806+05'30'") == (datetime(2025, 1, 7, 13, 38, 6, tzinfo=UTC), True)
    assert pdf_date("D:20250107190806Z")[0] == datetime(2025, 1, 7, 19, 8, 6, tzinfo=UTC)
    when, zone = pdf_date("D:20250107190806")
    assert not zone and when.utcoffset().total_seconds() == 19800
    assert pdf_date("garbage") == (None, False)
    assert span(1) == "1 second" and span(41 * 86400) == "41 days" and span(400 * 86400) == "13 months"
    assert span(3.4 * 365.25 * 86400) == "3 years 5 months"


# ---- inspection brief


def test_inspection_brief_lists_originals_retakes_and_questions_and_is_audited(app):
    from pramana.db import SessionLocal
    from pramana.models import AuditEvent

    c = _login(app, "officer")
    r = c.post(f"/api/applications/{A7}/inspection-brief", json={})
    assert r.status_code == 200, r.text
    b = r.json()
    (noc,) = [o for o in b["originals"] if o["filename"] == "fire_noc.pdf"]
    assert noc["severity"] in ("critical", "high") and len(noc["findings"]) >= 3 and "certified by the issuer" in noc["ask"]
    assert any("Content Credentials" in w for x in b["retake"] for w in x["why"])
    assert any("changed after it was signed" in q["question"] for q in b["questions"])
    assert b["gps"]["record"]["lat"] and b["footer"] == "Prepared with the Pramana prototype. Synthetic demo data."
    assert {x["what"] for x in b["count"]} >= {"Laboratories", "Faculty", "Built-up area"}

    pdf = c.get(f"/api/applications/{A7}/inspection-brief.pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert pdf.headers["content-type"] == "application/pdf"
    db = SessionLocal()
    try:
        fmts = [e.details["format"] for e in db.query(AuditEvent).filter(
            AuditEvent.action == "inspection_brief.generated", AuditEvent.application_id == A7)]
    finally:
        db.close()
    assert {"view", "pdf"} <= set(fmts)

    words = " ".join([b["summary"]] + [q["question"] for q in b["questions"]] + [o["ask"] for o in b["originals"]])
    for banned in ("forged", "fake", "fraud", "genuine", "approve", "reject", chr(0x2014)):
        assert banned not in words.lower()
    assert _login(app, "inst7").post(f"/api/applications/{A7}/inspection-brief", json={}).status_code == 403
    assert _login(app, "verifier").get(f"/api/applications/{A7}/inspection-brief.pdf").status_code == 403
