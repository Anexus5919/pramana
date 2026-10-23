"""Download real, publicly available Government of India PDFs to test Pramana on documents it did not make.

Nine DSC-signed e-Gazette notifications of different years, parts and ministries (one of them an AICTE
notification), and one unsigned AICTE Extension of Approval letter as a control. Each file is fetched from
where it is published and checked against a pinned SHA-256. They are used for testing only and are not
redistributed: they land in the gitignored fixtures/real, with a manifest of where each came from.

    python scripts/fetch_real_samples.py
    python scripts/eval_real_samples.py     # analyse each one and print the results table
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

EGAZETTE = "Government of India Press, Directorate of Printing (e-Gazette, egazette.gov.in)"
SAMPLES = [
    {"file": "egazette_2025_260000.pdf", "url": "https://egazette.gov.in/WriteReadData/2025/260000.pdf",
     "sha256": "c64d090c960d3a5a41dd8b6b277c1c0f240ccb76c825cf2e61da063d37af0e25", "publisher": EGAZETTE,
     "published": "2025-01-06", "what": "Extraordinary, Part II Section 3(ii): Ministry of Railways notification",
     "signed": True},
    {"file": "egazette_2020_220000.pdf", "url": "https://egazette.gov.in/WriteReadData/2020/220000.pdf",
     "sha256": "dc3024766d1b214df632b19bb831eb47c2879a7669c23d66e796475f9632edec", "publisher": EGAZETTE,
     "published": "2020-06-18", "what": "Extraordinary, Part II Section 3(ii): Ministry of Commerce and Industry "
                                        "notification on export policy", "signed": True},
    {"file": "egazette_2022_235000.pdf", "url": "https://egazette.gov.in/WriteReadData/2022/235000.pdf",
     "sha256": "93c88523a78ce141e3877c4172bf848a4daaebd264c278173e93e079e4e6a785", "publisher": EGAZETTE,
     "published": "2022-04-09", "what": "Weekly, Part I Section 2: appointments and promotions of government "
                                        "officers, bilingual with a legacy-font Hindi text layer", "signed": True},
    {"file": "egazette_2022_240111.pdf", "url": "https://egazette.gov.in/WriteReadData/2022/240111.pdf",
     "sha256": "1f0908dd0719b2ba4ec6d4422fba1bbf18213697e056b441da4afb876c4ae266", "publisher": EGAZETTE,
     "published": "2022-11-07", "what": "Extraordinary, Part III Section 4: All India Council for Technical "
                                        "Education notification (pay and qualifications regulation amendment)",
     "signed": True},
    {"file": "egazette_2023_242000.pdf", "url": "https://egazette.gov.in/WriteReadData/2023/242000.pdf",
     "sha256": "06d9ffd76b0ef89c39368564665b7590b515f1c216fc01ae7b52ac143eb1f14a", "publisher": EGAZETTE,
     "published": "2023-01-16", "what": "Extraordinary, Part II Section 3(ii): Ministry of Railways notification "
                                        "(Mumbai edition)", "signed": True},
    {"file": "egazette_2023_245000.pdf", "url": "https://egazette.gov.in/WriteReadData/2023/245000.pdf",
     "sha256": "094182046610a3e9cd11386e69d845139330c8ae0cef3e6b5bcab50b1b3b92ea", "publisher": EGAZETTE,
     "published": "2023-04-05", "what": "Extraordinary, Part II Section 3(ii): notification with a land "
                                        "schedule table", "signed": True},
    {"file": "egazette_2024_255000.pdf", "url": "https://egazette.gov.in/WriteReadData/2024/255000.pdf",
     "sha256": "8966ba4ef993af493e41686aa9f2049756d435d33879140fa328a37873c3e28a", "publisher": EGAZETTE,
     "published": "2024-06-27", "what": "Extraordinary, Part II Section 3(ii): Ministry of Petroleum and Natural "
                                        "Gas notification (pipeline land)", "signed": True},
    {"file": "egazette_2025_262500.pdf", "url": "https://egazette.gov.in/WriteReadData/2025/262500.pdf",
     "sha256": "f435bbaeb22606ed23b2d8b78c23e670f1f81da62943390f4870568d00a4e481", "publisher": EGAZETTE,
     "published": "2025-04-17", "what": "Extraordinary, Part II Section 3(ii): Ministry of Finance income-tax "
                                        "notification", "signed": True},
    {"file": "egazette_2026_270000.pdf", "url": "https://egazette.gov.in/WriteReadData/2026/270000.pdf",
     "sha256": "a80f1941c2d9f03a0d28480dfd8c40b42a8e965ead303eaae2bad17e9296320c", "publisher": EGAZETTE,
     "published": "2026-02-06", "what": "Extraordinary, Part II Section 3(ii): notification", "signed": True},
    {"file": "aicte_eoa_2025_26_control.pdf",
     "url": "https://din.cusat.ac.in/uploads/downloads/EOA%20Report%202025-26-2_1743096371.PDF",
     "sha256": "77663d8049e708f40b3c65721f0160a7bff15993367ac09ae59d824e7ccc7233",
     "publisher": "All India Council for Technical Education (copy published by CUSAT)",
     "published": "2025-03-21", "what": "Control: AICTE Extension of Approval letter 2025-26, computer generated "
                                        "and carrying no digital signature", "signed": False},
]
OUT = Path(__file__).resolve().parents[2] / "fixtures" / "real"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failed = 0
    for s in SAMPLES:
        dest = OUT / s["file"]
        if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest() == s["sha256"]:
            print(f"ok (cached) {dest.name}")
            continue
        req = urllib.request.Request(s["url"], headers={"User-Agent": "Pramana-prototype/0.3"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
        except OSError as e:
            print(f"could not fetch {s['url']}: {e}", file=sys.stderr)
            failed += 1
            continue
        got = hashlib.sha256(data).hexdigest()
        if got != s["sha256"]:
            print(f"hash mismatch for {s['url']}: {got}", file=sys.stderr)
            failed += 1
            continue
        dest.write_bytes(data)
        print(f"ok {dest.name}")
    (OUT / "manifest.json").write_text(json.dumps(
        {"note": "Public documents fetched for testing only; not redistributed with Pramana.", "samples": SAMPLES},
        indent=2), encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
