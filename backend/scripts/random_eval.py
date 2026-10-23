"""Blind randomised evaluation.

Generates a world from a seed (random_world.py), loads it into an isolated data directory with the same
seeding code as the demo, processes and validates every application through the real pipeline in
deterministic mode, and only then opens the answer key and scores the findings.

Writes report.json and report.md to the output directory.

    python scripts/random_eval.py --seed 4242 --n 30          # judge mode, a few minutes
    python scripts/random_eval.py --seed 11 --n 120 --out ../var/random-eval/s11
    python scripts/random_eval.py --combine DIR [DIR ...]     # pool several runs into one report
    python scripts/random_eval.py --revalidate DIR            # validate a processed run again and rescore
    python scripts/random_eval.py --rescore DIR               # score a finished run again against its answer key
"""

import argparse
import json
import logging
import os
import shutil
import statistics
import sys
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from evaluate import wilson  # noqa: E402


def isolate(out: Path, fresh: bool = True) -> None:
    """Point Pramana at the data directory and trust store under `out`, before it is imported; fresh wipes them."""
    data, trust = out / "data", out / "trust"
    if fresh:
        shutil.rmtree(data, ignore_errors=True)
        shutil.rmtree(trust, ignore_errors=True)
        shutil.copytree(BACKEND / "trust", trust, ignore=shutil.ignore_patterns("demo", "demo-c2pa"))
    os.environ.update({"PRAMANA_DATA_DIR": str(data), "PRAMANA_TRUST_DIR": str(trust), "PRAMANA_DATABASE_URL": "",
                       "PRAMANA_LLM_PROVIDERS": "", "PRAMANA_ASK_PROVIDERS": "", "PRAMANA_BACKGROUND_RUNS": "false",
                       "PRAMANA_WATCH_SCHEDULER": "false"})


def run_pipeline(world: Path) -> tuple[dict[str, Any], dict[str, float]]:
    """Seed the world and validate every application. Reads only world/manifest.json and its documents."""
    import seed as seed_script
    from sqlalchemy import select

    from pramana.db import SessionLocal
    from pramana.models import Document
    from pramana.pipeline.process import process_document
    from pramana.rules.engine import active_ruleset

    t0 = time.perf_counter()
    seed_script.main(validate=False, fix=world)
    seeded = time.perf_counter() - t0
    db = SessionLocal()
    rs = active_ruleset()
    proc: dict[str, float] = defaultdict(float)
    ndocs: Counter[str] = Counter()
    t0 = time.perf_counter()
    # Every document first, so cross-application checks see all peers, as seed.py does
    for d in db.scalars(select(Document)):
        inst = d.application.institution
        t = time.perf_counter()
        try:
            process_document(db, d, rs, (inst.latitude, inst.longitude))
        except Exception as e:  # noqa: BLE001  the run reports it as DOC-PROCESSING-FAILED
            d.processing_status, d.processing_error = "failed", str(e)[:500]
        proc[d.application_id] += time.perf_counter() - t
        ndocs[d.application_id] += 1
    db.commit()
    processing = time.perf_counter() - t0
    db.close()
    results, validating = validate_all(world, {k: {"documents": ndocs[k], "processing_s": round(v, 3)}
                                               for k, v in proc.items()})
    return results, {"seeding_s": round(seeded, 1), "processing_s": round(processing, 1),
                     "validation_s": round(validating, 1)}


