# Random evaluation, seeds 5505, 6606 combined

Generated 2026-10-23T16:30:48+00:00. Seeds: 5505, 6606. Applications: 200 (55 clean). Planted conditions: 242. Expected (application, finding) pairs: 446. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 446/446 = 100.0% (95% CI 99.2 to 100.0) |
| Precision over pairs that fired | 446/446 = 100.0% (95% CI 99.2 to 100.0) |
| Conditions with every expected finding | 242/242 = 100.0% (95% CI 98.4 to 100.0) |
| Clean applications with any false alarm | 0 of 55 |
| False-alarm codes per clean application | 0.0 |
| Failed validation runs | 0 |

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 5 | 5 | 0 | 0 | 5/5 | - |
| accounts_wrong_year | 13 | 13 | 0 | 0 | 13/13 | - |
| admin_area_short | 1 | 1 | 0 | 0 | 1/1 | - |
| affidavit_other_app | 5 | 5 | 0 | 0 | 5/5 | - |
| affidavit_unsigned | 6 | 6 | 0 | 0 | 6/6 | - |
| bandwidth_short | 7 | 7 | 0 | 0 | 7/7 | - |
| core_branches_unmet | 5 | 5 | 0 | 0 | 5/5 | - |
| eoa_seat_increase | 8 | 8 | 0 | 0 | 16/16 | - |
| faculty_count_mismatch | 5 | 5 | 0 | 0 | 5/5 | - |
| faculty_shared | 5 | 5 | 0 | 0 | 15/15 | - |
| faculty_short | 6 | 6 | 0 | 0 | 6/6 | - |
| faculty_turnover | 7 | 7 | 0 | 0 | 7/7 | - |
| fire_after_submission | 5 | 5 | 0 | 0 | 5/5 | - |
| fire_copied | 3 | 3 | 0 | 0 | 20/20 | - |
| fire_expired | 2 | 2 | 0 | 0 | 6/6 | - |
| fire_other_name | 4 | 4 | 0 | 0 | 4/4 | - |
| fire_overwritten_other_font | 7 | 7 | 0 | 0 | 57/57 | - |
| fire_overwritten_same_font | 6 | 6 | 0 | 0 | 41/41 | - |
| fire_qr_mismatch | 3 | 3 | 0 | 0 | 11/11 | - |
| fire_unknown_number | 3 | 3 | 0 | 0 | 6/6 | - |
| fire_variant_instruction | 5 | 5 | 0 | 0 | 25/25 | - |
| fire_variant_layout | 5 | 5 | 0 | 0 | 20/20 | - |
| intake_above_record | 1 | 1 | 0 | 0 | 4/4 | - |
| issuer_unsigned | 7 | 7 | 0 | 0 | 7/7 | - |
| late_submission | 3 | 3 | 0 | 0 | 3/3 | - |
| nba_unsupported | 11 | 11 | 0 | 0 | 11/11 | - |
| oc_area_exceeded | 7 | 7 | 0 | 0 | 7/7 | - |
| oc_other_name | 6 | 6 | 0 | 0 | 6/6 | - |
| photo_c2pa_edited | 3 | 3 | 0 | 0 | 3/3 | - |
| photo_geotag_far | 8 | 8 | 0 | 0 | 8/8 | - |
| photo_reused | 4 | 4 | 0 | 0 | 12/12 | - |
| registry_outage | 11 | 11 | 0 | 0 | 11/11 | - |
| satmap_off_site | 6 | 6 | 0 | 0 | 6/6 | - |
| seal_other_issuer | 7 | 7 | 0 | 0 | 21/21 | - |
| ssc_expired | 10 | 10 | 0 | 0 | 20/20 | - |
| ssc_missing | 8 | 8 | 0 | 0 | 8/8 | - |
| ssc_pending | 6 | 6 | 0 | 0 | 6/6 | - |
| ter_not_received | 8 | 8 | 0 | 0 | 8/8 | - |
| ter_receipt_mismatch | 1 | 1 | 0 | 0 | 1/1 | - |
| yoy_built_up_decreased | 4 | 4 | 0 | 0 | 4/4 | - |
| yoy_cert_reused | 8 | 8 | 0 | 0 | 8/8 | - |
| yoy_land_decreased | 7 | 7 | 0 | 0 | 7/7 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 5 | 0 | 0 |
| APH-232D-TER-STATUS | 8 | 0 | 0 |
| APH-617H-SSC-VALID | 10 | 0 | 0 |
| APH-617I-FIRE-VALID | 21 | 0 | 0 |
| APH-639-AFF2-DSC | 6 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 8 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 15 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 1 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 7 | 0 | 0 |
| APH-ANX5-FSR | 7 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 13 | 0 | 0 |
| FX-FONT-MISMATCH | 7 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 12 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 13 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 13 | 0 | 0 |
| FX-PDF-WHITEOUT | 13 | 0 | 0 |
| FX-SEAL-REUSED | 7 | 0 | 0 |
| FX-SEAL-REUSED-LATER | 7 | 0 | 0 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 3 | 0 | 0 |
| PN2627-DEADLINE | 3 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 5 | 0 | 0 |
| VER-ISSUER-SIGNATURE-ABSENT | 22 | 0 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 11 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 10 | 0 | 0 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 9 | 0 | 0 |
| VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE | 11 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 16 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 13 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 10 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 5 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 10 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 5 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 6 | 0 | 0 |
| XA-PHOTO-REUSED | 4 | 0 | 0 |
| XA-PHOTO-REUSED-LATER | 4 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 6 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 18 | 0 | 0 |
| XD-AFF2-APPLICATION | 5 | 0 | 0 |
| XD-FACULTY-COUNT | 5 | 0 | 0 |
| XD-FIRE-INSTITUTION | 14 | 0 | 0 |
| XD-OC-AREA | 7 | 0 | 0 |
| XD-OC-INSTITUTION | 6 | 0 | 0 |
| XD-SATMAP-LOCATION | 6 | 0 | 0 |
| XR-EOA-NO-INCREASE | 9 | 0 | 0 |
| XR-INTAKE-RECORD | 1 | 0 | 0 |
| XR-NBA-CLAIMS | 11 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 1 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 4 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 10 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 7 | 0 | 0 |
| YOY-INTAKE-JUMP | 9 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 7 | 0 | 0 |

## False alarms on clean applications

None.

## Every false positive and false negative

False positives (0): none.

False negatives (0): none.
