"""Check every quote in rulesets/regulatory_basis.yaml against the official PDFs it cites.

The PDFs are not in git. Point the script at the folder they were saved to; each source is found there by its
SHA-256, so file names do not matter. A quote passes when its text appears on the page it cites, ignoring
whitespace, line breaks and typographic quote marks, and nothing else.

    python scripts/verify_regulatory_basis.py <folder with the PDFs> [--markdown] [--ruleset]

--markdown prints the verification log table used in docs/features/regulatory-basis.md. --ruleset also checks
the handbook quotes the rules themselves cite, as information. Exits 1 when a mapping quote does not verify.
"""

import argparse
import hashlib
import re
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pypdfium2 as pdfium  # noqa: E402
import yaml  # noqa: E402

from pramana.config import get_settings  # noqa: E402
from pramana.rules.basis import BASIS_FILE, load_basis  # noqa: E402

# Typographic quotes, dashes and the soft hyphen PDFium reports at a line break fold to plain ASCII
FOLD = {**dict.fromkeys(map(chr, (0x201C, 0x201D)), '"'), **dict.fromkeys(map(chr, (0x2018, 0x2019)), "'"),
        **dict.fromkeys(map(chr, (0x2010, 0x2011, 0x2013, 0x2014, 0x00AD, 0xFFFE)), "-")}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = "".join(FOLD.get(c, c) for c in s)
    return re.sub(r"\s+", "", s)


def by_hash(folder: Path) -> dict[str, Path]:
    # Deeper copies first, so a file at the top of the folder wins over an identical one in a subfolder
    files = sorted(folder.rglob("*.pdf"), key=lambda p: -len(p.parts))
    return {hashlib.sha256(p.read_bytes()).hexdigest(): p for p in files}


def pages(path: Path) -> list[str]:
    pdf = pdfium.PdfDocument(str(path))
    return [norm(pdf[i].get_textpage().get_text_range()) for i in range(len(pdf))]


def found_on(text: list[str], quote: str) -> list[int]:
    q = norm(quote)
    return [i + 1 for i, t in enumerate(text) if q in t]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder", type=Path)
    ap.add_argument("--markdown", action="store_true")
    ap.add_argument("--ruleset", action="store_true")
    a = ap.parse_args()

    bm = load_basis(get_settings().rulesets_dir / BASIS_FILE)
    files = by_hash(a.folder)
    texts: dict[str, list[str]] = {}
    for s in bm.sources:
        if s.sha256 not in files:
            print(f"MISSING  {s.id}: no PDF with SHA-256 {s.sha256} under {a.folder}")
            return 1
        texts[s.id] = pages(files[s.sha256])
        print(f"source   {s.id}: {files[s.sha256].name} ({len(texts[s.id])} pages)")

    failed = 0
    rows = []
    for pid, p in bm.provisions.items():
        hits = found_on(texts[p.source], p.quote)
        ok = p.page in hits
        failed += not ok
        rows.append((pid, p, ok, hits))
        if not ok:
            print(f"FAIL     {pid}: quote not on page {p.page} (found on {hits or 'no page'})")
    print(f"\n{len(rows) - failed} of {len(rows)} provisions verified on their cited page")

    if a.markdown:
        print("\n| Provision | Instrument | Number | Page | Verbatim quote |")
        print("|---|---|---|---|---|")
        for pid, p, _ok, _ in rows:
            q = p.quote.replace("|", "\\|")
            print(f"| `{pid}` | {bm.source(p.source).short} | {p.number} | {p.page} | \"{q}\" |")

    if a.ruleset:
        rs = yaml.safe_load((get_settings().rulesets_dir / "aicte-aph-2024-27.yaml").read_text(encoding="utf-8"))
        print("\nHandbook quotes cited by the rules (information only):")
        for r in rs["rules"]:
            src = r.get("source") or {}
            if src.get("doc") != "APH":
                continue
            # A rule quote may join fragments with '...'; each fragment is checked
            parts = [x for x in str(src.get("quote", "")).split("...") if x.strip()]
            spots = [found_on(texts["APH"], x) for x in parts]
            ok = all(src.get("page") in s for s in spots)
            print(f"  {'ok  ' if ok else 'CHECK'} {r['id']}: page {src.get('page')}, fragments found on {spots}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
