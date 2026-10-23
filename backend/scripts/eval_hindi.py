"""Measure Hindi OCR on the bilingual fixture against what the generator printed.

Reports field accuracy (values the ruleset extracts from Hindi labels) and character accuracy of every
printed line that contains Devanagari, overall and on Devanagari characters alone. Optionally spot-checks
lines transcribed by hand from the real e-Gazette sample, if it was fetched.

    python scripts/eval_hindi.py
"""

import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "fixtures" / "out"
# Lines read by eye from page 1 of the e-Gazette sample (fetch_real_samples.py)
EGAZETTE_LINES = ["असाधारण", "प्राधिकार से प्रकाशित", "नई दिल्ली, सोमवार, जनवरी 6, 2025/पौष 16, 1946", "रेल मंत्रालय",
                  "[पूर्व तट रेलवे (निर्माण)]", "अधिसूचना", "भुवनेश्वर, 6 जनवरी, 2025"]


def _cer(truth: str, got: str) -> float:
    from rapidfuzz.distance import Levenshtein

    return Levenshtein.distance(truth, got) / max(len(truth), 1)


def _best(line: str, candidates: list[str]) -> str:
    from rapidfuzz import fuzz, process

    hit = process.extractOne(line, candidates, scorer=fuzz.ratio)
    return hit[0] if hit else ""


def _deva(s: str) -> str:
    return "".join(ch for ch in s if "ऀ" <= ch <= "ॿ")


def main() -> int:
    from pramana.pipeline.extract import extract_fields
    from pramana.pipeline.text import extract_pdf
    from pramana.rules.engine import active_ruleset

    m = json.loads((FIX / "manifest.json").read_text(encoding="utf-8"))
    spec = next(a["hindi_ocr"] for a in m["applications"] if a.get("hindi_ocr"))
    pages = extract_pdf((FIX / spec["document"]).read_bytes())
    print(f"page source {pages[0].source}; script handling {pages[0].ocr}")
    fields = {f.name: f for f in extract_fields(pages, active_ruleset().doc_types["occupancy_certificate"])}
    ok = 0
    for name, truth in spec["fields"].items():
        f = fields.get(name)
        got = (f.raw or "") if f else ""
        hit = got.replace(",", "") == str(truth).replace(",", "")
        ok += hit
        print(f"  field {name:20} {'ok ' if hit else 'MISS'} printed '{truth}' read '{got}' "
              f"conf {f.confidence if f else None}")
    print(f"fields: {ok}/{len(spec['fields'])} read exactly")

    ocr_lines = [unicodedata.normalize("NFC", ln.text) for p in pages for ln in p.lines]
    tot = err = dtot = derr = 0
    for line in spec["lines"]:
        line = unicodedata.normalize("NFC", line)
        got = _best(line, ocr_lines)
        c = _cer(line, got)
        tot, err = tot + len(line), err + c * len(line)
        dt, dg = _deva(line), _deva(got)
        dtot, derr = dtot + len(dt), derr + _cer(dt, dg) * len(dt)
        print(f"  CER {c:5.3f}  printed: {line}\n             read:    {got}")
    print(f"character accuracy on {len(spec['lines'])} Devanagari lines: {1 - err / tot:.3f} overall, "
          f"{1 - derr / dtot:.3f} on Devanagari characters ({dtot} characters)")

    gz = ROOT / "fixtures" / "real" / "egazette_2025_260000.pdf"
    if gz.exists():
        gp = extract_pdf(gz.read_bytes())[0]
        print(f"\ne-Gazette page 1: source {gp.source}; script handling {gp.ocr}")
        lines = [unicodedata.normalize("NFC", ln.text) for ln in gp.lines]
        for t in EGAZETTE_LINES:
            got = _best(t, lines)
            print(f"  CER {_cer(t, got):5.3f}  expected: {t}  read: {got}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
