"""Evidence pack: one signed ZIP per application that an auditor can check offline.

Order matters for the audit extract. The export event is recorded first and a checkpoint signs it, so the
last event in the extract is exactly the signed chain head. A second event records the sealed manifest digest.
"""

import base64
import io
import json
import re
import time
import zipfile
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, keyring
from .. import serializers as ser
from ..config import get_settings
from ..crypto import DocumentPurged, audit_signing_key, load_document, public_key_b64, sha256_hex
from ..models import (
    Application,
    AuditEvent,
    Document,
    Finding,
    ReviewAction,
    User,
    ValidationRun,
    VerificationAttempt,
    new_id,
    utcnow,
)
from ..rules.engine import active_ruleset
from .common import latest_run, run_findings
from .report import NOTICE, render_report

FORMAT = "pramana-evidence-pack/1"
VERIFY_SCRIPT = Path(__file__).with_name("verify_pack.py")
VERIFY_TXT = """Pramana evidence pack {pack_id}
Application {app_id}, generated {generated} by {by}

What is inside
  report.pdf              summary, findings with page crops, officer decisions, verification results, cited rules
  data/                   the same findings, verification results and run record as JSON
  audit/events.json       this application's audit events with their chain hashes
  audit/checkpoint.json   Ed25519 signature over the chain head, which is the export event
  documents/              original submitted files (only when the officer chose to include them)
  manifest.json           SHA-256 of every file above and of every submitted document, run ids and digests
  signature.json          Ed25519 signature over manifest.json with the audit signing key
  verify_pack.py          offline checker (Python 3.10+, standard library plus 'cryptography')

How to check it
  1. pip install cryptography
  2. python verify_pack.py <this zip or the extracted folder>
  3. Compare the public key it prints with the key published by the Pramana deployment:
     {public_key}

What a pass means
  The files are exactly those that were signed, the audit events recompute to their chain hashes and the
  checkpoint signs the last of them. It does not mean the findings are right or that any document is
  authentic. Findings are preliminary indicators for review by competent authorities.

The SHA-256 of manifest.json is printed by verify_pack.py and recorded in the Pramana audit chain as the
evidence_pack.sealed event for this pack.

{notice}
"""


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:80] or "file"


def _json(obj: Any) -> bytes:
    return json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=True, default=str).encode()


def _decisions(db: Session, app: Application) -> dict[str, list[dict[str, Any]]]:
    """Officer decisions by finding fingerprint, so decisions on earlier runs follow the finding."""
    out: dict[str, list[dict[str, Any]]] = {}
    names: dict[str, str] = {}
    rows = db.execute(select(ReviewAction, Finding.fingerprint).join(Finding, ReviewAction.finding_id == Finding.id)
                      .where(ReviewAction.application_id == app.id).order_by(ReviewAction.created_at)).all()
    for ra, fp in rows:
        if ra.actor_id not in names:
            u = db.get(User, ra.actor_id)
            names[ra.actor_id] = u.display_name if u else ra.actor_id
        out.setdefault(fp, []).append({"action": ra.action, "note": ra.note, "actor": names[ra.actor_id],
                                       "at": ra.created_at, "finding_id": ra.finding_id})
    return out


