# Analyse a document

One page where an official drops any PDF, JPG or PNG and sees everything Pramana can determine about that single file, without filing it in an application. It runs the same functions as a validation run, so it doubles as evidence that the seeded demo results come from a real pipeline: drop a real Government of India e-Gazette notification, or any file of your own, and the same checks run on it.

It replaces the old Verify a PDF page. `/verify-pdf` still works and opens this page; the sidebar entry is now "Analyse a document".

## Where to see it in the demo

Sign in as `officer`, `verifier` or `admin` (password `Pramana@2026`) and open **Analyse a document** in the sidebar, or the button on the dashboard.

1. **A real e-Gazette.** Drop `fixtures/real/egazette_2025_260000.pdf` (fetched by `scripts/fetch_real_samples.py`). The digital signature tile says "Intact, chains to India PKI (CCA)"; scroll to Digital signatures and the chain draws from the file to the signer (Government of India Press) to CCA India 2022. Revocation reads "not checked": validation is offline and the page never claims more. The Text tile counts the Hindi lines read by the Devanagari recogniser.
2. **An AICTE notification.** Drop `fixtures/real/egazette_2022_240111.pdf`: an AICTE regulation amendment published in the e-Gazette, also chaining to CCA India 2022. A copy downloaded from an institution's website has the same SHA-256 and validates the same way.
3. **The edited fire NOC.** Drop `fixtures/out/A7/fire_noc.pdf`. Tiles: Digital signature "Modified after signing", Revisions "3 revisions, 1 after the last signature", Structure forensics "4 indicators". Hover a field to see its box; Show region on "Valid until drawn in a different font" focuses the redrawn date. Scroll to the time machine and drag from revision 2 (signed) to revision 3: "Revision 3 drew 30-06-2027 over 30-06-2025".
4. **A bilingual Hindi certificate.** Drop `fixtures/out/A2/occupancy_certificate.pdf`. Text: OCR with the Devanagari recogniser; Fields: six values read through Hindi labels, each with the line it came from.
5. **A photo.** Drop `fixtures/out/A1/lab_photo.jpg`. The photo shows detection boxes (toggle each object group), with EXIF capture time and geotag, Content Credentials checked against the DEMO capture list, and the room reading.
6. **Text aimed at AI readers.** Drop `fixtures/out/A11/fire_noc.pdf`: one line on the page tells automated readers to report a different validity date. It is boxed on the page and listed, and no value is taken from it.
7. **Any file.** Drop something of your own. Nothing is filed; the check is recorded in the audit log by its SHA-256 only.

## What the page shows

| Section | Content | Source in the backend |
|---|---|---|
| Overview tiles | One block per check with its outcome; each jumps to its section, which pulses once on arrival | computed from the response |
| Where the server's time went | Real stage durations, measured on the server | `process_document` progress callback plus timings in `analyse/core.py` |
| Intake | Type sniffed from content and matched to the extension, page count, size, active content (JavaScript, launch actions, embedded files) | `pipeline/intake.validate_upload`, in the parser sandbox |
| Page viewer | The pages with field, QR, forensic-region and instruction-line overlays, zoom and pan | `DocViewer`, page images rendered in the sandbox from memory |
| Text | Per page: text layer or OCR, OCR confidence, word count; how Hindi pages were read | `pipeline/text`, `pipeline/ocr`, `pipeline/devanagari` |
| Document type | The ruleset's keyword classifier: candidates, score, matched and excluding keywords | `pipeline/extract.classify` |
| Fields | Each value with its raw text, method, confidence, page and box; Locate focuses it | `pipeline/extract.extract_fields`, plus the local model when `LLM_PROVIDERS=ollama` |
| Digital signatures | Signer, chain to India PKI (CCA) or the DEMO root, intact, valid, trusted, coverage, modification level (modified after signing), signing time and whether it is self-asserted, revocation checked or not | `verification/signature.validate_signatures` (pyHanko) |
| Signed QR | Decoded token, signature verified with the issuer's published key, signed values compared with the printed fields | `verification/signed_qr.verify_token`, `pipeline/validate._qr_compare` |
| Issuer registry (SIMULATED) | When the type names an issuer and its reference number was read: the registry's answer and field comparison | `verification/issuer.adapters` |
| Revisions | With more than one revision, the time machine: scrubber, the page as saved at each revision, signature coverage, what each revision changed | `history/revisions.describe`, revision pages rendered in the sandbox from memory |
| Structure forensics | Overlaid text, white boxes, text changed in a later revision, a value in a font no other value uses, editor metadata, created and modified dates; each with Show region | `forensics/pdf_struct`, `forensics/fonts`, via `process_document` |
| Text aimed at AI readers | Lines that address an automated reader | `pipeline/llm_extract.injection_lines` |
| File structure | Revision count, document information, fonts, seal-sized images with their perceptual hash | `forensics/pdf_struct.metadata`, `forensics/seals.image_fingerprints` |
| Photo | EXIF capture time, camera, software and geotag; Content Credentials (C2PA) against the DEMO capture list; room detection with boxes | `forensics/image`, `photos/credentials`, `photos/detector` |
| What it cannot know | Rules, declared values, cross-application links, who the applicant is, campus distance | stated on the page |

