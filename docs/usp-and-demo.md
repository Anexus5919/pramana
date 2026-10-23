# What makes Pramana different, and how to demo it

## Table stakes, not differentiators

A survey of public SIH 26261 repositories and commercial document-fraud tools showed several capabilities are already common. These are OCR plus an LLM, a dashboard, a hash-chained audit log, PDF revision flags, perceptual-hash duplicate checks, versioned rules and the six PS statuses. We have them, but we do not pitch them as the innovation.

The same goes for the deployment hardening added in the October sprint: background jobs with live progress, sign-in throttling, secure cookies, a parser sandbox, envelope encryption, retention and PostgreSQL. A real deployment needs all of it, so it is described in `docs/verification-and-security.md` and `docs/features/platform.md`, not pitched.

## The differentiators we chose

Each one is chosen against the real fraud patterns found in the research brief and the "explainable, evidence-linked" demand of the PS. The first three are the core of the pitch.

### 1. Cross-institution contradiction graph

**What it does:**
- Applications are linked through shared entities: faculty IDs, issuer certificate numbers, file hashes, photo perceptual hashes, seal images and identical variable field values.
- One institution's documents can each look fine while the same faculty member, fire NOC, lab photo or issuer seal also appears at another institution.
- This mirrors the Anna University ghost-faculty case and the reported Hyderabad fire-NOC cases.

**Why it is credible:** the checks are deterministic matches on identifiers and image hashes, with the shared entity and both documents shown as evidence. The earlier submitter of a reused photo or seal gets a low note; the later one gets the main finding. A seal is reported only when the two certificates name different issuers, and an image that appears under three or more issuers (a state emblem) is ignored.

