# Pramana

Evidence-linked application validation, document authentication and compliance assistance for AICTE approval processing. Built for Smart India Hackathon 2026, problem statement **26261** (AICTE, Regulation Bureau).

> Decision support only. Findings are preliminary indicators for review by competent authorities. Pramana does not approve, reject or penalise any institution. All demo data is synthetic.

## What it does

- **Validates** an application against a versioned, cited ruleset built from the Approval Process Handbook 2024-27 and its 2025-26 and 2026-27 addenda.
  - 29 rules across the Annexure 2.1 documents, certificate validity, Affidavit 2 form and DSC, TER ledger status, approval-record consistency, faculty-student ratio, bandwidth, areas, NBA claims and core-branch conditions.
- **Reads documents** from their text layer, or by OCR for scanned pages. Every extracted value is tied to the page region it came from.
- **Verifies:**
  - PDF digital signatures against the **CCA India root certificates**, a genuine check that works offline;
  - issuer-signed QR codes;
  - issuer registries through an adapter interface (simulated registries in the prototype, clearly labelled).
- **Separates who signed:** the applicant's own DSC never counts as issuer authentication.
- **Finds tampering evidence:**
  - text changed in a later PDF revision ("added '30-06-2027' over existing text '30-06-2025'");
  - overwritten fields, overlaid glyphs, white boxes;
  - photo metadata and geotag distance.
- **Links applications** through shared faculty IDs, certificate numbers, file hashes, reused photos and identical certificate details. These contradictions are invisible when one document is reviewed at a time.
- **Supports reviewers:**
  - an evidence viewer and review actions that need reasons;
  - rectification rounds that flag changes outside the requested scope;
  - manual confirmation when a source is unavailable;
  - a hash-chained audit trail;
  - replayable validation runs.

Start with `docs/usp-and-demo.md`. Research, requirements mapping, design decisions, security and measured results are in `docs/`.

## Quick start (Windows, macOS or Linux)

Prerequisites: Python 3.12 with [uv](https://docs.astral.sh/uv/), and Node 22 with pnpm.

```bash
# Backend
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv -e ".[dev]"   # Windows: --python .venv\Scripts\python.exe

# Synthetic world and demo database (about 1 minute; OCR models load on first use)
.venv/Scripts/python scripts/make_fixtures.py
.venv/Scripts/python scripts/seed.py
.venv/Scripts/python scripts/fetch_real_samples.py   # optional: a real DSC-signed e-Gazette PDF

# Frontend
cd ../frontend
pnpm install
pnpm build

# Run (serves the UI and the API)
cd ../backend
.venv/Scripts/python -m uvicorn pramana.main:app --port 8000
```

Open http://127.0.0.1:8000. For frontend development run `pnpm dev` in `frontend/`; it proxies `/api` to port 8000.

Demo accounts (password `Pramana@2026`):

| User | Role |
|---|---|
| officer | AICTE scrutiny officer |
| verifier | Verification cell |
| admin | Administrator / auditor |
| inst1 ... inst10 | Applicant institution for application A1 ... A10 |

## Tests and evaluation

```bash
cd backend
.venv/Scripts/python -m pytest          # 22 tests: rules, forensics, signatures, QR, uploads, full workflow
.venv/Scripts/python scripts/evaluate.py
```

Current results: all 37 planted conditions detected with no false alarms, 299 of 299 fields extracted, and about 1.1 s per validation run on a laptop CPU. These are upper bounds on synthetic data; see `docs/evaluation-results.md` for controls and limitations.

## Layout

```
backend/
  pramana/            FastAPI app
    pipeline/         intake, text and OCR, extraction, facts, validation runs
    rules/            expression language, facts with provenance, rule engine
    verification/     PDF signatures (pyHanko), signed QR, issuer adapters, demo PKI
    forensics/        PDF structure, photo metadata, fingerprints
    consistency/      cross-application links and relationship graph
    sim/              SIMULATED issuer registries
  rulesets/           APH 2024-27 ruleset (YAML, cited)
  trust/india-pki/    CCA India root certificates
  scripts/            fixtures, seed, evaluation, real sample fetch
  tests/
frontend/             React + Vite + TypeScript UI
docs/                 research, requirements matrix, decisions, USP and demo, security, evaluation
```

## Configuration

Environment variables (prefix `PRAMANA_`, see `.env.example`):

| Variable | Purpose |
|---|---|
| `DATA_DIR` | Runtime data directory |
| `DATABASE_URL` | PostgreSQL or another SQLAlchemy URL (default SQLite) |
| `STORAGE_KEY` | Fernet key for documents at rest |
| `PKI_FETCH_REVOCATION` | Check CRL/OCSP online |
| `DEMO_MODE` | Show demo accounts |
| `COOKIE_SECURE` | Behind HTTPS |

## Open source

Pramana is released under the MIT licence. Every dependency is free and open source, and model weights use permissive licences:
- **Backend:** FastAPI, SQLAlchemy, pyHanko, pikepdf, pdfplumber, pypdfium2, RapidOCR with PP-OCR ONNX weights (Apache-2.0), onnxruntime, OpenCV, Pillow, imagehash, networkx, rapidfuzz, reportlab, segno, cryptography, argon2-cffi.
- **Frontend:** React and Vite.

We deliberately avoided AGPL PDF libraries and OCR or forensics models with non-commercial weight licences; `docs/architecture-decisions.md` explains why.