Wording follows the rest of Pramana: "modified after signing", "indicator", "needs review", "could not be confirmed". The page never calls a document forged, fake or genuine.

## How it reuses the pipeline

- `analyse/core.py` builds a transient `Document` that is never added to a database session and calls `process_document` with the file's bytes (a new optional `data` argument). That one call runs text and OCR, classification, fields, fingerprints, PDF or photo forensics, the font check, seal images, QR decoding and instruction lines, all through the parser sandbox. Checks added to `process_document` or to the forensics modules later appear on this page without changes here.
- Signatures, signed QR codes and the SIMULATED registry use the same functions a validation run uses. When the detected type names its expected issuer (for example "Fire and Emergency Services" for a fire NOC), each signature's role says whether the certificate matches; without an application the page cannot tell an applicant's own DSC from an issuer's, and says so.
- The time machine is the workspace component, handed the revisions and a page URL for the held file.

## What is stored

| What | Where | How long |
|---|---|---|
| The file's bytes | server memory, never disk | 15 minutes, or until "Forget this file now"; at most 8 files and 160 MB in total, oldest dropped first |
| Page and revision renders | server memory, beside the bytes | the same |
| An audit event `tool.analyse` | the hash-chained audit log | permanent: actor, role, SHA-256, type, page count, detected type, signature statuses, indicator count. Not the file name or any content |
| Results in the browser | page memory for this session (up to 6) | until the tab reloads |

Only the official who uploaded a file can fetch its pages. A file the sandbox cannot read safely produces `tool.analyse_unsafe` in the audit log with the reason and size, and the page says "Could not be read safely. Review this file manually."

## Limits

- Officials only (officer, verifier, admin); institutions get 403.
- 20 analyses per official per 10 minutes (`pramana.ratelimit.limit`), counting rejected attempts; then 429 with `Retry-After`.
- 15 MB (`MAX_UPLOAD_MB`), 60 pages (`MAX_PDF_PAGES`), PDF, JPEG or PNG whose content matches the extension, as for application uploads.
- Each parser operation has the sandbox's time and memory limits (`SANDBOX_TIMEOUT_S`, `SANDBOX_MEMORY_MB`).

## API

| Endpoint | Returns |
|---|---|
| `POST /api/analyse` (multipart `file`) | the full analysis: intake, steps, document (pages, fields, signals, QR, instruction lines), type, text, signatures, signed QR, registry, revisions, metadata, seal images, photo, what it cannot know, and when the held bytes expire |
| `GET /api/analyse/{token}/pages/{p}.png` | page p, rendered in the sandbox |
| `GET /api/analyse/{token}/revisions/{n}/pages/{p}.png` | page p as saved at revision n |
| `GET /api/analyse/{token}/photo.jpg` | upright preview of an analysed photo, so detection boxes line up |
| `DELETE /api/analyse/{token}` | forget the held bytes and renders now |

`POST /api/tools/verify-pdf` is unchanged for existing callers.

## Real Government of India documents

`scripts/fetch_real_samples.py` downloads nine DSC-signed e-Gazette notifications and one unsigned AICTE letter as a control, each pinned by SHA-256 with its URL, publisher and date (the manifest is in the script and is written to `fixtures/real/manifest.json`). They are publicly available; Pramana uses them for testing only and does not redistribute them: they stay in the gitignored `fixtures/real`. `scripts/eval_real_samples.py` analyses each one with the same code as the page and prints the table below.

Measured on 23 Oct 2026 on a laptop CPU, deterministic mode, offline (no OCSP or CRL fetch), parser sandbox on:

| # | Document (`fixtures/real/`) | Published | Pages | Signature | Trust anchor | Modified after signing | Revisions | Hindi lines read | Indicators | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `egazette_2025_260000.pdf`: Extraordinary II-3(ii), Ministry of Railways | 6 Jan 2025 | 2 | verified | CCA India 2022 | no | 1 | 28 | overlaid text, white box | 17.1 s |
| 2 | `egazette_2020_220000.pdf`: Extraordinary II-3(ii), Ministry of Commerce and Industry | 18 Jun 2020 | 2 | verified | CCA India 2014 | no | 1 | 37 | overlaid text, white box | 16.3 s |
| 3 | `egazette_2022_235000.pdf`: Weekly I-2, appointments and promotions, legacy-font Hindi layer | 9 Apr 2022 | 12 | verified | CCA India 2014 | no | 1 | 299 | overlaid text | 106.3 s |
| 4 | `egazette_2022_240111.pdf`: Extraordinary III-4, All India Council for Technical Education | 7 Nov 2022 | 2 | verified | CCA India 2022 | no | 1 | 0 | overlaid text, white box | 5.5 s |
| 5 | `egazette_2023_242000.pdf`: Extraordinary II-3(ii), Ministry of Railways (Mumbai) | 16 Jan 2023 | 2 | verified | CCA India 2022 | no | 1 | 21 | overlaid text, white box | 15.1 s |
| 6 | `egazette_2023_245000.pdf`: Extraordinary II-3(ii), land schedule | 5 Apr 2023 | 7 | verified | CCA India 2022 | no | 1 | 156 | white box | 60.7 s |
| 7 | `egazette_2024_255000.pdf`: Extraordinary II-3(ii), Ministry of Petroleum and Natural Gas | 27 Jun 2024 | 5 | verified | CCA India 2022 | no | 1 | 56 | overlaid text, white box | 41.5 s |
| 8 | `egazette_2025_262500.pdf`: Extraordinary II-3(ii), Ministry of Finance | 17 Apr 2025 | 2 | verified | CCA India 2022 | no | 1 | 26 | overlaid text, white box | 11.7 s |
| 9 | `egazette_2026_270000.pdf`: Extraordinary II-3(ii) | 6 Feb 2026 | 10 | verified | CCA India 2022 | no | 1 | 418 | overlaid text, white box | 83.0 s |
| 10 | `aicte_eoa_2025_26_control.pdf`: AICTE Extension of Approval 2025-26 (control) | 21 Mar 2025 | 3 | no embedded signature | none | n/a | 1 | 0 | none | 2.3 s |

