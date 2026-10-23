"""Score the latest validation run of every seeded application against the fixture ground truth.

Reports, per application and overall:
- detection of planted conditions (finding codes expected by the manifest) as precision and recall
- false alarms on the clean application
- field extraction accuracy against the values the generator printed
- verification status per document
- processing time

Writes fixtures/out/evaluation.json and prints a Markdown summary.

    python scripts/evaluate.py [--skip-editors]

The everyday-editor controls run scripts/tamper_lab.py --matrix (about two minutes, and a real Word
round-trip when Word is installed); --skip-editors leaves them out.
"""

import json
import logging
import math
import subprocess
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
        from pramana.pipeline.llm_extract import enabled_providers

        exp = set(a.get("expected_with_llm", a["expected"]) if enabled_providers() else a["expected"])
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
    controls = benign_and_adversarial_controls() + everyday_editor_controls("--skip-editors" in sys.argv)
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
        "controls": controls,
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
    print("\n| Control | Kind | Signals (medium or high) | Signature status | As expected |")
    print("|---|---|---|---|---|")
    for c in controls:
        if c["kind"].startswith("everyday-editor"):
            continue
        print(f"| {c['name']} | {c['kind']} | {', '.join(c['signals']) or '-'} | {c['signature'] or '-'} | "
              f"{'yes' if c['as_expected'] else 'NO'} |")
    editors = [c for c in controls if c["kind"].startswith("everyday-editor")]
    if editors:
        print("\n| Everyday editor | Signals fired (medium or high, beyond the clean copy) | Caught | Shows the new value "
              "| As expected |")
        print("|---|---|---|---|---|")
        for c in editors:
            caught = "-" if c["caught"] is None else ("yes" if c["caught"] else "no")
            shows = "-" if c["shows_edit"] is None else ("yes" if c["shows_edit"] else "no")
            print(f"| {c['name']} | {', '.join(c['signals']) or '-'} | {caught} | {shows} | "
                  f"{'n/a' if c['as_expected'] is None else 'yes' if c['as_expected'] else 'NO'} |")


