# Verification boundaries and security

## What is real and what is simulated

| Component | Status | What a result means |
|---|---|---|
| PDF signature validation against **India PKI** (CCA India 2022, 2022 SPL, 2014, 2015 SPL roots) | **Real.** Works offline on real DSC-signed PDFs; tested on Government of India e-Gazette files. | The signed bytes are unchanged and the signer's certificate chains to the CCA root. Without a trusted timestamp, validation uses the signer-reported time and says so. Revocation is checked only when `PRAMANA_PKI_FETCH_REVOCATION=true`; the result then states how many OCSP and CRL responses arrived, and counts as checked only when at least one did. On the e-Gazette sample, online: 3 OCSP responses in about 3.5 s, not revoked. |
| PDF signature validation against the **DEMO** root | Real cryptography, prototype trust anchor | Used for synthetic issuer documents. Results are badged DEMO and never presented as India PKI. |
| Signed QR verification (JWS EdDSA) | Real cryptography, **simulated issuer keys** | The QR payload was signed by the holder of the published key, and its values are compared with the printed text. |
| Public scan-to-verify page (`/scan`) | Real QR decoding and signature check, **simulated issuer keys**; the optional registry lookup is **simulated** | The issuer key signed exactly these values with these validity dates. It does not show that the paper in hand matches (the user compares), that the certificate was not withdrawn later, or anything about the premises. The registry lookup only accepts a validly signed token, so it cannot be used to probe reference numbers. |
| Content Credentials (C2PA) on photos | Real validation with the open-source `c2pa-python` (bundling `c2pa-rs`), offline; trust list is a **DEMO capture CA**, and the campus cameras are simulated | The file is unchanged since the holder of the signing key signed it, and the key chains to the demo CA. It does not show that the scene is this campus or that the device clock was right. No timestamp authority or revocation check is used. Missing credentials are not an indicator. |
| Room and seat indicator | Real detector (YOLOX-M) on real, openly licensed photos; the declarations it is compared with are synthetic | A count of visible objects. Low-weight model evidence, never a compliance finding: one photo rarely shows a whole room. |
| Issuer registries: fire services, municipal OC, SHCIL e-Stamp, ICAI UDIN, structural engineer register | **Simulated** | Every response carries `simulated: true`, and the UI shows a SIMULATED badge. No real service is contacted. The models are documented per issuer. |
| Re-verification watch | Real scheduler, findings and alerts; the registries it re-queries are **simulated**, and the Issuer simulator plays the issuing authority | A watch result says what the simulated registry answered, nothing about a real issuer. It never changes a recorded outcome or the application status. |
| AICTE reference records: approval history, faculty registry, TER ledger, accreditation list, deficiencies, previous year's application | **Synthetic** stand-ins for authorised AICTE systems | Comparisons show the record source and record ID. |
| Manual confirmation by the verification cell | Real workflow | Records who confirmed what, with a note, in the audit chain. |

### Real issuer integrations are future scope

Real issuer integrations, and pulling documents through **DigiLocker or API Setu**, are future scope. They need AICTE authorisation and organisational onboarding with each issuer or platform, which a hackathon prototype cannot obtain. Portals that sit behind a captcha must not be automated. The adapter interface (`IssuerAdapter.verify`) is ready: an authorised integration replaces a simulated adapter without touching the rules, the watch or the UI.

## Status mapping

| Status | When |
|---|---|
| verified | Signature intact and trusted (issuer role), signed QR valid and consistent, issuer record matches, or Content Credentials intact, matching the file and chaining to the demo CA |
| mismatch_detected | Signature broken or modified after signing; QR values differ from the page; issuer has no record or different values; certificate revoked; Content Credentials signature invalid, or the file no longer matches the hash they signed |
| expired | Issuer or QR confirms the document, but its validity ended before the as-of date |
| verification_pending | The issuer confirms asynchronously (for example by letter) |
| source_unavailable | The issuer did not respond. The case is routed to manual confirmation. |
| manual_review_required | Signer not trusted or not the expected issuer; reference number unreadable; unknown QR key; Content Credentials unreadable, or signed by a key outside the demo list |
| not_checked | No signature, QR or registry applies to this document |

A document's authenticity status counts issuer channels only. The applicant's own DSC proves who uploaded the file, and counts only when it is broken.

