# Random evaluation, seed 5505, 100 applications

Generated 2026-10-23T16:11:21+00:00. Seeds: 5505. Applications: 100 (29 clean). Planted conditions: 112. Expected (application, finding) pairs: 227. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 227/227 = 100.0% (95% CI 98.3 to 100.0) |
| Precision over pairs that fired | 227/227 = 100.0% (95% CI 98.3 to 100.0) |
| Conditions with every expected finding | 112/112 = 100.0% (95% CI 96.7 to 100.0) |
| Clean applications with any false alarm | 0 of 29 |
| False-alarm codes per clean application | 0.0 |
| Failed validation runs | 0 |

## Time

Generation 123.8 s, seeding 30.6 s, document processing 928.8 s (794 documents, 1.17 s each), validation 155.4 s, wall clock 1241.4 s. Per application (processing plus validation): mean 10.84 s, median 10.56 s, p90 15.34 s, max 18.34 s.

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 1 | 1 | 0 | 0 | 1/1 | - |
| accounts_wrong_year | 9 | 9 | 0 | 0 | 9/9 | - |
| admin_area_short | 1 | 1 | 0 | 0 | 1/1 | - |
| affidavit_other_app | 3 | 3 | 0 | 0 | 3/3 | - |
| affidavit_unsigned | 3 | 3 | 0 | 0 | 3/3 | - |
| bandwidth_short | 6 | 6 | 0 | 0 | 6/6 | - |
| core_branches_unmet | 1 | 1 | 0 | 0 | 1/1 | - |
| eoa_seat_increase | 3 | 3 | 0 | 0 | 6/6 | - |
| faculty_count_mismatch | 1 | 1 | 0 | 0 | 1/1 | - |
| faculty_shared | 2 | 2 | 0 | 0 | 6/6 | - |
| faculty_turnover | 3 | 3 | 0 | 0 | 3/3 | - |
| fire_after_submission | 5 | 5 | 0 | 0 | 5/5 | - |
| fire_copied | 1 | 1 | 0 | 0 | 7/7 | - |
| fire_expired | 1 | 1 | 0 | 0 | 3/3 | - |
| fire_other_name | 1 | 1 | 0 | 0 | 1/1 | - |
| fire_overwritten_other_font | 4 | 4 | 0 | 0 | 30/30 | - |
| fire_overwritten_same_font | 5 | 5 | 0 | 0 | 34/34 | - |
| fire_qr_mismatch | 2 | 2 | 0 | 0 | 8/8 | - |
| fire_unknown_number | 2 | 2 | 0 | 0 | 4/4 | - |
| fire_variant_instruction | 4 | 4 | 0 | 0 | 20/20 | - |
| fire_variant_layout | 1 | 1 | 0 | 0 | 4/4 | - |
| intake_above_record | 1 | 1 | 0 | 0 | 4/4 | - |
| issuer_unsigned | 2 | 2 | 0 | 0 | 2/2 | - |
| late_submission | 2 | 2 | 0 | 0 | 2/2 | - |
| nba_unsupported | 4 | 4 | 0 | 0 | 4/4 | - |
| oc_area_exceeded | 1 | 1 | 0 | 0 | 1/1 | - |
| oc_other_name | 2 | 2 | 0 | 0 | 2/2 | - |
| photo_c2pa_edited | 1 | 1 | 0 | 0 | 1/1 | - |
| photo_geotag_far | 2 | 2 | 0 | 0 | 2/2 | - |
| photo_reused | 4 | 4 | 0 | 0 | 12/12 | - |
| registry_outage | 5 | 5 | 0 | 0 | 5/5 | - |
| satmap_off_site | 5 | 5 | 0 | 0 | 5/5 | - |
| seal_other_issuer | 1 | 1 | 0 | 0 | 3/3 | - |
| ssc_expired | 5 | 5 | 0 | 0 | 10/10 | - |
| ssc_missing | 5 | 5 | 0 | 0 | 5/5 | - |
| ssc_pending | 2 | 2 | 0 | 0 | 2/2 | - |
| ter_not_received | 3 | 3 | 0 | 0 | 3/3 | - |
| ter_receipt_mismatch | 1 | 1 | 0 | 0 | 1/1 | - |
| yoy_built_up_decreased | 3 | 3 | 0 | 0 | 3/3 | - |
| yoy_cert_reused | 3 | 3 | 0 | 0 | 3/3 | - |
| yoy_land_decreased | 1 | 1 | 0 | 0 | 1/1 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 1 | 0 | 0 |
| APH-232D-TER-STATUS | 3 | 0 | 0 |
| APH-617H-SSC-VALID | 5 | 0 | 0 |
| APH-617I-FIRE-VALID | 11 | 0 | 0 |
| APH-639-AFF2-DSC | 3 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 5 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 10 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 1 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 6 | 0 | 0 |
| APH-ANX5-FSR | 1 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 9 | 0 | 0 |
| FX-FONT-MISMATCH | 4 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 6 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 9 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 9 | 0 | 0 |
| FX-PDF-WHITEOUT | 9 | 0 | 0 |
| FX-SEAL-REUSED | 1 | 0 | 0 |
| FX-SEAL-REUSED-LATER | 1 | 0 | 0 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 1 | 0 | 0 |
| PN2627-DEADLINE | 2 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 4 | 0 | 0 |
| VER-ISSUER-SIGNATURE-ABSENT | 8 | 0 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 6 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 7 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 9 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 6 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 3 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 4 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 2 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 2 | 0 | 0 |
| XA-PHOTO-REUSED | 4 | 0 | 0 |
| XA-PHOTO-REUSED-LATER | 4 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 2 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 10 | 0 | 0 |
| XD-AFF2-APPLICATION | 3 | 0 | 0 |
| XD-FACULTY-COUNT | 1 | 0 | 0 |
| XD-FIRE-INSTITUTION | 6 | 0 | 0 |
| XD-OC-AREA | 1 | 0 | 0 |
| XD-OC-INSTITUTION | 2 | 0 | 0 |
| XD-SATMAP-LOCATION | 5 | 0 | 0 |
| XR-EOA-NO-INCREASE | 4 | 0 | 0 |
| XR-INTAKE-RECORD | 1 | 0 | 0 |
| XR-NBA-CLAIMS | 4 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 1 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 3 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 5 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 3 | 0 | 0 |
| YOY-INTAKE-JUMP | 4 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 1 | 0 | 0 |

## False alarms on clean applications

None.

## Every false positive and false negative

False positives (0): none.

False negatives (0): none.
