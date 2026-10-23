# Evaluation results

Measured on 23 Oct 2026 on a Windows 11 laptop (i5-12450HX, 16 GB RAM), CPU only, on the merged code unless a row says otherwise. The laptop was shared with other jobs, so timings are indicative, not benchmarks. Reproduce with:

```
python backend/scripts/fetch_assets.py
python backend/scripts/fetch_photo_assets.py
python backend/scripts/make_fixtures.py
python backend/scripts/seed.py
python backend/scripts/evaluate.py
python -m pytest backend/tests
python backend/scripts/eval_hindi.py
python backend/scripts/eval_ask.py
python backend/scripts/bench_sandbox.py
```

## Dataset

- 11 synthetic institutions.
- 11 applications (10 EoA, 1 increase in intake) with 83 documents. They include 1 scanned page, 1 bilingual Hindi certificate with a legacy-font text layer, 4 infrastructure photos, and 1 certificate in an unfamiliar issuer layout carrying a planted instruction line.
- 431 reference records, including one previous-year application per institution.
- 5 simulated issuer registries.
- A demo PKI with issuer and applicant certificates, and a DEMO capture CA with one campus camera certificate per institution for Content Credentials.
- The generator plants known conditions and writes the expected finding codes to `fixtures/out/manifest.json`.
- All documents are footed "SYNTHETIC TEST DOCUMENT".

Two kinds of real material are used, both downloaded against a pinned SHA-256 and never committed:
- 1 real DSC-signed Government of India e-Gazette PDF, fetched by `scripts/fetch_real_samples.py`, for India PKI validation and a Hindi OCR spot check.
- 3 openly licensed Wikimedia Commons lab photos (CC BY-SA 3.0, CC BY-SA 4.0 and CC0), fetched by `scripts/fetch_photo_assets.py`. They are resized and given synthetic EXIF data, because the synthetic lab drawings defeat the object detector. Authors, licences and file pages are in `docs/features/photos.md`.

## Results

| Metric | Result |
|---|---|
| Planted conditions detected (recall), deterministic mode | 51 / 51 = 1.00 (Wilson 95% CI 0.93 to 1.00) |
| Precision of findings against ground truth, deterministic mode | 51 / 51 = 1.00 (Wilson 95% CI 0.93 to 1.00); 0 false positives |
| False alarms on the clean application | 0. A1 carries two expected low notes: its photo was later reused by A10, and its seal image later appears on A8's certificate. |
| Field extraction by deterministic patterns | 323 / 328; the 5 misses are all in A11's unfamiliar issuer layout, which goes to manual review without a model |
| Verification outcomes recorded | 38 issuer-registry verified, 19 issuer signatures verified, 7 signed QR verified, 1 Content Credentials verified (DEMO); the expected mismatch, expired, pending, unavailable and manual-review cases, and 1 Content Credentials mismatch (A7) |
| Real India PKI signature | e-Gazette PDF verified against CCA India 2022, offline, 0.06 s (measured before the sprint) |
| Validation time per application (after processing) | mean 1.09 s, max 1.24 s |
| Document processing during seeding (83 documents through the parser sandbox, first run including the OCR, Devanagari and detector model loads) | about 79 s total |
| Replay of a run | identical input and report digests |
| Automated tests | 73 passed on the merged code (SQLite), run with the model disabled so they are deterministic. On the platform branch the full suite at that point, 35 tests, also passed on PostgreSQL 16.2 from portable binaries. |

### With the fine-tuned local model enabled

The demo setting turns on the fine-tuned extractor (`PRAMANA_LLM_PROVIDERS=ollama`). In that mode the ground truth for A11 changes: the model is expected to read its fields, so the only planted condition left there is the instruction line.

- Every planted condition is found.
- The fine-tuned model does not read A11's certificate number, a format unlike its training data (a known gap, see below). The issuer lookup therefore goes to manual review (`VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED`), which the evaluator counts as one unexpected item.
- The model ignores the planted instruction, and grounding would reject its value anyway.

So in model mode the result is every planted condition found with one unexpected manual-review item, not a clean sheet.

## Fine-tuned extraction model

Fields the patterns cannot read can be proposed by a model and are kept only when found on the page.

**Training.**
- Model: Qwen3-1.7B (Apache-2.0), QLoRA r16 with transformers, PEFT and bitsandbytes.
- Data: 2,400 synthetic prompts from `backend/training/make_dataset.py`. They cover label aliases in English and Hindi, sentence and key-value layouts, distractor dates, OCR-style noise, and planted instructions the answer must ignore.
- Run: 1 epoch on a free Kaggle T4 in 22.7 minutes. Final eval loss was 0.0004.
- Packaging: merged and converted to a Q8_0 GGUF (1.8 GB) for Ollama.
- Evaluation: on 200 held-out documents whose label wordings and layouts never appear in training (`backend/training/eval_extractor.py`).

