"""Check the instruction-line detector against every benign text available and against the line sets.

Benign text: every line of the seeded fixture documents (including the tamper lab and scan samples), the real
documents in fixtures/real, the documents of randomised worlds given with --worlds, and the findings Pramana
wrote in those worlds (Ask why screens them with the same detector). Lines are read as the pipeline reads them.
The only lines that may be flagged are the planted ones: A11's fire NOC and the instruction conditions of a
random world's answer key.

    python scripts/eval_instruction_lines.py --db ../var/pramana.db --findings ../var/random-eval/final/seed-*
    python scripts/eval_instruction_lines.py --worlds ../var/random-eval/final/seed-1101     # also every document
                                                                                              # of a world (slow)
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
logging.disable(logging.CRITICAL)

LINES = ROOT / "backend" / "tests" / "data" / "instruction_lines.json"


CACHE = ROOT / "var" / "instruction_lines_cache.json"
_cache: dict[str, list[str]] = {}


def read_lines(path: Path) -> list[str]:
    """The document's lines as the pipeline reads them, cached by file SHA-256 (OCR is slow)."""
    import hashlib

    from pramana.pipeline.text import extract_image, extract_pdf

    data = path.read_bytes()
    key = hashlib.sha256(data).hexdigest()
    if key not in _cache:
        pages = extract_pdf(data) if path.suffix.lower() == ".pdf" else extract_image(data)
        _cache[key] = [ln.text for p in pages for ln in p.lines if ln.text]
    return _cache[key]


def cache_from_db(db: Path) -> None:
    """Page text a seeded database already holds: the lines the pipeline itself read from each document."""
    import sqlite3

    con = sqlite3.connect(db)
    rows = con.execute("select d.sha256, p.text from documents d join document_pages p on p.document_id = d.id "
                       "order by d.sha256, p.page_no").fetchall()
    con.close()
    for sha, text in rows:
        _cache.setdefault(sha, []).extend(ln for ln in (text or "").splitlines() if ln)


def scan(files: list[Path], planted: set[Path]) -> dict:
    from pramana.pipeline.llm_extract import INJECTION

    out = {"documents": 0, "lines": 0, "flagged_planted": [], "missed_planted": [], "false_positives": []}
    for f in files:
        lines = read_lines(f)
        out["documents"] += 1
        out["lines"] += len(lines)
        hits = [ln for ln in lines if INJECTION.search(ln)]
        if f in planted:
            out["flagged_planted" if hits else "missed_planted"].append(str(f.relative_to(ROOT)))
            hits = hits[1:]  # the planted line itself; anything else on the page counts against the detector
        out["false_positives"] += [f"{f.relative_to(ROOT)}: {h}" for h in hits]
    return out


def findings_text(data_dir: Path) -> list[tuple[str, str]]:
    """(code, text) of every finding stored in a run's database."""
    import sqlite3

    con = sqlite3.connect(data_dir / "pramana.db")
    rows = con.execute("select code, title, message, coalesce(limitation, '') from findings").fetchall()
    con.close()
    return [(c, t) for c, *texts in rows for t in texts if t]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--worlds", type=Path, nargs="*", default=[], help="random-eval runs whose documents to read")
    ap.add_argument("--findings", type=Path, nargs="*", default=[], help="random-eval runs whose findings to read")
    ap.add_argument("--images", action="store_true", help="also OCR the photos of random worlds (slow)")
    ap.add_argument("--db", type=Path, help="a seeded pramana.db whose stored page text stands in for re-reading")
    args = ap.parse_args()
    os.environ.setdefault("PRAMANA_LLM_PROVIDERS", "")
    from pramana.pipeline.llm_extract import INJECTION

    if CACHE.exists():
        _cache.update(json.loads(CACHE.read_text(encoding="utf-8")))
    if args.db:
        cache_from_db(args.db)

    report: dict = {}
    sets = json.loads(LINES.read_text(encoding="utf-8"))
    for name, lines in sets.items():
        if isinstance(lines, list):
            report[f"lines:{name}"] = {"flagged": sum(1 for x in lines if INJECTION.search(x)), "of": len(lines),
                                       "not_flagged" if not name.startswith("benign") else "flagged_lines":
                                       [x for x in lines if bool(INJECTION.search(x)) == name.startswith("benign")]}
    fix = ROOT / "fixtures" / "out"
    seeded = sorted(p for p in fix.rglob("*") if p.suffix.lower() in (".pdf", ".jpg", ".jpeg", ".png")
                    and "trust" not in p.parts)
    report["seeded_fixtures"] = scan(seeded, {fix / "A11" / "fire_noc.pdf"})
    report["real_documents"] = scan(sorted((ROOT / "fixtures" / "real").glob("*.pdf")), set())
    for w in args.worlds:
        key = json.loads((w / "answer_key.json").read_text(encoding="utf-8"))
        planted = {w / "world" / c["app"] / "fire_noc.pdf" for c in key["conditions"]
                   if c["kind"] == "fire_variant_instruction"}
        exts = (".pdf", ".jpg") if args.images else (".pdf",)
        files = sorted(p for p in (w / "world").rglob("*") if p.suffix.lower() in exts)
        report[f"world:{w.name}"] = scan(files, planted)
    for w in args.findings:
        texts = findings_text(w / "data")
        fp = [f"{c}: {t[:160]}" for c, t in texts if INJECTION.search(t) and c != "SEC-INSTRUCTION-TEXT"]
        report[f"findings:{w.name}"] = {"texts": len(texts), "false_positives": fp}
    print(json.dumps(report, indent=1, ensure_ascii=False))
    CACHE.write_text(json.dumps(_cache), encoding="utf-8")
    out = ROOT / "var" / "instruction_lines_check.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
