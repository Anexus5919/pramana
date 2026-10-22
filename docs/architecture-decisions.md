# Architecture decisions

Constraints:
- free and open source throughout;
- runs on one Windows laptop (CPU first, 16 GB RAM);
- synthetic data;
- prototype due 25 Oct 2026.

## Overview

```
Institution portal --upload--> Intake (type, size, active content) --encrypted store-->
  Document processing: text layer or OCR -> classification -> fields with word boxes -> fingerprints
                       -> PDF structure forensics / photo metadata -> QR tokens
  Validation run:  verification (signatures, signed QR, issuer adapters) -> facts with provenance
                   -> versioned rules -> forensic and cross-application signals -> findings
                   -> ruleset hash, input digest, report digest -> audit chain
Official workspace: review queue -> finding evidence on the page -> review action / rectification / manual confirmation
```

Backend: Python 3.12, FastAPI, SQLAlchemy and SQLite. Frontend: React, Vite, TypeScript and Tailwind, served by the backend in production.

## ADR-1: Python backend, single service, SQLite

- **Options:** Node or Next.js full stack; Python FastAPI; Go.
- **Decision:** Python with FastAPI. The verification and document stack is Python-native: pyHanko, pdfplumber, pikepdf, RapidOCR, OpenCV.
- **Database:** SQLite runs without installation and handles the prototype's load. The SQLAlchemy models carry over to PostgreSQL unchanged, by switching `PRAMANA_DATABASE_URL`.

## ADR-2: Deterministic first, no LLM in the decision path

- The PS asks for explainable, evidence-linked results. Classification uses keyword rules that explain themselves. Fields come from anchored patterns tied to word boxes. Rules are expressions over facts that carry provenance.
- A local LLM (Ollama, Apache-2.0 weights) was evaluated as an optional extractor for unseen layouts, with two safeguards:
  - a value is accepted only if fuzzy alignment finds it in the OCR words;
  - prompt injection from document text is guarded against.
- It is not enabled in the prototype. The fixtures did not need it, and the rules never depend on model output.

## ADR-3: Own rule engine over YAML

- **Compared:** json-logic, GoRules ZEN (runner-up), CEL, OPA/Rego, DMN engines.
- **Gap:** none of them treat citations, effective dates, evidence requirements or manual-review outcomes as built-in features.
- **Our engine:**
  - a whitelisted expression language (Python `ast`, with no attribute access, calls or imports beyond a short function list);
  - outcomes pass, fail, insufficient_evidence, not_applicable and error;
  - every fact read is recorded with its source and page region;
  - each run pins the ruleset's SHA-256, and the YAML is archived by hash, so a run can be replayed.

## ADR-4: OCR with RapidOCR

- **Compared:** Tesseract (needs a separate Windows installer), PaddleOCR (105 MB framework), docTR, EasyOCR (slow, no release since 2024), Surya (weights with a revenue cap).
- **Decision:** RapidOCR. It is pip-only, Apache-2.0 for code and weights, gives word boxes and confidences, and runs on CPU.
- **Speed:** onnxruntime latency varies, and OpenVINO is a faster drop-in engine if needed.

## ADR-5: Signatures with pyHanko and the India PKI roots

- pyHanko (MIT) validates CMS/PAdES signatures, chains them to trust anchors, and runs diff analysis on later revisions.
- We bundle the CCA India roots, so real DSC-signed PDFs validate offline.
- Signatures without a trusted timestamp are validated at the signer-reported time, and the time is labelled self-asserted.
- Revocation fetching (CRL/OCSP) is a setting, off by default for offline demos.
- **Signer role:** a separate step classifies whether the issuer or the applicant signed. A valid applicant DSC never counts as issuer authentication.

## ADR-6: Forensics without deep models

- **Implemented:**
  - revision boundaries and a character-level diff between revisions (multiset, so values redrawn in place are caught);
  - overlapping horizontal glyphs;
  - white boxes over text;
  - producer and date metadata;
  - active content;
  - photo EXIF and geotag.
- **Not used:** deep tampering models. Their benchmarks collapse out of domain and the best known have non-commercial terms (see the research brief).
- Severity follows documented rules; we compute no fraud probability.

## ADR-7: Issuer integrations behind an adapter

- `IssuerAdapter.verify(ref_no, submitted_fields, as_of) -> VerificationResult`.
- The prototype registers simulated registries with switchable outages and an asynchronous mode.
- An authorised integration (DigiLocker pull, a state API) replaces an adapter without touching rules or UI.
- Simulated results carry `simulated: true` end to end.

## ADR-8: Cross-application consistency as a graph of shared entities

- Applications link through shared faculty IDs, certificate reference numbers, file hashes, photo perceptual hashes and identical variable field values.
- networkx builds an ego graph per application for the UI.
- **Ordering:** the earlier submitter of a reused photo gets a low note and the later one the main finding.

## ADR-9: Tamper-evident audit and reproducible runs

- **Audit chain:** each audit event hashes canonical JSON together with the previous hash, and Ed25519 checkpoints sign the chain head.
- **Pinned run inputs:** each validation run pins the ruleset hash, engine version, as-of date and an input digest (document hashes, declared values, reference records).
- **Replay:** recomputing the report digest shows whether the result is reproduced.
- **What replay cannot freeze:** results that depend on external state are marked. These include peer applications and simulated source availability.

## ADR-10: Security baseline

- Server-side sessions in httpOnly SameSite=Strict cookies.
- A CSRF token header on unsafe methods.
- Argon2id password hashes.
- Role checks, plus object-level checks that return 404 across institutions.
- Uploads: extension allowlist, magic bytes, size and page limits, a decompression-bomb guard and a recursive active-content scan.
- Originals are stored Fernet-encrypted and never re-encoded, which would destroy forensic evidence.
- Security headers on every response.

## Not built, and why

| Item | Reason |
|---|---|
| Room-type and seat counting from photos | Feasible with Places365 (CC BY) or SigLIP2 (Apache-2.0) and RT-DETR (Apache-2.0), but needs torch (about 1 GB). Planned as an optional module. Counts would be lower bounds, never compliance proof. |
| Floor-plan area extraction | Public training data such as CubiCasa5k is non-commercial. Areas are taken from certificates and declarations instead. |
| Live issuer integrations | Need institutional authorisation; captcha portals must not be automated. |