def validate_all(world: Path, processed: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], float]:
    """Validate every application of a seeded and processed world, with the outages the manifest marks."""
    from sqlalchemy import select

    from pramana.db import SessionLocal
    from pramana.models import Application, Finding
    from pramana.pipeline.validate import run_validation
    from pramana.sim import issuers as sim

    m = json.loads((world / "manifest.json").read_text(encoding="utf-8"))
    db = SessionLocal()
    results: dict[str, Any] = {}
    t0 = time.perf_counter()
    for spec in m["applications"]:
        app = db.get(Application, spec["id"])
        down = spec.get("issuers_down", [])
        for code in down:
            sim.set_availability(code, False)
        t = time.perf_counter()
        status, error = "crashed", None
        codes: dict[str, dict[str, Any]] = {}
        try:
            run = run_validation(db, app, "system", "system")
            status, error = run.status, run.error
            for f in db.scalars(select(Finding).where(Finding.run_id == run.id)):
                c = codes.setdefault(f.code, {"n": 0, "severity": set(), "evidence_class": set()})
                c["n"] += 1
                c["severity"].add(f.severity)
                c["evidence_class"].add(f.evidence_class)
        except Exception as e:  # noqa: BLE001  a run that cannot even be saved is scored as finding nothing
            db.rollback()
            error = f"{type(e).__name__}: {str(e)[:300]}"
        vt = time.perf_counter() - t
        for code in down:
            sim.set_availability(code, True)
        results[spec["key"]] = {
            "id": spec["id"], "status": status, "error": error,
            "codes": {k: {"n": v["n"], "severity": sorted(v["severity"]), "evidence_class": sorted(v["evidence_class"])}
                      for k, v in sorted(codes.items())},
            **processed.get(spec["id"], {"documents": 0, "processing_s": 0.0}), "validation_s": round(vt, 3)}
    validating = time.perf_counter() - t0
    db.close()
    return results, validating


def _rate(k: int, n: int) -> dict[str, Any]:
    lo, hi = wilson(k, n)
    return {"k": k, "n": n, "rate": round(k / n, 4) if n else None, "wilson95": [round(lo, 4), round(hi, 4)]}


def score(key: dict[str, Any], results: dict[str, Any]) -> dict[str, Any]:
    """Score (application, code) pairs. Expected pairs come only from the answer key; a pair that fired and is
    not expected is a false positive, however plausible it looks."""
    expected: dict[str, dict[str, list[dict[str, str]]]] = defaultdict(dict)
    for c in key["conditions"]:
        for e in c["expect"]:
            expected[e["app"]].setdefault(e["code"], []).append({"condition": c["id"], "kind": c["kind"],
                                                                 "role": e["role"]})
    got = {k: set(r["codes"]) for k, r in results.items()}
    apps = [a["key"] for a in key["applications"]]
    tp, fn, fp = [], [], []
    for a in apps:
        exp, g = set(expected.get(a, {})), got.get(a, set())
        tp += [(a, c) for c in sorted(exp & g)]
        fn += [(a, c) for c in sorted(exp - g)]
        fp += [(a, c) for c in sorted(g - exp)]
    gotp = {(a, c) for a in apps for c in got.get(a, set())}

    kinds: dict[str, dict[str, Any]] = {}
    conditions = []
    for c in key["conditions"]:
        pairs = sorted({(e["app"], e["code"]) for e in c["expect"]})
        found = [p for p in pairs if p in gotp]
        status = "detected" if len(found) == len(pairs) else "partial" if found else "missed"
        conditions.append({"id": c["id"], "kind": c["kind"], "app": c["app"], "partner": c["partner"],
                           "status": status, "missing": [f"{a}:{code}" for a, code in pairs if (a, code) not in gotp]})
        k = kinds.setdefault(c["kind"], {"title": c["title"], "instances": 0, "detected": 0, "partial": 0,
                                         "missed": 0, "pairs": 0, "pairs_found": 0, "missing_codes": Counter()})
        k["instances"] += 1
        k[status] += 1
        k["pairs"] += len(pairs)
        k["pairs_found"] += len(found)
        for a, code in pairs:
            if (a, code) not in gotp:
                k["missing_codes"][code] += 1
    codes: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fn": 0, "fp": 0})
    for name, items in (("tp", tp), ("fn", fn), ("fp", fp)):
        for _, c in items:
            codes[c][name] += 1
    clean = [a["key"] for a in key["applications"] if a["clean"]]
    clean_fp = {a: sorted(got.get(a, set())) for a in clean}
    detected = sum(1 for c in conditions if c["status"] == "detected")
    return {
        "applications": len(apps), "clean_applications": len(clean), "conditions": len(conditions),
        "expected_pairs": len(tp) + len(fn), "failed_runs": sorted(k for k, r in results.items() if r["status"] != "complete"),
        "recall": _rate(len(tp), len(tp) + len(fn)), "precision": _rate(len(tp), len(tp) + len(fp)),
        "conditions_fully_detected": _rate(detected, len(conditions)),
        "false_alarms_on_clean": {"applications": len(clean),
                                  "with_any_false_alarm": sum(1 for v in clean_fp.values() if v),
                                  "codes": sum(len(v) for v in clean_fp.values()),
                                  "per_clean_application": round(sum(len(v) for v in clean_fp.values()) / len(clean), 3)
                                  if clean else None,
                                  "by_code": dict(Counter(c for v in clean_fp.values() for c in v).most_common()),
                                  "fired": {a: v for a, v in clean_fp.items() if v}},
        "false_positives": [f"{a}:{c}" for a, c in fp], "false_negatives": [f"{a}:{c}" for a, c in fn],
        "by_kind": {k: {**v, "missing_codes": dict(v["missing_codes"])} for k, v in sorted(kinds.items())},
        "by_code": dict(sorted(codes.items())), "condition_results": conditions,
    }