The re-verification watch reports changes after the scrutiny outcome as findings of the issuer evidence class: `WATCH-ISSUER-REVOKED`, `WATCH-ISSUER-SUSPENDED`, `WATCH-CERT-EXPIRED`, `WATCH-ISSUER-NOT-FOUND` and `WATCH-ISSUER-RECORD-CHANGED` (high), and `WATCH-SOURCE-UNAVAILABLE` (medium).

**Re-saving breaks signatures.** If an institution re-saves an issuer-signed PDF in an editor, the issuer signature reports a mismatch even when no content changed (see the evaluation controls). The reviewer should then ask for the original issuer copy.

The verification research found a related problem. Counter-signing an issuer-locked PDF (as APH requires for uploads) makes the issuer signature report modification. We recommend detached applicant signatures in a production design.

## Security controls

| Area | Control | Where |
|---|---|---|
| Authentication | Argon2id password hashes; server-side sessions; httpOnly, SameSite=Strict cookie; 8-hour expiry. With `PRAMANA_COOKIE_SECURE=true` the cookie is `__Host-pramana_session` (Secure, Path=/, no Domain) and every response carries HSTS. | `auth.py`, `main.py` |
| Sign-in throttling | 60 attempts per client address and 5 failed passwords per username per 15 minutes; then 429 with `Retry-After`, even for the right password, until the window passes. The first refusal of each lockout is audited (`auth.locked_out`). | `throttle.py`, `ratelimit.py` |
| Other rate limits | Public scan: 20 per minute per client and 600 per minute in total. Ask why: 20 questions a minute per officer; evidence packs: 6 exports a minute per officer. | `ratelimit.py` |
| CSRF | Per-session token required in `x-csrf-token` on every unsafe method | `auth.current_session` |
| Authorisation | Roles: institution, officer, verifier, admin. Object-level check on every application, document, finding and run. Other institutions' IDs return 404. Photo evidence, the time machine and the year-over-year view are for officials; evidence packs, Ask why and letter drafting are for officers. | `auth.load_application`, feature routes |
| Data minimisation | Institutions see deficiencies, not forensic or cross-institution indicators under review; in live runs they see stages only, no checks or finding counts; letters reach them without detector codes or other institutions' names. No Aadhaar or PAN processed. India PKI subject fields with hashed PAN are not displayed. The public scan keeps only the photo's SHA-256, the QR count and the status. | `api/applications.py`, `api/live.py`, `api/public.py`, `verification/signature.py` |
| Uploads | Extension allowlist, magic-byte match, size and page limits, decompression-bomb guard, password-protected PDFs rejected, recursive scan for JavaScript, launch, embedded files and auto-actions. The intake scan itself runs in the parser sandbox. | `pipeline/intake.py` |
| Parser sandbox | Untrusted files are parsed in pooled worker processes, not in the server: text and OCR, page rendering, fingerprints, structure and font forensics, seal images, QR decoding and upload intake. Replies are JSON only. On Windows a Job Object enforces a 120 s timeout per operation, a 1536 MB memory cap, no child processes and death with the server; Linux limits (`RLIMIT_AS`, parent-death signal, no core dumps) are written but were not run here. A crash, timeout or memory cap marks the document "Could not be read safely" with a `manual_review` finding; the server keeps running. | `sandbox.py`, `sandbox_worker.py` |
| Storage | Per-document envelope encryption: each file has its own random 256-bit data key (AES-256-GCM, storage name as associated data), wrapped under a master key. `scripts/keys.py rotate` rewraps every data key without rewriting the files, and is audited. Page previews in the cache are encrypted the same way. Originals are never re-encoded, so forensic evidence survives. Files stored before this change (Fernet) still open and can be migrated. | `keyring.py`, `crypto.py`, `scripts/keys.py` |
| Retention | Document files 730 days after the application is closed or withdrawn, page previews 30 days, run progress events 180 days, sessions 7 days. The purge is a dry run unless applied; it deletes each file and its wrapped key (crypto-shredding), leaves a tombstone that answers 410, and audits each deletion. Hashes, fields, findings, verification records, runs and the audit chain are kept. | `retention.py`, `scripts/purge.py` |
| Database | SQLite for the demo; PostgreSQL 16 supported and tested. On PostgreSQL the audit append takes an advisory lock so two writers cannot read the same chain head. | `db.py`, `audit.py` |
| Parsing | Documents are parsed, never executed. Rendering uses PDFium without JavaScript. | `pipeline/text.py` |
| Audit | Append-only hash chain over canonical JSON; Ed25519 signed checkpoints; failed logins, lockouts, downloads, decisions, letters, Ask why answers, watch changes, key rotations and purges logged. Evidence packs carry the application's events up to a signed checkpoint and an offline checker. | `audit.py`, `officer/pack.py` |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on the API; HSTS in secure-cookie mode. Map tile requests alone use `strict-origin-when-cross-origin`, as the OpenStreetMap tile policy asks. | `main.py`, Campus tab |
| AI safety | No model in the decision path. The optional extractor's values must align to OCR words, hidden-text forensics run first, instruction lines are flagged and never used, and the model has no tools or network. All models run locally; no document text is sent to an outside service. Ask why reads only Pramana's structured findings, with document quotes screened for injected instructions; each sentence must cite valid evidence and pass a post-check, and it decides nothing. | `pipeline/llm_extract.py`, `officer/ask.py` |
| Secrets | The master key comes from `PRAMANA_MASTER_KEY`, or is generated into `var/keys/master` with a warning for local demos; `keyring.py` is the seam for an HSM or key management service. The audit signing key is read from `var/keys/audit_ed25519.pem`, and generated there with a warning when missing. | `keyring.py`, `crypto.py`, `config.py` |

