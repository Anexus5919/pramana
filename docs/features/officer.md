# Officer tools: deficiency letters, evidence packs and Ask why

Three tools for the AICTE scrutiny officer. All three work on what Pramana has already found. None of them approves, rejects or penalises, and none adds a finding.

| Tool | Who | Where in the demo |
|---|---|---|
| Deficiency letter generator | officer drafts and finalises; the institution downloads the final PDF | Workspace header: Request rectification, then Draft deficiency letter. Portal: "What AICTE asked you to fix". |
| Evidence pack export | officer only | Workspace header: Evidence pack |
| Ask why | officer only | Workspace header: Ask why (side panel) |

Code: `backend/pramana/officer/` (routes, letter, report, pack, verify_pack, ask, settings) and `frontend/src/pages/application/officer/`. Tests: `backend/tests/test_officer.py`. Evaluation: `backend/scripts/eval_ask.py`.

## 1. Deficiency letter generator

### What it does

- Drafts a deficiency (rectification) notice from the findings the officer picked in the rectification dialog. With no selection it uses the findings of an open rectification request, then findings already marked evidence requested, then open completeness, compliance and validity findings.
- Groups findings about the same document into one numbered item. A3 (expired fire certificate) gives one item that covers the failed validity rule, the expired signed QR and the expired registry record.
- Each item has:
  - a plain-language description (the rule message for failed rules; neutral wording for verification, forensic and cross-application findings);
  - the cited handbook clause, quoted verbatim with its page from the ruleset;
  - what the institution must submit (from the document type's description in the ruleset);
  - a response date (default today plus `PRAMANA_LETTER_RESPONSE_DAYS`, 15 days; an office setting, not a handbook rule).
- The officer edits in a structured editor: subject, opening paragraph, and per item title, description, what to submit, cited rule (picked from the ruleset) and date. Items can be moved up or down and removed. There is no free-form HTML.
- The PDF (reportlab) has a neutral layout without emblem, letterhead or logo, a page count, and the footer "Prepared with the Pramana prototype. Synthetic demo data." A diagonal DRAFT watermark stays until the letter is finalised.
- Finalising needs a written reason (at least 8 characters). It renders the final PDF without the watermark, stores it encrypted like any document, records `letter.finalised` with the PDF's SHA-256 in the audit chain, and attaches the letter to a rectification request.
- The institution sees a "Deficiency notice" card with the digest and a Download PDF button inside "What AICTE asked you to fix". Every final download is audited (`letter.downloaded`).

### How to see it

1. Sign in as `officer`, open A3 (Konkan Institute, `APP-2026-000103`).
2. Request rectification, Select all, Draft deficiency letter. The editor opens with the PDF preview on the right.
3. Edit an item, Save draft (the preview re-renders), then Finalise, give a reason, Finalise and send.
4. Sign in as `inst3`, open the application: the notice card with its SHA-256 and Download PDF.

### How it works

- Endpoints: `POST /api/applications/{id}/letters` (draft), `GET /api/applications/{id}/letters`, `GET|PUT /api/letters/{id}`, `GET /api/letters/{id}/pdf`, `GET /api/letters/{id}/pages/{n}.png` (preview), `POST /api/letters/{id}/finalise`.
- One working draft per application: a new draft replaces the previous unsent one. "Resume saved draft" in the rectification dialog reopens it.
- The clause text is never taken from the editor. The client sends a rule id and the server copies the source, section, page and quote from the active ruleset.
- Finalising reuses the existing rectification endpoint function (`request_rectification`), so finding statuses, the snapshot used for out-of-scope detection and the round counter behave exactly as before. If an open request without a letter already covers the same findings, the letter attaches to it instead of opening another round.
- Institution-facing text: request items for forensic and cross-application findings take the letter's wording and a neutral code (the cited rule id, or `NOTICE-ITEM-n`), so the portal does not show detector names, page forensics or another institution's name. Institutions get letters without finding ids or detector codes, only final letters, and only for their own applications (other ids return 404).
- Text checks: the server rejects letter text that uses the banned judgemental vocabulary about documents (`FORBIDDEN_WORDS` in `officer/common.py`, the words the product rules forbid), and response dates in the past.

### What it does not do

- It does not decide anything. The closing paragraph says the notice is not a decision on the application.
- It does not sign the PDF. The integrity anchor is the SHA-256 in the audit chain.
- It does not send email. The institution reads the notice in the portal.

### Limitations

- Descriptions are templates. The officer should read and adjust them; the editor exists for that.
- Grouping is by document type. Two unrelated issues on one document become one item unless the officer rewords it.
- Helvetica (reportlab's built-in font) covers Latin text only; Devanagari text would need an embedded font.

### Measured

- Draft PDF render: about 7 ms for the one-item A3 letter on the demo laptop (it is rendered on each save and preview).
- Final A3 letter: one page, about 3.8 KB.

## 2. Evidence pack export

### What it does

One ZIP per application, built on request:

| File | Content |
|---|---|
| `report.pdf` | Application summary; every finding of the latest run with severity, evidence class, outcome, review status and every officer decision with its reason (decisions follow the finding fingerprint across runs); a crop of the page region each finding points at, with the box outlined; verification results with SIMULATED and DEMO tags; cited rules with verbatim quotes; the run record with digests. |
| `data/findings.json`, `data/verifications.json`, `data/run.json` | The same data as JSON. |
| `audit/events.json` | This application's audit events with `prev_hash` and `hash`. |
| `audit/checkpoint.json` | The Ed25519 checkpoint that signs the chain head. |
| `manifest.json` | SHA-256 and size of every file, SHA-256 of every submitted document (current and superseded), all run ids with ruleset hash, input digest and report digest. |
| `signature.json` | Ed25519 signature over the exact bytes of `manifest.json`, with the audit signing key. |
| `VERIFY.txt`, `verify_pack.py` | How to check the pack, and a checker that needs only Python and `cryptography`. |
| `documents/` | Original submitted files, only when the officer ticks "Include the original submitted documents". |

### How to see it

1. As `officer`, open A7 (Panchganga Institute, `APP-2026-000107`), Evidence pack, Build evidence pack.
2. The result card shows real stage timings, the manifest SHA-256, the ZIP SHA-256, the audit public key, the checkpoint sequence and the file list with digests. Download ZIP.
3. Unzip and run `python verify_pack.py .` inside the pack folder. Edit any file and run it again: it fails and names the file.

### How it works

- The export is recorded first (`evidence_pack.exported`) and a checkpoint signs the chain head at that event. The extract therefore ends exactly at a signed head, and the checker can tie the last event to the checkpoint without needing other applications' events.
- Each event's hash is recomputed as `sha256(prev_hash + canonical_json(body))`, the same formula as `audit.py`.
- After the ZIP is built, `evidence_pack.sealed` records the manifest SHA-256 and the ZIP SHA-256 in the chain. Downloads are recorded as `evidence_pack.downloaded`.
- The ZIP is sealed with the document keyring (envelope encryption) under `var/exports` and downloaded through an officer-only endpoint that checks the pack belongs to the application.
- Original documents that the retention job has purged are left out; their digests stay in the manifest.
- `verify_pack.py` checks: every listed file is present with its SHA-256; no file was added; the manifest signature verifies; each audit event recomputes; the checkpoint is signed by the same key and signs the last event; included originals match the submitted document digests.

### What it does not do

- A pass shows the pack is unchanged since it was signed. It does not make any finding more certain or show that a document is authentic. `VERIFY.txt` says so.
- It does not publish the audit public key anywhere. The checker prints the key; the auditor must compare it with the key the deployment publishes, otherwise a forger could re-sign a changed pack with their own key.
- Related documents in other applications (cross-application findings) are named, not included.

### Limitations

- Each export adds a checkpoint row. That is cheap, but a production system might checkpoint on a schedule and include a chain segment instead.
- Page crops use the 110 dpi page images; small boxes are readable, full-width table rows are small.

### Measured (A7, 12 findings, 8 documents, after merging the sandbox and envelope-encryption work)

- Build time about 2 to 3.5 s. Page crops come from the same parser sandbox and encrypted page cache as the document viewer, so documents are never parsed in the web process; the report stage is about 1.8 s of the total.
- ZIP about 0.9 MB without originals (report.pdf is most of it); the stored copy is sealed with the document keyring.
- The checker passes on exported packs for A1, A7 and A10. Appending bytes to `report.pdf` fails the file digest check; editing one audit event's details fails the chain recompute (both covered by tests).

## 3. Ask why

### What it does

A side panel in the workspace where the officer asks about the current application, for example "Why is the fire NOC flagged?", "What is still unverified?", "Which rule needs the SSC?", "What changed after signing?".

- The panel carries the E7 Model evidence-class chip and the line "Explains existing findings, decides nothing."
- Each sentence shows clickable evidence chips: a finding opens in the Findings tab, a page region opens the document viewer at the box, a document opens the viewer, a verification result opens the Verification tab, a rule shows its verbatim clause inline, the run opens the Runs tab. Dashed chips are deterministic links from a cited finding to its rule and page region.
- Every answer shows how many sentences were dropped by the evidence check; the dropped sentences and reasons expand on click.
- Each answer is labelled with its source: "Local model qwen3:4b-instruct-2507-q4_K_M", "Template answer, model sentences failed the check" or "Template answer, no model reachable".

### How it works

- **Context.** Only Pramana's own structured output: findings (code, title, message, limitation, severity, evidence class, outcome, review status), page regions (document, page, field, value), verification results (channel, source, status, SIMULATED flag, comparisons), rules with verbatim clauses and outcomes, documents with authenticity status, and run facts. Raw document text is never sent.
- **Injection screening.** Text that quotes a document is screened with the extraction pipeline's `INJECTION` pattern and withheld if it addresses automated readers; the `SEC-INSTRUCTION-TEXT` finding is described without its line; values over 80 characters are withheld. A test checks that A11's planted instruction never reaches the context.
- **Model.** Ollama `qwen3:4b-instruct-2507-q4_K_M` at temperature 0 with a JSON schema: a list of sentences, each with evidence ids. Only local models are used; cloud providers were removed.
- **Post-check.** A sentence is dropped when it:
  - cites no valid evidence id;
  - contains a date, number or reference code that is not in the items it cites (dates are normalised across formats);
  - uses a status word its cited items contradict (for example "verified" when none of them is verified, "expired" when none is expired, "not verified" when all are verified), unless it repeats the cited item's own words;
  - uses the banned judgemental vocabulary about a document (`FORBIDDEN_WORDS`);
  - states or recommends a decision on the application.
- **Fallback.** Without a reachable model, template answers are assembled from the same items for the common questions (why flagged, still unverified, which rule needs a document, what changed after signing) and go through the same post-check. When every model sentence fails the check, the template answer is shown instead, labelled "Template answer, model sentences failed the check", and the dropped model sentences stay visible with their reasons.
- **Audit.** Every question and answer is recorded as `ask.answered` with the mode, model, kept sentences with citations, dropped sentences with reasons, and latency.

### What it does not do

- It does not decide, rank or recommend. It cannot add, change or dismiss a finding.
- It does not read documents. A question about something Pramana did not record cannot be answered from evidence; the model is told to say so.
- The post-check is lexical. It catches invented numbers, dates, codes and contradicted status words; it cannot catch a paraphrase that misstates a relationship using only words that appear in the cited items.

### Evaluation

`scripts/eval_ask.py` asks 27 questions across all 11 seeded applications and records every proposed sentence. "Expected evidence" means a kept sentence cites at least one item a reviewer would point to for that question. Model figures score the model's own sentences, before any template fallback. Measured on the seeded data after merging the photo, history and platform work.

| Metric | Local model (qwen3:4b-instruct-2507, Q4_K_M) | Template answers only |
|---|---|---|
| Questions | 27 | 27 |
| Sentences proposed | 27 | 87 |
| Citation-valid (cite at least one real evidence id) | 27 (100%) | 87 (100%) |
| Kept after the post-check | 24 (88.9%) | 87 (100%) |
| Dropped by the post-check | 3 (11.1%) | 0 |
| Answers citing expected evidence | 22 of 27 | 24 of 27 |
| Answers where every model sentence was dropped (template fallback shown instead) | 3 | not applicable |
| Latency mean / median / p90 / max, model already loaded | 2.1 / 2.1 / 2.7 / 5.2 s | 47 / 4 / 5 / 1155 ms (the first call loads the ruleset) |

- All three drops were real errors the check caught: a date taken from a different finding than the one cited, "as verified by the signed QR" citing a QR result whose status is expired, and "verified by an expert visit" attached to a finding that does not say it.
- The five misses: those three dropped answers, and two "What is still unverified?" answers that explained a finding instead of listing documents (the template answer lists them).
- Across five runs while the check was being tuned, the model kept between 22 and 25 of 27 sentences. The changes were: a finding's own rule and page region count as support for numbers and dates, the prompt asks for status words as the items state them, and a status word followed by the same three words as in a cited item counts as quoting it.
- The 4B model nearly always answers in one sentence even when asked for two to four. The first question after Ollama unloads the model pays about 10 s of load time, which is not in the table.
- These are numbers on synthetic data and a 27-question set; they are indicative, not a benchmark.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `PRAMANA_LETTER_RESPONSE_DAYS` | 15 | Default response window on new letters |
| `PRAMANA_ASK_PROVIDERS` | `ollama` | Ask why providers in order; empty disables the model and uses templates |
| `PRAMANA_ASK_MODEL` | `qwen3:4b-instruct-2507-q4_K_M` | Ollama model for Ask why |
| `PRAMANA_ASK_TIMEOUT_S` | 90 | Model call timeout |
| `PRAMANA_ASK_MAX_RULES` | 8 | Cap on rule items added beyond those the findings cite |

`PRAMANA_OLLAMA_URL` is the existing setting for the local Ollama server.

## Security and data rules

- Letters: drafting, editing and finalising are officer only; previews are for officials; institutions see final letters for their own applications only.
- Evidence packs and Ask why are officer only; verifiers and institutions get 403, and other applications' pack ids return 404.
- Ask why and pack export are rate limited per officer (20 questions and 6 exports a minute) with the shared limiter.
- No new dependencies: reportlab (BSD), cryptography (Apache-2.0 or BSD), pypdfium2 (Apache-2.0 or BSD) and pdfplumber (MIT) were already in use.
