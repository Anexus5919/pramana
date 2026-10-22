import io
from datetime import date

import pytest
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from reportlab.pdfgen import canvas

from pramana.forensics.pdf_struct import analyse
from pramana.pipeline.intake import UploadRejected, validate_upload
from pramana.rules.engine import FAIL, INSUFFICIENT, NOT_APPLICABLE, PASS, Ruleset, evaluate
from pramana.rules.expr import Evaluator, ExprError, MissingFact
from pramana.rules.facts import FactStore
from pramana.verification import demo_pki, signature
from pramana.verification.base import MANUAL_REVIEW, MISMATCH, NOT_CHECKED, VERIFIED
from pramana.verification.signed_qr import sign_payload


def _pdf(text: str = "Fire NOC No. FES/PUN/2025/1 Valid Up To: 31-03-2027") -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(72, 750, text)
    c.save()
    return buf.getvalue()


def _overwrite(data: bytes) -> bytes:
    w = IncrementalPdfFileWriter(io.BytesIO(data))
    ref = w.add_object(generic.StreamObject(
        stream_data=b"q 1 1 1 rg 290 745 90 16 re f Q BT /F1 12 Tf 292 750 Td (31-03-2029) Tj ET"))
    w.add_stream_to_page(0, ref)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


# ---- expression sandbox


def test_expression_reads_facts_and_records_provenance():
    fs = FactStore()
    fs.add("doc.fire_noc.valid_until", date(2027, 3, 31), "document", page=1)
    ev = Evaluator(fs, {"as_of": date(2026, 1, 1)})
    assert ev.eval("doc.fire_noc.valid_until >= as_of") is True
    assert "doc.fire_noc.valid_until" in ev.read


@pytest.mark.parametrize("src", ["__import__('os')", "().__class__", "open('x')", "[x for x in y]", "a[0]"])
def test_expression_rejects_unsafe_syntax(src):
    with pytest.raises((ExprError, MissingFact)):
        Evaluator(FactStore()).eval(src)


def test_missing_fact_is_reported_not_guessed():
    with pytest.raises(MissingFact) as e:
        Evaluator(FactStore()).eval("doc.fire_noc.valid_until >= as_of")
    assert e.value.path == "doc.fire_noc.valid_until"


# ---- rule engine


def _rs(rules):
    return Ruleset("t", "t", "1", "x", {}, rules, None)


def _rule(expr, **applies):
    return {"id": "R1", "title": "t", "check": {"type": "expression", "expr": expr}, "applies_to": applies,
            "effective_from": "2025-01-01"}


def test_rule_outcomes():
    fs = FactStore()
    fs.add("app.x", 5, "declared")
    fs.add("doc.fire_noc.document_id", "doc_1", "document")
    on = date(2026, 1, 1)
    assert evaluate(_rs([_rule("app.x >= 3")]), fs, category="EOA", as_of=on)[0].outcome == PASS
    assert evaluate(_rs([_rule("app.x >= 9")]), fs, category="EOA", as_of=on)[0].outcome == FAIL
    assert evaluate(_rs([_rule("app.y >= 9")]), fs, category="EOA", as_of=on)[0].outcome == INSUFFICIENT
    r = evaluate(_rs([_rule("app.x >= 9", requires_docs=["structural_stability"])]), fs, category="EOA", as_of=on)
    assert r[0].outcome == NOT_APPLICABLE
    assert evaluate(_rs([_rule("app.x >= 9", categories=["CLOSURE"])]), fs, category="EOA", as_of=on) == []


def test_rule_not_effective_before_its_start_date():
    rule = _rule("app.x >= 9")
    rule["effective_from"] = "2027-06-01"
    fs = FactStore()
    fs.add("app.x", 1, "declared")
    assert evaluate(_rs([rule]), fs, category="EOA", as_of=date(2026, 1, 1)) == []


# ---- forensics


def test_clean_pdf_has_no_signals():
    signals, facts = analyse(_pdf())
    assert facts["revisions"] == 1
    assert [s for s in signals if s.severity != "info"] == []


