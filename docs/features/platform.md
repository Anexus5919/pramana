# Platform: live background validation and production hardening

This covers two pieces of work:
- validation that runs in the background and streams its progress to the browser;
- the hardening a deployment needs: sign-in throttling, secure cookies, a parser sandbox, per-document envelope encryption, data retention and PostgreSQL.

Every number below was measured on the build laptop (Windows 11, 12 logical cores, 16 GB RAM, shared with other work). They are indicative, not benchmarks.

## 1. Live background validation

### What it does

Submit, Run validation and Re-read documents no longer hold the HTTP request open while documents are read and checked. The request queues a validation run and returns in a few milliseconds with the run id. A worker thread then does the work, and the browser watches it happen:
- each document's read and OCR, field extraction, fingerprints, forensics and QR decoding;
- each verification check (issuer signature, applicant signature, signed QR, issuer registry) as it returns;
- the rules, the forensic and cross-application stages, and the running count of findings.

Nothing is paced or simulated. A block fills when the server reports that the step has finished, with the real duration.

### How to see it in the demo

Officer view (sign in as `officer`):
1. Open an application, for example A7 Panchganga Institute (`/applications/APP-2026-000107`).
2. Click **Run validation**. The run panel opens with a LIVE badge. The six stage blocks fill in order. Documents read in an earlier run show as pale filled blocks. The verification checks appear one by one with their status cube: issuer signature mismatch detected, signed QR expired, registry expired. **Findings so far** ticks up. The run takes about 1.5 s on the seeded data.
3. When it completes, the panel offers **Re-read 7 documents**. Click it to watch every document read again from its encrypted file: each row's Read, Fields, Prints, Forensic and QR blocks fill in turn, the active row is highlighted and says what it is doing, then the checks stream in. This takes about 10 to 15 s for A7.
4. Reload the page during a run: the panel comes back where it was, because the events are stored.

Institution view (sign in as the institution, for example `inst3` for A3):
1. A3 needs a rectification round first. As `officer`, open A3, use **Request rectification** on the fire certificate finding, then sign in as `inst3`, upload `fixtures/out/rectification/A3_fire_noc_renewed.pdf` in the Fire NOC slot and click **Resubmit application**.
2. The dialog closes at once and the right-hand card shows four blocks: Received, Reading documents (with "6 of 7 documents read"), Checking against the handbook, Ready for AICTE review.
3. The institution sees no checks, no finding counts and no forensic detail.

If the officer has A3 open in another window, the officer's workspace picks up the institution's run within about five seconds and shows the full live view.

### How it works

- `pramana/jobs.py` holds the queue. `enqueue()` creates a `ValidationRun` with status `queued`, writes an audit event and a `run.queued` event, and submits the job to a `ThreadPoolExecutor`.
  - On SQLite there is exactly one job worker, so job writes never compete with each other. On PostgreSQL there are up to two (`PRAMANA_JOB_WORKERS`).
  - Each job opens its own database session.
  - A second Run validation click while a run is queued or running attaches to that run instead of starting another. A submission always gets a run of its own, because its inputs changed.
- The job calls the same `run_validation()` the synchronous path uses, passing the queued run and a `progress` callback. The callback writes a `RunEvent` row and commits, so each event is visible to other connections as soon as it happens.
  - Committing per event also commits the pipeline's work so far. A run that dies half way leaves its documents in a consistent per-document state and the run marked failed.
- Event kinds, in order:

| Kind | Data | Shown to the institution |
|---|---|---|
| `run.queued` | reason (`validate`, `reprocess`, `retry`, `submitted`) | reason only |
| `run.started` | documents, with `cached` when already read | document types only |
| `doc.step` | document, step (`read`, `extract`, `fingerprints`, `forensics`, `qr`), ms, pages, text source, fields, indicator count | no |
| `doc.done` | document, status | yes |
| `check` | document, channel, status, simulated, source | no |
| `rules` | rules evaluated, outcomes | no |
| `stage.finished` | stage, ms, stage details, findings so far | stage and ms only |
| `findings` | total, by severity, category and evidence class | no |
| `run.finished` | status, error | status only |

- `GET /api/runs/{id}/events` streams the events as Server-Sent Events. It replays everything after `?after=` or the `Last-Event-ID` header, then follows new events until the run ends, with a keep-alive comment every 15 s.
- `GET /api/runs/{id}/progress?after=` is the polling fallback with the same events. The browser uses it when `EventSource` is missing or the stream cannot open.
- `GET /api/applications/{id}/active-run` lets a reloaded page find the run to resume.
- Access control:
  - Institutions get only `all`-audience events, with the data trimmed to the keys in the table.
  - Other institutions' runs return 404, as everywhere else.
