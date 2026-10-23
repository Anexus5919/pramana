# What makes Pramana different, and how to demo it

## Table stakes, not differentiators

A survey of public SIH 26261 repositories and commercial document-fraud tools showed several capabilities are already common. These are OCR plus an LLM, a dashboard, a hash-chained audit log, PDF revision flags, perceptual-hash duplicate checks, versioned rules and the six PS statuses. We have them, but we do not pitch them as the innovation.

## The differentiators we chose

Each one is chosen against the real fraud patterns found in the research brief and the "explainable, evidence-linked" demand of the PS.

### 1. Cross-institution contradiction graph

**What it does:**
- Applications are linked through shared entities: faculty IDs, issuer certificate numbers, file hashes, photo perceptual hashes and identical variable field values.
- One institution's documents can each look fine while the same faculty member, fire NOC or lab photo also appears at another institution.
- This mirrors the Anna University ghost-faculty case and the Hyderabad fake fire-NOC cases.

**Why it is credible:** the checks are deterministic matches on identifiers, with the shared entity and both documents shown as evidence. The earlier submitter of a reused photo gets a low note; the later one gets the main finding.

**Demo:** A6 and A7 (shared faculty), A5 and A6 (one NOC number in two applications), A1 and A10 (reused lab photo).

### 2. A trust ladder that separates who signed from what was verified

Every finding has an evidence class, from strongest to weakest:

| Evidence class | Meaning |
|---|---|
| cryptographic | signature or signed QR checked against a key |
| issuer | issuing authority's registry |
| record | AICTE records |
| rule | deterministic check of submitted data |
| structural | a fact about the file |
| heuristic | needs judgement |
| model | not used for decisions |

**What it does:**
- "Verified" is reserved for cryptographic or issuer confirmation.
- The handbook makes applicants DSC-sign every upload. So a forged NOC can carry a perfectly valid signature: the applicant's own.
- Pramana classifies the signer's role and never counts an applicant signature as issuer authentication.
- Real DSC-signed PDFs validate against the bundled **CCA India root certificates**. This is a genuine integration, not a simulation.

**Demo:**
- A8: the NOC is validly signed by the chairman, yet the issuer registry has no record of it.
- "Verify a PDF" with a real e-Gazette PDF: chains to CCA India 2022.

### 3. Evidence you can point at: revision diffs and overwritten fields

**What it does:**
- When a PDF is edited after issue, Pramana states exactly what changed and where. Example: "Revision 3 changed text on page 1: added '30-06-2027' over existing text '30-06-2025'."
- The field is flagged as overwritten, with both values and which one the checks used.
- The issuer's PAdES signature reports "modified after signing", and the issuer-signed QR still certifies 2025.
- Four independent signals, each with a page region.

**Demo:** A7 fire NOC.

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

**Demo:** A3:
1. The officer asks for a valid fire certificate.
2. The institution uploads the renewed certificate and also edits its bandwidth.
3. The expiry finding resolves, and the bandwidth edit is flagged as out of scope.

## Honest boundaries (said out loud in the demo)

- Issuer registries other than PDF signatures are **simulated**, and every such result is labelled. Real access needs authorisation; captcha portals must not be scraped.
- Forensic findings are indicators, never verdicts. A document retyped from scratch leaves no file-level trace; only the issuer registry, cross-application links or a reviewer catches it.
- Pramana does not approve, reject or penalise. Reviewers act, and decisive actions need a written reason.

## Five-minute demo script

The click-by-click script with timings and narration is in [demo-script.md](demo-script.md).

## Seeded scenarios

| App | Institution | Planted condition | Expected findings |
|---|---|---|---|
| A1 | Shree Dnyaneshwar Institute of Technology, Pune | Clean; its lab photo is later reused by A10 | low note only |
| A2 | Godavari College of Engineering, Nashik | Completion certificate from 1991, no Structural Stability Certificate; accounts uploaded as a scan | APH-A21-SSC-REQUIRED |
| A3 | Konkan Institute, Ratnagiri | Fire certificate expired before submission | fire validity rule, issuer registry expired, signed QR expired |
| A4 | Vidarbha Technical Campus, Nagpur | Intake declared above record, area beyond OC, false NBA claim, unsigned affidavit, faculty short | 6 rule and record findings |
| A5 | Sahyadri School of Engineering, Satara | Fire NOC copied from A6 with the QR pasted; affidavit for last year's application | QR mismatch, registry mismatch, shared number, near-duplicate, affidavit mismatch |
| A6 | Krishna Valley College, Karad | Three faculty also listed by A7 and registered there | faculty links, shared NOC number (used by A5) |
| A7 | Panchganga Institute, Kolhapur | Expired NOC date overwritten after issuer signing | signature, QR, registry, overwrite, revision diff, overlay, white box |
| A8 | Deccan Institute, Hyderabad | Fabricated NOC signed only by the applicant | registry mismatch |
| A9 | Marathwada Polytechnic, Chhatrapati Sambhajinagar | Municipal registry down, engineer register asynchronous, faculty short | source unavailable, pending, FSR |
| A10 | Tapi Valley Institute, Jalgaon | Intake increase with two non-CS core branches, map point 2.6 km away, reused photo | core-branch rule, map location, photo reuse, geotag |
| A11 | Bhima Valley College of Engineering, Solapur | Valid fire NOC in an unfamiliar issuer layout, with a line instructing automated readers | instruction text flagged; without a model the fields go to manual review |
