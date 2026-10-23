"""Generate a randomised synthetic world for a blind evaluation.

Institutions, people, places, numbers, dates, issuer layouts and which conditions are planted all come
from the seed. About a quarter of the applications are left clean to measure false alarms. Documents are
drawn with make_fixtures' builders.

Two outputs, kept apart:
- <out>/world/: manifest.json and the documents, which is everything the pipeline is given;
- <out>/answer_key.json: the planted conditions and the findings each must produce. The pipeline never
  reads it; random_eval.py opens it only after every application has been validated.

    python scripts/random_world.py --seed 7 --n 30 --out ../var/random-eval/world-7
"""

import argparse
import base64
import json
import random
import shutil
import sys
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import make_fixtures as mf  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402
from random_conditions import BY_NAME, KINDS, Kind, catalogue  # noqa: E402
from random_photos import room_jpeg  # noqa: E402
from random_plan import (  # noqa: E402
    DEADLINE,
    DERIVED,
    LATE,
    ON_TIME,
    RELATED_SLOTS,
    App,
    World,
    base_app,
    derived_codes,
    new_inst,
    new_world,
    previous_year,
)

from pramana.photos import demo_capture  # noqa: E402
from pramana.photos.credentials import DEMO_CA_FILE  # noqa: E402
from pramana.verification import demo_pki  # noqa: E402
from pramana.verification.signed_qr import sign_payload  # noqa: E402

VERSION = 1
CLEAN_SHARE = (0.25, 0.30)
CONDITIONS_PER_APP = ([1, 2, 3], [0.5, 0.35, 0.15])
INCREASE_SHARE = 0.2
NOTICE = "Randomised synthetic world. All institutions, people, issuers and documents are fictitious."


class GeneratorError(RuntimeError):
    """The plan and the answer key disagree: a bug in the generator, never a pipeline result."""


@dataclass
class Planted:
    id: str
    kind: str
    app: str
    partner: str | None
    slots: set[str]
    expect: list[dict[str, str]] = field(default_factory=list)


def plant(w: World, a: App, k: Kind, b: App | None, registry: list[Planted]) -> Planted:
    before = set(a.slots)
    a.slots |= set(k.slots)
    if b is not None:
        b.slots |= set(k.partner_slots)
    expect = k.apply(w, a, b)
    p = Planted(f"C{len(registry) + 1:03d}", k.name, a.key, b.key if b else None, (a.slots - before) | set(k.slots),
                expect)
    a.conds.append(p)
    registry.append(p)
    return p


def plan_world(seed: int, n: int) -> tuple[World, list[Planted]]:
    w = new_world(seed)
    r = w.rng
    keys = [f"R{i:03d}" for i in range(1, n + 1)]
    clean = set(r.sample(keys, round(n * r.uniform(*CLEAN_SHARE))))
    late_p = sum(x * p for x, p in zip(*CONDITIONS_PER_APP, strict=True)) / len(KINDS)
    for key in keys:
        inst = new_inst(w, f"I{key[1:]}")
        category = "INCREASE_INTAKE" if r.random() < INCREASE_SHARE else "EOA"
        late = key not in clean and r.random() < late_p
        w.apps.append(base_app(w, key, inst, category, w.ids.day(*(LATE if late else ON_TIME)), key in clean))

    planted: list[Planted] = []
    order = [a for a in w.apps if not a.clean]
    r.shuffle(order)
    for a in order:
        want = r.choices(*CONDITIONS_PER_APP)[0]
        if a.submitted > DEADLINE:
            plant(w, a, BY_NAME["late_submission"], None, planted)
        tried = {"late_submission"}
        while len(a.conds) < want:
            options = [k for k in KINDS if k.name not in tried and not set(k.slots) & a.slots and k.eligible(w, a)]
            if not options:
                break
            k = r.choices(options, weights=[k.weight for k in options])[0]
            tried.add(k.name)
            b = None
            if k.partner_ok:
                partners = [p for p in w.apps if not p.clean and p is not a and not set(k.partner_slots) & p.slots
                            and k.partner_ok(w, a, p)]
                if not partners:
                    continue
                b = r.choice(partners)
            plant(w, a, k, b, planted)
        if not a.conds:
            raise GeneratorError(f"{a.key} was meant to carry a condition but none fitted")
    return w, planted


