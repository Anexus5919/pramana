# Architecture decisions

Constraints:
- free and open source throughout;
- runs on one Windows laptop (CPU first, 16 GB RAM);
- synthetic data;
- prototype due 25 Oct 2026.

## Overview

```
Institution portal --upload--> Intake in the parser sandbox (type, size, active content) --envelope-encrypted store-->
Submit / Run validation --> job queue (background thread) --progress events--> SSE stream --> workspace and portal
  Document processing, in sandbox workers:
      text layer or OCR (Latin, and Devanagari when detected) -> classification -> fields with word boxes
      -> fingerprints and seal images -> PDF structure and font forensics / photo metadata -> QR tokens
  Photo analysis: Content Credentials (C2PA) -> object counts (YOLOX-M, onnxruntime)
  Validation run:
      verification (signatures, signed QR, issuer adapters, Content Credentials) -> facts with provenance
      -> versioned rules -> forensic, cross-application (incl. seal reuse), photo and year-over-year signals
      -> findings -> ruleset hash, input digest, report digest -> audit chain
Official workspace: review queue -> finding evidence on the page -> review action / rectification and deficiency letter
                    / manual confirmation; time machine, Campus tab, Since last year, Ask why (findings only), evidence pack
After a scrutiny outcome: re-verification watch (scheduler) -> issuer adapters -> watch findings and dashboard alerts
Public, no login: /scan -> QR decode -> signed QR verification (photo not stored)
```

Backend: Python 3.12, FastAPI and SQLAlchemy, on SQLite for the demo and PostgreSQL 16 for a deployment. Frontend: React, Vite, TypeScript and Tailwind, with Leaflet for the campus map, served by the backend in production.

## ADR-1: Python backend, single service, SQLite

- **Options:** Node or Next.js full stack; Python FastAPI; Go.
- **Decision:** Python with FastAPI. The verification and document stack is Python-native: pyHanko, pdfplumber, pikepdf, RapidOCR, OpenCV.
- **Database:** SQLite runs without installation and handles the prototype's load. The SQLAlchemy models carry over to PostgreSQL by switching `PRAMANA_DATABASE_URL`. The full suite passed on PostgreSQL 16.2 on the platform branch. The changes were small: SQLite-only connection options, a pre-pinged pool for PostgreSQL, and an advisory lock on the audit append.

## ADR-2: Deterministic first, no LLM in the decision path

- The PS asks for explainable, evidence-linked results. Classification uses keyword rules that explain themselves. Fields come from anchored patterns tied to word boxes. Rules are expressions over facts that carry provenance.
- A local LLM is an optional extractor for fields the patterns cannot read, with two safeguards:
  - a value is accepted only if fuzzy alignment finds it in the OCR words;
  - lines that address automated readers are flagged and never used.
- We fine-tuned Qwen3 1.7B for this (`backend/training`, results in `docs/evaluation-results.md`). It is enabled in the demo setting and off in the tests and the deterministic evaluation, which pass without it.
- A model value enters the facts only after grounding, labelled with its extraction method. The rules never see an ungrounded model value, and no model decides an outcome.

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
- **Hindi:** the same runtime loads the PP-OCRv5 Devanagari recogniser (ADR-14).

## ADR-5: Signatures with pyHanko and the India PKI roots

- pyHanko (MIT) validates CMS/PAdES signatures, chains them to trust anchors, and runs diff analysis on later revisions.
- We bundle the CCA India roots, so real DSC-signed PDFs validate offline.
- Signatures without a trusted timestamp are validated at the signer-reported time, and the time is labelled self-asserted.
- Revocation fetching (CRL/OCSP) is a setting, off by default for offline demos. When on, the result counts how many responses arrived and claims "revocation checked" only when at least one did.
- **Signer role:** a separate step classifies whether the issuer or the applicant signed. A valid applicant DSC never counts as issuer authentication.

## ADR-6: Forensics without deep models

- **Implemented:**
  - revision boundaries and a character-level diff between revisions (multiset, so values redrawn in place are caught), and a time machine that renders each saved revision;
  - overlapping horizontal glyphs;
  - white boxes over text;
  - a value drawn in a font or size that no other value and no other text on the page uses;
  - seal-sized images hashed (SHA-256 of pixels, pHash and dHash) and compared across issuers;
  - producer and date metadata;
  - active content;
  - photo EXIF and geotag.
- **Not used:** deep tampering models. Their benchmarks collapse out of domain and the best known have non-commercial terms (see the research brief).
- Severity follows documented rules; we compute no fraud probability.

## ADR-7: Issuer integrations behind an adapter