- `latest_run` now means the latest complete run. A queued, running, failed or interrupted run no longer empties the workspace while the previous result is still the best one. A failed run is shown only when nothing has completed yet.

### Failures

- An exception inside `run_validation` marks the run `failed` with the reason, as before.
- An exception that escapes it (for example a database error) is caught by the job. The job marks the run `failed` in a fresh session, writes a `validation.failed` audit event and a `run.finished` event.
- `POST /api/runs/{id}/retry` (officer, verifier, admin) starts a failed or interrupted run again. It re-reads documents that could not be read, writes `validation.retry_requested` and links the new run to the old one. The run panel shows the reason and a **Retry run** button.
- At start-up the server marks every run still `queued` or `running` as `interrupted`. The reason is "The server stopped before this run finished", and each gets a `validation.interrupted` audit event.
- `POST /api/applications/{id}/reprocess` re-reads every current document from its stored bytes, then validates.

### What stays synchronous

- `scripts/seed.py`, `scripts/evaluate.py`, replay and the existing API tests call `run_validation()` directly, as before.
- `PRAMANA_BACKGROUND_RUNS=false` switches the API back to the synchronous behaviour. The test configuration does that, and `tests/test_platform.py` turns background runs on for its own tests.

### Limitations

- The queue lives in the server process. A deployment with several server processes would need a shared queue (for example PostgreSQL `SKIP LOCKED` or Redis); start-up recovery assumes one server process.
- The stream polls the database every 250 ms per open stream. That is fine for a handful of viewers, not for hundreds.
- Per-event commits cost a few milliseconds each; a full run writes 30 to 90 events.

## 2. Production hardening

### Sign-in throttling

- Every sign-in attempt counts against the client address: 60 per 15 minutes by default, enough for demo rehearsals that switch accounts often.
- Failed passwords count against the username: 5 per 15 minutes. After that the account answers 429 with `Retry-After`, even for the right password, until the window passes.
- The first refused attempt of each lockout writes `auth.locked_out` to the audit chain, with the scope, address and limit. Later refusals in the same lockout are not written, so a flood cannot bloat the chain.
- Implemented in `pramana/throttle.py` on the shared `pramana/ratelimit.py`.
  - `limit()` and `reset()` keep their signatures.
  - The module gains `count()`, `hit()`, `retry_after()` and `clear()`.
- Tests reset the counters before each test, in `tests/conftest.py`.
- Limitations:
  - Counters are in memory, per process, and reset on restart.
  - A username lockout can be triggered by someone who knows the username; that is the usual trade-off, and why the window is short.
  - Behind a reverse proxy, run uvicorn with `--proxy-headers` so the client address is the real one.

### Secure cookies

