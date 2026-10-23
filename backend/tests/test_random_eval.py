"""Randomised blind evaluation: generator, answer key, scoring and one small end-to-end run."""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def rw():
    return _load("random_world")


def _plan(rw, seed, n):
    w, planted = rw.plan_world(seed, n)
    rw.finalise(w, planted)
    return w, planted, rw.answer_key(w, planted)


def test_same_seed_gives_the_same_world_and_answer_key(rw):
    a = json.dumps(rw._jsonable(_plan(rw, 17, 40)[2]), sort_keys=True)
    b = json.dumps(rw._jsonable(_plan(rw, 17, 40)[2]), sort_keys=True)
    c = json.dumps(rw._jsonable(_plan(rw, 18, 40)[2]), sort_keys=True)
    assert a == b and a != c


def test_answer_keys_are_consistent_across_seeds(rw):
    # finalise raises GeneratorError when a condition's rule codes disagree with what the plan implies
    kinds = set()
    for seed in range(12):
        w, planted, key = _plan(rw, 1000 + seed, 80)
        clean = [a for a in key["applications"] if a["clean"]]
        assert 0.25 <= len(clean) / 80 <= 0.30
        assert all(not a["conditions"] and not a["involved_in"] for a in clean)
        assert all(1 <= len(a["conditions"]) <= 3 for a in key["applications"] if not a["clean"])
        assert len({a["institution"] for a in key["applications"]}) == 80
        kinds |= {p.kind for p in planted}
    assert len(kinds) >= 35


def test_generator_session_matches_the_ruleset_configuration(rw):
    # Certificates are generated to cover the session unless a condition makes one lapse in it
    from random_plan import SESSION_END, SESSION_START, SSC_DAYS

    from pramana.insights.proof import session_window, time_bound_types
    from pramana.rules.engine import active_ruleset

    rs = active_ruleset()
    s = session_window(rs, "2026-27")
    assert (s["start"], s["end"]) == (SESSION_START, SESSION_END)
    assert time_bound_types(rs)["structural_stability"]["days"] == SSC_DAYS


def test_partner_findings_respect_submission_order(rw):
    for seed in range(6):
        w, planted, _ = _plan(rw, 2000 + seed, 120)
        for p in planted:
            if p.kind not in ("photo_reused", "seal_other_issuer"):
                continue
            a, b = w.app(p.app), w.app(p.partner)
            later = a if a.submitted > b.submitted else b
            main = {"photo_reused": "XA-PHOTO-REUSED", "seal_other_issuer": "FX-SEAL-REUSED"}[p.kind]
            assert {"app": later.key, "code": main} in [{"app": e["app"], "code": e["code"]} for e in p.expect]


def test_manifest_carries_no_answers(rw, tmp_path):
    rw.build(31, 4, tmp_path)
    world = tmp_path / "world"
    manifest = (world / "manifest.json").read_text(encoding="utf-8")
    key = json.loads((tmp_path / "answer_key.json").read_text(encoding="utf-8"))
    assert not (world / "answer_key.json").exists()
    for word in ('"expected', '"story"', '"conditions"', "planted"):
        assert word not in manifest
    for c in key["conditions"]:
        assert c["kind"] not in manifest
    m = json.loads(manifest)
    assert len(m["applications"]) == 4
    assert all((world / d["file"]).exists() for a in m["applications"] for d in a["documents"])


def test_score_counts_pairs_and_clean_false_alarms():
    re_ = _load("random_eval")
    key = {"applications": [{"key": "R1", "clean": False}, {"key": "R2", "clean": False}, {"key": "R3", "clean": True}],
           "conditions": [
               {"id": "C1", "kind": "k1", "title": "t", "app": "R1", "partner": "R2",
                "expect": [{"app": "R1", "code": "A", "role": "planted"}, {"app": "R2", "code": "B", "role": "partner"}]},
               {"id": "C2", "kind": "k2", "title": "t", "app": "R2", "partner": None,
                "expect": [{"app": "R2", "code": "C", "role": "planted"}]}]}

    def res(*codes):
        return {"status": "complete", "codes": {c: {} for c in codes}}

    s = re_.score(key, {"R1": res("A", "X"), "R2": res("B"), "R3": res("Y")})
    assert (s["recall"]["k"], s["recall"]["n"]) == (2, 3)
    assert (s["precision"]["k"], s["precision"]["n"]) == (2, 4)
    assert {c["id"]: c["status"] for c in s["condition_results"]} == {"C1": "detected", "C2": "missed"}
    assert s["false_alarms_on_clean"]["fired"] == {"R3": ["Y"]}
    assert s["false_positives"] == ["R1:X", "R3:Y"] and s["false_negatives"] == ["R2:C"]


