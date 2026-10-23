"""Edits made with everyday tools: annotations over a value, missing issuer signatures, image-only copies."""

import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from pramana.forensics.annotations import scan
from pramana.forensics.pdf_struct import editors_named
from pramana.pipeline.extract import extract_fields
from pramana.pipeline.text import extract_pdf, render_pdf_page
from pramana.rules.engine import active_ruleset
from pramana.verification import base as vb
from pramana.verification.issuer_copy import findings as copy_findings

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lab = _script("tamper_lab")


def _certificate() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    y = 760
    for label, value in [("NOC No.", "FES/PUN/2025/04417"), ("Date of Issue", "12-03-2025"),
                         ("Valid Up To", "11-03-2027"), ("Issued to", "Shree Test Institute of Technology"),
                         ("Issuing Authority", "Chief Fire Officer, Pune Fire Brigade")]:
        c.setFont("Helvetica-Bold", 10.5)
        c.drawString(70, y, f"{label}: ")
        c.setFont("Helvetica", 10.5)
        c.drawString(70 + c.stringWidth(f"{label}: ", "Helvetica-Bold", 10.5), y, value)
        y -= 17
    c.setFont("Helvetica", 9)
    c.drawString(70, y - 20, "This certificate is valid up to the date stated above, subject to inspection.")
    c.save()
    return buf.getvalue()


@pytest.fixture(scope="module")
def signed() -> bytes:
    from pramana.verification import demo_pki

    root, sub = demo_pki.build()
    issuer = demo_pki.signer(sub, "Chief Fire Officer Pune", "Maharashtra Fire and Emergency Services (DEMO)")
    return demo_pki.sign_pdf(_certificate(), issuer, [sub, root], reason="Fire NOC issued", location="Pune")


def _fields(data: bytes) -> list[dict]:
    spec = active_ruleset().doc_types["fire_noc"]
    return [{"name": e.name, "raw": e.raw, "page": e.page, "bbox": e.bbox}
            for e in extract_fields(extract_pdf(data), spec)]


def _edit(data: bytes, *makers, full: bool = False) -> bytes:
    loc = lab.locate(data, "Valid Up To", "11-03-2027")
    return lab.add_annotations(data, [lambda w, p, m=m: m(w, p, loc) for m in makers], full_save=full)


def _text_box(w, p, loc):
    return lab.free_text(w, p, loc, "11-03-2029")


def _white_box(w, p, loc):
    return lab.white_square(w, p, loc)


# ---- annotations over a value


def test_edge_add_text_over_the_date_says_what_the_page_shows(signed):
    data = _edit(signed, _text_box)
    res = scan(data, _fields(data))
    assert [s.code for s in res["signals"]] == ["FX-ANNOT-OVER-FIELD"]
    s = res["signals"][0]
    assert s.severity == "high" and s.evidence_class == "structural"
    assert "the page shows '11-03-2029' in a text box annotation (FreeText) drawn over the printed '11-03-2027'" \
        in s.detail
    assert "after the signature 'IssuerSignature'" in s.detail
    assert [e["label"] for e in s.evidence] == ["annotation over valid until", "printed valid until"]
    assert all(e["page"] == 1 and len(e["bbox"]) == 4 for e in s.evidence)


def test_white_box_and_text_box_are_reported_together(signed):
    data = _edit(signed, _white_box, _text_box)
    res = scan(data, _fields(data))
    assert [s.code for s in res["signals"]] == ["FX-ANNOT-OVER-FIELD"]
    detail = res["signals"][0].detail
    assert "shows '11-03-2029' in a text box annotation" in detail and "rectangle annotation (Square)" in detail
    assert {a["subtype"] for a in res["annotations"]} == {"Square", "FreeText"}
    assert all(a["revision"] == 3 for a in res["annotations"])


def test_annotation_in_a_rewritten_file_is_still_reported(signed):
    data = _edit(signed, _text_box, full=True)
    res = scan(data, _fields(data))
    assert [s.code for s in res["signals"]] == ["FX-ANNOT-OVER-FIELD"]
    assert "rewritten as a whole after the signature" in res["signals"][0].detail


def test_ink_scribble_and_form_field_over_the_date_are_reported():
    data = _certificate()
    scribble = _edit(data, lambda w, p, loc: lab.ink(w, p, loc, (0, 0, 0.6), 1.4, 6))
    res = scan(scribble, _fields(scribble))
    assert [s.code for s in res["signals"]] == ["FX-ANNOT-OVER-FIELD"]
    assert "freehand drawing annotation (Ink) is drawn over the printed '11-03-2027'" in res["signals"][0].detail
    field = _edit(data, lambda w, p, loc: lab.form_field(w, p, loc, "11-03-2029"))
    res = scan(field, _fields(field))
    assert "shows '11-03-2029' in a form field annotation (Widget)" in res["signals"][0].detail
    assert "carries no signature" in res["signals"][0].detail