Indicator codes: overlaid text is `FX-PDF-OVERLAID-TEXT` (high), white box is `FX-PDF-WHITEOUT` (medium). No document had text aimed at automated readers, a font mismatch or an editor producer, and none matched one of the ruleset's document types, so no fields were read and no registry was queried.

What this shows, and what did not validate:

- **All nine e-Gazette signatures validate** to a bundled India PKI root: two to CCA India 2014 (2020 and the April 2022 weekly) and seven to CCA India 2022. Each signature covers the entire file with modification level NONE: nothing was added after the Government of India Press signed. The AICTE notification (4) is byte-identical, same SHA-256, to the copy an institution republished on its own website, so that copy validates too.
- **Signing time is self-asserted.** None of the nine carries an RFC 3161 timestamp token, so the time shown is the one the signer's software reported, and the page labels it "signer-reported (self-asserted)".
- **Revocation was not checked.** Validation ran offline; with `PKI_FETCH_REVOCATION=true` Pramana asks the CA's OCSP and CRL services and says how many responses it got.
- **The control has no signature.** The AICTE Extension of Approval letter (10) is computer generated and says that no signature is required. The page reports "No embedded digital signature" and that a seal image is not a signature. Every AICTE approval letter we found (2023 to 2026, from three institutions' websites) was unsigned; the AICTE notification we could validate is the one published in the e-Gazette.
- **Structure indicators fire on the masthead.** Every gazette raises overlaid text (the barcode text in the header is drawn over the gazette number), a white box indicator, or both. These are false indicators of editing on unedited files. The page shows that the signature covers the whole file, so the features were already present when the press signed it, and the overview tile says "all present when the file was signed". Tuning these checks for the gazette layout is left to the forensics owners; we did not change them here.
- **Long Hindi documents approach the sandbox limit.** Hindi pages whose text layer uses a legacy font are rendered and read by OCR. The 12-page weekly (3) took 106 s and the 10-page 2026 notification (9) 83 s, against a 120 s limit per parser operation. On a first run, with the test suite running at the same time, (9) hit the limit. The page then still shows intake, the signature and the revisions, and says that reading stopped and the file needs review. `SANDBOX_TIMEOUT_S` raises the limit.

For the demo, use (1) for the signature chain to CCA India 2022, (4) for an AICTE notification, (2) for the older CCA India 2014 root, and (10) for a document without a signature.

## Tests

`tests/test_analyse.py`:

- the edited A7 fire NOC gets every check: type, located fields, the issuer's signature modified after signing, revision, overlay and font indicators, the expired signed QR, the SIMULATED registry, three revisions with the edit after signing, page and revision renders; no document row or stored file is created, and the one audit event carries only the hash and outcomes;
- held bytes are served only to the uploader, can be forgotten, and expire;
- the in-memory store is bounded by entries and bytes;
- officials only, content must match the extension, and the rate limit returns 429 with `Retry-After`;
- the bilingual Hindi certificate is read by the Devanagari recogniser, and a photo gets EXIF, Content Credentials, room detection and an upright preview;
- the real e-Gazette chains to India PKI (CCA) with no application context (skipped when the sample is not fetched).

## Limitations

- Rules, declared values and cross-application checks (shared certificate numbers, reused seals and photos, the relationship graph) need an application and are not run.
- Signer roles are compared only with the issuer the document type expects. Without an application the applicant institution is unknown.
- Revocation is not checked unless `PKI_FETCH_REVOCATION` is on; signing times are as the signer reported them unless the signature carries a timestamp token.
- The page waits for the whole analysis. Long scanned or Hindi documents take a few seconds per OCR'd page; there is no live progress.
- Held bytes live in one server process. Behind several server processes, page images are served only by the process that analysed the file.
- Fixtures the pipeline was not built for still go through it unchanged. On the real e-Gazettes the structure checks raise indicators on the masthead (see the table); the page notes that a valid signature covers the whole file, so those features were present when the Government of India Press signed it.