def test_near_duplicate_needs_more_than_shared_office_fee_status_or_dates():
    # Found by the random evaluation: NBA letters of one accreditation cycle and TER receipts paid on one day
    # were reported as copies of each other
    from types import SimpleNamespace as NS

    from pramana.consistency.cross import FIELD_OVERLAP_MIN, _shared_values

    def doc(**values):
        types = {"issue_date": "date", "valid_from": "date", "valid_until": "date", "payment_date": "date",
                 "amount": "amount"}
        return NS(fields=[NS(name=k, value=v, value_type=types.get(k, "text")) for k, v in values.items()])

    def near(a, b):
        shared, total, beyond = _shared_values(a, b)
        return total >= 3 and shared / total >= FIELD_OVERLAP_MIN and beyond

    nba = dict(programme_code="CE", valid_from="2024-07-01", valid_until="2027-06-30")
    assert not near(doc(nba_ref="NBA/ACCR/2024/00871", **nba), doc(nba_ref="NBA/ACCR/2024/01422", **nba))
    ter = dict(amount="72600", payment_date="2025-12-16", payment_status="Payment Received")
    assert not near(doc(application_id="APP-2026-000101", transaction_id="TER26-1", **ter),
                    doc(application_id="APP-2026-000102", transaction_id="TER26-2", **ter))
    noc = dict(noc_number="FES/KAR/2025/04502", issue_date="2025-03-12", valid_until="2027-03-11",
               issuing_authority="Chief Fire Officer, Karad Fire Brigade")
    assert near(doc(institution_name="A", **noc), doc(institution_name="B", **noc))
    office = dict(issue_date="2025-03-12", valid_until="2027-03-11", issuing_authority="Chief Fire Officer, Pune")
    assert not near(doc(noc_number="FES/PUN/2025/1", **office), doc(noc_number="FES/PUN/2025/2", **office))


def test_one_engineer_may_certify_two_buildings(monkeypatch):
    # Found by the random evaluation: two colleges certified by the same structural engineer were reported as
    # sharing one certificate, because the register is queried by the engineer's licence number
    from types import SimpleNamespace as NS

    from pramana.consistency import cross

    def ssc(doc_id, number, inst):
        fields = [NS(name="certificate_no", value=number, value_type="text", page=1, bbox=[0, 0, 1, 1]),
                  NS(name="engineer_registration_no", value="SE/NAS/2006/6305", value_type="text", page=1,
                     bbox=[0, 0, 1, 1]),
                  NS(name="issue_date", value=f"2024-0{len(doc_id)}-01", value_type="date", page=1, bbox=None)]
        return NS(id=doc_id, declared_type="structural_stability", mime="application/pdf", fingerprints={},
                  original_filename="structural_stability.pdf", fields=fields, analysis={}), \
            NS(id=f"app-{doc_id}", institution=NS(name=inst))

    mine, _ = ssc("d1", "SSC/2024/117", "College A")
    other = ssc("d22", "SSC/2023/904", "College B")
    monkeypatch.setattr(cross, "_peer_docs", lambda db, app: [other])
    refs = {"structural_stability": "engineer_registration_no"}
    assert [ln.code for ln in cross.cross_checks(None, NS(id="app-d1"), [mine], refs)] == []
    copied = ssc("d33", "SSC/2024/117", "College C")
    monkeypatch.setattr(cross, "_peer_docs", lambda db, app: [copied])
    assert "XA-SHARED-CERTIFICATE-NUMBER" in [ln.code for ln in cross.cross_checks(None, NS(id="app-d1"), [mine], refs)]


def test_seal_distance_is_a_plain_int():
    # Found by the random evaluation: a seal match that was close but not pixel-identical put a numpy integer
    # into the finding's evidence, and saving the run failed
    from pramana.forensics.seals import distance

    a = {"sha256": "a", "phash32": "0" * 256}
    b = {"sha256": "b", "phash32": "0" * 255 + "3"}
    assert type(distance(a, b)) is int and distance(a, b) == 2
    assert json.dumps({"distance": distance(a, b)}) == '{"distance": 2}'


