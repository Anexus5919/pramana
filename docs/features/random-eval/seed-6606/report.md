# Random evaluation, seed 6606, 100 applications

Generated 2026-10-23T16:30:47+00:00. Seeds: 6606. Applications: 100 (26 clean). Planted conditions: 130. Expected (application, finding) pairs: 219. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 219/219 = 100.0% (95% CI 98.3 to 100.0) |
| Precision over pairs that fired | 219/219 = 100.0% (95% CI 98.3 to 100.0) |
| Conditions with every expected finding | 130/130 = 100.0% (95% CI 97.1 to 100.0) |
| Clean applications with any false alarm | 0 of 26 |
| False-alarm codes per clean application | 0.0 |
| Failed validation runs | 0 |

## Time

Generation 43.7 s, seeding 33.5 s, document processing 765.0 s (784 documents, 0.976 s each), validation 319.7 s, wall clock 1164.7 s. Per application (processing plus validation): mean 10.84 s, median 10.46 s, p90 14.54 s, max 19.88 s.

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 4 | 4 | 0 | 0 | 4/4 | - |
| accounts_wrong_year | 4 | 4 | 0 | 0 | 4/4 | - |
| affidavit_other_app | 2 | 2 | 0 | 0 | 2/2 | - |
| affidavit_unsigned | 3 | 3 | 0 | 0 | 3/3 | - |
| bandwidth_short | 1 | 1 | 0 | 0 | 1/1 | - |
| core_branches_unmet | 4 | 4 | 0 | 0 | 4/4 | - |
| eoa_seat_increase | 5 | 5 | 0 | 0 | 10/10 | - |
| faculty_count_mismatch | 4 | 4 | 0 | 0 | 4/4 | - |
| faculty_shared | 3 | 3 | 0 | 0 | 9/9 | - |
| faculty_short | 6 | 6 | 0 | 0 | 6/6 | - |
| faculty_turnover | 4 | 4 | 0 | 0 | 4/4 | - |
| fire_copied | 2 | 2 | 0 | 0 | 13/13 | - |
| fire_expired | 1 | 1 | 0 | 0 | 3/3 | - |
| fire_other_name | 3 | 3 | 0 | 0 | 3/3 | - |
| fire_overwritten_other_font | 3 | 3 | 0 | 0 | 27/27 | - |
| fire_overwritten_same_font | 1 | 1 | 0 | 0 | 7/7 | - |
| fire_qr_mismatch | 1 | 1 | 0 | 0 | 3/3 | - |
| fire_unknown_number | 1 | 1 | 0 | 0 | 2/2 | - |
| fire_variant_instruction | 1 | 1 | 0 | 0 | 5/5 | - |
| fire_variant_layout | 4 | 4 | 0 | 0 | 16/16 | - |
| issuer_unsigned | 5 | 5 | 0 | 0 | 5/5 | - |
| late_submission | 1 | 1 | 0 | 0 | 1/1 | - |
| nba_unsupported | 7 | 7 | 0 | 0 | 7/7 | - |
| oc_area_exceeded | 6 | 6 | 0 | 0 | 6/6 | - |
| oc_other_name | 4 | 4 | 0 | 0 | 4/4 | - |
| photo_c2pa_edited | 2 | 2 | 0 | 0 | 2/2 | - |
| photo_geotag_far | 6 | 6 | 0 | 0 | 6/6 | - |
| registry_outage | 6 | 6 | 0 | 0 | 6/6 | - |
| satmap_off_site | 1 | 1 | 0 | 0 | 1/1 | - |
| seal_other_issuer | 6 | 6 | 0 | 0 | 18/18 | - |
| ssc_expired | 5 | 5 | 0 | 0 | 10/10 | - |
| ssc_missing | 3 | 3 | 0 | 0 | 3/3 | - |
| ssc_pending | 4 | 4 | 0 | 0 | 4/4 | - |
| ter_not_received | 5 | 5 | 0 | 0 | 5/5 | - |
| yoy_built_up_decreased | 1 | 1 | 0 | 0 | 1/1 | - |
| yoy_cert_reused | 5 | 5 | 0 | 0 | 5/5 | - |
| yoy_land_decreased | 6 | 6 | 0 | 0 | 6/6 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 4 | 0 | 0 |
| APH-232D-TER-STATUS | 5 | 0 | 0 |
| APH-617H-SSC-VALID | 5 | 0 | 0 |
| APH-617I-FIRE-VALID | 10 | 0 | 0 |
| APH-639-AFF2-DSC | 3 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 3 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 5 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 1 | 0 | 0 |
| APH-ANX5-FSR | 6 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 4 | 0 | 0 |
| FX-FONT-MISMATCH | 3 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 6 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 4 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 4 | 0 | 0 |
| FX-PDF-WHITEOUT | 4 | 0 | 0 |
| FX-SEAL-REUSED | 6 | 0 | 0 |
| FX-SEAL-REUSED-LATER | 6 | 0 | 0 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 2 | 0 | 0 |
| PN2627-DEADLINE | 1 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 1 | 0 | 0 |
| VER-ISSUER-SIGNATURE-ABSENT | 14 | 0 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 4 | 0 | 0 |
| VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE | 6 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 9 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 4 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 4 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 2 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 6 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 3 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 4 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 4 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 8 | 0 | 0 |
| XD-AFF2-APPLICATION | 2 | 0 | 0 |
| XD-FACULTY-COUNT | 4 | 0 | 0 |
| XD-FIRE-INSTITUTION | 8 | 0 | 0 |
| XD-OC-AREA | 6 | 0 | 0 |
| XD-OC-INSTITUTION | 4 | 0 | 0 |
| XD-SATMAP-LOCATION | 1 | 0 | 0 |
| XR-EOA-NO-INCREASE | 5 | 0 | 0 |
| XR-NBA-CLAIMS | 7 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 1 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 5 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 4 | 0 | 0 |
| YOY-INTAKE-JUMP | 5 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 6 | 0 | 0 |

## False alarms on clean applications

None.

## Every false positive and false negative

False positives (0): none.

False negatives (0): none.
