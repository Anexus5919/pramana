# Handoff to the Executive Committee

A judge's question: "where does the officer's decision go next?" In AICTE's process the scrutiny outcome is not the decision. AICTE's Executive Committee takes the decision on approval and the Council ratifies it. Pramana covers the scrutiny stage, so it now prepares that stage's record for the Executive Committee, shows its status, and lets an official record that it was forwarded. Pramana never decides, and nothing in it says approve or reject as its own output.

The process chain, as the app and the report put it:

> Scrutiny, supported by Pramana: the Scrutiny Committee verifies the documents, deficiencies are communicated and an officer records the scrutiny outcome with its reasons. The outcome goes to AICTE's Executive Committee, which decides on approval. The Council ratifies the decision. The decision reaches the institution on the AICTE portal as a letter.

Code: `backend/pramana/handoff/` (models, report, pdf, channels, settings, api), the hook at the end of `history/watch.py` `record_outcome()`, the workspace panel in `frontend/src/pages/application/handoff/`, the review queue panel in `frontend/src/pages/dashboard/DashboardPage.tsx`, the institution's next steps in `frontend/src/pages/portal/OutcomePanel.tsx` and the Help section in `frontend/src/pages/info/Guides.tsx`. Tests: `backend/tests/test_ec_handoff.py`, plus a check in `test_rectification_conversation.py`.

## 1. The process in the handbook

Read in the Approval Process Handbook 2024-27 (`legal_sources/APH_2024-27.pdf`, SHA-256 `153d5481...6051`, the same file `rulesets/regulatory_basis.yaml` cites). Page numbers are PDF pages.

| Stage | Who | Handbook text |
|---|---|---|
| Scrutiny | Scrutiny Committee, Regulation Bureau | Annexure 16.8, page 194, the Scrutiny Committee: "Verify the authenticity of the documents submitted by the Applicant as specified in Annexure 1/2 (as applicable) of the Approval Process Handbook." |
| Expert visit, where needed | Expert Visit Committee | Annexure 16.8, page 194: "Online/ Offline Visit of the premises of Institution to verify the availability of Infrastructural facilities and Faculty with respect to the norms specified in the Approval Process Handbook." The Standing Hearing and Standing Appellate Committees assess compliance and appeals. |
| Decision | Executive Committee | Clause 1.10(a), page 24: "The Executive Committee (EC) after considering the recommendations of the Committee and views of the Regulation Bureau shall take decision either to grant of approval or otherwise." |
| Ratification | Council | Clause 1.10(a), page 24: "The decisions of the Executive Committee shall be ratified by the Council." For existing institutions (Chapter II, which the demo's extension-of-approval applications fall under), clause 2.25(a), page 47: "The decisions taken by the Executive Committee are ratified by the Council." |
| Letter | AICTE web portal | Clause 1.10(b), page 24: "The decision of the Executive Committee shall be uploaded on the Web-Portal in the form of Letter of Approval (LoA) or Letter of Deficiency (LoD)/ Letter of Rejection (LoR)." Clause 1.9(h), page 24: "The Scrutiny/Re-Scrutiny Committee Report and EVC Report shall be made available to the institutions through AICTE web portal." |

Clause 1.9(h) is the clause on scrutiny and EVC reports reaching institutions; it sits on the same page as 1.10, under 1.9 (the Expert Visit Committee), not under 1.10.

## 2. The report

When an official records a scrutiny outcome (`POST /api/applications/{id}/scrutiny-outcome`, or the seed), `record_outcome()` commits the outcome and the watch, then `handoff.report.prepare()` writes one `EcReport`:

| Part | What it holds |
|---|---|
| Application | Id, institution, AICTE id, place, category, academic year, status |
| Outcome | Code and label, the officer's reasons, round, the validation run it was recorded against, recorded by (username, name, role) and when |
| Findings | Every finding on that run, counted by review group (open, acknowledged, resolved, dismissed; asked of the institution and referred for inspection count as open) by severity and by category, each finding with the provisions it relates to from the regulatory basis, and the provisions listed once with their verbatim quote, page and how many open or acknowledged findings relate to them |
| Verification | Each current document's effective status (`verification/effective.py`: the run's status with later manual confirmations and officer reviews applied), counts by status, and whether a simulated issuer registry took part |
| Correction rounds | Each round: items, the final letter's SHA-256 and date, resubmission date, messages, review requests and how many had the cell's answer; and whether every review request in every round was answered |
| Evidence pack | A signed pack built at that moment with `officer/pack.py` `build_pack()` (no original files), stored with the existing envelope encryption; its id, ZIP SHA-256, manifest SHA-256, size, audit public key and checkpoint |
| Process | The four stages above with their clauses |

