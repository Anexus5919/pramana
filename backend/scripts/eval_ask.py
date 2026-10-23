"""Measure Ask why over the seeded applications.

For each question the script records every sentence the model proposed, which ones the post-check kept or
dropped and why, whether a kept sentence cites one of the evidence items a reviewer would expect, and the
latency. Run it against a seeded database (scripts/seed.py) with Ollama running:

    python scripts/eval_ask.py              # model mode (PRAMANA_ASK_PROVIDERS, default ollama)
    python scripts/eval_ask.py --template   # deterministic answers only, no model

Writes fixtures/out/ask_eval[_template].json and prints a Markdown summary.
"""

import json
import logging
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

ROOT = Path(__file__).resolve().parents[2]

# (application, question, evidence a good answer cites: finding codes, rule ids, document types or statuses)
QUESTIONS = [
    ("APP-2026-000107", "Why is the fire NOC flagged?", ["VER-ISSUER_SIGNATURE-MISMATCH_DETECTED", "APH-617I-FIRE-VALID",
                                                         "VER-SIGNED_QR-EXPIRED", "VER-ISSUER_REGISTRY-EXPIRED",
                                                         "FX-FIELD-OVERWRITTEN"]),
    ("APP-2026-000107", "What changed after signing?", ["VER-ISSUER_SIGNATURE-MISMATCH_DETECTED", "FX-FIELD-OVERWRITTEN",
                                                        "FX-PDF-REVISION-TEXT-CHANGE", "FX-PDF-WHITEOUT"]),
    ("APP-2026-000107", "Which date does the validity check use for the fire certificate?",
     ["FX-FIELD-OVERWRITTEN", "APH-617I-FIRE-VALID"]),
    ("APP-2026-000107", "Which faculty members also appear at another institution?", ["XA-FACULTY-MULTIPLE-INSTITUTIONS"]),
    ("APP-2026-000107", "What is still unverified?", ["doc:fire_noc", "doc:ter_receipt", "doc:satellite_map",
                                                      "doc:faculty_list"]),
    ("APP-2026-000103", "Why is the fire certificate flagged?", ["APH-617I-FIRE-VALID", "VER-SIGNED_QR-EXPIRED",
                                                                "VER-ISSUER_REGISTRY-EXPIRED"]),
    ("APP-2026-000103", "When did the fire certificate expire?", ["APH-617I-FIRE-VALID", "VER-SIGNED_QR-EXPIRED",
                                                                 "VER-ISSUER_REGISTRY-EXPIRED"]),
    ("APP-2026-000103", "Which handbook clause requires a valid fire certificate?", ["APH-617I-FIRE-VALID",
                                                                                    "APH-A21-FIRE"]),
    ("APP-2026-000102", "Which rule needs the SSC?", ["APH-A21-SSC-REQUIRED", "APH-617H-SSC-VALID"]),
    ("APP-2026-000102", "Why is a Structural Stability Certificate required here?", ["APH-A21-SSC-REQUIRED"]),
    ("APP-2026-000104", "What does the faculty-student ratio finding say?", ["APH-ANX5-FSR"]),
    ("APP-2026-000104", "Why is the declared intake flagged?", ["XR-INTAKE-RECORD", "XR-EOA-NO-INCREASE"]),
    ("APP-2026-000104", "What is wrong with the NBA claim?", ["XR-NBA-CLAIMS"]),
    ("APP-2026-000104", "Is the affidavit signed?", ["APH-639-AFF2-DSC"]),
    ("APP-2026-000105", "Why is the fire NOC flagged?", ["VER-ISSUER_REGISTRY-MISMATCH_DETECTED",
                                                         "VER-SIGNED_QR-MISMATCH_DETECTED", "XA-SHARED-CERTIFICATE-NUMBER"]),
    ("APP-2026-000105", "What is the problem with the affidavit?", ["XD-AFF2-APPLICATION"]),
    ("APP-2026-000106", "Which faculty are registered elsewhere?", ["XA-FACULTY-REGISTERED-ELSEWHERE",
                                                                   "XA-FACULTY-MULTIPLE-INSTITUTIONS"]),
    ("APP-2026-000108", "Why is the fire NOC flagged when its signature is valid?",
     ["VER-ISSUER_REGISTRY-MISMATCH_DETECTED"]),
    ("APP-2026-000108", "Who signed the fire NOC?", ["VER-ISSUER_REGISTRY-MISMATCH_DETECTED", "verification"]),
    ("APP-2026-000109", "What is still unverified?", ["VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE",
                                                      "VER-ISSUER_REGISTRY-VERIFICATION_PENDING", "doc:occupancy_certificate",
                                                      "doc:structural_stability"]),
    ("APP-2026-000109", "Why is the occupancy certificate not confirmed?", ["VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE"]),
    ("APP-2026-000109", "How many faculty are required and how many are listed?", ["APH-ANX5-FSR"]),
    ("APP-2026-000110", "Why is the infrastructure photo flagged?", ["XA-PHOTO-REUSED", "FX-IMG-GEOTAG-FAR"]),
    ("APP-2026-000110", "Which rule applies to the core branches?", ["ADD26-26C-CORE-BRANCHES"]),
    ("APP-2026-000111", "Why is the fire NOC flagged?", ["SEC-INSTRUCTION-TEXT", "VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED",
                                                         "APH-617I-FIRE-VALID"]),
    ("APP-2026-000111", "What does the instruction on the fire NOC say to do?", ["SEC-INSTRUCTION-TEXT"]),
    ("APP-2026-000101", "Why is anything flagged on this application?", ["XA-PHOTO-REUSED-LATER"]),
]


