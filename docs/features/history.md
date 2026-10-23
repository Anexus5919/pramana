# History: revision time machine, re-verification watch, year-over-year comparison

Three features that look at an application across time: inside one file (its saved revisions), after the scrutiny outcome (the watch), and against the previous academic year (the comparison). All three are decision support. They show evidence and raise indicators; officials decide.

## 1. Revision time machine

### What it does

A PDF with incremental updates keeps every earlier version inside the same file. The time machine lets an official step through those saved revisions and see the actual page as it stood at each one.

- **Scrubber.** One block per revision, in the block motif. Bands above the blocks show which bytes each signature covers, and which revisions lie outside every signature.
- **Page.** The render of the selected revision. Moving between revisions crossfades the page.
- **Changed regions.** On reaching the revision that introduced a text change, the region draws its outline, pulses once and is labelled, for example "Revision 3 drew 30-06-2027 over 30-06-2025". Earlier revisions show the same region dashed ("changes later").
- **Signature markers.** For example "Chief Fire Officer Kolhapur signed: revision 2", with the signer role (issuer, applicant or unknown) and the status from the latest validation run.
- **What changed.** A list per revision: byte range, objects written, signatures added, text changes with a "Show on the page" action.
- **Keyboard.** The scrubber is a slider: Left and Right (or Up and Down) step, Home and End jump. The page area also takes Left and Right. The selected revision is in the URL (`rev=`), so a link opens the same view.

### How it works

- Revision boundaries come from `forensics/pdf_struct.revision_offsets`, the end of each `%%EOF` marker.
- An incremental update only appends, so the file cut at a revision's boundary is that revision byte for byte. `history/revisions.render` cuts the file there and renders the page with pypdfium2, at the same 110 DPI as the ordinary page images. Renders are cached in `var/cache` as `<doc>_r<n>_p<page>.png`.
- Each embedded signature's `/ByteRange` gives the last byte it covers. The signature belongs to the revision ending there, and covers every revision up to it.
- Signer role and status come from the verification attempts of the validation run, which already classified who signed.
- Text changes are the `revision_diffs` stored by the forensics stage (`diff_revisions`), each tagged with the revision that introduced it.

API (officials only; institutions get 403):

| Endpoint | Returns |
|---|---|
| `GET /api/documents/{doc}/revisions` | revisions with byte ranges, kind, signatures, coverage and text changes; page sizes; limitations |
| `GET /api/documents/{doc}/revisions/{n}/pages/{p}.png` | the page as saved at revision n |

### What it does not prove

- An unsigned revision carries no proof of who saved it or when. The time machine shows that bytes were added and what they draw, not who added them.
- A revision after the issuer's signature is not covered by that signature. That is a fact about the file; issuers do sometimes amend documents, so it remains an indicator to confirm with the issuer.
- A document retyped from scratch has a single revision and nothing to step through.

### Limitations

- Text changes are compared through the text layer. A change drawn as an image or vector shapes appears on the rendered page but not in the change list.
- Files re-saved by a tool (full rewrite, linearisation) lose their earlier revisions; the time machine then shows one revision.
- Only PDFs have revisions. Images show "Not a PDF".

## 2. Re-verification watch

### What it does

- **Scrutiny outcome.** An officer records the outcome they decided, with a written reason of at least 10 characters. The choices are "Scrutiny complete, no deficiency recorded", "Scrutiny complete, deficiencies recorded" and "Referred to an expert visit committee". None of them approves or rejects. The outcome is stored, written to the audit chain and shown on the Overview tab with who recorded it. The application status is left unchanged.
- **What is watched.** Every certificate that an issuer registry confirmed (status verified) on the latest validation run: for example the fire NOC, occupancy certificate, e-stamp and UDIN. Sources that were unavailable or pending at the time were never confirmed, so they are not watched.
- **Checks.** A background scheduler re-queries each watched reference in the simulated issuer registry and re-checks validity dates against today. It runs every 24 hours by default; "Run watch now" runs it on demand.
- **Changes reported:**

  | Change | Finding code | Severity |
  |---|---|---|
  | revoked by the issuer | `WATCH-ISSUER-REVOKED` | high |
  | suspended by the issuer | `WATCH-ISSUER-SUSPENDED` | high |
  | expired since the outcome | `WATCH-CERT-EXPIRED` | high |
  | no longer found in the registry | `WATCH-ISSUER-NOT-FOUND` | high |
  | issuer record now differs from the document | `WATCH-ISSUER-RECORD-CHANGED` | high |
  | registry did not respond | `WATCH-SOURCE-UNAVAILABLE` | medium |

- **Each change creates:**
  - a watch event, shown in the watch card;
  - a finding on the application, evidence class issuer, labelled as a SIMULATED registry result;
  - an audit event (`watch.change_detected`);
  - a dashboard alert ("Re-verification watch"), listed ahead of other alerts of the same severity.
- A change is reported once, on the transition. When the registry confirms the certificate again, a "restored" event closes the alert. The finding stays for an official to review.
- **Simulator control.** The Issuers page has an "Issuer actions" card (SIMULATED) where an officer or administrator plays the issuing authority: revoke, suspend or restore a reference, then run the watch. `POST /api/sim/issuers/{code}/records/status` does the same.