def finalise(w: World, planted: list[Planted]) -> None:
    """Build last year's records, then check the answer key against what the plan implies and attach the
    rule and year-over-year side effects to the condition that caused them."""
    for a in w.apps:
        a.prev = previous_year(w, a)
    for a in w.apps:
        implied = derived_codes(a, a.prev)
        expected = {e["code"] for p in planted for e in p.expect if e["app"] == a.key}
        missing = (expected & DERIVED) - implied
        if missing:
            raise GeneratorError(f"{a.key}: answer key expects {sorted(missing)} but the plan does not imply it")
        for code in sorted(implied - expected):
            owner = next((p for p in a.conds if p.slots & RELATED_SLOTS[code]), None)
            if owner is None:
                raise GeneratorError(f"{a.key}: plan implies {code} with no condition to explain it")
            owner.expect.append({"app": a.key, "code": code, "role": "side_effect",
                                 "why": "follows from the planted change (restated from the plan before any run)"})


# ---------------------------------------------------------------- documents


def render(w: World, out: Path) -> dict[str, Any]:
    world = out / "world"
    if world.exists():
        shutil.rmtree(world)
    (world / "trust").mkdir(parents=True)
    # make_fixtures' builders draw survey numbers and auditor details from their own generator
    mf.rng = random.Random(w.seed * 7919 + 26261)
    root, sub = demo_pki.build()
    chain = [sub, root]
    start = datetime(2024, 1, 1, tzinfo=UTC)
    (world / "trust" / "pramana-demo-root.pem").write_bytes(root.cert.public_bytes(serialization.Encoding.PEM))
    capture_ca = demo_capture.build_ca()
    (world / "trust" / DEMO_CA_FILE).write_bytes(capture_ca[0].public_bytes(serialization.Encoding.PEM))
    qr_keys = {"fire-sim-2025": Ed25519PrivateKey.generate(), "nba-sim-2024": Ed25519PrivateKey.generate()}
    issuer_keys = {kid: {"issuer": {"fire-sim-2025": "State Fire and Emergency Services (SIMULATED)",
                                    "nba-sim-2024": "National Board of Accreditation (SIMULATED)"}[kid],
                         "public_key": base64.b64encode(k.public_key().public_bytes(
                             serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode(),
                         "simulated": True} for kid, k in qr_keys.items()}
    insts = {a.inst.key: a.inst for a in w.apps}
    signers: dict[tuple[str, str], Any] = {}

    def signer(kind: str, key: str):
        i = insts[key]
        if (kind, key if kind == "applicant" else i.city) not in signers:
            cn, org = {"fire": (f"Chief Fire Officer {i.city}", f"{i.state} Fire and Emergency Services (DEMO)"),
                       "muni": (f"City Engineer {i.city}", f"{i.city} Municipal Corporation (DEMO)"),
                       "applicant": (i.chair, i.society)}[kind]
            signers[(kind, key if kind == "applicant" else i.city)] = demo_pki.signer(sub, cn, org, start)
        return signers[(kind, key if kind == "applicant" else i.city)]

    cameras: dict[str, demo_capture.Device] = {}

    def camera(i) -> demo_capture.Device:
        if i.key not in cameras:
            cameras[i.key] = demo_capture.device(capture_ca, f"Campus camera 01, {i.city} (DEMO)", f"{i.name} (DEMO)")
        return cameras[i.key]

    registry: dict[str, Any] = {"issuers": {
        "FIRE-SERVICES": {"name": "State Fire and Emergency Services registry (SIMULATED)", "available": True,
                          "latency_ms": 0, "compare_fields": ["institution_name", "issue_date", "valid_until"],
                          "models": "Reference-number lookup as offered by state fire NOC portals"},
        "MUNICIPAL-OC": {"name": "Municipal building permission registry (SIMULATED)", "available": True,
                         "latency_ms": 0, "compare_fields": ["institution_name", "issue_date", "built_up_area_sqm"],
                         "models": "Occupancy certificate lookup by certificate number"},
        "SHCIL-ESTAMP": {"name": "SHCIL e-Stamp verification (SIMULATED)", "available": True, "latency_ms": 0,
                         "compare_fields": ["stamp_value", "purchased_by"],
                         "models": "e-Stamp certificate lookup by certificate number"},
        "SE-REGISTRY": {"name": "Structural engineer licence register (SIMULATED)", "available": True,
                        "latency_ms": 0, "mode": "async", "compare_fields": [],
                        "models": "Confirmation by letter from the licensing municipal body"},
        "ICAI-UDIN": {"name": "ICAI UDIN verification (SIMULATED)", "available": True, "latency_ms": 0,
                      "compare_fields": ["entity_name", "financial_year"], "models": "UDIN lookup for audit reports"},
    }, "records": []}
    seen_refs: set[tuple[str, str]] = set()

    def record(issuer: str, ref: str, fields: dict[str, str]) -> None:
        if (issuer, ref) not in seen_refs:
            seen_refs.add((issuer, ref))
            registry["records"].append({"issuer": issuer, "ref_no": ref, "status": "valid", "fields": fields})

    refs: list[dict[str, Any]] = []
    photo_bytes: dict[tuple[str, str], bytes] = {}
    for a in w.apps:
        for ph in a.photos:
            if ph.get("reuse_of"):
                continue
            taken = datetime.fromisoformat(ph["taken"])
            data = room_jpeg(ph["seed"], mf.photo_exif(tuple(ph["gps"]), taken))
            if ph["c2pa"]:
                data = demo_capture.sign_jpeg(data, camera(a.inst), ph["name"], taken.replace(tzinfo=mf.IST))
            if ph["edit_after_signing"]:
                data = demo_capture.edit_after_signing(data, mf.copy_move)
            photo_bytes[(a.key, ph["name"])] = data

    apps_out = []
    for a in w.apps:
        i, ib = a.inst, a.inst.builder()
        d = world / a.key
        d.mkdir()
        docs: dict[str, bytes] = {}
        f = a.fire
        office = insts[f["office"]].builder()
        if f["registry"]:
            reg = f["registry"]
            record("FIRE-SERVICES", reg["number"], {"institution_name": reg["name"], "issue_date": reg["issue"].isoformat(),
                                                    "valid_until": reg["valid"].isoformat()})
        if f["layout"] == "variant":
            pdf = mf.fire_noc_variant(office, f["number"], f["issue"], f["valid"], f["injection"])
            marks = {}
        else:
            tok = None
            if f["qr"]:
                q = f["qr"]
                tok = sign_payload({"noc": q["number"], "issued_to": q["name"], "issue_date": q["issue"].isoformat(),
                                    "valid_until": q["valid"].isoformat()}, qr_keys["fire-sim-2025"], "fire-sim-2025")
            pdf, marks = mf.fire_noc(office, f["number"], f["issue"], f["valid"], a.oc["area"], issued_to=f["issued_to"],
                                     qr_token=tok, seal=mf.fire_seal(insts[f["seal_of"]].builder()))
        if f["sign"] == "issuer":
            pdf = demo_pki.sign_pdf(pdf, signer("fire", f["office"]), chain, reason="Fire NOC issued",
                                    location=office["city"])
        elif f["sign"] == "applicant":
            pdf = demo_pki.sign_pdf(pdf, signer("applicant", i.key), chain, reason="Uploaded", location=i.city)
        if f["tamper"]:
            x, y, old, size = marks["valid_until"]
            pdf = mf.tamper_date(pdf, x, y, old, mf.dmy(f["tamper"]["new"]), size, font_name=f["tamper"]["font"])
        docs["fire_noc"] = pdf

        oc = a.oc
        record("MUNICIPAL-OC", oc["number"], {"institution_name": oc["registry"]["name"],
                                              "issue_date": oc["registry"]["issue"].isoformat(),
                                              "built_up_area_sqm": str(oc["registry"]["area"])})
        pdf, _ = mf.occupancy(ib, oc["number"], oc["issue"], oc["area"], name=oc["name"])
        docs["occupancy_certificate"] = demo_pki.sign_pdf(pdf, signer("muni", i.key), chain, reason="OC issued",
                                                          location=i.city) if oc["sign"] else pdf
        if a.ssc:
            record("SE-REGISTRY", a.ssc["reg"], {})
            docs["structural_stability"] = mf.structural(ib, a.ssc["number"], a.ssc["issue"], a.ssc["reg"])[0]

        af = a.aff
        record("SHCIL-ESTAMP", af["estamp"], {"stamp_value": str(af["stamp_value"]), "purchased_by": i.society,
                                              "issue_date": (af["sworn"] - timedelta(days=1)).isoformat()})
        pdf, _ = mf.affidavit(ib, af["app_id"], af["estamp"], af["stamp_value"], af["sworn"], af["notary"])
        docs["affidavit_2"] = demo_pki.sign_pdf(pdf, signer("applicant", i.key), chain, reason="Affidavit 2",
                                                location=i.city) if af["signed"] else pdf

        t = a.ter
        led = t["ledger"]
        refs.append({"source": "AICTE TER payment ledger (synthetic)", "record_type": "fee_payment", "key": led["txn"],
                     "inst": i.key, "data": {"application_id": a.id, "txn_id": led["txn"], "amount": led["amount"],
                                             "status": led["status"], "paid_on": led["paid"].isoformat()}})
        docs["ter_receipt"] = mf.ter_receipt(ib, a.id, t["txn"], t["amount"], t["paid"], t["status"])[0]
        docs["satellite_map"] = mf.satellite(ib, a.sat["lat"], a.sat["lon"])[0]
        ac = a.acc
        record("ICAI-UDIN", ac["udin"], {"entity_name": ac["entity"], "financial_year": ac["fy"]})
        pdf = mf.accounts(ib, ac["fy"], ac["udin"], entity=ac["entity"])[0]
        docs["audited_accounts"] = mf.scan(pdf) if ac["scan"] else pdf
        docs["faculty_list"] = mf.faculty_list(ib, a.roster)[0]
        if a.nba:
            nb = a.nba
            prog = next(p for p in a.progs if p["code"] == nb["prog"])
            if nb["register"]:
                refs.append({"source": "NBA accreditation list (synthetic, modelled on the public list)",
                             "record_type": "accreditation", "key": nb["ref"], "inst": i.key,
                             "data": {"programme_code": nb["prog"], "valid_from": nb["from"].isoformat(),
                                      "valid_until": nb["to"].isoformat(), "status": "Accredited",
                                      "nba_ref": nb["ref"]}})
            tok = sign_payload({"ref": nb["ref"], "inst": i.aicte_id, "programme_code": nb["prog"],
                                "valid_from": nb["from"].isoformat(), "valid_until": nb["to"].isoformat()},
                               qr_keys["nba-sim-2024"], "nba-sim-2024") if nb["qr"] else None
            docs["nba_certificate"] = mf.nba_letter(ib, nb["ref"], prog, nb["from"], nb["to"], tok)[0]

        files = []
        for t_, data in docs.items():
            (d / f"{t_}.pdf").write_bytes(data)
            files.append({"declared_type": t_, "file": f"{a.key}/{t_}.pdf"})
        for ph in a.photos:
            if ph.get("reuse_of"):
                src = photo_bytes[(ph["reuse_of"]["app"], ph["reuse_of"]["name"])]
                data = mf.recompress(src, ph["quality"], ph["scale"])
            else:
                data = photo_bytes[(a.key, ph["name"])]
            (d / ph["name"]).write_bytes(data)
            files.append({"declared_type": "infrastructure_photo", "file": f"{a.key}/{ph['name']}"})

        refs.append({"source": "AICTE approval history (synthetic)", "record_type": "approval_history",
                     "key": f"{i.aicte_id}:2025-26", "inst": i.key,
                     "data": {"academic_year": "2025-26", "status": "EoA granted",
                              "total_intake": sum(p["approved_intake"] for p in a.record),
                              "programmes": [{"code": p["code"], "name": p["name"], "intake": p["approved_intake"]}
                                             for p in a.record]}})
        refs.append({"source": "AICTE approval portal, 2025-26 application (synthetic)",
                     "record_type": "previous_application", "key": f"{i.aicte_id}:2025-26", "inst": i.key,
                     "data": a.prev})
        for row in a.own:
            refs.append({"source": "AICTE faculty registry (synthetic)", "record_type": "faculty",
                         "key": row["faculty_id"], "inst": i.key,
                         "data": {"name": row["name"], "designation": row["designation"], "institution_name": i.name,
                                  "active": True}})
        spec = {"key": a.key, "institution": i.key, "id": a.id, "category": a.category, "academic_year": "2026-27",
                "submitted": a.submitted.isoformat(), "declared": a.decl, "documents": files}
        if a.down:
            spec["issuers_down"] = list(a.down)
        apps_out.append(spec)

    manifest = {
        "generated": datetime.now(UTC).isoformat(timespec="seconds"), "seed": w.seed, "kind": "random-world",
        "generator_version": VERSION, "notice": NOTICE,
        "institutions": [{"key": a.inst.key, "name": a.inst.name, "city": a.inst.city, "state": a.inst.state,
                          "lat": a.inst.lat, "lon": a.inst.lon, "society": a.inst.society, "chair": a.inst.chair,
                          "est": a.inst.est, "aicte_id": a.inst.aicte_id, "pin": a.inst.pin,
                          "authorised_signatory": a.inst.chair} for a in w.apps],
        "reference_records": refs, "issuer_registry": registry, "issuer_keys": issuer_keys,
        "applications": apps_out, "scrutiny_outcomes": [],
        "demo_accounts": [{"username": "officer", "display_name": "Random evaluation officer", "role": "officer"},
                          *[{"username": f"r{a.key[1:]}", "display_name": a.inst.name, "role": "institution",
                             "institution": a.inst.key} for a in w.apps]],
    }
    (world / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    return manifest


def _jsonable(v: Any) -> Any:
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, list | tuple):
        return [_jsonable(x) for x in v]
    return v


def answer_key(w: World, planted: list[Planted]) -> dict[str, Any]:
    by_app: dict[str, list[str]] = {}
    for p in planted:
        for e in p.expect:
            by_app.setdefault(e["app"], []).append(p.id)
    return {
        "seed": w.seed, "n": len(w.apps), "generator_version": VERSION,
        "rules": "Each expected item is an (application, finding code) pair. planted: the condition's own finding; "
                 "partner: the finding the condition causes on the other application; side_effect: a consequence "
                 "fixed by the plan before any run. An application with no expected item is clean.",
        "world": {"fire_number_format": w.fire_fmt, "occupancy_number_format": w.oc_fmt, "nba_format": w.nba_fmt,
                  "fire_qr_by_state": w.fire_qr, "fire_issuer_signs_by_state": w.fire_signs,
                  "municipal_issuer_signs_by_state": w.muni_signs, "nba_qr": w.nba_qr},
        "applications": [{"key": a.key, "id": a.id, "institution": a.inst.name, "city": a.inst.city,
                          "state": a.inst.state, "category": a.category, "submitted": a.submitted.isoformat(),
                          "clean": a.key not in by_app, "conditions": [p.id for p in a.conds],
                          "involved_in": sorted(set(by_app.get(a.key, []))),
                          "layout": {"fire": a.fire["layout"], "fire_qr": bool(a.fire["qr"]),
                                     "fire_signed_by": a.fire["sign"], "oc_signed": a.oc["sign"],
                                     "accounts_scanned": a.acc["scan"], "nba_letter": bool(a.nba),
                                     "photos": len(a.photos),
                                     "photo_c2pa": sum(1 for p in a.photos if p.get("c2pa"))}}
                         for a in w.apps],
        "conditions": [{"id": p.id, "kind": p.kind, "title": BY_NAME[p.kind].title, "app": p.app,
                        "partner": p.partner, "expect": p.expect} for p in planted],
        "catalogue": catalogue(),
    }


def build(seed: int, n: int, out: Path) -> dict[str, Any]:
    out.mkdir(parents=True, exist_ok=True)
    w, planted = plan_world(seed, n)
    finalise(w, planted)
    key = answer_key(w, planted)
    render(w, out)
    (out / "answer_key.json").write_text(json.dumps(_jsonable(key), indent=1, ensure_ascii=False), encoding="utf-8")
    return key


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    key = build(args.seed, args.n, args.out)
    clean = sum(1 for a in key["applications"] if a["clean"])
    print(f"wrote {key['n']} applications ({clean} clean) and {len(key['conditions'])} conditions to {args.out}")


if __name__ == "__main__":
    main()
