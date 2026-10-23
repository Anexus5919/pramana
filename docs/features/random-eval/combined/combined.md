# Random evaluation, seeds 1101, 2202, 3303 combined

Generated 2026-10-23T10:12:05+00:00. Seeds: 1101, 2202, 3303. Applications: 300 (85 clean). Planted conditions: 359. Expected (application, finding) pairs: 667. Deterministic mode (no language model).

| Measure | Result |
|---|---|
| Recall over expected pairs | 662/667 = 99.2% (95% CI 98.3 to 99.7) |
| Precision over pairs that fired | 662/723 = 91.6% (95% CI 89.3 to 93.4) |
| Conditions with every expected finding | 354/359 = 98.6% (95% CI 96.8 to 99.4) |
| Clean applications with any false alarm | 11 of 85 |
| False-alarm codes per clean application | 0.188 |
| Failed validation runs | 0 |

## By condition

| Condition | Instances | All found | Partial | Missed | Pairs found | Codes missed |
|---|---|---|---|---|---|---|
| accounts_other_entity | 4 | 4 | 0 | 0 | 4/4 | - |
| accounts_wrong_year | 9 | 9 | 0 | 0 | 9/9 | - |
| admin_area_short | 8 | 8 | 0 | 0 | 8/8 | - |
| affidavit_other_app | 6 | 6 | 0 | 0 | 6/6 | - |
| affidavit_unsigned | 5 | 5 | 0 | 0 | 5/5 | - |
| bandwidth_short | 9 | 9 | 0 | 0 | 9/9 | - |
| core_branches_unmet | 12 | 12 | 0 | 0 | 12/12 | - |
| eoa_seat_increase | 8 | 8 | 0 | 0 | 16/16 | - |
| faculty_count_mismatch | 7 | 7 | 0 | 0 | 7/7 | - |
| faculty_shared | 7 | 7 | 0 | 0 | 21/21 | - |
| faculty_short | 10 | 10 | 0 | 0 | 10/10 | - |
| faculty_turnover | 12 | 12 | 0 | 0 | 12/12 | - |
| fire_after_submission | 9 | 9 | 0 | 0 | 9/9 | - |
| fire_copied | 9 | 9 | 0 | 0 | 53/53 | - |
| fire_expired | 6 | 6 | 0 | 0 | 18/18 | - |
| fire_other_name | 9 | 9 | 0 | 0 | 9/9 | - |
| fire_overwritten_other_font | 7 | 7 | 0 | 0 | 54/54 | - |
| fire_overwritten_same_font | 9 | 9 | 0 | 0 | 60/60 | - |
| fire_qr_mismatch | 9 | 9 | 0 | 0 | 25/25 | - |
| fire_unknown_number | 8 | 8 | 0 | 0 | 8/8 | - |
| fire_variant_instruction | 11 | 6 | 5 | 0 | 50/55 | SEC-INSTRUCTION-TEXT x5 |
| fire_variant_layout | 9 | 9 | 0 | 0 | 36/36 | - |
| intake_above_record | 6 | 6 | 0 | 0 | 25/25 | - |
| late_submission | 13 | 13 | 0 | 0 | 13/13 | - |
| nba_unsupported | 12 | 12 | 0 | 0 | 12/12 | - |
| oc_area_exceeded | 15 | 15 | 0 | 0 | 15/15 | - |
| oc_other_name | 10 | 10 | 0 | 0 | 10/10 | - |
| photo_c2pa_edited | 13 | 13 | 0 | 0 | 13/13 | - |
| photo_geotag_far | 10 | 10 | 0 | 0 | 10/10 | - |
| photo_reused | 7 | 7 | 0 | 0 | 21/21 | - |
| registry_outage | 4 | 4 | 0 | 0 | 4/4 | - |
| satmap_off_site | 7 | 7 | 0 | 0 | 7/7 | - |
| seal_other_issuer | 5 | 5 | 0 | 0 | 10/10 | - |
| ssc_expired | 7 | 7 | 0 | 0 | 14/14 | - |
| ssc_missing | 11 | 11 | 0 | 0 | 11/11 | - |
| ssc_pending | 12 | 12 | 0 | 0 | 12/12 | - |
| ter_not_received | 7 | 7 | 0 | 0 | 7/7 | - |
| ter_receipt_mismatch | 9 | 9 | 0 | 0 | 9/9 | - |
| yoy_built_up_decreased | 11 | 11 | 0 | 0 | 11/11 | - |
| yoy_cert_reused | 5 | 5 | 0 | 0 | 5/5 | - |
| yoy_land_decreased | 12 | 12 | 0 | 0 | 12/12 | - |