| Model | field_exact | value_exact | null_correct | grounded | injections followed | median latency |
|---|---|---|---|---|---|---|
| General Qwen3 4B (Q4_K_M, local) | 0.825 | 0.864 | 0.542 | 0.977 | 9/30 | 1.71 s |
| Fine-tuned Qwen3 1.7B (Q8_0, local, ours) | 0.921 | 0.911 | 0.990 | 0.914 | 1/30 | 1.06 s |
| GPT-OSS 20B via Groq (cloud) | 0.891 | 0.931 | 0.594 | 0.993 | 3/30 | 4.95 s |

- **field_exact:** all fields correct, including empty ones. **value_exact:** values copied exactly. **null_correct:** fields that should be empty returned empty. **grounded:** proposed values found on the page.
- Local latencies are on the RTX 3050 laptop GPU; p90 was 3.15 s for the general 4B and 1.52 s for the fine-tuned model. Groq's latency (p90 7.01 s) includes network time and waits from free-tier rate limits.
- The cloud model copies values slightly more exactly and is better grounded, but fills fields that should be empty (0.594) and followed 3 planted instructions. The fine-tuned model is the best at leaving fields empty and at ignoring instructions, and it keeps document text on the machine.

By document type, field_exact for the general 4B, the fine-tuned 1.7B and GPT-OSS 20B:

| Document type | General 4B | Fine-tuned 1.7B | GPT-OSS 20B |
|---|---|---|---|
| Fire NOC | 0.86 | 0.95 | 0.91 |
| Occupancy certificate | 0.84 | 0.99 | 0.85 |
| Affidavit 2 | 0.79 | 0.99 | 0.93 |
| TER receipt | 0.79 | 0.83 | 0.87 |
| Audited accounts | 0.88 | 0.75 | 0.91 |

The fine-tuned model is weakest on audited accounts, which is the next thing to train.

**Gemini.** The provider works: verified live, it returned every field of a held-out example correctly. The free tier allows only 20 requests per day for the current Flash model, so the 200-example benchmark was not possible, and Gemini is not in the table. `gemini-2.5-flash` is closed to new API keys, so the default is now `gemini-flash-latest` with low thinking.

**On A11, the unfamiliar layout:**
- **General 4B:** it recovered 4 of 5 fields, and its 5th proposal was the planted "valid until 31/12/2099". Grounding rejected that value because it appears only in the flagged instruction line.
- **Fine-tuned model:** it read the validity date correctly (13/03/2028) and ignored the instruction. It returned empty for the certificate number, a format unlike its training data, so the issuer lookup goes to manual review.

Grounding is why a model mistake becomes a manual review rather than a wrong fact. All model numbers are on synthetic documents.

## Detection by condition

One row per finding code with planted instances, deterministic mode:

| Condition | Instances found / planted |
|---|---|
| Missing structural certificate (building over 30 years) | 1 / 1 |
| Expired fire certificate (rule, issuer registry, signed QR) | 2 / 2, 2 / 2, 2 / 2 |
| Issuer signature broken after signing | 1 / 1 |
| Field overwritten in a later revision; revision diff; overlay; white box | 1 / 1 each |
| Value drawn in a font no other value uses (A7) | 1 / 1 |
| Seal image of another issuer (later submission, A8); earlier owner note (A1) | 1 / 1 each |
| Signed QR disagrees with the printed text | 1 / 1 |
| Issuer registry mismatch or unknown number | 2 / 2 |
| Source unavailable; verification pending | 1 / 1 each |
| Shared certificate number; near-duplicate details | 2 / 2 each |
| Faculty listed by two institutions; faculty registered elsewhere | 2 / 2; 1 / 1 |
| Reused photo (later submitter); earlier owner note; geotag far from campus | 1 / 1 each |
| Photo modified after its Content Credentials were signed (A7) | 1 / 1 |
| Fewer visible workstations than declared, low model indicator (A4) | 1 / 1 |
| Intake above record; EoA above approved intake; NBA claim unsupported | 1 / 1 each |
| Area beyond the occupancy certificate; map point off-site | 1 / 1 each |
| Affidavit for another application; affidavit unsigned | 1 / 1 each |
| Faculty-student ratio short; core-branch condition unmet | 2 / 2; 1 / 1 |
| Year over year: certificate number back with a new validity (A2); intake jump (A4); faculty turnover (A8); land area decreased (A10) | 1 / 1 each |
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

The clean documents of all ten applications also act as a benign set for the forensic checks:
- No overlay, revision or metadata finding was raised on any of them after rotated seal glyphs were excluded. That exclusion fixed a false positive found during development.
- The shared emblem printed on every fire and municipal certificate, bold labels, rotated seal text and QR captions raise no font or seal findings.
- Ordinary year-over-year changes (a few faculty moving, a bandwidth upgrade, a fire NOC renewed under a new number, a lab added) raise no indicator; A1 shows only such changes.
- Photos without Content Credentials raise nothing, because most cameras do not add them yet.

