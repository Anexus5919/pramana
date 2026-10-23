"""Measure what the parser sandbox costs: the same parsing in-process and in the worker pool.

    python scripts/bench_sandbox.py              # documents of A7 and the scanned accounts of A2
    python scripts/bench_sandbox.py --all        # every fixture document (slow: OCR runs twice)

Prints worker start-up time, then per operation the in-process and sandboxed totals and the overhead.
"""

import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("PRAMANA_DATA_DIR", tempfile.mkdtemp(prefix="pramana-bench-"))
FIX = Path(__file__).resolve().parents[2] / "fixtures" / "out"


def main(all_docs: bool = False) -> None:
    from pramana import sandbox
    from pramana.forensics import fingerprints, pdf_struct
    from pramana.pipeline.text import extract_image, extract_pdf
    from pramana.sandbox_worker import op_qr

    files = sorted(FIX.rglob("*.pdf")) + sorted(FIX.rglob("*.jpg")) if all_docs else \
        sorted((FIX / "A7").glob("*.pdf")) + [FIX / "A2" / "audited_accounts.pdf"]
    files = [f for f in files if "rectification" not in f.parts]
    t0 = time.perf_counter()
    sandbox.call("selftest_echo", data=b"x")
    print(f"worker start-up: {(time.perf_counter() - t0) * 1000:.0f} ms")
    sandbox.call("selftest_echo", data=b"x" * 1_000_000)
    t0 = time.perf_counter()
    for _ in range(20):
        sandbox.call("selftest_echo", data=b"x" * 1_000_000)
    print(f"round trip with 1 MB of file bytes: {(time.perf_counter() - t0) / 20 * 1000:.1f} ms")

    # Load the OCR model on both sides first, so neither total includes the one-time model load
    scan = (FIX / "A2" / "audited_accounts.pdf").read_bytes()
    t0 = time.perf_counter()
    extract_pdf(scan)
    t1 = time.perf_counter()
    sandbox.read_pages(scan, "application/pdf")
    print(f"first OCR document (includes model load): in-process {(t1 - t0) * 1000:.0f} ms, "
          f"sandboxed {(time.perf_counter() - t1) * 1000:.0f} ms")

    totals = {k: [0.0, 0.0] for k in ("pages", "fingerprints", "forensics", "qr")}
    for f in files:
        data = f.read_bytes()
        mime = "application/pdf" if f.suffix == ".pdf" else "image/jpeg"
        pages_n = 1
        for mode in (0, 1):
            t = time.perf_counter()
            pages = (extract_pdf(data) if mime == "application/pdf" else extract_image(data)) if mode == 0 else \
                sandbox.read_pages(data, mime)
            totals["pages"][mode] += time.perf_counter() - t
            pages_n = len(pages)
            text = "\n".join(p.text for p in pages)
            t = time.perf_counter()
            fingerprints.compute(data, mime, text) if mode == 0 else sandbox.fingerprints(data, mime, text)
            totals["fingerprints"][mode] += time.perf_counter() - t
            if mime == "application/pdf":
                t = time.perf_counter()
                pdf_struct.analyse(data) if mode == 0 else sandbox.forensics(data, mime, None, None)
                totals["forensics"][mode] += time.perf_counter() - t
            t = time.perf_counter()
            op_qr(data, mime, pages_n) if mode == 0 else sandbox.qr_tokens(data, mime, pages_n)
            totals["qr"][mode] += time.perf_counter() - t
    print(f"\n{len(files)} documents")
    print(f"{'operation':<14}{'in-process':>12}{'sandboxed':>12}{'overhead':>12}")
    a = b = 0.0
    for k, (x, y) in totals.items():
        a, b = a + x, b + y
        print(f"{k:<14}{x * 1000:>10.0f}ms{y * 1000:>10.0f}ms{(y - x) * 1000:>10.0f}ms")
    print(f"{'total':<14}{a * 1000:>10.0f}ms{b * 1000:>10.0f}ms{(b - a) / a * 100:>11.1f}%")
    print(sandbox.status()["idle_workers"])
    sandbox.shutdown()


if __name__ == "__main__":
    main(all_docs="--all" in sys.argv)