## By finding code

| Code | Expected and found | Expected, not found | Fired, not expected |
|---|---|---|---|
| ADD26-26C-CORE-BRANCHES | 12 | 0 | 0 |
| APH-232D-TER-STATUS | 7 | 0 | 0 |
| APH-617H-SSC-VALID | 7 | 0 | 0 |
| APH-617I-FIRE-VALID | 35 | 0 | 0 |
| APH-639-AFF2-DSC | 5 | 0 | 0 |
| APH-A21-SSC-REQUIRED | 11 | 0 | 0 |
| APH-A31D-FIRE-BEFORE | 29 | 0 | 0 |
| APH-ANX33-ADMIN-AREA | 8 | 0 | 0 |
| APH-ANX41-BANDWIDTH | 10 | 0 | 0 |
| APH-ANX5-FSR | 16 | 0 | 0 |
| FX-FIELD-OVERWRITTEN | 16 | 0 | 0 |
| FX-FONT-MISMATCH | 7 | 0 | 0 |
| FX-IMG-GEOTAG-FAR | 17 | 0 | 0 |
| FX-PDF-OVERLAID-TEXT | 16 | 0 | 0 |
| FX-PDF-REVISION-TEXT-CHANGE | 16 | 0 | 0 |
| FX-PDF-WHITEOUT | 16 | 0 | 0 |
| FX-SEAL-REUSED | 5 | 0 | 23 |
| FX-SEAL-REUSED-LATER | 5 | 0 | 23 |
| PH-C2PA-MODIFIED-AFTER-SIGNING | 13 | 0 | 0 |
| PN2627-DEADLINE | 13 | 0 | 0 |
| SEC-INSTRUCTION-TEXT | 6 | 5 | 0 |
| VER-ISSUER_REGISTRY-EXPIRED | 15 | 0 | 0 |
| VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED | 20 | 0 | 6 |
| VER-ISSUER_REGISTRY-MISMATCH_DETECTED | 26 | 0 | 0 |
| VER-ISSUER_REGISTRY-SOURCE_UNAVAILABLE | 4 | 0 | 0 |
| VER-ISSUER_REGISTRY-VERIFICATION_PENDING | 19 | 0 | 0 |
| VER-ISSUER_SIGNATURE-MISMATCH_DETECTED | 16 | 0 | 0 |
| VER-SIGNED_QR-EXPIRED | 15 | 0 | 0 |
| VER-SIGNED_QR-MISMATCH_DETECTED | 17 | 0 | 0 |
| XA-FACULTY-MULTIPLE-INSTITUTIONS | 14 | 0 | 0 |
| XA-FACULTY-REGISTERED-ELSEWHERE | 7 | 0 | 0 |
| XA-NEAR-DUPLICATE-DETAILS | 18 | 0 | 0 |
| XA-PHOTO-REUSED | 7 | 0 | 0 |
| XA-PHOTO-REUSED-LATER | 7 | 0 | 0 |
| XA-SHARED-CERTIFICATE-NUMBER | 18 | 0 | 0 |
| XD-ACCOUNTS-ENTITY | 13 | 0 | 9 |
| XD-AFF2-APPLICATION | 6 | 0 | 0 |
| XD-FACULTY-COUNT | 7 | 0 | 0 |
| XD-FIRE-INSTITUTION | 29 | 0 | 0 |
| XD-OC-AREA | 15 | 0 | 0 |
| XD-OC-INSTITUTION | 10 | 0 | 0 |
| XD-SATMAP-LOCATION | 7 | 0 | 0 |
| XR-EOA-NO-INCREASE | 14 | 0 | 0 |
| XR-INTAKE-RECORD | 6 | 0 | 0 |
| XR-NBA-CLAIMS | 12 | 0 | 0 |
| XR-TER-RECEIPT-MATCH | 9 | 0 | 0 |
| YOY-BUILT-UP-AREA-DECREASED | 11 | 0 | 0 |
| YOY-CERT-REUSED-NEW-VALIDITY | 12 | 0 | 0 |
| YOY-FACULTY-TURNOVER | 12 | 0 | 0 |
| YOY-INTAKE-JUMP | 14 | 0 | 0 |
| YOY-LAND-AREA-DECREASED | 12 | 0 | 0 |

## False alarms on clean applications

