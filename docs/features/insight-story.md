# Insights: document life story and inspection brief

Two officer features that turn evidence Pramana already holds into something an official can read at a glance. Both are decision support: they show where to look and what to ask, and never call a document anything or decide anything.

## 1. Document life story

### What it shows

A chain of custody for one file, built only from evidence inside the file and Pramana's own records. Events run left to right in time order on two lanes:

- **In the file (what it claims)**
  - **Issued (printed):** the issue date read from the page, with its page box (`issue_date`, `sworn_date`, `payment_date` or `valid_from`). For a Gazette of India notification, the masthead date ("MONDAY, JANUARY 6, 2025") or the date in the gazette number (`CG-DL-E-18062020-220000`).
  - **Created:** the file's CreationDate and the Creator and Producer recorded in the first revision. The text says plainly that the creating tool wrote both, so they are claims.
  - **Signed:** each embedded signature with signer, role (issuer or applicant, from the validation run), signing time, and the revision it covers (from its `/ByteRange`).
  - **Edited, Annotated, Re-saved:** each later revision with what changed (from the revision diff: "'30-06-2027' was drawn over '30-06-2025' on page 1"), the ModDate and Producer of that revision when it changed them, and annotations added. A signature's own widget annotation is part of signing, not an event.
  - **Photos:** Captured (EXIF DateTimeOriginal and camera), Credentials signed (C2PA), actions recorded in the manifest, Changed after signing (the file no longer matches the signed hash; no time is recorded for that), and a later EXIF save by editing software.
- **Pramana (its own records)**
  - **Uploaded** by the institution user, at the server's time, with the SHA-256 recorded at upload and whether the stored file still matches it.
  - **Read** (text layer, OCR, Devanagari OCR, or photo analysis) and **Checked** in each validation run, with the findings that point at the file.
  - On Analyse: **Analysed here**, at the time of the upload.

### How far each time can be trusted

Every time carries its source, shown by a small mark next to it and spelled out in the detail and the list view:

| Mark | Trust | Sources |
|---|---|---|
| Solid | Trusted | Recorded by Pramana; a timestamp token |
| Half | Self-asserted | The signer's software (signing time); the capture device's clock (C2PA) |
| Hollow | Editable | File metadata (CreationDate, ModDate); EXIF |
| Dashed | Claim | A date printed on the page |
| Dash | No time | Placed in file order between its neighbours |

PDF dates honour the zone written in the file (`D:20250107190806+05'30'` is 13:38:06 UTC). A date without a zone, and every EXIF time, is read as IST and says so. Times show in IST; the detail also shows the value exactly as written.

### What stands out (anomalies)

Drawn as labelled brackets above the strip and listed beside the detail, worst first. Each says what it rests on.

| Code | Severity | When | Basis |
|---|---|---|---|
| `STORY-AFTER-SIGNING` | high (issuer), medium (applicant), info (re-save only) | A revision after a signed revision changes text or adds an annotation. Says how long after by the file's own clocks: "Changed after the issuer signed, 1 second later" | File structure (byte ranges), so it holds even when every clock in the file is wrong |
| `STORY-APPLICANT-ONLY` | medium | An issuer document whose only signature is the applicant's own | Structure and the run's signer role |
| `STORY-EDITOR-CREATED` | medium | An issuer document whose creating tool is a desktop editor or converter (Word, LibreOffice, Print to PDF and the rest of `EDITOR_HINTS`) | Metadata |
| `STORY-CREATED-BEFORE-ISSUE` | medium | The file was created before the issue date printed on it | Metadata and the printed date |
| `STORY-CREATED-LONG-AFTER-ISSUE` | info | Created more than 180 days after the printed issue date; worded as common for downloaded or re-issued copies | Metadata and the printed date |
| `STORY-NO-SIGNATURE` | info | An issuer document with no digital signature: every time in it is a claim | Structure |
| `STORY-PHOTO-MODIFIED` | high | The photo no longer matches the hash its Content Credentials signed | Structure (C2PA hash) |
| `STORY-PHOTO-SAVED-LATER` | low | EXIF save time later than capture time | Metadata |

The wording never calls a file forged, fake, fraudulent or genuine; the tests check it.

### The component

`frontend/src/pages/application/insights/LifeStory.tsx` draws the strip by hand (SVG for lines, bands, brackets and breaks; HTML buttons for the events):

- **Broken, logarithmic axis.** The step between two events grows with the logarithm of the time between them, capped at a day; a gap longer than a day is drawn as a break on both lanes with its real length in a pill ("3 years 4 months"). Shorter intervals are labelled on the shared Interval axis ("same second", "+13 s", "+2 min"). A date printed without a time is compared by calendar day ("next day"). A caption under the strip states the scale.
- **Film strip.** Small page thumbnails at the points where the page changed (each revision once), with the changed region outlined in red on the edit revision; the photo for a photo.
- **Signature coverage.** A green band on the file lane from Created to the issuer's signature, labelled "Issuer signature covers revisions 1 to 2" (grey for an applicant); a hatched red band for revisions after the last signature.
- **Markers.** One drawn glyph per kind (page, printed date, seal rosette, pencil, note, aperture, warning, upload, read, check). Pramana's records are filled (trusted); file events are outlined; warnings use the mismatch tone, the issuer's seal the verified tone.
- **Evidence.** Selecting an event shows its time, source, value as written, signer or tool and what the evidence says, with a button to the evidence: the time machine at that revision, the region on the page, the signature or credentials check, the capture metadata, the fields read, the findings, or the activity log.
- **Accessible.** The strip is a group with a text summary; events are buttons in time order with full labels, Left and Right move between them (roving tab stop), Home and End jump. A List view is the text alternative: a table with every event, time, source and detail. No animation; light and dark come from the design tokens.