Digests:
- `report_sha256` is the SHA-256 of the record (`content`) as canonical JSON. `GET /api/ec-reports/{id}` returns the record, so anyone given it can recompute the digest.
- The PDF is rendered once from the record, stored encrypted, and its SHA-256 kept as `pdf_sha256`. The PDF prints the report and pack digests.
- `pack_zip_sha256` and `pack_manifest_sha256` match the stored pack; `verify_pack.py` inside the pack checks it offline.
- All of them go into the `ec_report.prepared` audit event.

Versions:
- Each outcome gets exactly one report (`outcome_id` is unique). A later outcome on the same application writes version n+1, whose record names the version it replaces (`supersedes`).
- A report is never changed or deleted: SQLAlchemy `before_update` and `before_delete` listeners on `EcReport` and `EcForwarding` raise `ImmutableRecord`. Earlier versions stay listed, with their PDFs and their own forwarding.
- If preparing fails (say the renderer is down), the outcome stays recorded, `ec_report.preparation_failed` is audited, the workspace says so, and an officer can prepare it again (`POST /api/applications/{id}/ec-reports`), once per outcome.

The PDF, for an Executive Committee member: a notice that Pramana decides nothing; the outcome and reasons; an at-a-glance block; the integrity digests; findings by severity and category; the provisions quoted; every finding with its status and the provisions it relates to; verification per document; the correction rounds; and what happens next, ending with clause 1.10(a) quoted.

## 3. Status and channels

| Status | When |
|---|---|
| Ready for the Executive Committee | The report is prepared and no forwarding is recorded |
| Forwarded to the Executive Committee | An official recorded the forwarding |

A version replaced by a later one says so ("Replaced by version 2") and can no longer be forwarded (409).

Channels follow the notification pattern (`conversation/notify.py`):
- `HandoffChannel` (`handoff/channels.py`): `name`, `label`, `available`, `sends`, and `offer(db, report, pdf, pack)` returning a `Delivery`.
- `ManualChannel` (`manual`): built. It sends nothing; it waits for an official's record.
- `AictePortalChannel` (`aicte_portal`): designed, not built. AICTE's portal has no public interface for this, so the class documents what it would send (metadata with every digest, the PDF, the canonical record and the signed pack; never anything to the institution), how it would authenticate (mutual TLS, a key from the secret store, the report id as idempotency key), what it records on an acknowledgment (an `EcForwarding` with `sent_by_pramana` true and the portal's reference, audit `ec_report.forwarded`) and on a failure (`ec_report.send_failed`, report stays Ready), and how to switch it on.
- `PRAMANA_HANDOFF_CHANNELS` (default `manual`) names the channels. Naming `aicte_portal` before it is built logs one warning and is recorded in the prepared event as "not available"; the report stays Ready and nothing reads as sent. Manual forwarding is always available.

Recording a forwarding by hand (`POST /api/ec-reports/{id}/forwarding`, officer or admin): the date (from the day the report was prepared to today), a reference number (3 to 80 characters) and an optional note (no judgemental words about documents). The record has `channel` "manual" and `sent_by_pramana` false, and the screen says "Forwarded by an official; Pramana did not send it." It is audited as `ec_report.forwarding_recorded` with the report and pack digests. One forwarding per report.

## 4. Who sees what

| | Officer | Admin | Verifier | Institution |
|---|---|---|---|---|
| Report panel, record, PDF | Yes | Yes | Yes | No (403) |
| Evidence pack download | Yes | Yes | No (403) | No (403) |
| Record forwarding | Yes | Yes | No (403) | No (403) |
| Prepare a report again | Yes | No | No | No |
| Outcome, reasons, what happens next | Yes | Yes | Yes | Yes, its own applications |