def _matches(item: dict, expected: list[str]) -> bool:
    text = item["text"]
    for e in expected:
        if e.startswith("doc:"):
            if item["kind"] == "document" and e[4:].replace("_", " ") in text.lower().replace("_", " "):
                return True
        elif e == "verification":
            if item["kind"] == "verification":
                return True
        elif e in text:
            return True
    return False


def main(template: bool = False) -> None:
    from pramana.db import SessionLocal
    from pramana.models import Application
    from pramana.officer import ask

    db = SessionLocal()
    rows = []
    for aid, q, expected in QUESTIONS:
        app = db.get(Application, aid)
        out = ask.answer(db, app, q, use_model=not template)
        ctx = ask.build_context(db, app, q)["items"]
        # Score the first pass only (model sentences in model mode); a template fallback is reported separately
        first = out["first_pass_kept"]
        model_dropped = out["proposed_count"] - first
        fell_back = out["fallback"] == "the model's sentences did not pass the evidence check"
        cited = [ctx[c] for s in (out["sentences"] if not fell_back else []) for c in s["cites"] if c in ctx]
        valid_cite = first + sum(1 for d in out["dropped"][:model_dropped] if d["reason"] != "no valid citation")
        rows.append({"application": aid, "question": q, "mode": out["mode"], "model": out["model"],
                     "fallback_after_drop": fell_back,
                     "proposed": out["proposed_count"], "kept": first, "dropped": model_dropped,
                     "citation_valid": valid_cite, "drop_reasons": [d["reason"] for d in out["dropped"]],
                     "hit": any(_matches(i, expected) for i in cited), "latency_ms": out["latency_ms"],
                     "sentences": out["sentences"], "dropped_sentences": out["dropped"], "errors": out["errors"]})
        print(f"{aid} {out['mode']:8} kept {first}/{out['proposed_count']} "
              f"{'hit ' if rows[-1]['hit'] else 'miss'} {out['latency_ms']:6} ms  {q}")
    db.close()

    proposed = sum(r["proposed"] for r in rows)
    kept = sum(r["kept"] for r in rows)
    dropped = sum(r["dropped"] for r in rows)
    valid = sum(r["citation_valid"] for r in rows)
    lat = [r["latency_ms"] for r in rows]
    reasons: dict[str, int] = {}
    for r in rows:
        for x in r["drop_reasons"]:
            key = x.split(" is not")[0].split(",")[0] if "is not in" in x else x
            key = "number not in cited items" if key.startswith("number") else key
            key = "date not in cited items" if key.startswith("date") else key
            key = "reference not in cited items" if key.startswith("reference") else key
            key = "status not supported by cited items" if key.startswith("says") else key
            reasons[key] = reasons.get(key, 0) + 1
    summary = {
        "mode": "template" if template else "model", "questions": len(rows),
        "model_answers": sum(1 for r in rows if r["model"]),
        "template_fallbacks_after_drop": sum(1 for r in rows if r["fallback_after_drop"]),
        "sentences_proposed": proposed, "sentences_kept": kept, "sentences_dropped": dropped,
        "citation_valid_rate": round(valid / proposed, 3) if proposed else None,
        "kept_rate": round(kept / proposed, 3) if proposed else None,
        "dropped_rate": round(dropped / proposed, 3) if proposed else None,
        "answers_with_expected_evidence": sum(1 for r in rows if r["hit"]),
        "answers_with_no_kept_sentence": sum(1 for r in rows if r["kept"] == 0),
        "latency_ms": {"mean": round(statistics.mean(lat)), "median": round(statistics.median(lat)),
                       "p90": sorted(lat)[int(0.9 * (len(lat) - 1))], "max": max(lat)},
        "drop_reasons": reasons,
    }
    out_dir = ROOT / "fixtures" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    name = "ask_eval_template.json" if template else "ask_eval.json"
    (out_dir / name).write_text(json.dumps({"summary": summary, "rows": rows}, indent=2), encoding="utf-8")
    print()
    print(f"| Metric | {summary['mode']} |")
    print("|---|---|")
    for k in ("questions", "model_answers", "template_fallbacks_after_drop", "sentences_proposed", "sentences_kept", "sentences_dropped",
              "citation_valid_rate", "kept_rate", "dropped_rate", "answers_with_expected_evidence",
              "answers_with_no_kept_sentence"):
        print(f"| {k} | {summary[k]} |")
    print(f"| latency ms (mean / median / p90 / max) | {summary['latency_ms']['mean']} / "
          f"{summary['latency_ms']['median']} / {summary['latency_ms']['p90']} / {summary['latency_ms']['max']} |")
    print(f"| drop reasons | {reasons} |")


if __name__ == "__main__":
    main(template="--template" in sys.argv)