def build_pack(db: Session, app: Application, user: User, *, include_originals: bool) -> dict[str, Any]:
    t_all = time.perf_counter()
    stages: list[dict[str, Any]] = []

    def stage(name: str, t0: float) -> None:
        stages.append({"stage": name, "ms": round((time.perf_counter() - t0) * 1000)})

    pack_id = new_id("pack")
    now = utcnow()
    rs = active_ruleset()

    t0 = time.perf_counter()
    run = latest_run(db, app.id)
    runs = db.scalars(select(ValidationRun).where(ValidationRun.application_id == app.id)
                      .order_by(ValidationRun.started_at)).all()
    findings = run_findings(db, run)
    decisions = _decisions(db, app)
    attempts = db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id)
                          .order_by(VerificationAttempt.started_at)).all() if run else []
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.application_id == app.id)
                                        .order_by(Document.uploaded_at))}
    labels = {k: v.get("label", k) for k, v in rs.doc_types.items()}
    cited: dict[str, dict[str, Any]] = {}
    for f in findings:
        c = (f.rule or {}).get("citation")
        if c and f.rule.get("id") not in cited:
            cited[f.rule["id"]] = {"rule_id": f.rule["id"], "rule_title": f.title, **c}
    stage("collect", t0)

    # Anchor the extract: record the export, then sign the chain head at that event
    t0 = time.perf_counter()
    ev = audit.record(db, actor=user.username, actor_role=user.role, action="evidence_pack.exported",
                      object_type="application", object_id=app.id, application_id=app.id,
                      details={"pack_id": pack_id, "include_originals": include_originals,
                               "run_id": run.id if run else None})
    cp = audit.checkpoint(db)
    db.commit()
    events = db.scalars(select(AuditEvent).where(AuditEvent.application_id == app.id, AuditEvent.seq <= ev.seq)
                        .order_by(AuditEvent.seq)).all()
    extract = [{**audit._event_body(e), "prev_hash": e.prev_hash, "hash": e.hash} for e in events]
    checkpoint = {"seq": cp.seq, "head_hash": cp.head_hash, "signature": cp.signature, "public_key": cp.public_key,
                  "created_at": cp.created_at.isoformat(), "signed_message": "<seq>:<head_hash>"}
    stage("audit_extract", t0)

    key = audit_signing_key()
    pub = public_key_b64(key.public_key())
    t0 = time.perf_counter()
    report = render_report({
        "app": app, "run": run, "runs": runs, "findings": findings, "decisions": decisions, "attempts": attempts,
        "docs": docs, "labels": labels, "rules": list(cited.values()), "generated_by": user.display_name,
        "generated_at": now, "pack_id": pack_id, "public_key": pub,
        "category_label": rs.checklists.get(app.category, {}).get("label", app.category)})
    stage("report", t0)

    t0 = time.perf_counter()
    files: dict[str, bytes] = {
        "report.pdf": report,
        "data/findings.json": _json([{**ser.finding(f), "decisions": [{**d, "at": d["at"].isoformat()}
                                                                      for d in decisions.get(f.fingerprint, [])]}
                                     for f in findings]),
        "data/verifications.json": _json([ser.attempt(v) for v in attempts]),
        "data/run.json": _json(ser.run_full(run) if run else None),
        "audit/events.json": _json(extract),
        "audit/checkpoint.json": _json(checkpoint),
        "verify_pack.py": VERIFY_SCRIPT.read_bytes(),
    }
    doc_rows = []
    for d in docs.values():
        path = None
        if include_originals:
            ext = Path(d.original_filename).suffix.lower()[:8]
            try:
                data = load_document(d.storage_name)
                path = f"documents/{_safe(d.declared_type)}_{d.id}{ext}"
                files[path] = data
            except DocumentPurged:
                path = None  # removed under the retention policy; its digest stays in the manifest
        doc_rows.append({"id": d.id, "declared_type": d.declared_type, "filename": d.original_filename,
                         "sha256": d.sha256, "size_bytes": d.size_bytes, "round": d.round, "superseded": d.superseded,
                         "file": path})
    stage("data_files", t0)

    t0 = time.perf_counter()
    generated = now.strftime("%Y-%m-%d %H:%M UTC")
    manifest = {
        "format": FORMAT, "pack_id": pack_id, "application_id": app.id,
        "institution": {"name": app.institution.name, "aicte_id": app.institution.aicte_id},
        "generated_at": now.isoformat(), "generated_by": {"username": user.username, "role": user.role},
        "include_originals": include_originals, "notice": NOTICE,
        "latest_run_id": run.id if run else None,
        "ruleset": {"id": run.ruleset_id, "sha256": run.ruleset_hash} if run else None,
        "runs": [{"id": r.id, "round": r.round, "status": r.status, "ruleset_id": r.ruleset_id,
                  "ruleset_hash": r.ruleset_hash, "engine_version": r.engine_version, "input_digest": r.input_digest,
                  "report_digest": r.report_digest, "as_of": (r.summary or {}).get("as_of"),
                  "replay_of": (r.summary or {}).get("replay_of"),
                  "started_at": r.started_at.isoformat() if r.started_at else None} for r in runs],
        "documents": doc_rows,
        "audit": {"events": len(extract), "first_seq": extract[0]["seq"] if extract else None,
                  "last_seq": ev.seq, "head_hash": ev.hash, "checkpoint_seq": cp.seq, "public_key": pub},
    }
    files["VERIFY.txt"] = VERIFY_TXT.format(pack_id=pack_id, app_id=app.id, generated=generated, by=user.display_name,
                                            public_key=pub, notice=NOTICE).encode()
    manifest["files"] = {n: {"sha256": sha256_hex(b), "size": len(b)} for n, b in sorted(files.items())}
    raw = _json(manifest)
    msha = sha256_hex(raw)
    signature = {"algorithm": "Ed25519", "public_key": pub, "signed_file": "manifest.json", "manifest_sha256": msha,
                 "signature": base64.b64encode(key.sign(raw)).decode()}
    stage("manifest_and_signature", t0)

    t0 = time.perf_counter()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in [("manifest.json", raw), ("signature.json", _json(signature)), *sorted(files.items())]:
            info = zipfile.ZipInfo(f"{pack_id}/{name}", date_time=now.timetuple()[:6])
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    blob = buf.getvalue()
    out_dir = get_settings().data_dir / "exports"
    out_dir.mkdir(parents=True, exist_ok=True)
    keyring.seal_to(out_dir / f"{pack_id}.bin", blob)
    (out_dir / f"{pack_id}.json").write_text(json.dumps({"application_id": app.id, "user": user.username}))
    stage("zip", t0)

    zsha = sha256_hex(blob)
    audit.record(db, actor=user.username, actor_role=user.role, action="evidence_pack.sealed", object_type="application",
                 object_id=app.id, application_id=app.id,
                 details={"pack_id": pack_id, "manifest_sha256": msha, "zip_sha256": zsha, "size": len(blob),
                          "files": len(files) + 2, "include_originals": include_originals})
    db.commit()
    listing = [{"name": "manifest.json", "sha256": msha, "size": len(raw), "role": "manifest"},
               {"name": "signature.json", "sha256": sha256_hex(_json(signature)), "size": len(_json(signature)),
                "role": "signature"}]
    listing += [{"name": n, "sha256": sha256_hex(b), "size": len(b), "role": n.split("/")[0] if "/" in n else "file"}
                for n, b in sorted(files.items())]
    return {"pack_id": pack_id, "application_id": app.id, "filename": f"evidence-pack-{app.id}-{pack_id}.zip",
            "size": len(blob), "zip_sha256": zsha, "manifest_sha256": msha, "public_key": pub,
            "include_originals": include_originals, "files": listing, "stages": stages,
            "total_ms": round((time.perf_counter() - t_all) * 1000), "findings": len(findings),
            "audit_events": len(extract), "checkpoint_seq": cp.seq, "generated_at": now.isoformat(),
            "download_url": f"/api/applications/{app.id}/evidence-packs/{pack_id}.zip"}


def load_pack(app_id: str, pack_id: str) -> bytes | None:
    if not re.fullmatch(r"pack_[0-9a-f]{16}", pack_id):
        return None
    d = get_settings().data_dir / "exports"
    meta = d / f"{pack_id}.json"
    if not meta.exists() or json.loads(meta.read_text()).get("application_id") != app_id:
        return None
    return keyring.open_from(d / f"{pack_id}.bin")