`PRAMANA_COOKIE_SECURE` is off by default for the local http demo. When it is on:
- the session cookie is `__Host-pramana_session` with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/` and no `Domain`, which browsers enforce for the `__Host-` prefix;
- every response carries `Strict-Transport-Security: max-age=31536000; includeSubDomains` (`PRAMANA_HSTS_MAX_AGE`).

CSRF protection is unchanged.

### Parser sandbox

Untrusted files are parsed in separate worker processes, never inside the server. `pramana/sandbox.py` is the server side and `pramana/sandbox_worker.py` the worker.

What runs in the sandbox:
- PDF text and OCR, including page rendering for OCR;
- fingerprints (perceptual hash rendering, text shingles);
- PDF structure forensics (revisions, overlays, white boxes, metadata) and photo metadata;
- QR decoding at three resolutions;
- page preview rendering for the document viewer;
- upload intake (pikepdf structure scan and image verification), for every upload path including the seed script.

What does not:
- PDF signature validation (pyHanko, pure Python) and signed QR verification run in the server on the stored bytes;
- the optional language model extraction gets text, not files.

How it works:
- Workers are started with `python -m pramana.sandbox_worker`.
- Requests and replies are length-prefixed frames on stdin and stdout.
  - Replies are JSON only, so a worker that misbehaves can return data but never code.
  - The worker moves library output off stdout so nothing can corrupt the reply channel.
- Workers are pooled: two by default (`PRAMANA_SANDBOX_WORKERS`), started on first use and reused. Each is recycled after 200 operations (`PRAMANA_SANDBOX_MAX_TASKS`).
- A crash, a timeout or the memory cap raises `SandboxUnsafe`:
  - the worker is killed and replaced;
  - the document is marked failed with "Could not be read safely: ..." and a `DOC-PROCESSING-FAILED` finding with outcome `manual_review`;
  - an upload is refused with the same wording;
  - a preview answers 422.
  The server never crashes.
- Workers set `OPENBLAS_NUM_THREADS=1`. Without it OpenBLAS commits a buffer per core, about 350 MB per worker on this laptop; with it a worker starts at about 45 MB.
- On Windows the worker opts out of EcoQoS power throttling. Windows applies it to windowless background processes, and it made a one-page read take minutes inside the server.

What is enforced, per OS:

| | Windows (tested) | Linux (written, not run here) | macOS |
|---|---|---|---|
| Wall-clock timeout per operation | yes, 120 s (`PRAMANA_SANDBOX_TIMEOUT_S`), then the worker is killed | yes | yes |
| Memory cap | yes: Job Object `JOB_OBJECT_LIMIT_PROCESS_MEMORY`, 1536 MB per worker (`PRAMANA_SANDBOX_MEMORY_MB`). Allocations beyond it fail, and the worker reports or dies | yes: `RLIMIT_AS` (address space, so set it higher than on Windows; docker-compose uses 2048) | no: macOS does not enforce `RLIMIT_AS` |
| No child processes | yes: Job Object active process limit of 1 | no | no |
| Worker dies with the server | yes: `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` | yes: `PR_SET_PDEATHSIG` | when its stdin closes |
| No crash dialogs or core dumps | yes: `DIE_ON_UNHANDLED_EXCEPTION` | yes: `RLIMIT_CORE=0` | no |
| Network, filesystem, system calls | not restricted | not restricted | not restricted |

On Windows the server assigns the Job Object before the worker says it is ready, and untrusted bytes are only sent after that. A venv's `python.exe` is a launcher that starts a second process, which the one-process job would refuse. So workers start the base interpreter with `__PYVENV_LAUNCHER__` set, the same way `multiprocessing` does.

Tests (`tests/test_platform.py`) prove the limits on this machine:
- a 10 s operation is stopped at 1 s;
- a 600 MB allocation under a 300 MB cap is stopped, while 50 MB passes;
- an `os._exit` crash is reported and the pool replaces the worker;
- killing a parent process kills its worker within seconds;
- a document whose parse times out ends as a `manual_review` finding in a complete run;
- sandboxed and in-process parsing give the same pages, words and forensic signals.

Overhead is in section 4: the one-time worker start-up plus about 1.5 ms per call.

Limitations:
- No network, filesystem or system call isolation: a parser compromised by a crafted file could read files the server user can read. Production should run workers as a separate low-privilege user, in a container with no network, or under seccomp or AppContainer.
- On Windows the memory cap counts committed private memory; on Linux address space, which over-counts memory-mapped libraries.
- Signature validation still parses the PDF in the server process.

### Per-document envelope encryption

`pramana/keyring.py`; `crypto.store_document`, `load_document` and `delete_document` keep their signatures.

- Each stored file gets its own random 256-bit data key and is encrypted with AES-256-GCM. The storage name is the associated data, so a file copied over another one fails to decrypt.
- The data key is wrapped with AES-256-GCM under the master key, with the key id and storage name as associated data. It is stored beside the file as `<name>.key`.
- Master keys:
  - live in `data_dir/keys/master/<kid>.key`, with `ACTIVE` naming the current one; one is generated on first use with a warning;
  - or come from `PRAMANA_MASTER_KEY` (base64, 32 bytes), which is what docker-compose uses.
  - In production they belong in an HSM or a key management service, and `keyring.py` is the seam for that.
- `python scripts/keys.py rotate` creates a new master key, makes it active and rewraps every data key. The document files are not read or rewritten: a test checks that their bytes are identical before and after.
  - `--retire` deletes master keys that no longer wrap anything.
  - `status` shows the files per key.
  - Every run is audited (`keys.rotated`).
- Files stored before this change (Fernet with `PRAMANA_STORAGE_KEY`) still open. `python scripts/keys.py migrate` converts them (`keys.migrated`), or reseed.
- Rendered page previews are cached encrypted the same way, so no plaintext page image sits in `var/cache`.
- Deleting a file's key makes the file unreadable even from a backup of the bytes (crypto-shredding). The retention purge deletes both.
- Limitation: in the default demo mode the master key sits on the same disk as the data. That protects a copied document folder, not a copied data directory.

### Data retention

`pramana/retention.py`, `scripts/purge.py`, `POST /api/admin/retention/purge` (administrator only).

| Kind | Default | Counted from | Setting |
|---|---|---|---|
| Document files | 730 days | the application being closed or withdrawn (its audit event) | `PRAMANA_RETENTION_DOCUMENT_DAYS` |
| Page previews | 30 days | rendering | `PRAMANA_RETENTION_PREVIEW_DAYS` |
| Run progress events | 180 days | the run finishing | `PRAMANA_RETENTION_RUN_EVENT_DAYS` |
| Sign-in sessions | 7 days | expiry | `PRAMANA_RETENTION_SESSION_DAYS` |
| Document hashes, extracted fields, findings, verification records, runs, audit chain | always kept | | |

- The purge is a dry run unless asked otherwise: `scripts/purge.py --apply`, or `{"dry_run": false}` on the endpoint.
- A real purge:
  - deletes each due file and its wrapped key, plus its cached previews;
  - leaves a small tombstone, so the document endpoints answer 410 "deleted under the retention policy" instead of failing;
  - writes `retention.document_purged` per file (with its hash and size) and `retention.purge_completed` with the counts.
  - The audit chain stays intact (tested).
- To start the clock:
  - institutions withdraw their own application with `POST /api/applications/{id}/withdraw`;
  - officers and administrators record that processing has concluded with `POST /api/applications/{id}/close`.
  - Both need a written reason, which goes into the audit event. Closing does not approve or reject anything: the decision is made and recorded by the competent authority.
- The Platform page shows the policy and a live dry run. Administrators get a confirmed **Purge now** button.
- Limitations:
  - Extracted page text and fields stay with the record after the files are purged.
  - Backups are outside the purge, though crypto-shredding covers backups of the document folder.
  - There is no withdraw or close button in the UI yet; the endpoints are covered by tests.

### PostgreSQL

- `PRAMANA_DATABASE_URL=postgresql+psycopg://user:password@host/db` and `uv pip install -e ".[postgres]"` (psycopg 3).
- Changes:
  - SQLite connection options and pragmas only apply to SQLite; PostgreSQL gets a pre-pinged pool.
  - The audit chain takes a transaction-level advisory lock (`pg_advisory_xact_lock`) before appending, because two concurrent writers could otherwise both read the same chain head. SQLite's single writer already serialises this.
  - The seed script drops the tables on a database server, where there is no file to delete.