def test_overwrite_in_incremental_update_is_localised():
    signals, facts = analyse(_overwrite(_pdf()))
    codes = {s.code for s in signals}
    assert {"FX-PDF-REVISION-TEXT-CHANGE", "FX-PDF-OVERLAID-TEXT"} <= codes
    diff = facts["revision_diffs"][0]
    assert diff["added_text"] == "31-03-2029"
    assert "31-03-2027" in diff["text_underneath"]
    assert diff["bbox"] is not None


# ---- signatures


@pytest.fixture(scope="module")
def pki(tmp_path_factory):
    from pramana.config import get_settings

    root, sub = demo_pki.build()
    demo_pki.write_anchor(root, get_settings().trust_dir)
    signature.trust_anchors.cache_clear()
    return root, sub


def test_signature_states(pki):
    root, sub = pki
    issuer = demo_pki.signer(sub, "Chief Fire Officer Pune", "State Fire and Emergency Services (DEMO)")
    signed = demo_pki.sign_pdf(_pdf(), issuer, [sub, root], reason="r", location="l")
    assert signature.validate_signatures(signed)[0].status == VERIFIED
    assert signature.validate_signatures(_overwrite(signed))[0].status == MISMATCH
    other_root, other_sub = demo_pki.build()
    stranger = demo_pki.signer(other_sub, "Someone", "Elsewhere")
    s2 = demo_pki.sign_pdf(_pdf(), stranger, [other_sub, other_root], reason="r", location="l")
    assert signature.validate_signatures(s2)[0].status == MANUAL_REVIEW
    assert signature.validate_signatures(_pdf())[0].status == NOT_CHECKED


def test_india_pki_roots_are_bundled():
    labels = [a.label for a in signature.trust_anchors() if not a.demo]
    assert any("CCA India 2022" in x for x in labels)


# ---- signed QR


def test_signed_qr_detects_tampering(tmp_path, monkeypatch):
    import base64
    import json

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from pramana.config import get_settings
    from pramana.verification import signed_qr

    k = Ed25519PrivateKey.generate()
    pub = base64.b64encode(k.public_key().public_bytes(serialization.Encoding.Raw,
                                                        serialization.PublicFormat.Raw)).decode()
    d = get_settings().data_dir / "sim"
    d.mkdir(parents=True, exist_ok=True)
    (d / "issuer_keys.json").write_text(json.dumps({"k1": {"issuer": "Test (SIMULATED)", "public_key": pub}}))
    signed_qr.issuer_keys.cache_clear()
    tok = sign_payload({"valid_until": "2027-01-01"}, k, "k1")
    assert signed_qr.verify_token(tok).ok
    head, body, sig = tok.split(".")
    forged_body = base64.urlsafe_b64encode(b'{"valid_until":"2029-01-01"}').rstrip(b"=").decode()
    assert not signed_qr.verify_token(f"{head}.{forged_body}.{sig}").ok
    assert not signed_qr.verify_token(sign_payload({"a": 1}, Ed25519PrivateKey.generate(), "k1")).ok


# ---- uploads


def test_upload_validation():
    assert validate_upload("a.pdf", _pdf()).mime == "application/pdf"
    with pytest.raises(UploadRejected):
        validate_upload("a.pdf", b"MZ\x90\x00 not a pdf")
    with pytest.raises(UploadRejected):
        validate_upload("a.exe", _pdf())
    with pytest.raises(UploadRejected):
        validate_upload("a.png", _pdf())


def test_active_content_is_reported():
    import pikepdf

    pdf = pikepdf.open(io.BytesIO(_pdf()))
    pdf.Root.OpenAction = pikepdf.Dictionary(S=pikepdf.Name.JavaScript, JS=pikepdf.String("app.alert(1)"))
    out = io.BytesIO()
    pdf.save(out)
    res = validate_upload("a.pdf", out.getvalue())
    assert any(a["key"] in ("/JavaScript", "/JS") for a in res.active_content)