### Where it appears

- **Workspace, Documents, any document (officers):** a full-width Life story panel above the viewer. It can be hidden; the choice is kept in this browser. Opening evidence scrolls to the viewer and switches the side panel.
- **Analyse a document:** the same component under the report header, from the in-memory analysis, with its own entry in the page index.

### Backend

`backend/pramana/insights/story.py`, one builder shared by both routes:

- `build_story(mime, data, fields, pages, facts, photo, revisions, signatures, own, issuer_doc)` reads the per-revision document information dictionary with pikepdf (`revision_infos`), combines it with `history.revisions.describe` (signatures and coverage), the revision diff, the signature validation responses and Pramana's own events, orders events by time (an event without a time stays after its predecessor in file order) and adds the anomalies.
- `GET /api/documents/{doc}/story`: officials only (institutions get 403); built from the stored file, its verification attempts, the upload audit event and the validation runs.
- `POST /api/analyse` now returns `story` in its result, built by `analyse.core._story`. A failure there is logged and never costs the rest of the report.

## 2. Inspection brief

**More actions, Prepare inspection brief** (officers) opens a printable brief for the Expert Visit Committee, prepared from the application's open findings:

- **Summary** in one or two lines: open findings, high ones, what to do on site.
- **Original documents to ask for:** each document with a forensic or verification finding of medium severity or more, with the findings that make it worth seeing and what to ask for (the original, or a copy certified by the issuer).
- **What to count or see on site:** declared facilities against the room check ("15 workstations declared, 6 visible in lab_photo.jpg"), the declared labs, faculty, built-up area, land and bandwidth, each with how to check it.
- **Where to go:** the campus point on record, the point declared on the satellite map and every photo geotag, drawn as a small plot (rings at the geotag threshold and twice it; a far geotag sits on the outer ring with its real distance, for example 329 km).
- **Photos to retake**, with the reasons.
- **Questions to ask**, one per kind of finding, worded as questions.

**Download PDF** (`GET /api/applications/{app}/inspection-brief.pdf`) gives the same brief as a neutral A4 PDF with no letterhead, footed "Prepared with the Pramana prototype. Synthetic demo data." Preparing the brief (`POST /api/applications/{app}/inspection-brief`) and downloading the PDF each record an `inspection_brief.generated` audit event with the format and counts. Code: `backend/pramana/insights/inspection.py` and `frontend/src/pages/application/insights/InspectionBriefDialog.tsx`.

## Fixes made on the way

- `pipeline/text.render_pdf_page` now takes a lock. PDFium is not thread-safe, and the story requests several revision thumbnails at once; parallel in-process renders crashed the server with an access violation. The time machine could hit the same crash.
- `scripts/make_fixtures.py` writes the full local zone offset in fixture PDF dates. ReportLab dropped the minutes of half-hour zones, so IST was written as `+05'00'` and creation appeared 30 minutes after signing.

## Tests

`backend/tests/test_insight_story.py`: A7's edit after the issuer signed (events, sources, order, coverage and the anomaly), A1's clean issuer-signed NOC (no warning), A8's applicant-only signature and A7's photo changed after capture, officials only, the real 2025 e-Gazette on Analyse (masthead date, zone-correct creation time, signer, no anomaly), a Word-made issuer document with a creation date before its issue date, PDF date parsing, and the inspection brief (content, PDF, audit events, roles, wording).

## Demo path

1. Sign in as `officer`. Panchganga Institute of Technology (APP-2026-000107), Documents, Fire Safety Certificate: the strip reads Issued 01 Jul 2023, a 3-year break, Created, Issuer signed (green band, revisions 1 to 2), Edited, revision 3 (red hatch, thumbnail with the changed date outlined), then Uploaded, Read and Checked on Pramana's lane. "Open revision 3 in the time machine" jumps to the edit.
2. Deccan Institute (APP-2026-000108), Fire Safety Certificate: "Signed only by the applicant".
3. APP-2026-000101 and APP-2026-000107, the lab photos: Captured, Credentials signed, and for A7 "Changed after signing" with no time.
4. Analyse a document, `fixtures/real/egazette_2025_260000.pdf`: dated 6 Jan 2025 by its masthead, created the next day, signed 3 minutes later, nothing stands out.
5. Analyse `fixtures/out/tamper_lab/fire_word.pdf` (a real Word round-trip): "Made with a desktop editor or converter" and "No digital signature in the file".
6. Tapi Valley (APP-2026-000110), More actions, Prepare inspection brief: the far geotag pinned at 329 km, Download PDF.