- Checked and unchanged:
  - `UTCDateTime` stores naive UTC in `timestamp without time zone` and returns aware values, the same as on SQLite.
  - The JSON columns map to `json`, and no query compares or groups by them.
- Test run: the full suite (35 tests) passes against PostgreSQL 16.2, run from the portable Windows binaries in the `pgserver` wheel without Docker. See section 4.
- `docker-compose.yml` (PostgreSQL 16 plus the app) and `Dockerfile` document a deployment. They were not built here because Docker is not available on the build machine.

### Online revocation checking (optional)

- With `PRAMANA_PKI_FETCH_REVOCATION=true`, pyHanko fetches OCSP and CRL responses for India PKI signatures.
- A signature result now reports how many OCSP and CRL responses were obtained.
  - It counts as "revocation checked" only when at least one arrived.
  - Otherwise it says the status could not be fetched. Soft-fail mode no longer reads as checked when nothing was fetched.
- On the real e-Gazette sample, online: 3 OCSP responses (Care4Sign DSC Sub CA, Care4Sign CA, CCA) in about 3.5 s, not revoked. Offline: "Revocation status was not fetched (offline mode)".

### Platform page

`/platform`, for officers and administrators, in the System section of the sidebar. It shows what the running server enforces, refreshed every five seconds:
- the job mode and recent and active runs;
- sandbox limits, worker peak memory against the cap, and parses stopped;
- the active master key and files per key;
- sign-in limits and cookie mode;
- the retention policy, a dry run and, for administrators, a confirmed purge.

## 3. Settings