def test_links_highlights_and_comments_away_from_values_are_not_reported():
    from pyhanko.pdf_utils import generic

    data = _certificate()
    loc = lab.locate(data, "Valid Up To", "11-03-2027")

    def link(w, p):
        d = lab._common(p, [loc["x0"], loc["baseline"] - 3, loc["x1"], loc["baseline"] + 10], "/Link")
        d[generic.NameObject("/Border")] = lab._arr([0, 0, 0])
        return d

    def highlight(w, p):
        r = [loc["x0"], loc["baseline"] - 3, loc["x1"], loc["baseline"] + 10]
        d = lab._common(p, r, "/Highlight")
        d[generic.NameObject("/QuadPoints")] = lab._arr([r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[1]])
        return d

    def far_note(w, p):
        return lab.free_text(w, p, {**loc, "baseline": 120.0, "x0": 300.0}, "Received with thanks")

    edited = lab.add_annotations(data, [link, highlight, far_note])
    res = scan(edited, _fields(edited))
    assert res["signals"] == []
    assert [a["subtype"] for a in res["annotations"]] == ["FreeText"]


def test_annotation_over_other_printed_text_is_a_lower_indicator():
    data = _certificate()
    loc = lab.locate(data, "Issued to", "Shree")
    edited = lab.add_annotations(data, [lambda w, p: lab.free_text(w, p, {**loc, "x0": 66.0}, "Note")])
    res = scan(edited, [f for f in _fields(edited) if f["name"] != "institution_name"])
    assert [s.code for s in res["signals"]] == ["FX-ANNOT-OVER-TEXT"]
    assert res["signals"][0].severity == "medium"


def test_page_render_draws_annotations_and_form_fields():
    data = _certificate()
    field = _edit(data, lambda w, p, loc: lab.form_field(w, p, loc, "11-03-2029"))
    before, after = (np.asarray(render_pdf_page(x, 0, 72).convert("L"), dtype=int) for x in (data, field))
    assert (abs(before - after) > 40).sum() > 20


def test_annotation_check_runs_in_the_parser_sandbox(signed):
    from pramana import sandbox

    data = _edit(signed, _white_box, _text_box)
    signals, facts = sandbox.annotations(data, _fields(data))
    assert [s.code for s in signals] == ["FX-ANNOT-OVER-FIELD"]
    assert len(facts["annotations"]) == 2 and facts["signatures"][0]["field"] == "IssuerSignature"


# ---- issuer documents without the issuer's signature


def _doc(**kw):
    base = {"id": "d1", "declared_type": "fire_noc", "mime": "application/pdf", "processing_status": "processed",
            "text_source": "digital",
            "analysis": {"forensic_facts": {"metadata": {"info": {"Producer": "ReportLab"}, "fonts": ["/Helvetica"]}}}}
    return SimpleNamespace(**{**base, **kw})


def _fp(*parts):
    return "|".join(parts)


def _res(channel, status, **kw):
    return vb.VerificationResult(channel, status, "test", False, "detail", **kw)


def test_applicant_signature_alone_is_no_issuer_signature():
    spec = active_ruleset().doc_types["fire_noc"]
    vres = [_res("applicant_signature", vb.VERIFIED, response={"signer": "Dr. A. Chair, Test Society"}),
            _res("issuer_signature", vb.NOT_CHECKED), _res("signed_qr", vb.MISMATCH)]
    out = copy_findings(_doc(), spec, vres, _fp)
    assert [f["code"] for f in out] == ["VER-ISSUER-SIGNATURE-ABSENT"]
    f = out[0]
    assert f["severity"] == "medium" and f["outcome"] == "indicator"
    assert "only the applicant's own signature (Dr. A. Chair, Test Society)" in f["message"]
    assert "the file may have been re-created; ask for the issuer's original" in f["message"]
    assert "the issuer-signed QR (mismatch detected)" in f["message"]


def test_word_producer_is_named_and_a_present_issuer_signature_is_left_to_the_signature_check():
    spec = active_ruleset().doc_types["fire_noc"]
    word = _doc(analysis={"forensic_facts": {"metadata": {"info": {"Producer": "Microsoft® Word 2024"},
                                                           "fonts": ["/Arial"]}}})
    out = copy_findings(word, spec, [_res("issuer_signature", vb.NOT_CHECKED)], _fp)
    assert "Microsoft® Word 2024" in out[0]["message"] and "no signature at all" in out[0]["message"]
    assert copy_findings(word, spec, [_res("issuer_signature", vb.MISMATCH)], _fp) == []
    # Document types the ruleset does not expect an issuer to sign are out of scope
    assert copy_findings(_doc(declared_type="ter_receipt"), active_ruleset().doc_types["ter_receipt"], [], _fp) == []


