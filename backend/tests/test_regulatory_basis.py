"""The regulatory basis map: valid, verbatim-only, free of accusing words, complete, and never sent to institutions."""

import importlib.util
import re
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from pramana.rules.basis import BASIS_FILE, FORBIDDEN, active_basis, basis_for, load_basis
from pramana.verification import base as vb

ROOT = Path(__file__).resolve().parents[2]
BACKEND = Path(__file__).resolve().parents[1]
SCRIPTS = BACKEND / "scripts"
CODE = re.compile(r"\"((?:APH|ADD26|PN2627|XR|XD|XA|FX|VER|YOY|PH|SEC|DOC|FIELD|RECT)-[A-Z0-9_]+(?:-[A-Z0-9_]+)*)\"")
# Prefixes the code tests with startswith(), not codes a finding carries
PREFIXES = {"FX-IMG", "FX-FONT", "FX-PDF-REVISION", "FX-PDF-OVERLAID", "VER-APPLICANT_SIGNATURE",
            "VER-ISSUER_REGISTRY", "VER-SIGNED_QR", "VER-ISSUER_SIGNATURE-MISMATCH"}
CHANNELS = ("issuer_signature", "applicant_signature", "signed_qr", "issuer_registry")


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def app():
    from pramana.config import get_settings

    # Reuse the world when an earlier module already seeded this session's data directory
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


def _codes_in(paths) -> set[str]:
    out: set[str] = set()
    for p in paths:
        out |= set(CODE.findall(p.read_text(encoding="utf-8")))
    return {c for c in out if c not in PREFIXES and not c.endswith("-")}


def raisable_codes() -> set[str]:
    """Every finding code Pramana can raise: the rules, every verification channel and status, and the literal
    codes in the pipeline, forensic, cross-application, photo, history and insight modules."""
    rules = yaml.safe_load((BACKEND / "rulesets" / "aicte-aph-2024-27.yaml").read_text(encoding="utf-8"))["rules"]
    ver = {f"VER-{c.upper()}-{s.upper()}" for c in CHANNELS for s in vb.STATUSES if s not in (vb.VERIFIED, vb.NOT_CHECKED)}
    return {r["id"] for r in rules} | ver | _codes_in((BACKEND / "pramana").rglob("*.py"))


def random_eval_codes() -> set[str]:
    return _codes_in(SCRIPTS.glob("random_*.py"))


def test_the_map_validates_and_is_not_taken_for_the_ruleset():
    from pramana.rules.engine import active_ruleset

    bm = load_basis(BACKEND / "rulesets" / BASIS_FILE)
    assert bm.basis.version and len(bm.provisions) >= 40 and len(bm.entries) >= 20
    assert active_ruleset().id == "aicte-aph-2024-27"


def test_every_provision_is_verified_with_a_url_a_page_and_a_short_quote():
    bm = active_basis()
    used = {pid for e in bm.entries for pid in e.provisions} | {pid for ids in bm.documents.values() for pid in ids}
    used |= {s.basis for s in bm.steps.values()}
    for pid in bm.provisions:
        p = bm.provision(pid)
        assert p["verified"] is True, pid
        assert str(bm.source(p["source"]).url).startswith("https://") and p["page"] >= 1, pid
        assert 3 <= len(p["quote"]) <= 400 and p["quote"].count(". ") <= 1, pid
        assert pid in used, f"{pid} is cited by no entry"
    for s in bm.sources:
        assert re.fullmatch(r"[0-9a-f]{64}", s.sha256) and s.retrieved


def test_no_forbidden_words_anywhere_in_the_map():
    raw = (BACKEND / "rulesets" / BASIS_FILE).read_text(encoding="utf-8")
    assert not FORBIDDEN.search(raw), FORBIDDEN.search(raw)
    # No criminal statute and no em dash
    assert not re.search(r"Indian Penal Code|Bharatiya Nyaya|Section 4[0-9]{2}\b", raw)
    assert chr(0x2014) not in raw


def test_every_establish_step_has_a_basis_tag():
    for code in ("FX-FIELD-OVERWRITTEN", "XA-FACULTY-MULTIPLE-INSTITUTIONS", "APH-617I-FIRE-VALID"):
        rb = basis_for(code, "fire_noc")
        assert rb["establish"], code
        for st in rb["establish"]:
            assert st["text"] and st["basis"]["label"]
            assert st["basis"]["kind"] == "evidence" or (rb["sources"][st["basis"]["source"]]["url"]
                                                         and st["basis"]["page"])


def test_every_code_pramana_can_raise_resolves():
    codes = raisable_codes() | random_eval_codes()
    assert len(codes) > 60
    missing = sorted(c for c in codes if basis_for(c) is None)
    assert not missing, missing


def test_the_fire_certificate_edit_relates_to_the_fire_clause_and_the_false_information_provision():
    rb = basis_for("FX-FIELD-OVERWRITTEN", "fire_noc")
    cites = [p["cite"] for p in rb["provisions"]]
    assert cites[0] == "APH cl. 6.17(i)" and "Regulation 9.3" in cites and "AICTE Act s. 10(k)" in cites
    steps = [s["text"] for s in rb["establish"]]
    assert steps[0].startswith("Obtain the issuer's original") and steps[-1] == "Record the decision with reasons."
    assert {s["basis"]["label"] for s in rb["establish"]} >= {"Evidence", "Regulation 11.2", "Regulation 7.4"}


def test_every_seeded_finding_carries_a_basis_for_officials(app):
    import json

    manifest = json.loads((ROOT / "fixtures" / "out" / "manifest.json").read_text(encoding="utf-8"))
    for user in ("officer", "verifier", "admin"):
        c = _login(app, user)
        for a in manifest["applications"]:
            for f in c.get(f"/api/applications/{a['id']}/findings").json():
                rb = f.get("regulatory_basis")
                assert rb and rb["provisions"] and rb["establish"], (user, a["key"], f["code"])
                assert all(p["verified"] and rb["sources"][p["source"]]["url"] and p["page"] and p["quote"]
                           for p in rb["provisions"])


def test_institutions_never_receive_the_regulatory_basis(app):
    import json

    manifest = json.loads((ROOT / "fixtures" / "out" / "manifest.json").read_text(encoding="utf-8"))
    seen = 0
    for n, a in enumerate(manifest["applications"], start=1):
        c = _login(app, f"inst{n}")
        r = c.get(f"/api/applications/{a['id']}/findings")
        if r.status_code != 200:
            continue
        for f in r.json():
            seen += 1
            assert "regulatory_basis" not in f, (a["key"], f["code"])
    assert seen > 0


def test_a_review_returns_the_finding_with_its_basis(app):
    c = _login(app, "officer")
    f = c.get("/api/applications/APP-2026-000107/findings").json()[0]
    r = c.post(f"/api/findings/{f['id']}/review", json={"action": "note", "note": "Checked the regulatory basis."})
    assert r.status_code == 200 and r.json()["regulatory_basis"]["provisions"]
