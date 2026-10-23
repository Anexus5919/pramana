# Random evaluation, seed 1101, 100 applications

Generated 2026-10-23T09:20:32+00:00. Seeds: 1101. Applications: 100 (30 clean). Planted conditions: 120. Expected (application, finding) pairs: 218. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 216/218 = 99.1% (95% CI 96.7 to 99.8) |
| Precision over pairs that fired | 216/239 = 90.4% (95% CI 86.0 to 93.5) |
| Conditions with every expected finding | 118/120 = 98.3% (95% CI 94.1 to 99.5) |
| Clean applications with any false alarm | 6 of 30 |
| False-alarm codes per clean application | 0.3 |
| Failed validation runs | 0 |

## Time

Generation 101.4 s, seeding 61.1 s, document processing 811.2 s (783 documents, 1.036 s each), validation 186.9 s, wall clock 1166.1 s. Per application (processing plus validation): mean 9.98 s, median 9.77 s, p90 13.25 s, max 20.35 s.

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 1 | 1 | 0 | 0 | 1/1 | - |
| accounts_wrong_year | 5 | 5 | 0 | 0 | 5/5 | - |
| admin_area_short | 1 | 1 | 0 | 0 | 1/1 | - |
| affidavit_other_app | 4 | 4 | 0 | 0 | 4/4 | - |
| affidavit_unsigned | 2 | 2 | 0 | 0 | 2/2 | - |
| bandwidth_short | 6 | 6 | 0 | 0 | 6/6 | - |
| core_branches_unmet | 5 | 5 | 0 | 0 | 5/5 | - |
| eoa_seat_increase | 5 | 5 | 0 | 0 | 10/10 | - |
| faculty_count_mismatch | 1 | 1 | 0 | 0 | 1/1 | - |
| faculty_shared | 2 | 2 | 0 | 0 | 6/6 | - |
| faculty_short | 3 | 3 | 0 | 0 | 3/3 | - |
| faculty_turnover | 5 | 5 | 0 | 0 | 5/5 | - |
| fire_after_submission | 1 | 1 | 0 | 0 | 1/1 | - |
| fire_copied | 4 | 4 | 0 | 0 | 23/23 | - |
| fire_expired | 1 | 1 | 0 | 0 | 3/3 | - |
| fire_other_name | 2 | 2 | 0 | 0 | 2/2 | - |
| fire_overwritten_other_font | 2 | 2 | 0 | 0 | 15/15 | - |
| fire_overwritten_same_font | 2 | 2 | 0 | 0 | 13/13 | - |
| fire_qr_mismatch | 4 | 4 | 0 | 0 | 10/10 | - |
| fire_unknown_number | 2 | 2 | 0 | 0 | 2/2 | - |
| fire_variant_instruction | 4 | 2 | 2 | 0 | 18/20 | SEC-INSTRUCTION-TEXT x2 |
| fire_variant_layout | 4 | 4 | 0 | 0 | 16/16 | - |
| late_submission | 6 | 6 | 0 | 0 | 6/6 | - |
| nba_unsupported | 3 | 3 | 0 | 0 | 3/3 | - |
| oc_area_exceeded | 3 | 3 | 0 | 0 | 3/3 | - |
| oc_other_name | 5 | 5 | 0 | 0 | 5/5 | - |
| photo_c2pa_edited | 2 | 2 | 0 | 0 | 2/2 | - |
| photo_geotag_far | 1 | 1 | 0 | 0 | 1/1 | - |
| photo_reused | 3 | 3 | 0 | 0 | 9/9 | - |
| satmap_off_site | 3 | 3 | 0 | 0 | 3/3 | - |
| seal_other_issuer | 2 | 2 | 0 | 0 | 4/4 | - |
| ssc_expired | 2 | 2 | 0 | 0 | 4/4 | - |
| ssc_missing | 3 | 3 | 0 | 0 | 3/3 | - |
| ssc_pending | 3 | 3 | 0 | 0 | 3/3 | - |
| ter_not_received | 3 | 3 | 0 | 0 | 3/3 | - |
| ter_receipt_mismatch | 5 | 5 | 0 | 0 | 5/5 | - |
| yoy_built_up_decreased | 4 | 4 | 0 | 0 | 4/4 | - |
| yoy_cert_reused | 2 | 2 | 0 | 0 | 2/2 | - |
| yoy_land_decreased | 4 | 4 | 0 | 0 | 4/4 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 5 | 0 | 0 |
| APH-232D-TER-STATUS | 3 | 0 | 0 |
| APH-617H-SSC-VALID | 2 | 0 | 0 |
| APH-617I-FIRE-VALID | 11 | 0 | 0 |
| APH-639-AFF2-DSC | 2 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 3 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 9 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 1 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 6 | 0 | 0 |
| APH-ANX5-FSR | 3 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 4 | 0 | 0 |
| FX-FONT-MISMATCH | 2 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 4 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 4 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 4 | 0 | 0 |
| FX-PDF-WHITEOUT | 4 | 0 | 0 |
| FX-SEAL-REUSED | 2 | 0 | 9 |
| FX-SEAL-REUSED-LATER | 2 | 0 | 10 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 2 | 0 | 0 |
| PN2627-DEADLINE | 6 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 2 | 2 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 3 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 8 | 0 | 2 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 10 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 5 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 4 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 3 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 7 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 4 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 2 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 8 | 0 | 0 |
| XA-PHOTO-REUSED | 3 | 0 | 0 |
| XA-PHOTO-REUSED-LATER | 3 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 8 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 6 | 0 | 2 |
| XD-AFF2-APPLICATION | 4 | 0 | 0 |
| XD-FACULTY-COUNT | 1 | 0 | 0 |
| XD-FIRE-INSTITUTION | 10 | 0 | 0 |
| XD-OC-AREA | 3 | 0 | 0 |
| XD-OC-INSTITUTION | 5 | 0 | 0 |
| XD-SATMAP-LOCATION | 3 | 0 | 0 |
| XR-EOA-NO-INCREASE | 5 | 0 | 0 |
| XR-NBA-CLAIMS | 3 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 5 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 4 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 4 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 5 | 0 | 0 |
| YOY-INTAKE-JUMP | 5 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 4 | 0 | 0 |