| Application | Codes |
|---|---|
| s1101-R004 | FX-SEAL-REUSED, FX-SEAL-REUSED-LATER |
| s1101-R038 | FX-SEAL-REUSED |
| s1101-R045 | VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, XD-ACCOUNTS-ENTITY |
| s1101-R064 | VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, XD-ACCOUNTS-ENTITY |
| s1101-R076 | FX-SEAL-REUSED |
| s1101-R086 | FX-SEAL-REUSED-LATER |
| s2202-R036 | FX-SEAL-REUSED, FX-SEAL-REUSED-LATER |
| s2202-R052 | FX-SEAL-REUSED-LATER |
| s2202-R066 | FX-SEAL-REUSED-LATER |
| s2202-R088 | FX-SEAL-REUSED, FX-SEAL-REUSED-LATER |
| s3303-R054 | FX-SEAL-REUSED-LATER |

## Every false positive and false negative

False positives (61): s1101-R004:FX-SEAL-REUSED, s1101-R004:FX-SEAL-REUSED-LATER, s1101-R018:FX-SEAL-REUSED, s1101-R018:FX-SEAL-REUSED-LATER, s1101-R020:FX-SEAL-REUSED, s1101-R020:FX-SEAL-REUSED-LATER, s1101-R024:FX-SEAL-REUSED-LATER, s1101-R026:FX-SEAL-REUSED-LATER, s1101-R038:FX-SEAL-REUSED, s1101-R045:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, s1101-R045:XD-ACCOUNTS-ENTITY, s1101-R057:FX-SEAL-REUSED, s1101-R057:FX-SEAL-REUSED-LATER, s1101-R061:FX-SEAL-REUSED, s1101-R064:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, s1101-R064:XD-ACCOUNTS-ENTITY, s1101-R070:FX-SEAL-REUSED, s1101-R071:FX-SEAL-REUSED-LATER, s1101-R076:FX-SEAL-REUSED, s1101-R083:FX-SEAL-REUSED-LATER, s1101-R086:FX-SEAL-REUSED-LATER, s1101-R089:FX-SEAL-REUSED, s1101-R089:FX-SEAL-REUSED-LATER, s2202-R001:FX-SEAL-REUSED, s2202-R012:FX-SEAL-REUSED-LATER, s2202-R018:XD-ACCOUNTS-ENTITY, s2202-R021:FX-SEAL-REUSED, s2202-R021:FX-SEAL-REUSED-LATER, s2202-R024:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, s2202-R024:XD-ACCOUNTS-ENTITY, s2202-R032:FX-SEAL-REUSED, s2202-R032:FX-SEAL-REUSED-LATER, s2202-R036:FX-SEAL-REUSED, s2202-R036:FX-SEAL-REUSED-LATER, s2202-R046:FX-SEAL-REUSED, s2202-R052:FX-SEAL-REUSED-LATER, s2202-R066:FX-SEAL-REUSED-LATER, s2202-R070:FX-SEAL-REUSED-LATER, s2202-R072:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, s2202-R072:XD-ACCOUNTS-ENTITY, s2202-R082:FX-SEAL-REUSED-LATER, s2202-R088:FX-SEAL-REUSED, s2202-R088:FX-SEAL-REUSED-LATER, s2202-R092:FX-SEAL-REUSED, s3303-R002:FX-SEAL-REUSED-LATER, s3303-R011:FX-SEAL-REUSED, s3303-R011:FX-SEAL-REUSED-LATER, s3303-R020:FX-SEAL-REUSED, s3303-R027:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, s3303-R027:XD-ACCOUNTS-ENTITY, s3303-R028:XD-ACCOUNTS-ENTITY, s3303-R029:FX-SEAL-REUSED, s3303-R031:VER-ISSUER_REGISTRY-MANUAL_REVIEW_REQUIRED, s3303-R031:XD-ACCOUNTS-ENTITY, s3303-R047:FX-SEAL-REUSED, s3303-R054:FX-SEAL-REUSED-LATER, s3303-R069:FX-SEAL-REUSED-LATER, s3303-R069:XD-ACCOUNTS-ENTITY, s3303-R072:FX-SEAL-REUSED, s3303-R090:FX-SEAL-REUSED, s3303-R098:FX-SEAL-REUSED.

False negatives (5): s1101-R042:SEC-INSTRUCTION-TEXT, s1101-R058:SEC-INSTRUCTION-TEXT, s2202-R005:SEC-INSTRUCTION-TEXT, s2202-R063:SEC-INSTRUCTION-TEXT, s3303-R026:SEC-INSTRUCTION-TEXT.
