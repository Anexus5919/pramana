# Verification boundaries and security

## What is genuine and what is simulated

| Component | Status | What a result means |
|---|---|---|
| PDF signature validation against **India PKI** (CCA India 2022, 2022 SPL, 2014, 2015 SPL roots) | **Genuine.** Works offline on real DSC-signed PDFs; tested on Government of India e-Gazette files. | The signed bytes are unchanged and the signer's certificate chains to the CCA root. Without a trusted timestamp, validation uses the signer-reported time and says so. Revocation is checked only when `PRAMANA_PKI_FETCH_REVOCATION=true`. |
| PDF signature validation against the **DEMO** root | Genuine cryptography, prototype trust anchor | Used for synthetic issuer documents. Results are badged DEMO and never presented as India PKI. |
| Signed QR verification (JWS EdDSA) | Genuine cryptography, **simulated issuer keys** | The QR payload was signed by the holder of the published key, and its values are compared with the printed text. |
| Issuer registries: fire services, municipal OC, SHCIL e-Stamp, ICAI UDIN, structural engineer register | **Simulated** | Every response carries `simulated: true`, and the UI shows a SIMULATED badge. No real service is contacted. The models are documented per issuer. |
| AICTE reference records: approval history, faculty registry, TER ledger, accreditation list, deficiencies | **Synthetic** stand-ins for authorised AICTE systems | Comparisons show the record source and record ID. |
| Manual confirmation by the verification cell | Real workflow | Records who confirmed what, with a note, in the audit chain. |

## Status mapping

| Status | When |
|---|---|
| verified | Signature intact and trusted (issuer role), signed QR valid and consistent, or issuer record matches |
| mismatch_detected | Signature broken or modified after signing; QR values differ from the page; issuer has no record or different values; certificate revoked |
| expired | Issuer or QR confirms the document, but its validity ended before the as-of date |
| verification_pending | The issuer confirms asynchronously (for example by letter) |
| source_unavailable | The issuer did not respond. The case is routed to manual confirmation. |
| manual_review_required | Signer not trusted or not the expected issuer; reference number unreadable; unknown QR key |
| not_checked | No signature, QR or registry applies to this document |

A document's authenticity status counts issuer channels only. The applicant's own DSC proves who uploaded the file, and counts only when it is broken.

**Re-saving breaks signatures.** If an institution re-saves an issuer-signed PDF in an editor, the issuer signature reports a mismatch even when no content changed (see the evaluation controls). The reviewer should then ask for the original issuer copy.

The verification research found a related problem. Counter-signing an issuer-locked PDF (as APH requires for uploads) makes the issuer signature report modification. We recommend detached applicant signatures in a production design.

## Security controls

| Area | Control | Where |
|---|---|---|
| Authentication | Argon2id password hashes; server-side sessions; httpOnly, SameSite=Strict cookie; 8-hour expiry | `auth.py` |
| CSRF | Per-session token required in `x-csrf-token` on every unsafe method | `auth.current_session` |
| Authorisation | Roles: institution, officer, verifier, admin. Object-level check on every application, document, finding and run. Other institutions' IDs return 404. | `auth.load_application` |
| Data minimisation | Institutions see deficiencies, not forensic or cross-institution indicators under review. No Aadhaar or PAN processed. India PKI subject fields with hashed PAN are not displayed. | `api/applications.py`, `verification/signature.py` |
| Uploads | Extension allowlist, magic-byte match, size and page limits, decompression-bomb guard, password-protected PDFs rejected, recursive scan for JavaScript, launch, embedded files and auto-actions | `pipeline/intake.py` |
| Storage | Originals encrypted at rest (Fernet; key from `PRAMANA_STORAGE_KEY`), random storage names, served only through authorised handlers with `nosniff`. Never re-encoded, so forensic evidence survives. | `crypto.py` |
| Parsing | Documents are parsed, never executed. Rendering uses PDFium without JavaScript. | `pipeline/text.py` |
| Audit | Append-only hash chain over canonical JSON; Ed25519 signed checkpoints; failed logins, downloads and decisions logged | `audit.py` |
| Headers | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on the API | `main.py` |
| AI safety | No LLM in the decision path. If an optional extractor is added: values must align to OCR words; hidden-text forensics run first; no tools or network for the model. | design |
| Secrets | Keys generated into `var/keys` only for local demos, with a warning; production keys come from the environment | `crypto.py`, `config.py` |

## Privacy and law

- **DPDP Act 2023 and Rules 2025.** Most obligations commence 13 May 2027. Regulatory scrutiny likely falls under s.17(1)(b), but security safeguards still apply. The prototype implements the Rule 6 safeguards: encryption, access control, logs and retention.
- **CERT-In Directions 2022.** Log retention of 180 days applies to a deployment. The audit chain supports it, and production would add NTP sync and log export.
- **Aadhaar.** Not processed (Aadhaar Act s.8A(4)).
- **AI governance.** Human oversight at the decision point: accept, dismiss and escalate each need a written reason, and the system never approves or rejects.

## Known gaps before production

- Rate limiting on login; `__Host-` cookie with HTTPS.
- Parser sandboxing in a subprocess with time limits.
- Envelope encryption per document with key rotation.
- External checkpoint publication.
- Retention jobs.
- Authorised issuer integrations.