def timing(results: dict[str, Any], phases: dict[str, float], generate_s: float, wall_s: float) -> dict[str, Any]:
    per_app = [r["processing_s"] + r["validation_s"] for r in results.values()]
    val = [r["validation_s"] for r in results.values()]
    docs = sum(r["documents"] for r in results.values())

    def q(xs: list[float], p: float) -> float:
        xs = sorted(xs)
        return round(xs[min(len(xs) - 1, int(p * len(xs)))], 2)

    return {"generate_s": round(generate_s, 1), **phases, "wall_s": round(wall_s, 1), "documents": docs,
            "per_document_processing_s": round(phases["processing_s"] / docs, 3) if docs else None,
            "per_application_s": {"mean": round(statistics.mean(per_app), 2), "median": q(per_app, 0.5),
                                  "p90": q(per_app, 0.9), "max": round(max(per_app), 2)},
            "validation_per_application_s": {"mean": round(statistics.mean(val), 3), "max": round(max(val), 3)},
            "wall_per_application_s": round(wall_s / len(results), 2)}


def pct(r: dict[str, Any]) -> str:
    if not r["n"]:
        return "n/a"
    lo, hi = r["wilson95"]
    return f"{r['k']}/{r['n']} = {100 * r['rate']:.1f}% (95% CI {100 * lo:.1f} to {100 * hi:.1f})"


