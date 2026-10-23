import importlib.util
import io
from pathlib import Path

from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from pramana.forensics.fonts import font_mismatches
from pramana.forensics.pdf_struct import analyse
from pramana.forensics.seals import distance, image_fingerprints
from pramana.pipeline.extract import extract_fields
from pramana.pipeline.text import extract_pdf
from pramana.rules.engine import active_ruleset

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def _script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


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


def _redraw(data: bytes, font: str) -> bytes:
    """Draw a new expiry date over the old one in an incremental update, in the given base font."""
    w = IncrementalPdfFileWriter(io.BytesIO(data))
    fd = w.add_object(generic.DictionaryObject({
        generic.NameObject("/Type"): generic.NameObject("/Font"),
        generic.NameObject("/Subtype"): generic.NameObject("/Type1"),
        generic.NameObject("/BaseFont"): generic.NameObject(f"/{font}"),
    }))
    ops = b"q 1 1 1 rg 136 723 60 14 re f Q BT /FX1 10.5 Tf 137.2 726 Td (11-03-2029) Tj ET"
    ref = w.add_object(generic.StreamObject(stream_data=ops))
    w.add_stream_to_page(0, ref, resources=generic.DictionaryObject({
        generic.NameObject("/Font"): generic.DictionaryObject({generic.NameObject("/FX1"): fd})}))
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def _fields(data: bytes):
    return extract_fields(extract_pdf(data), active_ruleset().doc_types["fire_noc"])


# ---- font check


def test_value_redrawn_in_another_font_is_reported_with_both_fonts():
    data = _redraw(_certificate(), "Courier")
    _, facts = analyse(data)
    sigs = font_mismatches(data, _fields(data), facts)
    assert [s.code for s in sigs] == ["FX-FONT-MISMATCH"]
    s = sigs[0]
    assert s.evidence_class == "structural" and s.severity == "high"
    assert "Courier" in s.detail and "Helvetica" in s.detail and "valid until" in s.detail
    assert all(e["page"] == 1 and len(e["bbox"]) == 4 for e in s.evidence)


def test_font_check_stands_alone_without_revision_context():
    data = _redraw(_certificate(), "Courier")
    sigs = font_mismatches(data, _fields(data), {})
    assert len(sigs) == 1 and sigs[0].severity == "medium"


def test_untouched_certificate_and_bold_labels_raise_nothing():
    data = _certificate()
    assert font_mismatches(data, _fields(data), analyse(data)[1]) == []


# ---- seal images


def _with_images(*images: tuple[bytes, float, float, float]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(70, 780, "Certificate with a seal")
    for png, x, y, size in images:
        c.drawImage(ImageReader(io.BytesIO(png)), x, y, size, size)
    c.save()
    return buf.getvalue()


def test_seal_images_are_fingerprinted_and_qr_codes_skipped():
    import segno

    assets = _script("fixture_assets")
    seal = assets.seal_png("Fire and Emergency Services Pune", ["Chief Fire Officer", "Pune"], "#1d4ed8", 1)
    q = io.BytesIO()
    segno.make("https://example.org/verify?ref=FES-PUN-2025-04417", error="l", micro=False).save(q, kind="png", scale=6, border=2)
    data = _with_images((seal, 260, 180, 80), (q.getvalue(), 420, 160, 110))
    ims = image_fingerprints(data)
    assert len(ims) == 1
    assert ims[0]["page"] == 1 and abs(ims[0]["bbox"][2] - ims[0]["bbox"][0] - 80) < 1


def test_same_seal_matches_and_another_issuers_seal_does_not():
    assets = _script("fixture_assets")
    pune = assets.seal_png("Fire and Emergency Services Pune", ["Chief Fire Officer", "Pune"], "#1d4ed8", 1)
    nashik = assets.seal_png("Fire and Emergency Services Nashik", ["Chief Fire Officer", "Nashik"], "#1d4ed8", 2)
    a = image_fingerprints(_with_images((pune, 260, 180, 80)))[0]
    b = image_fingerprints(_with_images((pune, 100, 300, 64)))[0]
    c = image_fingerprints(_with_images((nashik, 260, 180, 80)))[0]
    assert distance(a, b) == 0
    assert distance(a, c) > 8


# ---- Hindi OCR


def test_text_layer_hint_spots_legacy_and_visual_order_devanagari():
    from pramana.pipeline.devanagari import text_layer_hint

    assert text_layer_hint(["Certificate", "No.:", "NAS/BP/OC/2010/00941"]) is None
    assert "Private Use Area" in text_layer_hint(["", "संया:", "NAS/BP/OC/2010/00941"])
    # The i-sign stored before its consonant, as visual-order text layers do
    assert "vowel sign" in text_layer_hint(["ि", "दनांक", "ि", "तथि", "प्रमाण", "संख्या"])
    assert text_layer_hint(["प्रमाणपत्र", "संख्या", "दिनांक", "तिथि"]) is None


def test_latin_words_on_a_hindi_line_come_from_the_more_credible_reading():
    from pramana.pipeline.devanagari import merge

    box = [0.0, 0.0, 400.0, 30.0]
    dev = [{"box": box, "text": "दिनांक / Date of lssue: 20-02-1991", "score": 0.97, "words": [
        ("दिनांक", [0, 0, 60, 30], 0.99), ("lssue:", [200, 0, 280, 30], 0.99), ("NAS/BP/0C/1", [290, 0, 400, 30], 1.0)]}]
    lat = [{"box": box, "text": "fic Issue: NAS/BP/OC/1", "score": 0.9, "words": [
        ("fic", [5, 0, 55, 30], 0.6), ("Issue:", [201, 0, 279, 30], 0.97), ("NAS/BP/OC/1", [291, 0, 399, 30], 0.82)]}]
    assert [w[0] for w in merge(dev, lat)] == ["दिनांक", "Issue:", "NAS/BP/OC/1"]


def test_without_the_model_the_page_says_hindi_was_not_read(monkeypatch):
    import numpy as np

    from pramana.pipeline import devanagari

    monkeypatch.setattr(devanagari, "engine", lambda: None)
    monkeypatch.setitem(devanagari._state, "error", "offline")
    lines = [{"box": [0, 0, 10, 10], "text": "Main campus", "score": 0.9, "words": [("Main", [0, 0, 5, 10], 0.9)]}]
    words, info = devanagari.read(np.zeros((10, 10, 3), dtype=np.uint8), lines, "legacy font")
    assert [w[0] for w in words] == ["Main"]
    assert info["read"] is False and "not read" in info["note"] and "offline" in info["note"]
