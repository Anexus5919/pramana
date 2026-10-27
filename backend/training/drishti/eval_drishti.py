"""Evaluate a Drishti question model through Ollama, with the same request the engine sends
(pramana.drishti.model: /api/chat, the intent schema as `format`, GENERATION_OPTIONS, thinking off).

Scores intent accuracy, exact match, per-field accuracy, valid-JSON rate and out-of-scope precision and recall
on the held-out template split (data/test.jsonl) and the hand-written set (handwritten_test.jsonl), with
latency. --cpu adds num_gpu 0 to the options, so Ollama runs on the CPU only; --threads limits CPU threads,
to approximate a small server.

    python training/drishti/eval_drishti.py --model pramana-drishti --split test --split handwritten
    python training/drishti/eval_drishti.py --model pramana-drishti --split handwritten --cpu --threads 2 --n 60
"""

import argparse
import json
import random
import statistics
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from pramana.drishti.intents import compact  # noqa: E402
from pramana.drishti.lang import detect  # noqa: E402
from pramana.drishti.model_prompt import (  # noqa: E402
    GENERATION_OPTIONS,
    OUTPUT_SCHEMA,
    build_messages,
    parse_output,
)

HERE = Path(__file__).resolve().parent
SPLITS = {"test": HERE / "data" / "test.jsonl", "val": HERE / "data" / "val.jsonl",
          "handwritten": HERE / "handwritten_test.jsonl"}
FIELDS = ["filters." + f for f in ("category", "status", "round", "period", "date_from", "date_to", "actor",
                                   "decision_type", "severity", "topic", "institution", "application", "place",
                                   "open_only")] + ["target.page", "target.section", "target.document", "term",
                                                    "howto", "follow_up"]
FREE_TEXT = {"filters.actor", "filters.institution", "filters.place"}


def rows_for(split: str) -> list[dict]:
    """message, role, previous and gold for every row of a split, whatever file it comes from."""
    out = []
    for line in SPLITS[split].read_text(encoding="utf-8").splitlines():
        x = json.loads(line)
        m = x.get("meta", x)
        out.append({"id": x.get("id") or m.get("family"), "message": m["message"], "role": m["role"],
                    "previous": m.get("previous"), "gold": m["gold"], "kind": m.get("kind") or x.get("source"),
                    "lang": m["gold"]["language"]})
    return out


def field(d: dict | None, path: str):
    """A field of a compact intent, normalised for comparison; None when absent."""
    v = d or {}
    for k in path.split("."):
        v = v.get(k) if isinstance(v, dict) else None
    if path == "follow_up":
        return bool(v)
    # open_only false filters nothing, the same as no value
    if v is None or (path == "filters.open_only" and v is False):
        return None
    if path in FREE_TEXT:
        return " ".join(str(v).lower().strip(" .,?").split())
    if path == "filters.status":
        return tuple(sorted(v))
    if path == "filters.application":
        return str(v).upper()
    return v


def same(a: dict | None, b: dict | None, with_language: bool) -> bool:
    if not a or not b or a.get("intent") != b.get("intent"):
        return False
    if with_language and a.get("language") != b.get("language"):
        return False
    return all(field(a, f) == field(b, f) for f in FIELDS)