def markdown(rep: dict[str, Any], title: str) -> str:
    s = rep["score"]
    lines = [f"# {title}", "", f"Generated {rep['generated']}. Seeds: {', '.join(map(str, rep['seeds']))}. "
             f"Applications: {s['applications']} ({s['clean_applications']} clean). Planted conditions: "
             f"{s['conditions']}. Expected (application, finding) pairs: {s['expected_pairs']}. "
             "Deterministic mode (no language model).", "",
             "| Measure | Result |", "|---|---|",
             f"| Recall over expected pairs | {pct(s['recall'])} |",
             f"| Precision over pairs that fired | {pct(s['precision'])} |",
             f"| Conditions with every expected finding | {pct(s['conditions_fully_detected'])} |"]
    fa = s["false_alarms_on_clean"]
    lines += [f"| Clean applications with any false alarm | {fa['with_any_false_alarm']} of {fa['applications']} |",
              f"| False-alarm codes per clean application | {fa['per_clean_application']} |",
              f"| Failed validation runs | {len(s['failed_runs'])} |", ""]
    if "timing" in rep:
        t = rep["timing"]
        lines += ["## Time", "", f"Generation {t['generate_s']} s, seeding {t['seeding_s']} s, document processing "
                  f"{t['processing_s']} s ({t['documents']} documents, {t['per_document_processing_s']} s each), "
                  f"validation {t['validation_s']} s, wall clock {t['wall_s']} s. Per application (processing plus "
                  f"validation): mean {t['per_application_s']['mean']} s, median {t['per_application_s']['median']} s, "
                  f"p90 {t['per_application_s']['p90']} s, max {t['per_application_s']['max']} s.", ""]
        if "revalidated" in rep:
            lines[-1:-1] = ["", f"Validated again after a validation-stage fix: {rep['revalidated']['validation_s']} s; "
                                "the first scores are in report.first.md."]
    lines += ["## By condition", "", "| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |",
              "|---|---|---|---|---|---|---|"]
    for k, v in s["by_kind"].items():
        miss = ", ".join(f"{c} x{n}" for c, n in v["missing_codes"].items()) or "-"
        lines.append(f"| {k} | {v['instances']} | {v['detected']} | {v['partial']} | {v['missed']} | "
                     f"{v['pairs_found']}/{v['pairs']} | {miss} |")
    lines += ["", "## By finding code", "", "| Code | Expected and found | Expected, not found | Fired, not expected |",
              "|---|---|---|---|"]
    for c, v in s["by_code"].items():
        lines.append(f"| {c} | {v['tp']} | {v['fn']} | {v['fp']} |")
    lines += ["", "## False alarms on clean applications", ""]
    if fa["fired"]:
        lines += ["| Application | Codes |", "|---|---|"]
        lines += [f"| {a} | {', '.join(v)} |" for a, v in fa["fired"].items()]
    else:
        lines.append("None.")
    lines += ["", "## Every false positive and false negative", "",
              f"False positives ({len(s['false_positives'])}): {', '.join(s['false_positives']) or 'none'}.", "",
              f"False negatives ({len(s['false_negatives'])}): {', '.join(s['false_negatives']) or 'none'}.", ""]
    return "\n".join(lines)


