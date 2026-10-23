# Random evaluation, seed 2202, 100 applications

Generated 2026-10-23T10:07:53+00:00. Seeds: 2202. Applications: 100 (28 clean). Planted conditions: 113. Expected (application, finding) pairs: 221. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 219/221 = 99.1% (95% CI 96.8 to 99.8) |
| Precision over pairs that fired | 219/240 = 91.2% (95% CI 87.0 to 94.2) |
| Conditions with every expected finding | 111/113 = 98.2% (95% CI 93.8 to 99.5) |
| Clean applications with any false alarm | 4 of 28 |
| False-alarm codes per clean application | 0.214 |
| Failed validation runs | 0 |

## Time

Generation 119.6 s, seeding 48.7 s, document processing 676.4 s (786 documents, 0.861 s each), validation 195.8 s, wall clock 1043.5 s. Per application (processing plus validation): mean 8.72 s, median 8.63 s, p90 10.93 s, max 13.31 s.

Validated again after a validation-stage fix: 191.5 s; the first scores are in report.first.md.

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 1 | 1 | 0 | 0 | 1/1 | - |
| accounts_wrong_year | 1 | 1 | 0 | 0 | 1/1 | - |
| admin_area_short | 3 | 3 | 0 | 0 | 3/3 | - |
| affidavit_other_app | 1 | 1 | 0 | 0 | 1/1 | - |
| affidavit_unsigned | 1 | 1 | 0 | 0 | 1/1 | - |
| bandwidth_short | 1 | 1 | 0 | 0 | 1/1 | - |
| core_branches_unmet | 4 | 4 | 0 | 0 | 4/4 | - |
| eoa_seat_increase | 1 | 1 | 0 | 0 | 2/2 | - |
| faculty_count_mismatch | 5 | 5 | 0 | 0 | 5/5 | - |
| faculty_shared | 2 | 2 | 0 | 0 | 6/6 | - |
| faculty_short | 3 | 3 | 0 | 0 | 3/3 | - |
| faculty_turnover | 3 | 3 | 0 | 0 | 3/3 | - |
| fire_after_submission | 4 | 4 | 0 | 0 | 4/4 | - |
| fire_copied | 3 | 3 | 0 | 0 | 18/18 | - |
| fire_expired | 4 | 4 | 0 | 0 | 12/12 | - |
| fire_other_name | 2 | 2 | 0 | 0 | 2/2 | - |
| fire_overwritten_other_font | 2 | 2 | 0 | 0 | 12/12 | - |
| fire_overwritten_same_font | 5 | 5 | 0 | 0 | 34/34 | - |
| fire_qr_mismatch | 1 | 1 | 0 | 0 | 3/3 | - |
| fire_unknown_number | 5 | 5 | 0 | 0 | 5/5 | - |
| fire_variant_instruction | 4 | 2 | 2 | 0 | 18/20 | SEC-INSTRUCTION-TEXT x2 |
| fire_variant_layout | 2 | 2 | 0 | 0 | 8/8 | - |
| intake_above_record | 4 | 4 | 0 | 0 | 17/17 | - |
| late_submission | 5 | 5 | 0 | 0 | 5/5 | - |
| nba_unsupported | 3 | 3 | 0 | 0 | 3/3 | - |
| oc_area_exceeded | 7 | 7 | 0 | 0 | 7/7 | - |
| oc_other_name | 3 | 3 | 0 | 0 | 3/3 | - |
| photo_geotag_far | 4 | 4 | 0 | 0 | 4/4 | - |
| registry_outage | 1 | 1 | 0 | 0 | 1/1 | - |
| satmap_off_site | 3 | 3 | 0 | 0 | 3/3 | - |
| seal_other_issuer | 2 | 2 | 0 | 0 | 4/4 | - |
| ssc_expired | 2 | 2 | 0 | 0 | 4/4 | - |
| ssc_missing | 4 | 4 | 0 | 0 | 4/4 | - |
| ssc_pending | 3 | 3 | 0 | 0 | 3/3 | - |
| ter_not_received | 4 | 4 | 0 | 0 | 4/4 | - |
| ter_receipt_mismatch | 1 | 1 | 0 | 0 | 1/1 | - |
| yoy_built_up_decreased | 4 | 4 | 0 | 0 | 4/4 | - |
| yoy_cert_reused | 1 | 1 | 0 | 0 | 1/1 | - |
| yoy_land_decreased | 4 | 4 | 0 | 0 | 4/4 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 4 | 0 | 0 |
| APH-232D-TER-STATUS | 4 | 0 | 0 |
| APH-617H-SSC-VALID | 2 | 0 | 0 |
| APH-617I-FIRE-VALID | 13 | 0 | 0 |
| APH-639-AFF2-DSC | 1 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 4 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 10 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 3 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 2 | 0 | 0 |
| APH-ANX5-FSR | 7 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 7 | 0 | 0 |
| FX-FONT-MISMATCH | 2 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 4 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 7 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 7 | 0 | 0 |
| FX-PDF-WHITEOUT | 7 | 0 | 0 |
| FX-SEAL-REUSED | 2 | 0 | 7 |
| FX-SEAL-REUSED-LATER | 2 | 0 | 9 |
| PN2627-DEADLINE | 5 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 2 | 2 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 7 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 6 | 0 | 2 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 9 | 0 | 0 |
| VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE | 1 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 5 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 7 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 7 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 4 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 4 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 2 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 6 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 6 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 2 | 0 | 3 |
| XD-AFF2-APPLICATION | 1 | 0 | 0 |
| XD-FACULTY-COUNT | 5 | 0 | 0 |
| XD-FIRE-INSTITUTION | 8 | 0 | 0 |
| XD-OC-AREA | 7 | 0 | 0 |
| XD-OC-INSTITUTION | 3 | 0 | 0 |
| XD-SATMAP-LOCATION | 3 | 0 | 0 |
| XR-EOA-NO-INCREASE | 5 | 0 | 0 |
| XR-INTAKE-RECORD | 4 | 0 | 0 |
| XR-NBA-CLAIMS | 3 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 1 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 4 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 2 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 3 | 0 | 0 |
| YOY-INTAKE-JUMP | 5 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 4 | 0 | 0 |

## False alarms on clean applications

| Application | Codes |
|---|---|
| R036 | FX-SEAL-REUSED, FX-SEAL-REUSED-LATER |
| R052 | FX-SEAL-REUSED-LATER |
| R066 | FX-SEAL-REUSED-LATER |
| R088 | FX-SEAL-REUSED, FX-SEAL-REUSED-LATER |

## Every false positive and false negative

False positives (21): R001:FX-SEAL-REUSED, R012:FX-SEAL-REUSED-LATER, R018:XD-ACCOUNTS-ENTITY, R021:FX-SEAL-REUSED, R021:FX-SEAL-REUSED-LATER, R024:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, R024:XD-ACCOUNTS-ENTITY, R032:FX-SEAL-REUSED, R032:FX-SEAL-REUSED-LATER, R036:FX-SEAL-REUSED, R036:FX-SEAL-REUSED-LATER, R046:FX-SEAL-REUSED, R052:FX-SEAL-REUSED-LATER, R066:FX-SEAL-REUSED-LATER, R070:FX-SEAL-REUSED-LATER, R072:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, R072:XD-ACCOUNTS-ENTITY, R082:FX-SEAL-REUSED-LATER, R088:FX-SEAL-REUSED, R088:FX-SEAL-REUSED-LATER, R092:FX-SEAL-REUSED.

False negatives (2): R005:SEC-INSTRUCTION-TEXT, R063:SEC-INSTRUCTION-TEXT.