**Demo:** A6 and A7 (shared faculty), A5 and A6 (one NOC number in two applications), A1 and A10 (reused lab photo), A1 and A8 (the Pune fire brigade's seal on a Hyderabad NOC, both seals side by side).

### 2. A trust ladder that separates who signed from what was verified

Every finding has an evidence class, from strongest to weakest:

| Evidence class | Meaning |
|---|---|
| cryptographic | signature, signed QR or Content Credentials checked against a key |
| issuer | issuing authority's registry |
| record | AICTE records |
| rule | deterministic check of submitted data |
| structural | a fact about the file |
| heuristic | needs judgement |
| model | a detector or language model: low-weight indicators and explanations only, never decisions |

**What it does:**
- "Verified" is reserved for cryptographic or issuer confirmation.
- The handbook makes applicants DSC-sign every upload. So an NOC the issuer has no record of can carry a perfectly valid signature: the applicant's own.
- Pramana classifies the signer's role and never counts an applicant signature as issuer authentication.
- Real DSC-signed PDFs validate against the bundled **CCA India root certificates**. This is a real integration, not a simulation.

**Demo:**
- A8: the NOC is validly signed by the chairman, yet the issuer registry has no record of it.
- "Verify a PDF" with a real e-Gazette PDF: chains to CCA India 2022.

### 3. Evidence you can point at: revision diffs, overwritten fields and the time machine

**What it does:**
- When a PDF is edited after issue, Pramana states exactly what changed and where. Example: "Revision 3 changed text on page 1: added '30-06-2027' over existing text '30-06-2025'."
- The field is flagged as overwritten, with both values and which one the checks used.
- The issuer's PAdES signature reports "modified after signing", and the issuer-signed QR still certifies 2025.
- The font check adds that the new date is drawn in ArialMT while every other value on the certificate uses Helvetica.
- Five independent signals, each with a page region.
- The **revision time machine** renders the page as it was saved at each revision. Stepping from revision 2 to revision 3, the date changes on screen, the region is outlined and labelled, and a band shows that revision 3 lies outside every signature.

**Demo:** A7 fire NOC: Findings, then Documents, Time machine.

### 4. Replayable, versioned rules with citations

**What it does:**
- Each of the 29 rules quotes its handbook clause and page, has effective dates, and says when it does not apply.
- Every run pins the ruleset hash, as-of date and input digest.
- Replay recomputes the run and shows whether the report digest matches.
- When the ruleset changes (for example APH 2027-28), the impact report lists which applications' outcomes would change.

**Demo:** replay A7 ("Reproduced identically"); Rules page.

### 5. Rectification rounds that cannot hide extra edits

**What it does:**
- Re-scrutiny examines only earlier deficiencies.
- Pramana snapshots the application when rectification is requested.
- In the next round it reports documents replaced, or values changed, that the officer did not ask about.
- The officer can turn the selected findings into a deficiency letter: one item per document, the cited clause quoted verbatim from the ruleset, what to submit and by when. The final PDF's SHA-256 goes into the audit chain, and the institution downloads it from the portal.

**Demo:** A3:
1. The officer asks for a valid fire certificate and drafts the deficiency letter.
2. The institution uploads the renewed certificate and also edits its bandwidth.
3. The expiry finding resolves, and the bandwidth edit is flagged as out of scope.

## Further differentiators

These build on the first three and come after them in the pitch.

### 6. Verification that continues after scrutiny

**What it does:**
- When the officer records a scrutiny outcome (with a written reason; it approves or rejects nothing), every certificate that an issuer registry confirmed is put on a watch.
- A scheduler re-queries each one and re-checks its validity dates. A revocation, suspension, expiry, missing record or changed record becomes a finding and a dashboard alert, once, on the transition.
- The registries are simulated; the watch shows the workflow a real integration would plug into.

**Demo:** A6: Overview shows the recorded outcome and four watched certificates. Revoke the fire NOC in the Issuer simulator (SIMULATED), run the watch, and the dashboard's first alert is the watch alert.

### 7. Since last year

**What it does:**
- Compares the application with the institution's previous application: areas, intake, the faculty roster by ID, labs and certificate numbers.
- Ordinary changes (a few faculty moving, a renewed NOC under a new number) raise nothing. Changes that are hard to explain become indicators that point at this year's value and last year's record, for example a fire NOC number from last year returning with a new validity date.

**Demo:** A8: 22 of last year's 36 faculty IDs are gone, past the 50% marker. A1 for contrast: ordinary changes only.

### 8. Officer tools that carry their evidence

**What it does:**
- **Ask why:** the officer asks "Why is the fire NOC flagged?" and gets sentences that each cite a finding, page region, verification result or rule. The model sees only Pramana's structured output, never raw document text. A post-check drops any sentence without valid evidence, with a number or date that is not in what it cites, with a contradicted status word, or that states a decision. It explains; it decides nothing.
- **Evidence pack:** one signed ZIP with the report, page crops, the data, the application's audit events up to a signed checkpoint, and `verify_pack.py`, which checks it offline with only Python and the `cryptography` package. Editing any file makes the check fail and name the file.

**Demo:** A7: Ask why, "What changed after signing?", click an evidence chip. Then Evidence pack, download, run the checker.

### 9. Photo evidence, with its limits stated

**What it does:**
- The Campus tab plots the campus on record, the declared map point and each photo's geotag, with distance rings at the thresholds the checks use.
- Content Credentials (C2PA) are validated offline with the official open-source library. A photo whose pixels changed after the camera signed it is reported as modified after capture. Trust is a DEMO capture CA, and every result says so.
- A local detector counts visible workstations. Far fewer than declared is a low-weight model indicator, worded as something to confirm during inspection.

**Demo:** A10 Campus tab (map point 2.6 km away, geotag 329 km away, A1's photo reused); A7 "Modified after capture"; A4 11 visible workstations against 60 declared.

### 10. Hindi documents read, not skipped

Pages in Devanagari are detected from the text layer or a first OCR pass and read with a Devanagari recogniser, combined line by line with the default reading so reference numbers keep their Latin letters. When the model is missing, the document says its Hindi text was not read and goes to manual review.

**Demo:** A2 occupancy certificate: "Hindi text read by OCR", each value shown with the Hindi line it came from.

### 11. Scan to verify, for anyone holding a certificate

A public page with no login: photograph the issuer-signed QR and the page verifies the signature, shows the signed values next to "Same on paper" and "Different" buttons, and states what this proves and what it does not. The photo is never stored. The issuer keys are simulated.

**Demo:** open `/scan` on a phone and scan the printed samples: as issued, paper validity changed, validity ended, payload edited after signing, unknown key.

## Honest boundaries (said out loud in the demo)

- Issuer registries other than PDF signatures are **simulated**, and every such result is labelled. Real issuer integrations, DigiLocker and API Setu are future scope: they need AICTE authorisation and organisational onboarding, captcha portals must not be automated, and the adapter interface is ready for them.
- The issuer keys behind signed QR codes (also used by the scan page) are simulated, and the Content Credentials trust list is a DEMO capture CA, not a real authority.
- Forensic findings are indicators, never verdicts. A document retyped from scratch leaves no file-level trace; only the issuer registry, cross-application links or a reviewer catches it.
- Room counts and Ask why answers are model output: low weight, cited, and never a decision.
- Pramana does not approve, reject or penalise. Reviewers act, and decisive actions need a written reason.

## Five-minute demo script

The click-by-click script with timings and narration is in [demo-script.md](demo-script.md).

## Seeded scenarios

| App | Institution | Planted condition | Expected findings |
|---|---|---|---|
| A1 | Shree Dnyaneshwar Institute of Technology, Pune | Clean. Its lab photo carries valid Content Credentials from a DEMO campus camera and is later reused by A10; its fire brigade seal image later appears on A8's NOC. Scrutiny outcome recorded (no deficiency), certificates watched | low notes only: photo reused later, seal reused later; credentials verified (DEMO) |
| A2 | Godavari College of Engineering, Nashik | Completion certificate from 1991, no Structural Stability Certificate; bilingual occupancy certificate with Hindi labels and a legacy-font text layer, read by the Devanagari recogniser; accounts uploaded as a scan; last year's fire NOC number returns with validity to 11-03-2027 instead of 11-03-2026 | APH-A21-SSC-REQUIRED, YOY-CERT-REUSED-NEW-VALIDITY |
| A3 | Konkan Institute, Ratnagiri | Fire certificate expired before submission | fire validity rule, issuer registry expired, signed QR expired |
| A4 | Vidarbha Technical Campus, Nagpur | Intake declared above record, area beyond OC, unsupported NBA claim, unsigned affidavit, faculty short; lab photo shows 11 workstations against 60 declared; last year 60 approved CE seats, this year 120 proposed | 8 rule, record and indicator findings, including PH-ROOM-FEW-WORKSTATIONS (low, model) and YOY-INTAKE-JUMP |
| A5 | Sahyadri School of Engineering, Satara | Fire NOC copied from A6 with the QR pasted; affidavit for last year's application | QR mismatch, registry mismatch, shared number, near-duplicate, affidavit mismatch |
| A6 | Krishna Valley College, Karad | Three faculty also listed by A7 and registered there. Scrutiny outcome recorded (deficiencies recorded), four certificates watched | faculty links, shared NOC number (used by A5); a watch alert after a simulated revocation |
| A7 | Panchganga Institute, Kolhapur | Expired NOC date overwritten after issuer signing, in a font no other value uses; lab photo edited after its Content Credentials were signed | signature, QR, registry, overwrite, revision diff, overlay, white box, font mismatch, PH-C2PA-MODIFIED-AFTER-SIGNING |
| A8 | Deccan Institute, Hyderabad | NOC the issuer has no record of, signed only by the applicant; its seal image is the Pune fire brigade's, from A1's certificate; 22 of last year's 36 faculty IDs gone | registry mismatch, FX-SEAL-REUSED, YOY-FACULTY-TURNOVER |
| A9 | Marathwada Polytechnic, Chhatrapati Sambhajinagar | Municipal registry down, engineer register asynchronous, faculty short | source unavailable, pending, FSR |
| A10 | Tapi Valley Institute, Jalgaon | Intake increase with two non-CS core branches, map point 2.6 km away, reused photo; land declared 12.5 acres last year, 10.5 this year | core-branch rule, map location, photo reuse, geotag, YOY-LAND-AREA-DECREASED |
| A11 | Bhima Valley College of Engineering, Solapur | Valid fire NOC in an unfamiliar issuer layout, with a line instructing automated readers | instruction text flagged; without a model the fields go to manual review |