## False alarms on clean applications

| Application | Codes |
|---|---|
| R004 | FX-SEAL-REUSED, FX-SEAL-REUSED-LATER |
| R038 | FX-SEAL-REUSED |
| R045 | VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, XD-ACCOUNTS-ENTITY |
| R064 | VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, XD-ACCOUNTS-ENTITY |
| R076 | FX-SEAL-REUSED |
| R086 | FX-SEAL-REUSED-LATER |

## Every false positive and false negative

False positives (23): R004:FX-SEAL-REUSED, R004:FX-SEAL-REUSED-LATER, R018:FX-SEAL-REUSED, R018:FX-SEAL-REUSED-LATER, R020:FX-SEAL-REUSED, R020:FX-SEAL-REUSED-LATER, R024:FX-SEAL-REUSED-LATER, R026:FX-SEAL-REUSED-LATER, R038:FX-SEAL-REUSED, R045:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, R045:XD-ACCOUNTS-ENTITY, R057:FX-SEAL-REUSED, R057:FX-SEAL-REUSED-LATER, R061:FX-SEAL-REUSED, R064:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, R064:XD-ACCOUNTS-ENTITY, R070:FX-SEAL-REUSED, R071:FX-SEAL-REUSED-LATER, R076:FX-SEAL-REUSED, R083:FX-SEAL-REUSED-LATER, R086:FX-SEAL-REUSED-LATER, R089:FX-SEAL-REUSED, R089:FX-SEAL-REUSED-LATER.

False negatives (2): R042:SEC-INSTRUCTION-TEXT, R058:SEC-INSTRUCTION-TEXT.