API:

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/applications/{app}/watch` | officials | outcome, watched items, events, last and next check |
| `POST /api/applications/{app}/scrutiny-outcome` | officer | record an outcome with a reason; starts the watch |
| `GET /api/watch` | officials | schedule and last run |
| `POST /api/watch/run` | officials | run the watch now |
| `POST /api/sim/issuers/{code}/records/status` | officer, admin | revoke, suspend or restore a simulated record |

Settings: `PRAMANA_WATCH_INTERVAL_HOURS` (default 24) and `PRAMANA_WATCH_SCHEDULER` (default true; false leaves only on-demand runs).

The seeded world already has outcomes recorded for A1 (no deficiency) and A6 (deficiencies recorded), so their certificates are watched from the start.

### What it does not prove

- The registries are simulated. A watch result says what the simulated registry answered, nothing about a real issuer.
- The watch never changes a recorded outcome or the application status. What happens after a revocation is an official's decision.

### Limitations

- Watch findings are added to the application's latest completed run after that run finished. They are not part of that run's report digest, so replaying the run still reproduces it. If a later validation run is made, the next watch pass carries open watch findings onto it.
- The scheduler runs inside the API process. With several server processes each would run it; a deployment would move it to one worker or a job queue.
- Notification is the dashboard and the workspace only; there is no email or SMS.
- Validity is checked against the server's date.

## 3. Year-over-year comparison

### What it does

The "Since last year" tab compares the application with the institution's previous application (AY 2025-26), held as an AICTE record:

- declared values: land, built-up, administrative and amenities area, bandwidth, faculty count;
- intake per programme and NBA claims;
- the faculty roster by faculty ID, drawn as blocks: on both rosters, gone this year, new this year;
- labs added or no longer declared;
- key certificate numbers (fire NOC, occupancy certificate, NBA letter, e-stamp, UDIN) side by side.

Ordinary changes are shown without findings: a few faculty moving, a bandwidth upgrade, a fire NOC renewed under a new number, a lab added. Changes that are hard to explain become indicators, evidence class record, in the validation run:

| Code | Raised when | Cites |
|---|---|---|
| `YOY-LAND-AREA-DECREASED` | declared land area is lower than last year | configuration (no land clause encoded) |
| `YOY-BUILT-UP-AREA-DECREASED` | declared built-up area is lower than last year | APH Annexure 3.2(c), via XD-OC-AREA |
| `YOY-FACULTY-TURNOVER` | more than half of last year's faculty IDs are not on this year's roster | Affidavit 2 item 9, via XD-FACULTY-COUNT |
| `YOY-CERT-REUSED-NEW-VALIDITY` | a certificate number from last year comes back with a different validity date | APH Cl. 6.17(i), via APH-617I-FIRE-VALID (fire NOC) |
| `YOY-INTAKE-JUMP` | an Extension of Approval proposes more seats than last year's approved intake | APH Cl. 2.6, via XR-EOA-NO-INCREASE |

Each indicator points at its evidence: the declared value or the page region, and the previous-year record.

### How it works

- `make_fixtures.py` writes one `previous_application` reference record per institution. It uses its own random generator, so the existing fixture values do not change.
- `history/yoy.py` reads this year's values from the declared form data, the faculty list rows and the extracted certificate fields. It compares them with the record and returns the comparison and the indicators.
- `run_validation` adds the indicators to the run, so they are counted, digested and replayed like every other finding.
- The 50% turnover threshold and the area tolerances are configuration, not handbook law, and are labelled as such.

Planted conditions (added to the fixture ground truth):

| App | Condition |
|---|---|
| A2 | last year's application carried the same fire NOC number, valid to 11-03-2026; this year it shows validity to 11-03-2027 |
| A4 | 60 approved CE seats last year; this Extension of Approval proposes 120 |
| A8 | 22 of the 36 faculty IDs on last year's roster are gone |
| A10 | 12.5 acres of land declared last year, 10.5 this year |

API: `GET /api/applications/{app}/since-last-year` (officials only).

### What it does not prove

- The previous-year records are synthetic stand-ins for the AICTE approval portal.
- An indicator asks for an explanation; land is sold, faculty do leave, issuers sometimes extend a certificate under the same number.
- A roster comparison by ID cannot see a person re-registered under a new ID.

### Limitations

- Only one previous year is compared.
- Land norms (minimum area by intake) are not encoded, so a land decrease is not checked against them.
- A certificate number that could not be read this year (A11 without the local model) is shown as "Not read" and not compared.

## Demo walkthrough

1. **Time machine (A7).** Panchganga Institute, Documents tab, Fire Safety Certificate, panel "Time machine". Click Rev 2: the page reads 30-06-2025. Press the Right arrow (or drag to Rev 3): the date crossfades to 30-06-2027, the region draws and is labelled, and the band shows revision 3 is not covered by any signature.
2. **Watch (A6).** Krishna Valley College, Overview: the recorded outcome and four watched certificates. Click "Issuer simulator" on the fire NOC row; the Issuers page opens with the reference filled in. Click Revoke, then "Run re-verification watch now". The toast names Krishna Valley. Back on the Overview the fire NOC row turns red and a finding appears. The dashboard's first alert is the watch alert. Restore the reference afterwards.
3. **Since last year (A8).** Deccan Institute, "Since last year": 22 hollow blocks in last year's roster, the 61% bar past the 50% marker, and the indicator citing Affidavit 2 item 9. Compare with A1 (Shree Dnyaneshwar): ordinary changes only, no indicator.