def evaluate_seed(seed: int, n: int, out: Path) -> dict[str, Any]:
    wall = time.perf_counter()
    out.mkdir(parents=True, exist_ok=True)
    isolate(out)
    logging.basicConfig(level=logging.WARNING)
    for name in ("pyhanko", "pyhanko_certvalidator", "pdfminer", "RapidOCR", "pramana.keyring", "pramana.crypto"):
        logging.getLogger(name).setLevel(logging.CRITICAL)
    import random_world

    t0 = time.perf_counter()
    random_world.build(seed, n, out)
    generate_s = time.perf_counter() - t0
    print(f"seed {seed}: generated {n} applications in {generate_s:.0f} s; validating blind", flush=True)
    results, phases = run_pipeline(out / "world")
    # The answer key is opened only now, after every run has finished
    key = json.loads((out / "answer_key.json").read_text(encoding="utf-8"))
    rep = {"generated": datetime.now(UTC).isoformat(timespec="seconds"), "seeds": [seed], "n": n,
           "generator_version": key["generator_version"], "score": score(key, results),
           "timing": timing(results, phases, generate_s, time.perf_counter() - wall), "results": results}
    (out / "report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    (out / "report.md").write_text(markdown(rep, f"Random evaluation, seed {seed}, {n} applications"), encoding="utf-8")
    return rep


def revalidate_seed(out: Path) -> dict[str, Any]:
    """Validate an already processed world again after a fix to the validation stage, and rescore. Document
    processing does not depend on that stage, so this matches a full rerun. The first report is kept as
    report.first.json and report.first.md."""
    wall = time.perf_counter()
    first = json.loads((out / "report.json").read_text(encoding="utf-8"))
    for ext in ("json", "md"):
        if not (out / f"report.first.{ext}").exists():
            shutil.copyfile(out / f"report.{ext}", out / f"report.first.{ext}")
    isolate(out, fresh=False)
    logging.basicConfig(level=logging.WARNING)
    processed = {r["id"]: {"documents": r["documents"], "processing_s": r["processing_s"]}
                 for r in first["results"].values()}
    results, validating = validate_all(out / "world", processed)
    key = json.loads((out / "answer_key.json").read_text(encoding="utf-8"))
    seed = first["seeds"][0]
    rep = {"generated": datetime.now(UTC).isoformat(timespec="seconds"), "seeds": [seed], "n": first["n"],
           "generator_version": key["generator_version"], "score": score(key, results), "timing": first["timing"],
           "revalidated": {"validation_s": round(validating, 1), "wall_s": round(time.perf_counter() - wall, 1),
                           "first_report": "report.first.json"},
           "results": results}
    (out / "report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    (out / "report.md").write_text(markdown(rep, f"Random evaluation, seed {seed}, {first['n']} applications"),
                                   encoding="utf-8")
    return rep


def rescore(out: Path) -> dict[str, Any]:
    """Score a finished run again against its answer_key.json, without running the pipeline."""
    rep = json.loads((out / "report.json").read_text(encoding="utf-8"))
    key = json.loads((out / "answer_key.json").read_text(encoding="utf-8"))
    rep.update(score=score(key, rep["results"]), rescored=datetime.now(UTC).isoformat(timespec="seconds"))
    (out / "report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    (out / "report.md").write_text(markdown(rep, f"Random evaluation, seed {rep['seeds'][0]}, {rep['n']} applications"),
                                   encoding="utf-8")
    return rep


def combine(dirs: list[Path], out: Path) -> dict[str, Any]:
    """Pool runs: the answer keys and results of every run are scored together."""
    keys, results, seeds = {"conditions": [], "applications": []}, {}, []
    times = []
    for d in dirs:
        rep = json.loads((d / "report.json").read_text(encoding="utf-8"))
        key = json.loads((d / "answer_key.json").read_text(encoding="utf-8"))
        s = rep["seeds"][0]
        seeds.append(s)
        times.append(rep["timing"])
        for a in key["applications"]:
            keys["applications"].append({**a, "key": f"s{s}-{a['key']}"})
        for c in key["conditions"]:
            keys["conditions"].append({**c, "id": f"s{s}-{c['id']}", "app": f"s{s}-{c['app']}",
                                       "partner": f"s{s}-{c['partner']}" if c["partner"] else None,
                                       "expect": [{**e, "app": f"s{s}-{e['app']}"} for e in c["expect"]]})
        results.update({f"s{s}-{k}": v for k, v in rep["results"].items()})
    rep = {"generated": datetime.now(UTC).isoformat(timespec="seconds"), "seeds": seeds, "score": score(keys, results),
           "runs": [{"seed": s, "timing": t} for s, t in zip(seeds, times, strict=True)]}
    out.mkdir(parents=True, exist_ok=True)
    (out / "combined.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    (out / "combined.md").write_text(markdown(rep, f"Random evaluation, seeds {', '.join(map(str, seeds))} combined"),
                                     encoding="utf-8")
    return rep


def main() -> None:
    ap = argparse.ArgumentParser(description="Blind randomised evaluation of Pramana")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--combine", type=Path, nargs="+", metavar="DIR")
    ap.add_argument("--revalidate", type=Path, metavar="DIR",
                    help="validate an already processed run again and rescore it, after a validation-stage fix")
    ap.add_argument("--rescore", type=Path, metavar="DIR", help="score a finished run again against its answer key")
    args = ap.parse_args()
    if args.rescore:
        rep = rescore(args.rescore)
    elif args.revalidate:
        rep = revalidate_seed(args.revalidate)
    elif args.combine:
        rep = combine(args.combine, args.out or args.combine[0].parent / "combined")
    elif args.seed is None:
        ap.error("--seed is required (any integer)")
    else:
        rep = evaluate_seed(args.seed, args.n, args.out or ROOT / "var" / "random-eval" / f"seed-{args.seed}-n{args.n}")
    s = rep["score"]
    fa = s["false_alarms_on_clean"]
    print(f"recall {pct(s['recall'])}\nprecision {pct(s['precision'])}\n"
          f"conditions fully detected {pct(s['conditions_fully_detected'])}\n"
          f"clean applications with a false alarm: {fa['with_any_false_alarm']} of {fa['applications']}")
    if "timing" in rep:
        print(f"wall {rep['timing']['wall_s']} s, {rep['timing']['wall_per_application_s']} s per application")


if __name__ == "__main__":
    main()