## Privacy and law

- **DPDP Act 2023 and Rules 2025.** Most obligations commence 13 May 2027. Regulatory scrutiny likely falls under s.17(1)(b), but security safeguards still apply. The prototype implements the Rule 6 safeguards: encryption, access control, logs and retention.
- **CERT-In Directions 2022.** Log retention of 180 days applies to a deployment. The audit chain is never purged, and production would add NTP sync and log export.
- **Aadhaar.** Not processed (Aadhaar Act s.8A(4)).
- **AI governance.** Human oversight at the decision point: accept, dismiss and escalate each need a written reason, and the system never approves or rejects. Model output (the optional extractor, the room indicator, Ask why) is grounded, labelled and low weight.

## Gaps before production

Closed in the October sprint, each described above: sign-in rate limiting; the `__Host-` cookie with HSTS; parser sandboxing in worker processes with time and memory limits; per-document envelope encryption with key rotation; retention with an audited purge.

Still open:
- **Sandbox isolation.** The workers have no filesystem, network or system-call isolation: a parser compromised by a crafted file could read what the server user can read. Production should run them as a separate low-privilege user, in a container without network, or under seccomp or AppContainer. The Linux limits were written but not run here, and macOS enforces no memory cap.
- **Parsing still in the server process.** pyHanko signature validation parses the PDF in-process. So do, from the code as merged, the time machine's revision rendering (PDFium) and revision listing (pyHanko), and the photo detector and Content Credentials reader, which run on the image after the sandboxed intake check.
- **Plaintext caches.** Page previews are cached encrypted, but the time machine's revision renders and the Campus tab's photo previews are cached unencrypted in `var/cache`. The retention purge removes a document's page previews with it, but not these; revision renders leave with the 30-day preview sweep, photo previews do not.
- **Single-process queue and throttle.** The job queue, the watch scheduler and the sign-in counters live in one server process; counters reset on restart. Several server processes would need a shared queue (for example PostgreSQL `SKIP LOCKED` or Redis) and shared counters.
- **Master key on the same disk in demo mode.** That protects a copied document folder, not a copied data directory. Production keys belong in an HSM or key management service.
- **Retention edges.** Extracted page text and fields stay with the record after files are purged; backups are outside the purge (crypto-shredding covers backups of the document folder); there is no withdraw or close button in the UI yet.
- **External checkpoint publication.** Audit checkpoints and the audit public key are not published outside the deployment. An auditor checking an evidence pack must compare the key it prints with one the deployment publishes.
- **Authorised issuer integrations,** including DigiLocker and API Setu: future scope, as above.
- **Deployment files untested.** `Dockerfile` and `docker-compose.yml` document a deployment but were not built here, because Docker is not available on the build machine.
