import io

from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from reportlab.pdfgen import canvas

from pramana.forensics.fonts import font_mismatches
from pramana.forensics.pdf_struct import analyse
from pramana.pipeline.extract import extract_fields
from pramana.pipeline.text import extract_pdf
from pramana.rules.engine import active_ruleset


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
