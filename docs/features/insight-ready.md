# Readiness check: what AICTE will raise, before you submit

A college administrator sees, on the application page and before submitting (or resubmitting in a rectification round), the problems AICTE's handbook rules will raise, each with the clause it comes from and a link to where it is fixed. Fewer surprises at scrutiny means fewer rectification rounds and faster approvals.

It is a self-check, not a decision. The panel says so in plain words: AICTE officials still review every application, and passing the check does not mean approval.

## 1. What the institution sees

On `/portal/applications/:id`, while the application is a draft or in a rectification round, a **Readiness check** panel sits under Next step (under the deficiency letter in a rectification round).

- **The ring.** One segment per requirement, grouped into Documents, Validity and Norms with a wider gap between groups. Green is met, orange is to fix, a thin grey segment waits for a document that is not uploaded yet. An amber dot outside a segment marks a met requirement with a note (a certificate that lapses during the session, pages that could not be read). In a rectification round a short tick marks what AICTE asked about. The centre gives the count to fix.
- **Ready.** When everything is met the gaps close into one unbroken ring and a check mark draws once: "Ready to submit". Quiet, no confetti, no colour wash.
- **Headline and summary.** "2 items to fix before submitting", then "11 of 13 checked requirements are met. 1 more is checked once the missing documents are uploaded."
- **Items to fix**, each with:
  - a plain title ("Fire Safety Certificate has expired");
  - what was found ("expired on 30 September 2025, before today, 23 October 2026");
  - what to do ("Upload a Fire Safety Certificate valid until at least 30 June 2028");
  - the handbook clause, quoted verbatim from the ruleset with its section and page;
  - "Go to" buttons that scroll to the upload slot and focus its button, or open Declared figures for editing and focus the field.
- **Worth a look.** Met requirements with a note, with a suggested action.
- **Notes.** For example why a conditional document is not needed: "A Structural Stability Certificate is not needed: the building is 15 years old, from the date of your completion certificate, and the handbook asks for it only above 30 years."
- **Show all requirements.** The full checklist by group, each with its status in words and its clause.
- **Re-check.** It runs when the page opens and again, debounced by 700 ms, after an upload or a saved figure change. The previous result stays on screen; the ring shows a thin spinner and the status line says "Checking again after your upload". When the result arrives the line reads, for example, "After your upload: 1 item fixed." "Check again" re-runs it on demand. It is a ghost button: Submit stays the page's one primary action.
- **Submit dialog.** If the latest check lists items to fix, the dialog names them and says AICTE is likely to raise them; the institution can still submit. Pramana never blocks a submission on its own judgement.
- **Rectification round.** Items tied to the open request carry "Asked by AICTE" and come first. Other items say plainly that AICTE did not ask about them this round and that AICTE sees every change made in the round.

Accessibility: the ring is an `img` with a full text label ("Readiness: 11 of 13 requirements met, 2 to fix, 1 note."); every segment has a `<title>`; the list is the complete text alternative; status is always in words as well as colour; the status line is `role="status"`; the disclosure is a real button with `aria-expanded`. Under reduced motion the gap-closing, check-mark draw and spinner do not animate. Light and dark themes use only design tokens.

## 2. What it covers