def test_seals_of_one_template_for_two_cities_do_not_match_but_copies_do():
    # Found by the random evaluation: stamps that differ only in the city name came within 7 of 256 bits
    import io

    from PIL import Image

    from pramana.forensics.seals import PHASH_MAX_DISTANCE, distance

    cs = _load("calibrate_seals")
    kochi, salem = cs.municipal("Kochi"), cs.municipal("Salem")
    a, b = cs.fingerprint(kochi), cs.fingerprint(salem)
    assert distance(a, b) > PHASH_MAX_DISTANCE
    im = Image.open(io.BytesIO(kochi)).convert("RGB")
    assert distance(a, cs.fingerprint(kochi)) == 0
    assert distance(a, cs.fingerprint(im, fmt="JPEG", quality=60)) <= PHASH_MAX_DISTANCE
    assert distance(a, cs.fingerprint(im.resize((270, 270)))) <= PHASH_MAX_DISTANCE


def _page(source, *lines):
    from pramana.pipeline.text import PageText, Word, group_lines

    words = [Word(w, 70 + 40 * i, 100 + 20 * n, 100 + 40 * i, 110 + 20 * n, conf=0.99 if source == "ocr" else None)
             for n, line in enumerate(lines) for i, w in enumerate(line.split())]
    pt = PageText(1, 595, 842, source, words)
    pt.lines = group_lines(words)
    return pt


def test_ocr_pages_tolerate_merged_words_and_look_alike_digits_text_layers_do_not():
    # Found by the random evaluation: OCR of scanned audit reports read "FinancialYear: 2024-25"
    from pramana.pipeline.extract import extract_fields

    spec = {"fields": [{"name": "financial_year", "patterns": [r"Financial Year\s*:?\s*(?P<v>\d{4}-\d{2})"]}]}
    for line in ("FinancialYear: 2024-25", "Financial Year: 2O24-25", "Financial Year: 2024\u201325"):
        ocr = extract_fields([_page("ocr", line)], spec)[0]
        assert ocr.value == "2024-25" and ocr.raw == line.split(": ")[1], line
        assert extract_fields([_page("digital", line)], spec)[0].status == "missing", line
    assert extract_fields([_page("digital", "Financial Year: 2024-25")], spec)[0].value == "2024-25"


def test_name_similarity_ignores_merged_words_not_different_names():
    from pramana.rules.expr import _similar

    assert _similar("Kota CharitableTrust", "Kota Charitable Trust") == 100
    assert _similar("Jaipur Thiruvalluvar VidyaVikasMandal", "Jaipur Thiruvalluvar Vidya Vikas Mandal") == 100
    assert _similar("Ahilya Institute of Technology", "Chanakya Institute of Technology") < 90
    assert _similar("Pragati Education Society", "Krishna Education Society") < 85


def test_instruction_lines_are_flagged_and_ordinary_certificate_text_is_not():
    from pramana.pipeline.llm_extract import INJECTION

    sets = json.loads((Path(__file__).parent / "data" / "instruction_lines.json").read_text(encoding="utf-8"))
    assert all(INJECTION.search(x) for x in sets["known"] + sets["held_out_author"])
    assert sum(1 for x in sets["held_out_independent"] if INJECTION.search(x)) >= 7
    assert not any(INJECTION.search(x) for x in sets["benign_independent"] + sets["benign_blind"])
    # Written blind after the detector was frozen; this records its score, it was not tuned on these lines
    assert sum(1 for x in sets["held_out_blind"] if INJECTION.search(x)) >= 4
    for benign in ("Fire Alarm System: provided in all blocks", "Software: Tally ERP 9", "Reviewer: Dr. A. Rao",
                   "Lab Assistant, Computer Engineering", "The automatic sprinkler system shall be maintained.",
                   "Please ignore this reminder if the fee has been paid.", "Model: XR-200 smoke detector"):
        assert not INJECTION.search(benign), benign


def test_blind_run_end_to_end(tmp_path):
    out = tmp_path / "run"
    r = subprocess.run([sys.executable, str(SCRIPTS / "random_eval.py"), "--seed", "5", "--n", "4", "--out", str(out)],
                       capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, r.stderr[-2000:]
    rep = json.loads((out / "report.json").read_text(encoding="utf-8"))
    key = json.loads((out / "answer_key.json").read_text(encoding="utf-8"))
    s = rep["score"]
    assert s["failed_runs"] == []
    assert s["recall"]["n"] == len({(e["app"], e["code"]) for c in key["conditions"] for e in c["expect"]})
    assert set(rep["results"]) == {a["key"] for a in key["applications"]}
    assert (out / "report.md").read_text(encoding="utf-8").startswith("# Random evaluation, seed 5")
