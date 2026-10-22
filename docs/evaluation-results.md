# Evaluation results

Measured on 23 Oct 2026 on a Windows 11 laptop (i5-12450HX, 16 GB RAM), CPU only. Reproduce with:

```
python backend/scripts/make_fixtures.py
python backend/scripts/seed.py
python backend/scripts/evaluate.py
python -m pytest backend/tests
```

## Dataset

- 10 synthetic institutions.
- 10 applications (9 EoA, 1 increase in intake) with 74 documents, including 1 scanned page and 2 photos.
- 382 reference records.
- 5 simulated issuer registries.
- A demo PKI with issuer and applicant certificates.
- The generator plants known conditions and writes the expected finding codes to `fixtures/out/manifest.json`.
- All documents are footed "SYNTHETIC TEST DOCUMENT".

Separately, one real DSC-signed Government of India e-Gazette PDF is fetched by `scripts/fetch_real_samples.py`. It is used for India PKI validation.

## Results

| Metric | Result |
|---|---|
| Planted conditions detected (recall) | 37 / 37 = 1.00 (Wilson 95% CI 0.91 to 1.00) |
| Precision of findings against ground truth | 37 / 37 = 1.00 (Wilson 95% CI 0.91 to 1.00) |
| False alarms on the clean application | 0 (one expected low note: its photo was later reused by A10) |
| Field extraction (fields printed by the generator) | 299 / 299 extracted, including the scanned accounts via OCR |
| Verification outcomes recorded | 35 issuer-registry verified, 17 issuer signatures verified, 6 signed QR verified; the expected mismatch, expired, pending and unavailable cases |
| Real India PKI signature | e-Gazette PDF verified against CCA India 2022, offline, 0.06 s |
| Validation time per application (after processing) | mean 1.07 s, max 1.23 s |
| Document processing (74 documents, first run including OCR model load) | about 42 s total |
| Replay of a run | identical input and report digests |
| Automated tests | 22 passed (unit and end to end) |

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