- `IssuerAdapter.verify(ref_no, submitted_fields, as_of) -> VerificationResult`.
- The prototype registers simulated registries with switchable outages, an asynchronous mode, and revoke, suspend and restore actions for the watch demo.
- The re-verification watch calls the same adapters, so it needs no change when a real one arrives.
- An authorised integration (an issuer API, a state API, DigiLocker or API Setu) replaces an adapter without touching rules or UI. These are future scope: they need AICTE authorisation and organisational onboarding, and captcha portals must not be automated.
- Simulated results carry `simulated: true` end to end.

## ADR-8: Cross-application consistency as a graph of shared entities

- Applications link through shared faculty IDs, certificate reference numbers, file hashes, photo perceptual hashes, seal images and identical variable field values.
- networkx builds an ego graph per application for the UI.
- **Ordering:** the earlier submitter of a reused photo or seal gets a low note and the later one the main finding.
- **Seals:** reported only when the two documents name different issuers (compared by organisation, not by the signatory's title). An image under three or more issuers is shared artwork and ignored.

## ADR-9: Tamper-evident audit and reproducible runs

- **Audit chain:** each audit event hashes canonical JSON together with the previous hash, and Ed25519 checkpoints sign the chain head.
- **Pinned run inputs:** each validation run pins the ruleset hash, engine version, as-of date and an input digest (document hashes, declared values, reference records).
- **As-of date in rectification rounds:** the as-of date is the application's first submission date in every round, so the previous financial year and every other time-relative rule stay where they were. A document sent in a rectification round is judged on the day it was sent: rules marked `as_of: document` (fire certificate valid and issued by then, Structural Stability Certificate within five years), its signed QR and issuer registry expiry, and the session lapse check. Those dates are pinned with the run.
- **Replay:** recomputing the report digest shows whether the result is reproduced.
- **What replay cannot freeze:** results that depend on external state are marked. These include peer applications and simulated source availability. Watch findings are added after a run finishes and are kept out of its report digest, so replay still reproduces the run.
- **Export:** an evidence pack carries the application's events up to a checkpoint signed at the moment of export, so an auditor can verify the extract without other applications' events.

## ADR-10: Security baseline

- Server-side sessions in httpOnly SameSite=Strict cookies; `__Host-` prefix and HSTS behind HTTPS.
- A CSRF token header on unsafe methods.
- Argon2id password hashes and sign-in throttling per address and per username.
- Role checks, plus object-level checks that return 404 across institutions.
- Uploads: extension allowlist, magic bytes, size and page limits, a decompression-bomb guard and a recursive active-content scan.
- Originals are stored encrypted (ADR-13) and never re-encoded, which would destroy forensic evidence.
- Untrusted files are parsed in sandboxed workers (ADR-12).
- Security headers on every response.

## ADR-11: Background validation jobs with Server-Sent Events

- **Problem:** submit and validation held the HTTP request open while documents were read; a re-read of seven documents takes 8 to 15 s.
- **Options:** keep requests synchronous; Celery or RQ with Redis; an in-process thread pool with events stored in the database; WebSockets.
- **Decision:** `jobs.py` queues a run and returns its id in milliseconds. A thread pool (one worker on SQLite, so job writes never compete; up to two on PostgreSQL) runs the same `run_validation()` as before, with a progress callback that commits a `RunEvent` row per step. `GET /api/runs/{id}/events` streams them as Server-Sent Events, replaying from `Last-Event-ID`; a polling endpoint is the fallback.
- **Why:** no extra service to install on a laptop. Events are stored, so a reloaded page resumes where it was and an institution's run shows up in an officer's open workspace. SSE is one-way and works over plain HTTP. Nothing is paced or simulated: a block fills when the server reports the step done.
- **Trade-offs:** the queue lives in one server process; start-up marks orphaned runs interrupted, and a retry endpoint starts them again. Each open stream polls the database every 250 ms, fine for a handful of viewers. Several server processes would need a shared queue (PostgreSQL `SKIP LOCKED` or Redis). Seed, evaluation, replay and tests stay synchronous.

## ADR-12: Parser sandbox in pooled worker processes

- **Problem:** PDF and image parsers are the largest attack surface, and a crafted file can crash or exhaust a process.
- **Options:** parse in the server; a new process per document; a pool of long-lived workers with OS limits; containers or gVisor per parse.
- **Decision:** two pooled workers (`sandbox.py`, `sandbox_worker.py`) take length-prefixed requests on stdin and return JSON only, so a misbehaving worker can return data but never code. On Windows a Job Object caps memory, forbids child processes and kills the worker with the server; on Linux `RLIMIT_AS`, `PR_SET_PDEATHSIG` and no core dumps. Each operation has a wall-clock timeout. Workers are recycled after 200 operations.
- **Why:** a process per document costs about a second each; pooled workers cost the one-time start-up plus about 1.5 ms per call. A crash, timeout or memory cap becomes a manual-review finding, never a server crash.
- **Limits:** no filesystem, network or system-call isolation. pyHanko signature validation, the time machine's revision rendering, and the photo detector and Content Credentials reader still run in the server process. Production should add a low-privilege user, a container without network, or seccomp or AppContainer.

## ADR-13: Per-document envelope encryption

- **Options:** one Fernet key for every file (the earlier design); envelope encryption with a master key, the pattern key management services use; disk or database encryption only.
- **Decision:** each stored file gets a random 256-bit data key and AES-256-GCM, with the storage name as associated data so a file copied over another fails to decrypt. The data key is wrapped under the master key with AES-256-GCM and stored beside the file.
- **Why:** rotating the master key rewraps small keys instead of re-encrypting every document (`scripts/keys.py rotate`; a test checks the file bytes are identical before and after). Deleting one wrapped key makes one file unreadable, even from a backup of the bytes, which the retention purge relies on. `keyring.py` is the seam where an HSM or key management service plugs in.
- **Limits:** in demo mode the master key sits on the same disk as the data. Files from before the change still open and can be migrated.

## ADR-14: Local models for Hindi OCR, photo objects and Content Credentials

- **Rules for any model:** permissive weights, CPU-only, run through onnxruntime where possible, fetched once against a pinned SHA-256 into a gitignored folder. A missing model gives an explicit "not read" or "not analysed" with the reason, never a guess.
- **Hindi:** the PP-OCRv5 Devanagari mobile recogniser (ONNX, Apache-2.0, 7.9 MB) through RapidOCR. It reads Latin too but confuses `O` with `0` and `I` with `l`, so each text line takes Devanagari words from it and other words from the default recogniser when that reading is confident.
- **Photo objects:** YOLOX-M trained on COCO (ONNX, Apache-2.0) on onnxruntime, already a dependency. The earlier plan (Places365 or SigLIP2 for room type, RT-DETR for objects) needed torch, about 1 GB; Ultralytics YOLO weights are AGPL-3.0. The room type is read from the mix of objects instead of a scene classifier.
- **Content Credentials:** the official open-source `c2pa-python` (MIT or Apache-2.0, bundling `c2pa-rs`), run offline against a separate DEMO capture CA that can never become a PDF signature anchor. Pinned to 0.38.0 because 0.38.1 ships no Windows wheel.
- **Weight:** the room indicator is evidence class `model`, severity low, outcome indicator. Content Credentials are cryptographic: a signed hash compared with the file.

## ADR-15: Ask why grounded on structured findings only

- **Options:** chat over the documents (retrieval over raw text); chat over Pramana's structured output with citations; no assistant.
- **Decision:** the context is only Pramana's own output: findings, page regions, verification results, rules with their verbatim clauses, document status and run facts. Raw document text is never sent; quoted values that address automated readers are withheld. A local model (`qwen3:4b-instruct-2507`, temperature 0) returns sentences with evidence ids under a JSON schema. A lexical post-check drops a sentence that cites no valid evidence, contains a number, date or code not in what it cites, uses a status word its items contradict, uses judgemental words about a document, or states a decision. Without a model, or when every model sentence fails, template answers from the same evidence are shown and labelled. Every answer is audited.
- **Why:** raw document text is where injected instructions live (A11). An explanation is only as good as the evidence it cites, and the officer must be able to click through to it. Decision support only: the panel says "Explains existing findings, decides nothing."
- **Limits:** the post-check is lexical. It cannot catch a paraphrase that misstates a relationship using only words that appear in the cited items.

## Not built, and why

| Item | Reason |
|---|---|
| Live issuer integrations, DigiLocker and API Setu | Future scope. They need AICTE authorisation and organisational onboarding; captcha portals must not be automated. The adapter interface (ADR-7) is ready. |
| Room-type scene classifier | The room indicator is now built as a low-weight model indicator (ADR-14), reading the room type from the objects it counts. A scene classifier (Places365, CC BY, or SigLIP2, Apache-2.0) would need torch and would still not prove compliance. |
| Floor-plan area extraction | Public training data such as CubiCasa5k is non-commercial. Areas are taken from certificates and declarations instead. |
| Seal matching robust to cropping and rotation | Perceptual hashes miss a cropped, rotated or re-photographed seal. Keypoint matching (ORB) is the next step. |
| Indian scripts beyond Devanagari | Each script needs its own recogniser; Hindi values are not transliterated for comparison with English records. |
| Shared job queue for several server processes | One process is enough for the prototype (ADR-11). |