## Feature measurements

From the feature documents in `docs/features/`, each measured on the build laptop while it was shared with other work.

| Feature | Measured | Caveat |
|---|---|---|
| Hindi OCR (`scripts/eval_hindi.py`) | 6 of 6 occupancy certificate fields read exactly from Hindi labels, each at confidence 0.99 or more; 99.0% of characters on the 13 printed lines that contain Devanagari (98.8% of the 406 Devanagari characters alone); 7 of 7 Hindi lines on the real e-Gazette page read character for character, checked by eye | Synthetic, clean rendering at 200 dpi: an upper bound, not a phone photo or a fax. The errors are dropped half-letters in conjuncts and one vowel sign. |
| Photo detector (YOLOX-M, 1600 x 1200, 4 threads) | median 0.32 to 0.41 s per photo over 5 runs per photo; model load including the SHA-256 check about 0.6 to 0.7 s, once per process | Rose to several seconds while other heavy jobs shared the CPU. Workstations counted: A1 6 (declared 15), A4 11 (declared 60), A7 9, A10 5 (A1's photo at 75% scale). |
| Content Credentials read and validate | 2 to 13 ms per photo | Two signed photos in the dataset. |
| Ask why (`scripts/eval_ask.py`, 27 questions across all 11 applications, local `qwen3:4b-instruct-2507` Q4_K_M) | 27 sentences proposed, 100% cite valid evidence, 24 kept after the post-check (88.9%); 22 of 27 answers cite the evidence a reviewer would point to; latency median 2.1 s (mean 2.1, p90 2.7, max 5.2) with the model loaded | All three dropped sentences were real errors the check caught. The first question after Ollama unloads the model pays about 10 s. Template answers alone: 87 sentences, all kept, 24 of 27 cite expected evidence. A 27-question set written by the team. |
| Evidence pack (A7: 12 findings, 8 documents) | build about 2 to 3.5 s, of which the report is about 1.8 s; ZIP about 0.9 MB without originals | The checker passes on packs for A1, A7 and A10; appending to `report.pdf` or editing one audit event makes it fail (tested). |
| Deficiency letter | draft render about 7 ms; final A3 letter one page, about 3.8 KB | One-item letter. |
| Parser sandbox (`scripts/bench_sandbox.py`, A7's 7 documents plus the scanned A2 accounts) | worker start-up 0.9 to 1.1 s, once per worker; a round trip carrying 1 MB 1.3 to 1.6 ms; total in-process against sandboxed 7.99 s / 7.88 s and 12.81 s / 11.79 s in two runs; worker peak 688 to 689 MB with the OCR model loaded, about 45 MB idle | The overhead disappears in the noise of a shared laptop. Measured on the platform branch. |
| Background runs | the request returns in about 0.2 s; Run validation on A7 1.5 to 2.5 s, of which about 1 s is the simulated issuers' deliberate latency; re-read and validate A7 8 to 15 s; no regression against the base over 8 interleaved runs each | Measured on the platform branch. |
| Key rotation | 82 data keys rewrapped; document bytes identical before and after; all decrypt after the old key is retired | Platform branch seed. |
| Online revocation (optional) | e-Gazette sample: 3 OCSP responses in about 3.5 s, not revoked | Needs network; off by default. |

## Limitations

- **Upper bound, not a field accuracy.** The same team wrote the generator and the checks, and the extraction patterns know the templates. Real documents will vary in layout, language and scan quality. Expect lower extraction rates, and expect manual review where patterns fail.
- **Tiny sample.** 51 planted instances cannot support production-level claims. The confidence intervals are wide by construction.
- **OCR on real scans not measured.** There is one scanned page. Hindi was measured on one clean synthetic certificate and 7 real e-Gazette lines; phone photos, stamps over text and faxes were not measured. The OCR research recorded a character error rate of 0.118 on a noisy synthetic Hindi title, and published work warns that synthetic Hindi overstates accuracy.
- **Simulated issuers.** Registry results and watch results show the workflow, not real-world coverage. Content Credentials trust only a DEMO capture CA.
- **Photo indicators on four photos.** The room indicator ran on three source photos (A10's is A1's, recompressed). COCO has no desk, monitor or bench-desk class, partitions are often read as chairs, and one photo rarely shows a whole room.
- **Model mode is not clean.** With the fine-tuned extractor on, A11's certificate number is not read and goes to manual review. The model is weakest on audited accounts. Gemini was not benchmarked.
- **Ask why.** 27 questions on synthetic data; the post-check is lexical and cannot catch a paraphrase that misstates a relationship using only words from the cited items.
- **Mixed measurement points.** Most numbers are from the merged code. The sandbox benchmark, background-run timings, key rotation and the PostgreSQL run are from the platform branch before the other features were merged; the India PKI timing is from before the sprint.
- **External state.** Cross-application and seal findings depend on which other applications exist at run time. Replay reproduces a run only while that state is unchanged.