def test_image_only_copy_states_the_ocr_comparisons():
    spec = active_ruleset().doc_types["fire_noc"]
    vres = [_res("signed_qr", vb.MISMATCH), _res("issuer_registry", vb.MISMATCH)]
    photo = copy_findings(_doc(mime="image/jpeg", text_source="ocr"), spec, vres, _fp)
    assert [f["code"] for f in photo] == ["FX-IMAGE-ONLY-ISSUER-DOC"]
    assert "a photo or scanned image" in photo[0]["message"]
    assert ("read by OCR and compared with the issuer-signed QR (mismatch detected) and the issuer registry "
            "(mismatch detected)") in photo[0]["message"]
    printed = _doc(text_source="ocr", analysis={"forensic_facts": {"metadata": {
        "info": {"Producer": "Microsoft: Print To PDF"}, "fonts": []}}})
    out = copy_findings(printed, spec, [_res("issuer_signature", vb.NOT_CHECKED)], _fp)
    assert [f["code"] for f in out] == ["FX-IMAGE-ONLY-ISSUER-DOC"]
    assert "image-only PDF" in out[0]["message"] and "Microsoft: Print To PDF" in out[0]["message"]


def test_editor_names_ignore_symbols_and_case():
    assert editors_named("Microsoft® Word for Microsoft 365") == ["microsoft word"]
    assert editors_named("Microsoft: Print To PDF")
    assert editors_named("LibreOffice 24.8") and editors_named("iLovePDF") and editors_named("Sejda PDF")
    assert editors_named("ReportLab PDF Library - (opensource); pyHanko 0.38.0") == []


# ---- the live demo path: an institution re-uploads an Edge-edited certificate


def _seeded() -> bool:
    from sqlalchemy.exc import OperationalError

    from pramana.db import SessionLocal, engine
    from pramana.models import Application

    db = SessionLocal()
    try:
        return db.get(Application, "APP-2026-000103") is not None
    except OperationalError:
        return False
    finally:
        db.close()
        engine.dispose()


@pytest.fixture(scope="module")
def world():
    # Reuse the world test_e2e seeded in this session; seed it when this module runs alone
    if not _seeded():
        if not (ROOT / "fixtures" / "out" / "manifest.json").exists():
            _script("make_fixtures").main()
        _script("seed").main(validate=True)
    from pramana.main import app

    return json.loads((ROOT / "fixtures" / "out" / "manifest.json").read_text(encoding="utf-8")), app


def _login(app, user):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": user, "password": "Pramana@2026"})
    assert r.status_code == 200
    c.headers["x-csrf-token"] = r.json()["csrf_token"]
    return c


def test_edge_edited_expired_certificate_uploaded_in_rectification_is_caught(world):
    _, app = world
    aid = "APP-2026-000103"
    officer = _login(app, "officer")
    finding = officer.get(f"/api/applications/{aid}/findings").json()[0]
    assert officer.post(f"/api/applications/{aid}/rectification",
                        json={"finding_ids": [finding["id"]], "message": "Upload a valid fire certificate"}
                        ).status_code == 200
    src = lab.SOURCES["a3_fire"]
    original = (ROOT / "fixtures" / "out" / src["file"]).read_bytes()
    loc = lab.locate(original, src["label"], src["old"])
    edited = lab.add_annotations(original, [lambda w, p: lab.free_text(w, p, loc, src["new"])])
    inst = _login(app, "inst3")
    up = inst.post(f"/api/applications/{aid}/documents", data={"declared_type": "fire_noc"},
                   files={"file": ("fire_noc.pdf", edited, "application/pdf")})
    assert up.status_code == 200, up.text
    assert inst.post(f"/api/applications/{aid}/submit").json()["run"]["status"] == "complete"
    found = {f["code"]: f for f in officer.get(f"/api/applications/{aid}/findings").json()}
    assert "VER-ISSUER_SIGNATURE-MISMATCH_DETECTED" in found
    over = found["FX-ANNOT-OVER-FIELD"]
    assert over["severity"] == "high"
    assert "shows '30-09-2027'" in over["message"] and "printed '30-09-2025'" in over["message"]
    # The institution sees the deficiency it must fix, never the forensic indicator
    assert "FX-ANNOT-OVER-FIELD" not in {f["code"] for f in inst.get(f"/api/applications/{aid}/findings").json()}
