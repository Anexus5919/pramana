# Random evaluation, seed 4404, 100 applications

Generated 2026-10-23T10:56:47+00:00. Seeds: 4404. Applications: 100 (28 clean). Planted conditions: 114. Expected (application, finding) pairs: 201. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 199/201 = 99.0% (95% CI 96.5 to 99.7) |
| Precision over pairs that fired | 199/209 = 95.2% (95% CI 91.4 to 97.4) |
| Conditions with every expected finding | 112/114 = 98.2% (95% CI 93.8 to 99.5) |
| Clean applications with any false alarm | 2 of 28 |
| False-alarm codes per clean application | 0.071 |
| Failed validation runs | 0 |

## Time

Generation 61.1 s, seeding 25.8 s, document processing 953.2 s (773 documents, 1.233 s each), validation 210.3 s, wall clock 1252.3 s. Per application (processing plus validation): mean 11.63 s, median 11.34 s, p90 14.82 s, max 17.85 s.

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 1 | 1 | 0 | 0 | 1/1 | - |
| accounts_wrong_year | 2 | 2 | 0 | 0 | 2/2 | - |
| admin_area_short | 4 | 4 | 0 | 0 | 4/4 | - |
| affidavit_other_app | 2 | 2 | 0 | 0 | 2/2 | - |
| affidavit_unsigned | 6 | 6 | 0 | 0 | 6/6 | - |
| bandwidth_short | 1 | 1 | 0 | 0 | 1/1 | - |
| core_branches_unmet | 1 | 1 | 0 | 0 | 1/1 | - |
| eoa_seat_increase | 3 | 3 | 0 | 0 | 6/6 | - |
| faculty_count_mismatch | 6 | 6 | 0 | 0 | 6/6 | - |
| faculty_shared | 5 | 5 | 0 | 0 | 15/15 | - |
| faculty_short | 2 | 2 | 0 | 0 | 2/2 | - |
| faculty_turnover | 2 | 2 | 0 | 0 | 2/2 | - |
| fire_after_submission | 1 | 1 | 0 | 0 | 1/1 | - |
| fire_copied | 2 | 2 | 0 | 0 | 12/12 | - |
| fire_expired | 3 | 3 | 0 | 0 | 7/7 | - |
| fire_other_name | 5 | 5 | 0 | 0 | 5/5 | - |
| fire_overwritten_other_font | 2 | 2 | 0 | 0 | 15/15 | - |
| fire_overwritten_same_font | 2 | 2 | 0 | 0 | 12/12 | - |
| fire_unknown_number | 1 | 1 | 0 | 0 | 2/2 | - |
| fire_variant_instruction | 4 | 2 | 2 | 0 | 18/20 | SEC-INSTRUCTION-TEXT x2 |
| fire_variant_layout | 2 | 2 | 0 | 0 | 8/8 | - |
| intake_above_record | 1 | 1 | 0 | 0 | 4/4 | - |
| issuer_unsigned | 2 | 2 | 0 | 0 | 2/2 | - |
| late_submission | 2 | 2 | 0 | 0 | 2/2 | - |
| nba_unsupported | 4 | 4 | 0 | 0 | 4/4 | - |
| oc_area_exceeded | 7 | 7 | 0 | 0 | 7/7 | - |
| oc_other_name | 4 | 4 | 0 | 0 | 4/4 | - |
| photo_c2pa_edited | 6 | 6 | 0 | 0 | 6/6 | - |
| photo_geotag_far | 2 | 2 | 0 | 0 | 2/2 | - |
| photo_reused | 4 | 4 | 0 | 0 | 12/12 | - |
| satmap_off_site | 1 | 1 | 0 | 0 | 1/1 | - |
| ssc_expired | 3 | 3 | 0 | 0 | 6/6 | - |
| ssc_missing | 3 | 3 | 0 | 0 | 3/3 | - |
| ssc_pending | 2 | 2 | 0 | 0 | 2/2 | - |
| ter_not_received | 4 | 4 | 0 | 0 | 4/4 | - |
| ter_receipt_mismatch | 4 | 4 | 0 | 0 | 4/4 | - |
| yoy_built_up_decreased | 5 | 5 | 0 | 0 | 5/5 | - |
| yoy_cert_reused | 1 | 1 | 0 | 0 | 1/1 | - |
| yoy_land_decreased | 2 | 2 | 0 | 0 | 2/2 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 1 | 0 | 0 |
| APH-232D-TER-STATUS | 4 | 0 | 0 |
| APH-617H-SSC-VALID | 3 | 0 | 0 |
| APH-617I-FIRE-VALID | 11 | 0 | 0 |
| APH-639-AFF2-DSC | 6 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 3 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 7 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 4 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 1 | 0 | 0 |
| APH-ANX5-FSR | 3 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 4 | 0 | 0 |
| FX-FONT-MISMATCH | 2 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 6 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 4 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 4 | 0 | 0 |
| FX-PDF-WHITEOUT | 4 | 0 | 0 |
| FX-SEAL-REUSED | 0 | 0 | 7 |
| FX-SEAL-REUSED-LATER | 0 | 0 | 3 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 6 | 0 | 0 |
| PN2627-DEADLINE | 2 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 2 | 2 | 0 |
| VER-ISSUER-SIGNATURE-ABSENT | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 5 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 6 | 0 | 0 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 3 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 5 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 4 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 2 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 10 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 5 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 4 | 0 | 0 |
| XA-PHOTO-REUSED | 4 | 0 | 0 |
| XA-PHOTO-REUSED-LATER | 4 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 4 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 3 | 0 | 0 |
| XD-AFF2-APPLICATION | 2 | 0 | 0 |
| XD-FACULTY-COUNT | 6 | 0 | 0 |
| XD-FIRE-INSTITUTION | 11 | 0 | 0 |
| XD-OC-AREA | 7 | 0 | 0 |
| XD-OC-INSTITUTION | 4 | 0 | 0 |
| XD-SATMAP-LOCATION | 1 | 0 | 0 |
| XR-EOA-NO-INCREASE | 4 | 0 | 0 |
| XR-INTAKE-RECORD | 1 | 0 | 0 |
| XR-NBA-CLAIMS | 4 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 4 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 5 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 1 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 2 | 0 | 0 |
| YOY-INTAKE-JUMP | 4 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 2 | 0 | 0 |

## False alarms on clean applications

| Application | Codes |
|---|---|
| R028 | FX-SEAL-REUSED |
| R072 | FX-SEAL-REUSED-LATER |

## Every false positive and false negative

False positives (10): R007:FX-SEAL-REUSED, R009:FX-SEAL-REUSED, R028:FX-SEAL-REUSED, R029:FX-SEAL-REUSED-LATER, R033:FX-SEAL-REUSED, R044:FX-SEAL-REUSED, R072:FX-SEAL-REUSED-LATER, R074:FX-SEAL-REUSED, R081:FX-SEAL-REUSED-LATER, R087:FX-SEAL-REUSED.

False negatives (2): R053:SEC-INSTRUCTION-TEXT, R057:SEC-INSTRUCTION-TEXT.
