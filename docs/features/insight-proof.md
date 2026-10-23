# Proof strength and certificate coverage

Two views on the application Summary, for officials only. Both answer a question the checklist alone cannot: how much of what the institution claims is actually proven, and whether the certificates that were valid on the submission date also last through the year being approved. They show evidence; the official decides.

Code: `backend/pramana/insights/proof.py` (service, router, pipeline hook, dashboard alert), `frontend/src/pages/application/insights/` (`ProofMatrix`, `ProofDrawer`, `CoverageCalendar`, `api.ts`). Tests: `backend/tests/test_insight_proof.py`.

## 1. Proof-strength matrix

### What it shows

One row per requirement, one column per level of proof, weakest to strongest:

| Level | Meaning |
|---|---|
| Declared | Only the institution's word: a form value, or the Annexure 2.1 self-disclosure in Affidavit 2 |
| Present | The document is uploaded |
| Read | Fields were extracted from the document and checked against the declared values |
| AICTE record | An AICTE record matches: institution master, approval history, TER ledger, faculty registry, accreditation register |
| Issuer registry | The issuing authority's registry confirms the document (SIMULATED issuers in this prototype) |
| Signature or QR | The issuer's digital signature or signed QR verifies over the document |

Each row is a staircase: the rungs rise with the strength of proof.

- The strongest rung that supports the requirement is green when the row is proven (AICTE record or stronger) and dark grey when it is not; lower supporting rungs are light grey.
- A rung where the evidence contradicts the requirement is red with a cross above it, wherever it sits on the ladder.
- An inconclusive rung (an issuer still pending, a manual confirmation, an indicator such as a shared faculty ID) has an amber outline; when something at that level also supports the requirement, the lower half is filled.
- "Not checked" is a dashed outline: the level applies, but no check produced a result.
- "No source" is a flat line: nothing at that level exists for this requirement in the ruleset (TER has no issuer registry, for example).

The right column gives the verdict in words ("Contradicted by the issuer's signature, the signed QR and the issuer registry", "Proven by an AICTE record", "Rests on the institution's own declaration"). Above the table, one computed sentence summarises the application, for example A7: "7 of 9 requirements are proven by an AICTE record or stronger; fire safety is contradicted by the issuer's signature, the signed QR and the issuer registry; only declarations support infrastructure norms."

Selecting a cell opens a drawer with the exact evidence at that level: rule outcomes with the verbatim handbook citation and their inputs, verification attempts with the field-by-field comparison, findings, extracted fields with "Show on page", the faculty registry cross-check. Each item links to the finding, the verification attempt or the checklist row. The selected cell is in the URL (`?proof=fire:5`).

Keyboard: the table has one tab stop; arrow keys, Home and End move between cells, Enter opens the drawer, Esc closes it. Every cell button carries a full label ("Fire safety, Issuer registry (simulated): Contradicts. ..."), and the table has a caption, column and row headers.

### How it is computed