def ask(url: str, model: str, row: dict, options: dict) -> tuple[str | None, float]:
    body = {"model": model, "stream": False, "think": False, "keep_alive": "10m", "format": OUTPUT_SCHEMA,
            "options": options,
            "messages": build_messages(row["message"], row["role"], row["previous"], detect(row["message"]))}
    req = urllib.request.Request(f"{url}/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=300) as r:
        out = json.loads(r.read())
    return (out.get("message") or {}).get("content"), time.perf_counter() - t


def score(rows: list[dict], preds: list[dict | None]) -> dict:
    n = len(rows)
    ok_intent = [p is not None and p["intent"] == r["gold"]["intent"] for r, p in zip(rows, preds, strict=True)]
    per_field, tot_c, tot_n = {}, 0, 0
    for f in FIELDS:
        c = t = 0
        for r, p in zip(rows, preds, strict=True):
            g, q = field(r["gold"], f), field(p, f)
            if f == "follow_up":
                relevant = g or q
            else:
                relevant = g is not None or q is not None
            if relevant:
                t += 1
                c += g == q
        if t:
            per_field[f] = f"{c}/{t}"
            tot_c, tot_n = tot_c + c, tot_n + t
    oos_g = [r["gold"]["intent"] == "out_of_scope" for r in rows]
    oos_p = [p is not None and p["intent"] == "out_of_scope" for p in preds]
    tp = sum(a and b for a, b in zip(oos_g, oos_p, strict=True))

    def acc_by(key):
        groups: dict[str, list[bool]] = {}
        for r, ok in zip(rows, ok_intent, strict=True):
            groups.setdefault(str(r[key]), []).append(ok)
        return {k: f"{sum(v)}/{len(v)}" for k, v in sorted(groups.items())}

    wrong = Counter((r["gold"]["intent"], p["intent"] if p else "invalid")
                    for r, p in zip(rows, preds, strict=True) if not (p and p["intent"] == r["gold"]["intent"]))
    return {"examples": n, "valid_json": round(sum(p is not None for p in preds) / n, 3),
            "intent_accuracy": round(sum(ok_intent) / n, 3),
            "exact_match": round(sum(same(r["gold"], p, False) for r, p in zip(rows, preds, strict=True)) / n, 3),
            "exact_match_with_language": round(sum(same(r["gold"], p, True)
                                                   for r, p in zip(rows, preds, strict=True)) / n, 3),
            "language_accuracy": round(sum(p is not None and p.get("language") == r["gold"]["language"]
                                           for r, p in zip(rows, preds, strict=True)) / n, 3),
            "field_accuracy": round(tot_c / max(tot_n, 1), 3), "per_field": per_field,
            "oos_precision": round(tp / max(sum(oos_p), 1), 3), "oos_recall": round(tp / max(sum(oos_g), 1), 3),
            "oos_counts": {"gold": sum(oos_g), "predicted": sum(oos_p), "both": tp},
            "intent_accuracy_by_language": acc_by("lang"), "intent_accuracy_by_kind": acc_by("kind"),
            "confusions": {f"{g} -> {p}": c for (g, p), c in wrong.most_common(15)}}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="pramana-drishti")
    ap.add_argument("--split", action="append", choices=sorted(SPLITS))
    ap.add_argument("--n", type=int, default=0, help="a seeded sample of this many rows per split (0: all)")
    ap.add_argument("--cpu", action="store_true", help="num_gpu 0: run the model on the CPU only")
    ap.add_argument("--threads", type=int, default=0, help="num_thread for CPU runs")
    ap.add_argument("--url", default="http://127.0.0.1:11434")
    ap.add_argument("--tag", default="")
    a = ap.parse_args()
    options = dict(GENERATION_OPTIONS)
    if a.cpu:
        options["num_gpu"] = 0
    if a.threads:
        options["num_thread"] = a.threads
    out_dir = HERE / "results"
    out_dir.mkdir(exist_ok=True)
    seen = {json.loads(x)["meta"]["message"].lower()
            for x in (HERE / "data" / "train.jsonl").read_text(encoding="utf-8").splitlines()}
    # Warm-up: load the model with these options before anything is timed
    ask(a.url, a.model, {"message": "hello", "role": "officer", "previous": None}, options)
    report = {"model": a.model, "options": options, "splits": {}}
    for split in a.split or ["test", "handwritten"]:
        rows = rows_for(split)
        if a.n and a.n < len(rows):
            rows = random.Random(26261).sample(rows, a.n)
        preds, raw, lat = [], [], []
        for r in rows:
            text, dt = ask(a.url, a.model, r, options)
            p = parse_output(text)
            preds.append(compact(p) if p else None)
            raw.append({"id": r["id"], "message": r["message"], "role": r["role"], "previous": r["previous"],
                        "gold": r["gold"], "raw": text, "pred": preds[-1], "seconds": round(dt, 3)})
            lat.append(dt)
        res = score(rows, preds)
        res["latency_s"] = {"median": round(statistics.median(lat), 3), "p90": round(sorted(lat)[int(0.9 * len(lat)) - 1], 3),
                            "mean": round(statistics.mean(lat), 3), "max": round(max(lat), 3)}
        if split == "handwritten":
            # Short or acceptance-table messages the templates also produce
            fresh = [i for i, r in enumerate(rows) if r["message"].lower() not in seen]
            res["unseen_in_train"] = {"examples": len(fresh), "intent_accuracy": round(
                sum(preds[i] is not None and preds[i]["intent"] == rows[i]["gold"]["intent"] for i in fresh)
                / max(len(fresh), 1), 3)}
        report["splits"][split] = res
        name = f"{a.model.replace(':', '_').replace('/', '_')}_{split}{'_cpu' if a.cpu else ''}" \
               f"{f'_t{a.threads}' if a.threads else ''}{f'_n{a.n}' if a.n else ''}{a.tag}"
        (out_dir / f"{name}_outputs.jsonl").write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in raw),
                                                        encoding="utf-8")
        (out_dir / f"{name}.json").write_text(json.dumps({"model": a.model, "split": split, "options": options, **res},
                                                         indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({"split": split, **{k: v for k, v in res.items() if k != "per_field"}}, indent=2,
                         ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
