# Random evaluation, seed 7707, 30 applications

Generated 2026-10-23T17:32:41+00:00. Seeds: 7707. Applications: 30 (9 clean). Planted conditions: 33. Expected (application, finding) pairs: 70. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 70/70 = 100.0% (95% CI 94.8 to 100.0) |
| Precision over pairs that fired | 70/70 = 100.0% (95% CI 94.8 to 100.0) |
| Conditions with every expected finding | 33/33 = 100.0% (95% CI 89.6 to 100.0) |
| Clean applications with any false alarm | 0 of 9 |
| False-alarm codes per clean application | 0.0 |
| Failed validation runs | 0 |

## Time

Generation 56.6 s, seeding 40.7 s, document processing 461.3 s (232 documents, 1.988 s each), validation 44.4 s, wall clock 607.8 s. Per application (processing plus validation): mean 16.85 s, median 15.61 s, p90 27.1 s, max 31.03 s.

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_wrong_year | 1 | 1 | 0 | 0 | 1/1 | - |
| admin_area_short | 1 | 1 | 0 | 0 | 1/1 | - |
| affidavit_other_app | 1 | 1 | 0 | 0 | 1/1 | - |
| affidavit_unsigned | 1 | 1 | 0 | 0 | 1/1 | - |
| bandwidth_short | 3 | 3 | 0 | 0 | 3/3 | - |
| cert_lapses_in_session | 4 | 4 | 0 | 0 | 4/4 | - |
| core_branches_unmet | 2 | 2 | 0 | 0 | 2/2 | - |
| eoa_seat_increase | 1 | 1 | 0 | 0 | 2/2 | - |
| faculty_shared | 1 | 1 | 0 | 0 | 3/3 | - |
| faculty_short | 1 | 1 | 0 | 0 | 1/1 | - |
| faculty_turnover | 2 | 2 | 0 | 0 | 2/2 | - |
| fire_copied | 2 | 2 | 0 | 0 | 14/14 | - |
| fire_overwritten_other_font | 1 | 1 | 0 | 0 | 9/9 | - |
| fire_overwritten_same_font | 1 | 1 | 0 | 0 | 8/8 | - |
| fire_qr_mismatch | 1 | 1 | 0 | 0 | 3/3 | - |
| fire_variant_layout | 1 | 1 | 0 | 0 | 4/4 | - |
| nba_unsupported | 1 | 1 | 0 | 0 | 1/1 | - |
| oc_area_exceeded | 1 | 1 | 0 | 0 | 1/1 | - |
| photo_c2pa_edited | 1 | 1 | 0 | 0 | 1/1 | - |
| ssc_expired | 2 | 2 | 0 | 0 | 4/4 | - |
| ssc_pending | 1 | 1 | 0 | 0 | 1/1 | - |
| ter_receipt_mismatch | 1 | 1 | 0 | 0 | 1/1 | - |
| yoy_built_up_decreased | 2 | 2 | 0 | 0 | 2/2 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 2 | 0 | 0 |
| APH-617H-SSC-VALID | 2 | 0 | 0 |
| APH-617I-FIRE-VALID | 3 | 0 | 0 |
| APH-639-AFF2-DSC | 1 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 1 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 1 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 3 | 0 | 0 |
| APH-ANX5-FSR | 1 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 2 | 0 | 0 |
| FX-FONT-MISMATCH | 1 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 2 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 2 | 0 | 0 |
| FX-PDF-WHITEOUT | 2 | 0 | 0 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 1 | 0 | 0 |
| VER-ISSUER-SIGNATURE-ABSENT | 3 | 0 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 2 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 1 | 0 | 0 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 3 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 3 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 2 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 2 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 3 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 2 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 1 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 4 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 4 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 1 | 0 | 0 |
| XD-AFF2-APPLICATION | 1 | 0 | 0 |
| XD-CERT-EXPIRES-IN-SESSION | 4 | 0 | 0 |
| XD-FIRE-INSTITUTION | 1 | 0 | 0 |
| XD-OC-AREA | 1 | 0 | 0 |
| XR-EOA-NO-INCREASE | 1 | 0 | 0 |
| XR-NBA-CLAIMS | 1 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 1 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 2 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 2 | 0 | 0 |
| YOY-INTAKE-JUMP | 1 | 0 | 0 |

## False alarms on clean applications

None.

## Every false positive and false negative

False positives (0): none.

False negatives (0): none.
