"""Integrity network and faculty overlap radar over the synthetic fixture world."""

import importlib.util
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FORBIDDEN = ("forged", "fake", "fraud", "genuine")


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def app():
    from pramana.config import get_settings

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


def _app_id(n: int) -> str:
    return f"APP-2026-{100 + n:06d}"


def test_network_links_the_known_pairs_into_two_clusters(app):
    net = _login(app, "officer").get("/api/insights/network").json()
    assert net["stats"]["applications"] == 11
    clusters = [set(c["applications"]) for c in net["clusters"]]
    # A5 and A6 share a fire NOC number, A6 and A7 three faculty; A1 shares a photo with A10 and a seal with A8
    assert {_app_id(5), _app_id(6), _app_id(7)} in clusters
    assert {_app_id(1), _app_id(8), _app_id(10)} in clusters
    pairs = {(p["a"], p["b"]): p["items"] for p in net["pairs"]}
    assert len([i for i in pairs[(_app_id(6), _app_id(7))] if i.startswith("faculty:")]) == 3
    assert any(i.startswith("ref:") for i in pairs[(_app_id(5), _app_id(6))])
    kinds = {i["id"]: i["kind"] for i in net["items"]}
    assert "photo" in {kinds[i] for i in pairs[(_app_id(1), _app_id(10))]}
    assert "seal" in {kinds[i] for i in pairs[(_app_id(1), _app_id(8))]}
    # Unlinked applications are present but in no cluster
    unlinked = [a for a in net["applications"] if a["cluster"] is None]
    assert len(unlinked) == 11 - net["stats"]["linked_applications"]


def test_paired_matches_become_one_item_and_every_edge_has_its_finding(app):
    net = _login(app, "officer").get("/api/insights/network").json()
    # A photo matched by image is one shared item, not one per side
    photos = [i for i in net["items"] if i["kind"] == "photo"]
    assert len(photos) == 1 and sorted(photos[0]["applications"]) == [_app_id(1), _app_id(10)]
    for it in net["items"]:
        assert len(it["applications"]) >= 2
    edges = net["edges"]
    assert all(e["findings"] for e in edges if e["kind"] in ("faculty", "certificate"))
    assert sum(len(e["findings"]) for e in edges) >= 10


def test_cluster_summaries_are_plain_and_careful(app):
    net = _login(app, "officer").get("/api/insights/network").json()
    by_apps = {frozenset(c["applications"]): c for c in net["clusters"]}
    c = by_apps[frozenset({_app_id(5), _app_id(6), _app_id(7)})]
    assert "3 faculty IDs" in c["summary"] and "1 fire NOC number" in c["summary"]
    assert "Krishna Valley" in c["summary"] and "Panchganga" in c["summary"] and "Sahyadri" in c["summary"]
    text = " ".join(x["summary"] for x in net["clusters"]).lower()
    assert not any(w in text for w in FORBIDDEN)
    assert chr(0x2014) not in text and chr(0x2013) not in text


def test_faculty_radar_ranks_the_shared_ids_with_their_lanes(app):
    data = _login(app, "verifier").get("/api/insights/faculty-overlaps").json()
    assert data["stats"]["faculty_ids"] == 3
    assert data["stats"]["applications_involved"] == 2
    # A6 lists all three while the registry records them at A7's institution: three findings, three IDs
    assert data["stats"]["registered_elsewhere"] == 3
    days = [p["overlap_days"] for p in data["people"]]
    assert days == sorted(days, reverse=True) and days[0] > 0
    for p in data["people"]:
        assert sorted(p["applications"]) == [_app_id(6), _app_id(7)]
        lanes = {ln["application_id"]: ln for ln in p["lanes"]}
        # The registry records these faculty at A7's institution; A6 gives a recent joining date
        assert lanes[_app_id(7)]["registry"] and not lanes[_app_id(6)]["registry"]
        assert lanes[_app_id(6)]["joined"] >= "2024-01-01" > lanes[_app_id(7)]["joined"]
        assert p["overlap_start"] == lanes[_app_id(6)]["joined"]
        assert lanes[_app_id(7)]["last_year"]
        for ln in lanes.values():
            assert ln["document_id"] and ln["page"] and len(ln["bbox"]) == 4
            assert any(f["code"] == "XA-FACULTY-MULTIPLE-INSTITUTIONS" for f in ln["findings"])
        assert any(f["code"] == "XA-FACULTY-REGISTERED-ELSEWHERE" for f in lanes[_app_id(6)]["findings"])


def test_overlap_sweep_counts_only_concurrent_time():
    from pramana.insights.network import overlap

    today = date(2026, 1, 1)
    lanes = [{"joined": "2020-01-01"}, {"joined": "2024-01-01", "left": "2025-01-01"}, {"joined": "2025-07-01"}]
    first, days, peak = overlap(lanes, today)
    assert first == date(2024, 1, 1)
    assert days == (date(2025, 1, 1) - date(2024, 1, 1)).days + (today - date(2025, 7, 1)).days
    assert peak == 2
    assert overlap([{"joined": "2020-01-01"}], today) == (None, 0, 1)


def test_short_names_and_phrases():
    from pramana.insights.network import items_phrase, short_name

    assert short_name("Panchganga Institute of Technology") == "Panchganga"
    assert short_name("Krishna Valley College of Engineering") == "Krishna Valley"
    assert short_name("Institute of Something") == "Institute of Something"
    assert items_phrase([{"kind": "faculty"}, {"kind": "faculty"}, {"kind": "photo"}]) == "2 faculty IDs and 1 photo"


@pytest.mark.parametrize("path", ["/api/insights/network", "/api/insights/faculty-overlaps"])
def test_institutions_cannot_see_integrity_views(app, path):
    r = _login(app, "inst6").get(path)
    assert r.status_code in (403, 404)
    assert TestClient(app).get(path).status_code == 401
    assert _login(app, "admin").get(path).status_code == 200