def benign_and_adversarial_controls() -> list[dict]:
    """Transform fixture PDFs in ways that should not raise flags (benign) or that we expect to miss
    (adversarial), and report what the forensic and signature checks say."""
    import io

    import pikepdf
    from pyhanko.pdf_utils import generic
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

    from pramana.forensics.annotations import scan
    from pramana.forensics.pdf_struct import analyse
    from pramana.pipeline.extract import extract_fields
    from pramana.pipeline.text import extract_pdf
    from pramana.rules.engine import active_ruleset
    from pramana.verification.signature import validate_signatures

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import tamper_lab

    def fields_of(data: bytes, doc_type: str) -> list[dict]:
        return [{"name": e.name, "raw": e.raw, "page": e.page, "bbox": e.bbox}
                for e in extract_fields(extract_pdf(data), active_ruleset().doc_types[doc_type])]

    def annotated(data: bytes, doc_type: str, field: str, label: str, make) -> bytes:
        raw = next(f["raw"] for f in fields_of(data, doc_type) if f["name"] == field)
        loc = tamper_lab.locate(data, label, raw)
        return tamper_lab.add_annotations(data, [lambda w, p: make(w, p, loc)])

    def link(w, p, loc):
        return tamper_lab._common(p, [loc["x0"], loc["baseline"] - 3, loc["x1"], loc["baseline"] + 10], "/Link")

    def highlight(w, p, loc):
        r = [loc["x0"], loc["baseline"] - 3, loc["x1"], loc["baseline"] + 10]
        d = tamper_lab._common(p, r, "/Highlight")
        d[tamper_lab._name("/QuadPoints")] = tamper_lab._arr([r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[1]])
        return d

    def note_away(w, p, loc):
        return tamper_lab.free_text(w, p, {**loc, "baseline": 110.0, "x0": 330.0}, "Received, thank you")

    def save(data: bytes, **kw) -> bytes:
        with pikepdf.open(io.BytesIO(data)) as p:
            b = io.BytesIO()
            p.save(b, **kw)
            return b.getvalue()

    def meta_update(data: bytes) -> bytes:
        w = IncrementalPdfFileWriter(io.BytesIO(data))
        w.trailer["/Info"] = w.add_object(generic.DictionaryObject({
            generic.NameObject("/Title"): generic.TextStringObject("Fire NOC")}))
        out = io.BytesIO()
        w.write(out)
        return out.getvalue()

    clean_unsigned = (FIX / "A1" / "ter_receipt.pdf").read_bytes()
    clean_signed = (FIX / "A1" / "fire_noc.pdf").read_bytes()
    tampered = (FIX / "A7" / "fire_noc.pdf").read_bytes()
    txn = ("ter_receipt", "transaction_id", "Transaction ID")
    cases = [
        ("Linearised re-save of an unsigned PDF", "benign", save(clean_unsigned, linearize=True), set(), None),
        ("Recompressed re-save of an unsigned PDF", "benign",
         save(clean_unsigned, compress_streams=True, object_stream_mode=pikepdf.ObjectStreamMode.generate), set(), None),
        ("Metadata-only incremental update", "benign", meta_update(clean_unsigned), set(), None),
        ("Link annotation over a value (incremental update)", "benign", annotated(clean_unsigned, *txn, link), set(),
         None),
        ("Highlight over a value (incremental update)", "benign", annotated(clean_unsigned, *txn, highlight), set(),
         None),
        ("Comment note away from the values (incremental update)", "benign",
         annotated(clean_unsigned, *txn, note_away), set(), None),
        ("Issuer-signed PDF, untouched", "benign", clean_signed, set(), "verified"),
        ("Issuer-signed PDF re-saved by a tool (no content change)", "benign-but-breaks-signature",
         save(clean_signed), set(), "mismatch_detected"),
        ("Tampered PDF flattened into a single revision", "adversarial", save(tampered),
         {"FX-PDF-OVERLAID-TEXT"}, "mismatch_detected"),
    ]
    out = []
    for name, kind, data, expect_signals, expect_sig in cases:
        signals, _ = analyse(data)
        # The annotation check compares with the values of the document's type: the receipt's or the NOC's
        doc_type = "fire_noc" if "signed" in name.lower() or "tampered" in name.lower() else "ter_receipt"
        signals += scan(data, fields_of(data, doc_type))["signals"]
        found = sorted({s.code for s in signals if s.severity in ("medium", "high")})
        sigs = validate_signatures(data)
        st = sigs[0].status if sigs and sigs[0].status != "not_checked" else None
        ok = set(found) >= expect_signals and (kind != "benign" or not found) and st == expect_sig
        out.append({"name": name, "kind": kind, "signals": found, "signature": st, "as_expected": ok})
    out.append({"name": "Certificate retyped from scratch with an altered date (no QR, unsigned)",
                "kind": "adversarial-expected-undetectable-by-forensics", "signals": [], "signature": None,
                "as_expected": True,
                "note": "No file-level trace exists; only the issuer registry, cross-application links or a "
                        "reviewer can catch it (see A8)."})
    return out


def everyday_editor_controls(skip: bool) -> list[dict]:
    """Certificate edits made the way Edge, a PDF reader, Word, LibreOffice, a PDF printer or a phone camera
    make them (scripts/tamper_lab.py), each re-uploaded and validated by the real pipeline in a copy of the
    seeded world. Every edit is expected to raise at least one medium or high finding the clean copy does not."""
    if skip:
        return []
    path = FIX / "tamper_lab" / "matrix.json"
    p = subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "tamper_lab.py"), "--matrix",
                        "--out", str(path)], capture_output=True, text=True, timeout=1800)
    if p.returncode != 0:
        print(f"tamper lab failed: {(p.stderr or p.stdout)[-400:]}")
        return []
    out = []
    for r in json.loads(path.read_text(encoding="utf-8"))["rows"]:
        sig = next((v["status"] for v in r.get("verification", []) if v["channel"] == "issuer_signature"), None)
        name = f"{r['method']} ({r['declared_type'].replace('_', ' ')}, {r['app']})"
        if r["control"]:
            out.append({"name": name, "kind": "everyday-editor-control", "signals": r.get("new_codes", []),
                        "signature": sig, "caught": None, "shows_edit": None, "as_expected": r.get("control_clean")})
        elif not r["file"]:
            out.append({"name": name, "kind": "everyday-editor", "signals": [], "signature": None, "caught": None,
                        "shows_edit": None, "as_expected": None, "note": r.get("note")})
        else:
            out.append({"name": name, "kind": "everyday-editor", "signals": r["new_codes"], "signature": sig,
                        "caught": r["caught"], "shows_edit": r["shows_edit"], "as_expected": bool(r["caught"])})
    return out


if __name__ == "__main__":
    main()