The institution's outcome view (`GET /api/applications/{id}/outcome`) carries nothing of the report: no findings, forensic signals, digests, pack or officer names. A test checks the payload.

## 5. Screens

- **Workspace, Summary.** Once an outcome is recorded, "For the Executive Committee" leads the summary: the status, one line on who decides, the outcome, findings by group with the number of provisions, documents by status (SIMULATED tag when it applies), correction rounds and review requests, the report and pack digests, Report PDF and Evidence pack downloads, the forwarding (form or record) and earlier versions.
- **Decide, Record scrutiny outcome.** One line at the top: "The outcome goes to AICTE's Executive Committee, which decides; the Council ratifies the decision." The menu item reads "Record it with a reason. It goes to the Executive Committee, which decides."
- **Review queue.** "Ready for the Executive Committee": the reports not yet forwarded, with the institution, outcome, version and age; shown only while there are some. The counts come from `GET /api/dashboard` (`ec_handoff`).
- **Institution portal, outcome panel.** Under "What happens next", in English and Hindi: the Executive Committee takes the decision on approval, considering the scrutiny outcome; the Council ratifies it; the decision reaches the institution on the AICTE portal as a letter. The server's "what you can do next" lines are now translated too.
- **Help.** "How a decision is made": the five stages with the clauses above, quoted, with their pages.

## 6. API

| Method and path | Roles | Returns |
|---|---|---|
| `GET /api/applications/{id}/ec-reports` | officials | Latest report, every version, `outcome_without_report`, channels |
| `POST /api/applications/{id}/ec-reports` | officer | Prepares the report for the current outcome if it is missing; 409 otherwise |
| `GET /api/ec-reports/{id}` | officials | The report summary and the stored record |
| `GET /api/ec-reports/{id}/report.pdf` | officials | The stored PDF; audited |
| `GET /api/ec-reports/{id}/evidence-pack.zip` | officer, admin | The pack built with the report; audited |
| `POST /api/ec-reports/{id}/forwarding` | officer, admin | Records a forwarding by hand |

## 7. Audit events

`ec_report.prepared` (version, outcome, every digest, the version replaced, what each channel did), `evidence_pack.exported` and `evidence_pack.sealed` (with `purpose: executive_committee_report`), `ec_report.downloaded`, `evidence_pack.downloaded` (with the report id), `ec_report.forwarding_recorded`, `ec_report.preparation_failed`.

## 8. Demo

The seed records A1's and A6's outcomes, so both have reports. A1's report is recorded as forwarded on the seed day (reference RB/EC/2026-27/0041, recorded by the officer); A6's is Ready and appears on the review queue. Sign in as `officer`, open A6: the panel leads the summary; Record forwarding moves it to Forwarded and off the queue. Sign in as `inst6` (or `inst1`) to read the outcome and what happens next, in English or हिंदी.

## 9. Tests

`backend/tests/test_ec_handoff.py`:
- the seeded reports, A1's forwarding by hand and the queue count;
- the report's contents against the findings page, the regulatory basis and the effective status; its digest recomputed from the record; the PDF's and the pack's digests against the stored bytes; the pack verifying offline; the audit events and an intact chain;
- a later outcome writing version 2 while version 1 stays byte for byte the same, and the tables refusing an update or a delete;
- forwarding: dates, reference, note wording, roles (verifier and institution refused), one per report, latest version only, audited;
- the institution never reaching the report, the PDF, the pack or the record, and its outcome view carrying none of it;
- the portal stub never marking a report sent, even when configured;
- a failed preparation keeping the outcome and being retried.

`test_rectification_conversation.py` also checks that A4's report records its correction round and the answered review request.

## 10. Limits

- No connector to the AICTE portal: forwarding is recorded by hand and says so.
- The report covers the scrutiny stage only. Expert Visit Committee reports, Standing Hearing and Appellate Committee proceedings, the Executive Committee's decision and the Council's ratification happen outside Pramana; the decision's letter is AICTE's.
- The evidence pack in the report leaves out original files, to keep it small and free of personal data; an officer can still export a pack with originals from More actions.