| Area | Checks | Source |
|---|---|---|
| Completeness | Every required document for the category is uploaded. The Structural Stability Certificate becomes required when the building is over 30 years from its completion certificate (read from the uploaded certificate, or from the declared building age until it is uploaded). | Checklist and `document_present` rules of the ruleset |
| Readability | The file could be read; the slot holds the document it asks for (keyword classifier); pages without readable text or Hindi text that was not read become a note. | The pipeline's own reader |
| Validity | Certificates valid on the submission date (today), issued before applying, Structural Stability Certificate within five years, Affidavit 2 form. A certificate valid today that lapses before the session ends (30 June of the academic year's second year) gets a note. | `validity` rules |
| Compliance | Faculty-student ratio (Annexure 5), bandwidth tier (Annexure 4.1), administrative and amenities areas (Annexures 3.3 and 3.4), core branches for an increase in intake, the 2026-27 application window. | `compliance` rules |

Wording, actions and targets come from a small table in `readiness.py` keyed by rule, with the rule's own title and message as the fallback. Targets are derived from the facts a rule reads: `doc.<type>` points at the upload slot, `app.<field>` at the figure, programme-derived facts at the programmes table.

## 3. What it never shows, and why that holds

- **Nothing outside completeness, compliance and validity.** Rules are filtered by `RECTIFIABLE_CATEGORIES`, the same list that keeps forensic, consistency and verification findings out of rectification requests.
- **Nothing that reads `ref.` or `ver.` facts.** Checks against AICTE's own records (TER payment ledger, approval history) and issuer, signature or QR verification are left out. The panel says that checks needing AICTE's own records run after submission.
- **No forensics at all.** The dry run never computes forensic signals, cross-application links or year-over-year comparisons, so they cannot leak. Already processed documents (rectification rounds) carry forensic analysis in the database, but the check reads only their fields, classification and readability.
- **No codes.** Items have opaque ids (`doc-fire_noc`, `r-<hash>`); no rule, detector or finding code appears in the response.

`backend/tests/test_insight_ready.py::test_no_forensic_consistency_or_verification_output` validates four applications planted with forensic, cross-application and issuer conditions (A4, A5, A7, A11), opens them for correction and runs the check as each institution. It asserts that no code pattern, no forbidden word, none of "forensic", "indicator", "consistency", "issuer", "registry" or "detector", and none of the hidden findings' titles or messages appear in the response.

## 4. How it runs

`POST /api/applications/{id}/readiness`, institution role only, own applications only (404 otherwise), and only while the status is `draft` or `rectification_requested` (409 otherwise).

- **A dry run.** It creates no validation run, no findings and no verification attempts, and it does not change the application's status. Its only write is one audit event, `readiness.checked`, whose details are counts only: `met`, `to_fix`, `waiting`, `advice`, `files_read`.
- **Drafts are not processed until submission.** Uploads are stored as `pending`; `run_validation` processes them on submit. The check therefore reads each pending file itself (sandboxed text, classification, field extraction, table rows, the same functions the pipeline uses, without forensics) into a stand-in object. The document row is never touched, so officers later see exactly what they would have seen without the check, and the submission run processes the file as before.
- **Cache.** Results are cached per file hash, slot, MIME type and ruleset hash: in memory (512 entries) and encrypted on disk as `var/cache/readiness-<key>.json` through the same keyring as page previews.
- **Speed.** Reading seven fresh fixture PDFs takes about 0.6 s; a repeat check takes about 25 ms. The test asserts the repeat stays under 5 s.
- **As-of date.** Today, the date the institution would submit or resubmit. A validation run judges a submission on its date, and in a rectification round judges the documents sent in that round on the day they were sent, so the two agree for what the institution uploads now. Everything else in a rectification round the run keeps on the application's first submission date (the previous financial year, for one), while this check reads it as of today. For a draft, `app.submitted_on` is today.

## 5. Files

- `backend/pramana/insights/readiness.py`: the check and its router.
- `backend/tests/test_insight_ready.py`: eight tests (missing documents and no side effects, expired certificate and norm shortfall, ready state with a lapse note and the cache, the conditional certificate, a rectification round before and after the corrected upload, no forensic or consistency output, access and audit counts, a wrong file in a slot and missing figures). The module reuses the seeded world and restores the database afterwards, so later modules see it unchanged.
- `frontend/src/pages/portal/readiness/`: `ReadinessPanel.tsx`, `ReadinessRing.tsx`, `useReadiness.ts`, `types.ts`.
- Small additive edits: `backend/pramana/main.py` (router), `InstitutionApplicationPage.tsx` (placement, figure focus), `DeclaredEditor.tsx` (input ids), `SubmitDialog.tsx` (open items).

## 6. Limitations

- The session end (30 June) is configuration, not a handbook clause; the lapse note is advice, not a finding.
- Rules that need AICTE's records or issuer confirmation are not in the check, so "Ready to submit" covers only what the institution's own submission can show.
- Values the deterministic reader cannot find (unusual layouts) are reported as "could not be read"; the validation run may still read them with the optional grounded model.
- The classifier is keyword based; a wrong-document item asks the administrator to look, it does not decide.
