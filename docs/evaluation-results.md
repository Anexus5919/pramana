# Evaluation results

Measured on 23 Oct 2026 on a Windows 11 laptop (i5-12450HX, 16 GB RAM), CPU only. Reproduce with:

```
python backend/scripts/make_fixtures.py
python backend/scripts/seed.py
python backend/scripts/evaluate.py
python -m pytest backend/tests
```

## Dataset

- 11 synthetic institutions.
- 11 applications (10 EoA, 1 increase in intake) with 81 documents, including 1 scanned page, 2 photos and 1 certificate in an unfamiliar issuer layout carrying a planted instruction line.
- 420 reference records.
- 5 simulated issuer registries.
- A demo PKI with issuer and applicant certificates.
- The generator plants known conditions and writes the expected finding codes to `fixtures/out/manifest.json`.
- All documents are footed "SYNTHETIC TEST DOCUMENT".

Separately, one real DSC-signed Government of India e-Gazette PDF is fetched by `scripts/fetch_real_samples.py`. It is used for India PKI validation.

## Results

| Metric | Result |
|---|---|
| Planted conditions detected (recall), deterministic mode | 42 / 42 = 1.00 (Wilson 95% CI 0.92 to 1.00) |
| Precision of findings against ground truth, deterministic mode | 42 / 42 = 1.00 (Wilson 95% CI 0.92 to 1.00) |
| False alarms on the clean application | 0 (one expected low note: its photo was later reused by A10) |
| Field extraction by deterministic patterns | 323 / 328; the 5 misses are all in A11's unfamiliar issuer layout, which goes to manual review without a model |
| Verification outcomes recorded | 35 issuer-registry verified, 17 issuer signatures verified, 6 signed QR verified; the expected mismatch, expired, pending and unavailable cases |
| Real India PKI signature | e-Gazette PDF verified against CCA India 2022, offline, 0.06 s |
| Validation time per application (after processing) | mean 1.07 s, max 1.23 s |
| Document processing (74 documents, first run including OCR model load) | about 42 s total |
| Replay of a run | identical input and report digests |
| Automated tests | 22 passed (unit and end to end), run with the model disabled so they are deterministic |

## Fine-tuned extraction model

Fields the patterns cannot read can be proposed by a local model and are kept only when found on the page.

**Training.**
- Model: Qwen3-1.7B (Apache-2.0), QLoRA r16 with transformers, PEFT and bitsandbytes.
- Data: 2,400 synthetic prompts from `backend/training/make_dataset.py`. They cover label aliases in English and Hindi, sentence and key-value layouts, distractor dates, OCR-style noise, and planted instructions the answer must ignore.
- Run: 1 epoch on a free Kaggle T4 in 22.7 minutes. Final eval loss was 0.0004.
- Packaging: merged and converted to a Q8_0 GGUF (1.8 GB) for Ollama.
- Evaluation: on 200 held-out documents whose label wordings and layouts never appear in training (`backend/training/eval_extractor.py`).

| Metric | General Qwen3 4B (Q4_K_M) | Fine-tuned Qwen3 1.7B (Q8_0) |
|---|---|---|
| All fields correct, including empty ones | 0.825 | 0.921 |
| Values copied exactly | 0.864 | 0.911 |
| Empty fields correctly returned empty | 0.542 | 0.990 |
| Proposed values found on the page (grounding) | 0.977 | 0.914 |
| Planted instructions followed | 9 of 30 | 1 of 30 |
| Median and p90 latency per document (RTX 3050 laptop) | 1.71 s, 3.15 s | 1.06 s, 1.52 s |

By document type, the fine-tuned model scores:
- **Better** on fire NOCs (0.95 against 0.86), occupancy certificates (0.99 against 0.84) and affidavits (0.99 against 0.79);
- **Similar** on TER receipts (0.83 against 0.79);
- **Worse** on audited accounts (0.75 against 0.88), which is the next thing to train.

**On A11, the unfamiliar layout:**
- **General 4B:** it recovered 4 of 5 fields, and its 5th proposal was the planted "valid until 31/12/2099". Grounding rejected that value because it appears only in the flagged instruction line.
- **Fine-tuned model:** it read the validity date correctly (13/03/2028) and ignored the instruction. It returned empty for the certificate number, a format unlike its training data, so the issuer lookup goes to manual review.

Grounding is why a model mistake becomes a manual review rather than a wrong fact. All model numbers are on synthetic documents.

Detection by condition, one row per finding code with planted instances:

| Condition | Instances found / planted |
|---|---|
| Missing structural certificate (building over 30 years) | 1 / 1 |
| Expired fire certificate (rule, issuer registry, signed QR) | 2 / 2, 2 / 2, 2 / 2 |
| Issuer signature broken after signing | 1 / 1 |
| Field overwritten in a later revision; revision diff; overlay; white box | 1 / 1 each |
| Signed QR disagrees with the printed text | 1 / 1 |
| Issuer registry mismatch or unknown number | 2 / 2 |
| Source unavailable; verification pending | 1 / 1 each |
| Shared certificate number; near-duplicate details | 2 / 2 each |
| Faculty listed by two institutions; faculty registered elsewhere | 2 / 2; 1 / 1 |
| Reused photo (later submitter); earlier owner note; geotag far from campus | 1 / 1 each |
| Intake above record; EoA above approved intake; NBA claim unsupported | 1 / 1 each |
| Area beyond the occupancy certificate; map point off-site | 1 / 1 each |
| Affidavit for another application; affidavit unsigned | 1 / 1 each |
| Faculty-student ratio short; core-branch condition unmet | 2 / 2; 1 / 1 |
| Instruction text aimed at automated readers (A11) | 1 / 1 |
| Unreadable fields in an unfamiliar layout routed to manual review, without a model (A11) | 4 / 4 |

## Controls: benign transformations and expected misses

| Control | Signals (medium or high) | Signature | As expected |
|---|---|---|---|
| Linearised re-save of an unsigned PDF | none | n/a | yes |
| Recompressed re-save of an unsigned PDF | none | n/a | yes |
| Metadata-only incremental update | none | n/a | yes |
| Issuer-signed PDF, untouched | none | verified | yes |
| Issuer-signed PDF re-saved by a tool (no content change) | none | mismatch_detected | yes, a known false-alarm source |
| Tampered PDF flattened into one revision | overlay, white box | mismatch_detected | yes |
| Certificate retyped from scratch with an altered date | none possible | n/a | expected miss at file level; caught only by registry, links or a reviewer |

The clean documents of all ten applications also act as a benign set for the forensic checks. No overlay, revision or metadata finding was raised on any of them after rotated seal glyphs were excluded. That exclusion fixed a false positive found during development.

## Limitations

- **Upper bound, not a field accuracy.** The same team wrote the generator and the checks, and the extraction patterns know the templates. Real documents will vary in layout, language and scan quality. Expect lower extraction rates, and expect manual review where patterns fail.
- **Tiny sample.** 37 planted instances cannot support production-level claims. The confidence intervals are wide by construction.
- **One scanned page.** OCR accuracy on real phone photos, stamps over text and Hindi was not measured. The OCR research recorded a character error rate of 0.118 on a noisy synthetic Hindi title, and published work warns that synthetic Hindi overstates accuracy.
- **Simulated issuers.** Registry results show the workflow, not real-world coverage.
- **External state.** Cross-application findings depend on which other applications exist at run time. Replay reproduces a run only while that state is unchanged.