| Variable | Default | Purpose |
|---|---|---|
| `PRAMANA_BACKGROUND_RUNS` | `true` | Run submit, validate, re-read and retry in the background |
| `PRAMANA_JOB_WORKERS` | `1` | Job threads; always 1 on SQLite, at most 2 on PostgreSQL |
| `PRAMANA_PARSER_SANDBOX` | `true` | Parse untrusted files in worker processes |
| `PRAMANA_SANDBOX_WORKERS` | `2` | Worker processes in the pool |
| `PRAMANA_SANDBOX_TIMEOUT_S` | `120` | Wall-clock limit per parser operation |
| `PRAMANA_SANDBOX_MEMORY_MB` | `1536` | Memory cap per worker |
| `PRAMANA_SANDBOX_MAX_TASKS` | `200` | Operations before a worker is recycled |
| `PRAMANA_LOGIN_MAX_PER_IP` | `60` | Sign-in attempts per client address per window |
| `PRAMANA_LOGIN_MAX_FAILURES_PER_USER` | `5` | Failed passwords per username per window |
| `PRAMANA_LOGIN_WINDOW_S` | `900` | Throttling window |
| `PRAMANA_COOKIE_SECURE` | `false` | `__Host-` cookie and HSTS (existing setting, now complete) |
| `PRAMANA_HSTS_MAX_AGE` | `31536000` | HSTS max-age when the above is on |
| `PRAMANA_MASTER_KEY` | unset | Base64 256-bit master key; generated into `keys/master` if unset |
| `PRAMANA_RETENTION_DOCUMENT_DAYS` | `730` | See retention |
| `PRAMANA_RETENTION_PREVIEW_DAYS` | `30` | See retention |
| `PRAMANA_RETENTION_RUN_EVENT_DAYS` | `180` | See retention |
| `PRAMANA_RETENTION_SESSION_DAYS` | `7` | See retention |

## 4. Measurements

Background runs (seeded data, `officer`):

| What | Measured |
|---|---|
| `POST /validate` or `/submit` until the response | about 0.2 s; the run continues in the background |
| Run validation on A7, documents already read | 1.5 to 2.5 s, of which about 1 s is the simulated issuers' deliberate latency |
| Re-read and validate A7 (7 documents) | 8 to 15 s depending on machine load |
| Events per run | about 30 (validate) to 65 (re-read) |
| Run time with and without this branch, same machine, interleaved, 8 runs each | base 2.06 to 2.28 s mean, branch 1.70 to 1.88 s mean: no regression |

Parser sandbox (`scripts/bench_sandbox.py`, A7's 7 documents plus the scanned A2 accounts, OCR loaded on both sides first; two runs because the shared laptop's load varies):

| | Run 1 | Run 2 |
|---|---|---|
| Worker start-up (once per worker, then pooled) | 1.1 s | 0.9 s |
| Round trip carrying 1 MB of file bytes | 1.6 ms | 1.3 ms |
| Read and OCR, in-process / sandboxed | 2.61 s / 3.04 s | 4.13 s / 3.77 s |
| Fingerprints | 0.83 s / 0.44 s | 0.85 s / 0.63 s |
| Forensics | 0.85 s / 0.70 s | 1.48 s / 1.50 s |
| QR decoding | 3.71 s / 3.70 s | 6.35 s / 5.89 s |
| Total, in-process / sandboxed | 7.99 s / 7.88 s | 12.81 s / 11.79 s |
| Worker peak memory with the OCR model loaded | 688 MB | 689 MB |
| Idle worker memory | about 45 MB (about 400 MB without `OPENBLAS_NUM_THREADS=1`) | |

The sandbox's cost is the one-time worker start-up plus about 1.5 ms per call, which disappears in the noise of a shared laptop. Spawning a process per document would add about a second per document, which is why the workers are pooled.

The first measurement without the power-throttling opt-out is a warning for anyone running the server in the background on Windows. The benchmark process was throttled and its in-process side took 49.9 s against 7.7 s in the opted-out workers. The server now opts out at start-up too.

Tests and evaluation:

| | Result |
|---|---|
| `pytest` on SQLite | 35 passed (the 22 existing tests and 13 in `tests/test_platform.py`) |
| `pytest` on PostgreSQL 16.2 (portable binaries, `PRAMANA_DATABASE_URL=postgresql+psycopg://...`) | 35 passed (186 s; SQLite 165 s on the same machine) |
| `scripts/evaluate.py` after a fresh seed through the sandbox | 42 of 42 planted conditions, 0 false positives, 323 of 328 fields read, as before |
| Key rotation on the seeded data | 82 data keys rewrapped, document bytes identical before and after (hash of all files), all 82 decrypt after the old key is retired |

## 5. Licences of new dependencies

| Dependency | Licence | Use |
|---|---|---|
| psycopg 3 (`psycopg[binary]`), optional extra `postgres` | LGPL-3.0 | PostgreSQL driver |
| PostgreSQL 16 (docker-compose image; portable binaries for the test run) | PostgreSQL Licence | Database server |
| pgserver (test tooling only, not a project dependency) | Apache-2.0 | Ships the portable PostgreSQL binaries used for the test run |

AES-GCM comes from `cryptography` (Apache-2.0 or BSD), already a dependency. The frontend gains no dependencies.
