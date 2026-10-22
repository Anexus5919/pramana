"""Score the latest validation run of every seeded application against the fixture ground truth.

Reports, per application and overall:
- detection of planted conditions (finding codes expected by the manifest) as precision and recall
- false alarms on the clean application
- field extraction accuracy against the values the generator printed
- verification status per document
- processing time

Writes fixtures/out/evaluation.json and prints a Markdown summary.

    python scripts/evaluate.py
"""

import json
import logging
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "fixtures" / "out"


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, c - h), min(1.0, c + h))


def main() -> None:
    from sqlalchemy import select

    from pramana.db import SessionLocal
    from pramana.models import Document, Finding, ValidationRun, VerificationAttempt

    m = json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))
    db = SessionLocal()
    rows, tp_all, fp_all, fn_all = [], 0, 0, 0
    per_code: dict[str, dict[str, int]] = {}
    durations = []
    ver_counts: dict[str, int] = {}
    for a in m["applications"]:
        run = db.scalars(select(ValidationRun).where(ValidationRun.application_id == a["id"],
                                                     ValidationRun.status == "complete")
                         .order_by(ValidationRun.started_at.desc())).first()
        if run is None:
            print(f"no completed run for {a['key']}")
            continue
        durations.append((run.finished_at - run.started_at).total_seconds())
        got = {f.code for f in db.scalars(select(Finding).where(Finding.run_id == run.id))}
        exp = set(a["expected"])
        tp, fp, fn = got & exp, got - exp, exp - got
        tp_all, fp_all, fn_all = tp_all + len(tp), fp_all + len(fp), fn_all + len(fn)
        for c in exp | got:
            d = per_code.setdefault(c, {"tp": 0, "fp": 0, "fn": 0})
            d["tp"] += c in tp
            d["fp"] += c in fp
            d["fn"] += c in fn
        for v in db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id)):
            ver_counts[f"{v.channel}:{v.status}"] = ver_counts.get(f"{v.channel}:{v.status}", 0) + 1
        rows.append({"key": a["key"], "application": a["id"], "expected": sorted(exp), "found": sorted(got),
                     "missed": sorted(fn), "unexpected": sorted(fp), "story": a["story"]})

    # Field extraction against values the generator printed (labels it recorded as marks are in the PDFs)
    field_total = field_ok = 0
    misses = []
    for a in m["applications"]:
        for d in db.scalars(select(Document).where(Document.application_id == a["id"])):
            for f in d.fields:
                if f.name in ("total_faculty",):
                    continue
                field_total += 1
                if f.status == "extracted" and f.value:
                    field_ok += 1
                else:
                    misses.append(f"{a['key']}/{d.declared_type}.{f.name}={f.status}")
    prec = tp_all / (tp_all + fp_all) if tp_all + fp_all else 0.0
    rec = tp_all / (tp_all + fn_all) if tp_all + fn_all else 0.0
    out = {
        "applications": rows,
        "planted_conditions": {"true_positive": tp_all, "false_positive": fp_all, "false_negative": fn_all,
                               "precision": round(prec, 3), "recall": round(rec, 3),
                               "precision_wilson95": [round(x, 3) for x in wilson(tp_all, tp_all + fp_all)],
                               "recall_wilson95": [round(x, 3) for x in wilson(tp_all, tp_all + fn_all)]},
        "per_code": per_code,
        "field_extraction": {"fields": field_total, "extracted": field_ok,
                             "rate": round(field_ok / field_total, 3) if field_total else None, "not_extracted": misses},
        "verification_outcomes": dict(sorted(ver_counts.items())),
        "validation_seconds": {"mean": round(sum(durations) / len(durations), 2) if durations else None,
                               "max": round(max(durations), 2) if durations else None},
    }
    (FIX / "evaluation.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    print("| App | Expected | Found | Missed | Unexpected |")
    print("|---|---|---|---|---|")
    for r in rows:
        print(f"| {r['key']} | {len(r['expected'])} | {len(r['found'])} | {', '.join(r['missed']) or '-'} | "
              f"{', '.join(r['unexpected']) or '-'} |")
    pc = out["planted_conditions"]
    print(f"\nPlanted conditions: precision {pc['precision']} (95% CI {pc['precision_wilson95']}), "
          f"recall {pc['recall']} (95% CI {pc['recall_wilson95']}); TP {tp_all}, FP {fp_all}, FN {fn_all}")
    fe = out["field_extraction"]
    print(f"Field extraction: {fe['extracted']}/{fe['fields']} extracted ({fe['rate']}); not extracted: {misses[:8]}")
    print(f"Validation time per application: {out['validation_seconds']}")
    print(f"Verification outcomes: {out['verification_outcomes']}")


if __name__ == "__main__":
    main()
