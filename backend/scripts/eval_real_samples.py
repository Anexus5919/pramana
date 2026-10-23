"""Analyse each real public PDF from fetch_real_samples.py exactly as the Analyse page does, and print a table.

Runs the parser sandbox and offline signature validation; nothing is stored. Prints Markdown for
docs/features/analyse.md and writes the raw results to fixtures/real/results.json.

    python scripts/eval_real_samples.py
"""

import json
import logging
import sys
import time
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parent)]
for _n in ("pyhanko", "pyhanko_certvalidator", "pdfminer", "RapidOCR"):
    logging.getLogger(_n).setLevel(logging.CRITICAL)

from fetch_real_samples import OUT, SAMPLES  # noqa: E402

from pramana import sandbox  # noqa: E402
from pramana.analyse import core  # noqa: E402
from pramana.pipeline.intake import UploadRejected, validate_upload  # noqa: E402


def _anchor(sig: dict) -> str:
    a = sig["response"].get("trust_anchor") or ""
    return a.split("Common Name: ", 1)[-1].split(",", 1)[0] if a else "none"


def row(s: dict) -> dict:
    p = OUT / s["file"]
    if not p.exists():
        return {"file": s["file"], "error": "not fetched"}
    data = p.read_bytes()
    t0 = time.perf_counter()
    try:
        a = core.analyse(data, p.name, validate_upload(p.name, data), "an-eval")
    except (UploadRejected, sandbox.SandboxError) as e:
        return {"file": s["file"], "error": str(e)[:200], "seconds": round(time.perf_counter() - t0, 1)}
    signed = [x for x in a["signatures"] if x["response"].get("signer")]
    sig = signed[0] if signed else None
    return {
        "file": s["file"], "published": s["published"], "pages": a["page_count"],
        "seconds": round(time.perf_counter() - t0, 1),
        "signature": sig["status"] if sig else "no signature",
        "anchor": _anchor(sig) if sig else "n/a",
        "modification": sig["response"].get("modification_level") if sig else None,
        "time_source": sig["response"].get("time_source") if sig else None,
        "revocation_checked": sig["response"].get("revocation_checked") if sig else None,
        "revisions": a["revision_count"], "text_source": a["text"]["source"],
        "hindi_pages": a["text"]["hindi_pages"], "hindi_lines": a["text"]["hindi_lines"],
        "unreadable_pages": a["text"]["unreadable_pages"],
        "doc_type": a["doc_type"]["type"],
        "indicators": sorted({x["code"] for x in a["document"]["forensic_signals"] if x["severity"] != "info"}),
        "instruction_lines": len(a["document"].get("instruction_lines") or []),
        "detail": sig["detail"] if sig else a["signatures"][0]["detail"] if a["signatures"] else None,
        "incomplete": (a["incomplete"] or {}).get("reason"),
    }


def main() -> int:
    rows = []
    for s in SAMPLES:
        r = row(s)
        rows.append(r)
        print(json.dumps(r), file=sys.stderr)
    sandbox.shutdown()
    (OUT / "results.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print("| File | Pages | Signature | Trust anchor | Revisions | Hindi lines read | Indicators | Time |")
    print("|---|---|---|---|---|---|---|---|")
    for r in rows:
        if "error" in r:
            print(f"| {r['file']} | | could not be analysed: {r['error']} | | | | | |")
            continue
        ind = ", ".join(r["indicators"]) or "none"
        if r["incomplete"]:
            ind = f"text and forensics not completed: {r['incomplete']}"
        print(f"| {r['file']} | {r['pages']} | {r['signature']} | {r['anchor']} | {r['revisions']} | "
              f"{r['hindi_lines']} | {ind} | {r['seconds']} s |")
    return 0


if __name__ == "__main__":
    sys.exit(main())
