# Random evaluation: where the after-fixes work stopped

Written on 23 Oct 2026 when the laptop had to be shut down. Branch `feat/random-eval`.

## Done and tested

- **Seal matching** (`forensics/seals.py`, `consistency/seal_reuse.py`, `scripts/calibrate_seals.py`): matched on a 1024-bit perceptual hash, threshold 40. Calibration over 143 cities (40,755 distinct same-template pairs, 960 copies): distinct seals 50 or more apart, digital copies (JPEG to quality 50, rescaled, blurred) 30 or less; print-and-scan copies 270 or more, not matchable. The old 256-bit rule had distinct seals as close as 4 and copies up to 7. Test in `tests/test_random_eval.py`. The workspace shows the hash width (`frontend/.../SealCompare.tsx`).
- **OCR names** (`rules/expr.py`): names also compared as one string of letters and digits when that agrees 95 or more ("CharitableTrust"). Tested.
- **OCR financial year** (`pipeline/extract.py`): on OCR pages only, spaces in patterns are optional ("FinancialYear") and year ranges get look-alike digits fixed. Text layers unchanged. Tested.
- **Instruction lines** (`pipeline/llm_extract.py`, frozen at commit `8688075`): grammar-based detection. Known 5 of 5, author's held-out 5 of 5, first independent set 7 of 8 (the unaddressed "Status: pre-verified by system" line is missed), its 8 hard negatives 0 flagged. Tested.

## Not done

- **Zero-false-positive corpus check of the final detector was interrupted.** The previous detector version flagged one wrapped fire NOC line ("system, fire alarm, ... date stated") in all 24 fire NOC files and nothing in the 10 real PDFs or the 4,884 finding texts; the final version no longer flags that line, but the full corpus run did not finish.
- **Blind held-out set** (`held_out_blind`, `benign_blind` in `backend/tests/data/instruction_lines.json`) was written by a separate agent after the detector was frozen and is **not yet scored**. Score it once, without changing the detector.
- **New seeds 5505 and 6606** (N=100, fixed in `random-eval.md` before running): **neither has run.** The "After the fixes" section still has the `AFTER_RESULTS` placeholder.
- Seeded evaluation (expect 53 of 53, 0 false positives) and the full pytest suite have not been rerun since these fixes. Only the targeted tests ran.

## Commands to resume (from `backend/`)

```bash
.venv/Scripts/python scripts/make_fixtures.py
.venv/Scripts/python scripts/seed.py
.venv/Scripts/python scripts/evaluate.py                 # expect 53/53, 0 false positives (A8 seal still caught)
.venv/Scripts/python -m pytest -o addopts="" -q          # full suite
.venv/Scripts/python scripts/eval_instruction_lines.py --db ../var/pramana.db --findings ../var/random-eval/final/seed-1101 ../var/random-eval/final/seed-2202 ../var/random-eval/final/seed-3303 ../var/random-eval/final/seed-4404
.venv/Scripts/python scripts/random_eval.py --seed 5505 --n 100 --out ../var/random-eval/final/seed-5505
.venv/Scripts/python scripts/random_eval.py --seed 6606 --n 100 --out ../var/random-eval/final/seed-6606
.venv/Scripts/python scripts/random_eval.py --combine ../var/random-eval/final/seed-5505 ../var/random-eval/final/seed-6606 --out ../var/random-eval/final/combined-after
```

The instruction-line check reads the seeded database's stored page text when `--db` is given and caches the rest in `var/instruction_lines_cache.json`. The real PDFs must be in `fixtures/real` (copied from the analyse worktree, not committed). Compute used in this round so far: about 90 minutes, over the 75-minute budget, mostly OCR in two corpus-check runs.