- **Rows come from the ruleset.** Every rule the latest run evaluated (not "not applicable") and every document type the category's checklist requires, or that was uploaded, is placed in a requirement. A rule belongs to the requirement of the document types it reads (`check.doc_type`, `requires_docs`, `doc.X.` and `ver.X.` paths); a rule that reads no document is placed by the facts it reads (`ref.fee` goes to fees, `derived.intake_mismatches` to intake). Anything that matches no requirement goes to "Other requirements", so nothing is dropped. The grouping of document types and fact paths into requirements is the one hand-written table (`THEMES`). Accreditation claims appear only when a programme claims NBA or an NBA letter is uploaded.
- **Rule outcomes are placed by the facts they read.** `document_present` rules sit on Present; rules reading `ver.*` on Signature or QR; rules reading AICTE records (`ref.*`, `inst.*`, and the record-derived intake and NBA facts, plus the portal's submission timestamp) on AICTE record; rules reading document fields on Read; rules over declared figures alone on Declared. Pass supports, fail contradicts, insufficient evidence is inconclusive.
- **Verification attempts** of the latest document of each type: issuer registry on Issuer registry; issuer signature and signed QR on Signature or QR. Verified supports; mismatch and expired contradict; pending, unavailable and manual review are inconclusive. The applicant's own DSC counts as proof only for Affidavit 2, which the institution itself issues; on any other document it is shown as context ("shows who uploaded the file, not who issued it") and never as issuer proof.
- **Findings** that are not rule outcomes: document-type mismatch on Present; unreadable pages, uncertain fields and medium or high forensic indicators on Read (inconclusive); cross-application and year-over-year indicators on AICTE record (inconclusive); a missing issuer signature on Signature or QR (inconclusive).
- **Faculty registry cross-check:** every faculty ID read from the roster is looked up in the AICTE faculty registry; all registered to this institution supports, any registered elsewhere contradicts.
- A rung's state is the worst of its items (contradicts, then inconclusive, then supports, then not checked). The strongest level is the highest rung with support. A row is "proven" when nothing contradicts it and its strongest level is AICTE record or above; the sentence counts those.

API (officials only; institutions get 403): `GET /api/applications/{id}/insights/proof` returns `{matrix, coverage}` for the latest completed run, computed under that run's archived ruleset.

### Limitations

- The matrix reflects the latest completed run only; it does not re-run checks.
- Placement by fact path is mechanical. A rule that compares a document with the institution master (for example "Fire certificate names this institution") counts as an AICTE record match, which is weaker than a registry or signature confirmation; the drawer shows exactly what matched.
- Indicators are never counted as contradictions, only as inconclusive, because an indicator is not proof. A shared certificate number therefore shows amber on the original holder's row too.
- Issuer registries are SIMULATED and signatures chain to a DEMO trust anchor in this prototype.
- Infrastructure photographs (Content Credentials) are not on the ladder; they have their own view under Comparisons, campus.

## 2. Certificate coverage calendar

### What it shows

Every time-bound certificate on a horizontal time axis that covers the submission date and the academic session being approved, with:

- the certificate's validity window as a bar (select it to see the validity date on the page);
- markers for the submission date, today, and the assumed session (shaded band, labelled "Assumed session 2026-27");
- the part of the session the certificate does not cover, hatched: orange when it expires during the session ("Session not covered for 9 months"), red when it had already expired at submission or lapses before the session starts;
- a dashed outline when no validity date could be read;
- diamonds for other sources that give a different date (signed QR, issuer registry, accreditation register, or a value drawn over the page in a later revision), each linked to its verification attempt or page region. A7 shows the page claiming 30 Jun 2027 while the text layer, the signed QR and the registry all say 30 Jun 2025.

Above the chart one sentence summarises coverage; below it, certificates without a validity period (a full occupancy certificate) are listed, and a "Dates by source" table gives every date from every source and what it means for the session. The table is also the chart's text alternative.

### How it is computed

- **Which certificates.** From the ruleset: any document type with a `valid_until` field (fire NOC, NBA letter), and any type whose validity rule sets a period (`days_between(doc.X.issue_date, as_of) <= N`: the structural stability certificate, five years under APH Cl. 6.17(h)). The occupancy certificate has neither, so it is listed as open-ended.
- **Which date.** The extracted field, the same value the submission-date rules use. Signed QR payloads, issuer registry comparisons, the accreditation register and overwritten-field findings are shown alongside, with their own reading against the session.
- **The session** is configuration, not handbook law: `norms.academic_session` in the ruleset (`start: "07-01"`, 12 months, source CONFIG), so it is pinned in each run's ruleset hash and a replay gives the same answer.
- **Finding.** The pipeline calls `session_findings()` after the rules: a certificate valid on the submission date that lapses before the session ends raises `XD-CERT-EXPIRES-IN-SESSION` (severity medium, evidence class rule, category validity, so it can go in a deficiency letter), citing the clause of the certificate's validity rule, with the validity field's page region as evidence.
- **Review queue.** The dashboard's "Needs attention" list gets one digest line per session, "1 certificate expires during the 2026-27 session", linking to the first such finding. It sits after any re-verification watch changes and before the high-severity findings, because a medium finding would otherwise never reach the eight shown.

### Fixtures and evaluation

Standard fixture fire NOCs now run three years (to 11-03-2028), so the only in-session expiry is planted: A10's fire NOC is issued 01-10-2024 and valid until 30-09-2026, three months into the 2026-27 session; A10 expects `XD-CERT-EXPIRES-IN-SESSION`. A8's fabricated NOC moved to 2028 for the same reason. `scripts/evaluate.py --skip-editors`: 54 true positives, 0 false positives, 0 false negatives.

### Limitations

- Session dates are an assumption; an institution with a different calendar (or a late start) would need the configuration changed.
- The issuing State sets a fire certificate's validity; a renewal may already be applied for. The finding asks for the renewed certificate or the renewal application.
- Only the latest document of each type is plotted.
- The randomised blind evaluation (`scripts/random_eval.py`) generates genuine fire NOCs with one to five year terms and does not yet expect this finding, so worlds with a one or two year NOC will report it as unplanned there until the generator's answer key learns the session rule.
