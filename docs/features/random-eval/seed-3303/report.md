# Random evaluation, seed 3303, 100 applications

Generated 2026-10-23T10:09:43+00:00. Seeds: 3303. Applications: 100 (27 clean). Planted conditions: 126. Expected (application, finding) pairs: 228. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 227/228 = 99.6% (95% CI 97.6 to 99.9) |
| Precision over pairs that fired | 227/244 = 93.0% (95% CI 89.1 to 95.6) |
| Conditions with every expected finding | 125/126 = 99.2% (95% CI 95.6 to 99.9) |
| Clean applications with any false alarm | 1 of 27 |
| False-alarm codes per clean application | 0.037 |
| Failed validation runs | 0 |

## Time

Generation 87.5 s, seeding 49.1 s, document processing 679.0 s (802 documents, 0.847 s each), validation 194.1 s, wall clock 1013.4 s. Per application (processing plus validation): mean 8.73 s, median 8.84 s, p90 11.05 s, max 13.82 s.

Validated again after a validation-stage fix: 107.7 s; the first scores are in report.first.md.

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 2 | 2 | 0 | 0 | 2/2 | - |
| accounts_wrong_year | 3 | 3 | 0 | 0 | 3/3 | - |
| admin_area_short | 4 | 4 | 0 | 0 | 4/4 | - |
| affidavit_other_app | 1 | 1 | 0 | 0 | 1/1 | - |
| affidavit_unsigned | 2 | 2 | 0 | 0 | 2/2 | - |
| bandwidth_short | 2 | 2 | 0 | 0 | 2/2 | - |
| core_branches_unmet | 3 | 3 | 0 | 0 | 3/3 | - |
| eoa_seat_increase | 2 | 2 | 0 | 0 | 4/4 | - |
| faculty_count_mismatch | 1 | 1 | 0 | 0 | 1/1 | - |
| faculty_shared | 3 | 3 | 0 | 0 | 9/9 | - |
| faculty_short | 4 | 4 | 0 | 0 | 4/4 | - |
| faculty_turnover | 4 | 4 | 0 | 0 | 4/4 | - |
| fire_after_submission | 4 | 4 | 0 | 0 | 4/4 | - |
| fire_copied | 2 | 2 | 0 | 0 | 12/12 | - |
| fire_expired | 1 | 1 | 0 | 0 | 3/3 | - |
| fire_other_name | 5 | 5 | 0 | 0 | 5/5 | - |
| fire_overwritten_other_font | 3 | 3 | 0 | 0 | 27/27 | - |
| fire_overwritten_same_font | 2 | 2 | 0 | 0 | 13/13 | - |
| fire_qr_mismatch | 4 | 4 | 0 | 0 | 12/12 | - |
| fire_unknown_number | 1 | 1 | 0 | 0 | 1/1 | - |
| fire_variant_instruction | 3 | 2 | 1 | 0 | 14/15 | SEC-INSTRUCTION-TEXT x1 |
| fire_variant_layout | 3 | 3 | 0 | 0 | 12/12 | - |
| intake_above_record | 2 | 2 | 0 | 0 | 8/8 | - |
| late_submission | 2 | 2 | 0 | 0 | 2/2 | - |
| nba_unsupported | 6 | 6 | 0 | 0 | 6/6 | - |
| oc_area_exceeded | 5 | 5 | 0 | 0 | 5/5 | - |
| oc_other_name | 2 | 2 | 0 | 0 | 2/2 | - |
| photo_c2pa_edited | 11 | 11 | 0 | 0 | 11/11 | - |
| photo_geotag_far | 5 | 5 | 0 | 0 | 5/5 | - |
| photo_reused | 4 | 4 | 0 | 0 | 12/12 | - |
| registry_outage | 3 | 3 | 0 | 0 | 3/3 | - |
| satmap_off_site | 1 | 1 | 0 | 0 | 1/1 | - |
| seal_other_issuer | 1 | 1 | 0 | 0 | 2/2 | - |
| ssc_expired | 3 | 3 | 0 | 0 | 6/6 | - |
| ssc_missing | 4 | 4 | 0 | 0 | 4/4 | - |
| ssc_pending | 6 | 6 | 0 | 0 | 6/6 | - |
| ter_receipt_mismatch | 3 | 3 | 0 | 0 | 3/3 | - |
| yoy_built_up_decreased | 3 | 3 | 0 | 0 | 3/3 | - |
| yoy_cert_reused | 2 | 2 | 0 | 0 | 2/2 | - |
| yoy_land_decreased | 4 | 4 | 0 | 0 | 4/4 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 3 | 0 | 0 |
| APH-617H-SSC-VALID | 3 | 0 | 0 |
| APH-617I-FIRE-VALID | 11 | 0 | 0 |
| APH-639-AFF2-DSC | 2 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 4 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 10 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 4 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 2 | 0 | 0 |
| APH-ANX5-FSR | 6 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 5 | 0 | 0 |
| FX-FONT-MISMATCH | 3 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 9 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 5 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 5 | 0 | 0 |
| FX-PDF-WHITEOUT | 5 | 0 | 0 |
| FX-SEAL-REUSED | 1 | 0 | 7 |
| FX-SEAL-REUSED-LATER | 1 | 0 | 4 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 11 | 0 | 0 |
| PN2627-DEADLINE | 2 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 2 | 1 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 6 | 0 | 2 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 7 | 0 | 0 |
| VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE | 3 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 9 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 5 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 5 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 6 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 6 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 3 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 4 | 0 | 0 |
| XA-PHOTO-REUSED | 4 | 0 | 0 |
| XA-PHOTO-REUSED-LATER | 4 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 4 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 5 | 0 | 4 |
| XD-AFF2-APPLICATION | 1 | 0 | 0 |
| XD-FACULTY-COUNT | 1 | 0 | 0 |
| XD-FIRE-INSTITUTION | 11 | 0 | 0 |
| XD-OC-AREA | 5 | 0 | 0 |
| XD-OC-INSTITUTION | 2 | 0 | 0 |
| XD-SATMAP-LOCATION | 1 | 0 | 0 |
| XR-EOA-NO-INCREASE | 4 | 0 | 0 |
| XR-INTAKE-RECORD | 2 | 0 | 0 |
| XR-NBA-CLAIMS | 6 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 3 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 3 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 6 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 4 | 0 | 0 |
| YOY-INTAKE-JUMP | 4 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 4 | 0 | 0 |

## False alarms on clean applications

| Application | Codes |
|---|---|
| R054 | FX-SEAL-REUSED-LATER |

## Every false positive and false negative

False positives (17): R002:FX-SEAL-REUSED-LATER, R011:FX-SEAL-REUSED, R011:FX-SEAL-REUSED-LATER, R020:FX-SEAL-REUSED, R027:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, R027:XD-ACCOUNTS-ENTITY, R028:XD-ACCOUNTS-ENTITY, R029:FX-SEAL-REUSED, R031:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, R031:XD-ACCOUNTS-ENTITY, R047:FX-SEAL-REUSED, R054:FX-SEAL-REUSED-LATER, R069:FX-SEAL-REUSED-LATER, R069:XD-ACCOUNTS-ENTITY, R072:FX-SEAL-REUSED, R090:FX-SEAL-REUSED, R098:FX-SEAL-REUSED.

False negatives (1): R026:SEC-INSTRUCTION-TEXT.
