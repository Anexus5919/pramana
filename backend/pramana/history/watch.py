"""Re-verification watch.

After an official records a scrutiny outcome, the certificates that the issuer registry confirmed are
re-queried on a schedule (and on demand). A revocation, a validity date that has since passed, a record
that disappeared or a source that stops answering is reported as a watch alert, a finding on the
application, an audit event and a dashboard alert. The watch reports; officials decide what follows.
"""

import asyncio
import logging
import threading
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..config import get_settings
from ..crypto import sha256_hex
from ..db import SessionLocal
from ..models import Application, Document, Finding, User, ValidationRun, VerificationAttempt, utcnow
from ..rules.engine import active_ruleset
from ..verification import base as vb
from ..verification.issuer import adapters
from .models import ScrutinyOutcome, WatchEvent, WatchItem, WatchRun

log = logging.getLogger(__name__)
_lock = threading.Lock()

OUTCOMES = {
    "no_deficiency": "Scrutiny complete, no deficiency recorded",
    "deficiencies_recorded": "Scrutiny complete, deficiencies recorded",
    "referred_for_visit": "Referred to an expert visit committee",
}
# state: (finding code, severity, verification status, short label)
STATES: dict[str, tuple[str, str, str, str]] = {
    "revoked": ("WATCH-ISSUER-REVOKED", "high", vb.MISMATCH, "revoked by the issuer"),
    "suspended": ("WATCH-ISSUER-SUSPENDED", "high", vb.MISMATCH, "suspended by the issuer"),
    "expired": ("WATCH-CERT-EXPIRED", "high", vb.EXPIRED, "expired since the scrutiny outcome"),
    "not_found": ("WATCH-ISSUER-NOT-FOUND", "high", vb.MISMATCH, "no longer found in the issuer registry"),
    "record_changed": ("WATCH-ISSUER-RECORD-CHANGED", "high", vb.MISMATCH, "issuer record now differs"),
    "source_unavailable": ("WATCH-SOURCE-UNAVAILABLE", "medium", vb.SOURCE_UNAVAILABLE, "issuer registry did not respond"),
}
OPEN_REVIEW = {"open", "acknowledged", "evidence_requested"}
SIM_NOTE = "Result from a SIMULATED issuer registry; not a real-world confirmation."


def _fp(*parts: Any) -> str:
    return sha256_hex("|".join(str(p) for p in parts).encode())


def latest_complete_run(db: Session, app_id: str) -> ValidationRun | None:
    return db.scalars(select(ValidationRun).where(ValidationRun.application_id == app_id,
                                                  ValidationRun.status == "complete")
                      .order_by(ValidationRun.started_at.desc()).limit(1)).first()


def current_outcome(db: Session, app_id: str) -> ScrutinyOutcome | None:
    return db.scalars(select(ScrutinyOutcome).where(ScrutinyOutcome.application_id == app_id)
                      .order_by(ScrutinyOutcome.created_at.desc()).limit(1)).first()


def _doc_fields(doc: Document | None) -> dict[str, Any]:
    return {f.name: f.value for f in doc.fields} if doc else {}


def check_item(db: Session, item: WatchItem, today: date) -> tuple[str, str, dict[str, Any], list[dict]]:
    """Ask the issuer again, judged against today. Returns (state, detail, response, comparisons)."""
    adapter = adapters().get(item.issuer_code)
    if adapter is None:
        return "source_unavailable", "No adapter is configured for this issuer any more.", {}, []
    doc = db.get(Document, item.document_id) if item.document_id else None
    res = adapter.verify(item.ref_no, _doc_fields(doc), today)
    resp = res.response or {}
    comps = [c.as_dict() for c in res.comparisons]
    rec = resp.get("record") or {}
    if res.status == vb.SOURCE_UNAVAILABLE:
        return "source_unavailable", res.detail, resp, comps
    if resp.get("found") is False:
        return "not_found", f"The issuer registry no longer has a record of reference '{item.ref_no}'.", resp, comps
    status = str(rec.get("status") or "").lower()
    if status in ("revoked", "cancelled"):
        note = rec.get("status_note")
        return "revoked", (f"The issuer now reports reference '{item.ref_no}' as {status}"
                           + (f" on {rec['status_changed_on']}" if rec.get("status_changed_on") else "")
                           + (f": {note}" if note else "") + "."), resp, comps
    if status == "suspended":
        return "suspended", f"The issuer now reports reference '{item.ref_no}' as suspended.", resp, comps
    if res.status == vb.MISMATCH:
        return "record_changed", res.detail, resp, comps
    valid_until = (rec.get("fields") or {}).get("valid_until") or item.valid_until
    if valid_until and date.fromisoformat(valid_until[:10]) < today:
        return "expired", (f"Validity ended on {valid_until[:10]}, after the scrutiny outcome; checked against "
                           f"{today.isoformat()}."), resp, comps
    return "ok", res.detail, resp, comps


def _finding_payload(item: WatchItem, event: WatchEvent, outcome: ScrutinyOutcome | None,
                     comps: list[dict]) -> dict[str, Any]:
    code, sev, status, short = STATES[event.change]
    since = outcome.created_at.date().isoformat() if outcome else "the scrutiny outcome"
    return {
        "code": code, "fingerprint": _fp("watch", item.declared_type, item.ref_no, event.change),
        "category": "verification", "evidence_class": "issuer", "severity": sev, "outcome": status,
        "title": f"{item.label}: {short} (re-verification watch)",
        "message": f"{event.detail} Watched since the scrutiny outcome recorded on {since}; the certificate was "
                   f"confirmed by {item.issuer_name} at that time. The recorded outcome is unchanged; an official "
                   "decides what follows.",
        "limitation": SIM_NOTE,
        "evidence": [{"kind": "document", "document_id": item.document_id},
                     {"kind": "verification", "channel": "issuer_registry", "source": item.issuer_name,
                      "simulated": True, "comparisons": comps}],
        "trace": {"source": "re-verification watch", "watch_item_id": item.id, "watch_event_id": event.id,
                  "ref_no": item.ref_no, "previous_state": event.previous_state,
                  "checked_at": event.created_at.isoformat() if event.created_at else None,
                  "added_after_run": True},
        "document_id": item.document_id,
    }


def _attach_finding(db: Session, item: WatchItem, event: WatchEvent, comps: list[dict]) -> Finding | None:
    """The finding lives on the application's latest run, where reviewers look; the run's digests are untouched."""
    run = latest_complete_run(db, item.application_id)
    if run is None:
        return None
    p = _finding_payload(item, event, db.get(ScrutinyOutcome, item.outcome_id), comps)
    f = Finding(run_id=run.id, application_id=item.application_id, **{k: p[k] for k in (
        "code", "fingerprint", "category", "evidence_class", "severity", "outcome", "title", "message",
        "limitation", "evidence", "trace", "document_id")})
    db.add(f)
    db.flush()
    event.finding_id = f.id
    return f


def _carry_open_findings(db: Session, item: WatchItem) -> None:
    """A later validation run starts a fresh findings list; keep open watch findings on the latest run."""
    run = latest_complete_run(db, item.application_id)
    if run is None:
        return
    for ev in db.scalars(select(WatchEvent).where(WatchEvent.item_id == item.id, WatchEvent.open.is_(True))):
        f = db.get(Finding, ev.finding_id) if ev.finding_id else None
        if f is not None and f.run_id == run.id:
            continue
        if f is not None and f.review_status not in OPEN_REVIEW:
            continue
        comps = next((e.get("comparisons", []) for e in (f.evidence if f else []) if e.get("kind") == "verification"),
                     [])
        _attach_finding(db, item, ev, comps)


def check_and_record(db: Session, item: WatchItem, today: date, run_id: str, actor: str) -> WatchEvent | None:
    state, detail, resp, comps = check_item(db, item, today)
    item.last_checked_at = utcnow()
    prev = item.state
    if state == prev:
        item.detail = detail if state != "ok" else item.detail
        return None
    item.state, item.detail = state, detail
    if state == "ok":
        ev = WatchEvent(item_id=item.id, application_id=item.application_id, run_id=run_id, change="restored",
                        previous_state=prev, severity="info", open=False, response=resp,
                        detail=f"The issuer registry confirms reference '{item.ref_no}' again.")
        db.add(ev)
        for old in db.scalars(select(WatchEvent).where(WatchEvent.item_id == item.id, WatchEvent.open.is_(True))):
            old.open = False
        db.flush()
        audit.record(db, actor=actor, actor_role="system", action="watch.restored", object_type="watch_item",
                     object_id=item.id, application_id=item.application_id,
                     details={"ref_no": item.ref_no, "previous_state": prev, "simulated": True})
        return ev
    for old in db.scalars(select(WatchEvent).where(WatchEvent.item_id == item.id, WatchEvent.open.is_(True))):
        old.open = False
    ev = WatchEvent(item_id=item.id, application_id=item.application_id, run_id=run_id, change=state,
                    previous_state=prev, severity=STATES[state][1], detail=detail, response=resp, open=True)
    db.add(ev)
    db.flush()
    f = _attach_finding(db, item, ev, comps)
    audit.record(db, actor=actor, actor_role="system", action="watch.change_detected", object_type="watch_item",
                 object_id=item.id, application_id=item.application_id,
                 details={"ref_no": item.ref_no, "issuer": item.issuer_code, "change": state, "previous_state": prev,
                          "finding_id": f.id if f else None, "simulated": True})
    return ev


def _watch_candidates(db: Session, app: Application, run: ValidationRun) -> list[dict[str, Any]]:
    """Certificates the issuer registry confirmed on the latest run."""
    rs = active_ruleset()
    out, seen = [], set()
    attempts = db.scalars(select(VerificationAttempt).where(VerificationAttempt.run_id == run.id,
                                                            VerificationAttempt.channel == "issuer_registry",
                                                            VerificationAttempt.status == vb.VERIFIED)).all()
    for a in attempts:
        doc = db.get(Document, a.document_id) if a.document_id else None
        code, ref = (a.request or {}).get("issuer"), (a.request or {}).get("ref_no")
        if not doc or doc.superseded or not code or not ref or (code, ref) in seen:
            continue
        seen.add((code, ref))
        rec = (a.response or {}).get("record") or {}
        valid_until = (rec.get("fields") or {}).get("valid_until") or _doc_fields(doc).get("valid_until")
        out.append({"document_id": doc.id, "declared_type": doc.declared_type,
                    "label": rs.doc_types.get(doc.declared_type, {}).get("label", doc.declared_type),
                    "issuer_code": code, "issuer_name": a.source_name, "ref_no": ref,
                    "valid_until": valid_until[:10] if valid_until else None,
                    "baseline": {"run_id": run.id, "attempt_id": a.id, "status": a.status,
                                 "checked_at": a.completed_at.isoformat() if a.completed_at else None}})
    return out


def record_outcome(db: Session, app: Application, user: User, outcome: str, reason: str,
                   today: date | None = None) -> ScrutinyOutcome:
    """Record an official's scrutiny outcome, start watching the issuer-verified certificates and prepare the report
    for the Executive Committee."""
    run = latest_complete_run(db, app.id)
    if run is None:
        raise ValueError("the application has no completed validation run")
    out = ScrutinyOutcome(application_id=app.id, round=app.round, outcome=outcome, reason=reason, run_id=run.id,
                          actor_id=user.id)
    db.add(out)
    db.flush()
    for old in db.scalars(select(WatchItem).where(WatchItem.application_id == app.id, WatchItem.active.is_(True))):
        old.active = False
    items = [WatchItem(application_id=app.id, outcome_id=out.id, state="ok", **c)
             for c in _watch_candidates(db, app, run)]
    db.add_all(items)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="scrutiny.outcome_recorded",
                 object_type="application", object_id=app.id, application_id=app.id,
                 details={"outcome": outcome, "label": OUTCOMES.get(outcome), "reason": reason, "run_id": run.id,
                          "watched": [{"type": i.declared_type, "issuer": i.issuer_code, "ref_no": i.ref_no}
                                      for i in items]})
    wr = WatchRun(trigger="baseline", actor=user.username)
    db.add(wr)
    db.flush()
    changes = sum(1 for i in items if check_and_record(db, i, today or date.today(), wr.id, "watch") is not None)
    wr.checked, wr.changes, wr.finished_at = len(items), changes, utcnow()
    db.commit()
    # The outcome goes to AICTE's Executive Committee, which decides; Pramana prepares the report it reads
    from ..handoff.report import prepare_safely

    prepare_safely(db, app, out, user)
    return out


def seed_outcomes(db: Session, manifest: dict[str, Any], officer: User) -> None:
    """Demo state: outcomes the fixture world says an officer has already recorded, each with its report for the
    Executive Committee, and the forwardings the world says an officer recorded by hand."""
    from ..handoff.report import add_forwarding, latest_report

    ids = {a["key"]: a["id"] for a in manifest.get("applications", [])}
    for o in manifest.get("scrutiny_outcomes", []):
        app = db.get(Application, ids.get(o["application"], ""))
        if app is None:
            continue
        record_outcome(db, app, officer, o["outcome"], o["reason"])
        fw = o.get("forwarding")
        report = latest_report(db, app.id) if fw else None
        if report is not None:
            add_forwarding(db, report, officer, date.today(), fw["reference"], fw.get("note"))
            db.commit()


def run_watch(trigger: str, actor: str, today: date | None = None) -> dict[str, Any]:
    """One pass over every active watch item. Serialised, so the scheduler and a manual run never overlap."""
    with _lock:
        db = SessionLocal()
        try:
            wr = WatchRun(trigger=trigger, actor=actor)
            db.add(wr)
            db.flush()
            items = db.scalars(select(WatchItem).where(WatchItem.active.is_(True))).all()
            events = []
            for item in items:
                ev = check_and_record(db, item, today or date.today(), wr.id, "watch")
                if ev is not None:
                    events.append(ev)
                _carry_open_findings(db, item)
            wr.checked, wr.changes, wr.finished_at = len(items), len(events), utcnow()
            audit.record(db, actor=actor, actor_role="system" if trigger == "scheduler" else "official",
                         action="watch.run", object_type="watch_run", object_id=wr.id,
                         details={"trigger": trigger, "checked": len(items),
                                  "changes": [{"application_id": e.application_id, "change": e.change}
                                              for e in events]})
            db.commit()
            return {"run": run_brief(wr), "changes": [event_brief(db, e) for e in events]}
        finally:
            db.close()


def interval() -> timedelta:
    return timedelta(hours=max(0.01, get_settings().watch_interval_hours))


def next_check(db: Session) -> datetime | None:
    """Scheduled runs follow the last scheduled or manual run; per-application baseline checks do not reset it."""
    last = db.scalars(select(WatchRun).where(WatchRun.trigger.in_(("scheduler", "manual")),
                                             WatchRun.finished_at.is_not(None))
                      .order_by(WatchRun.finished_at.desc()).limit(1)).first()
    if last:
        return last.finished_at + interval()
    first = db.scalars(select(WatchItem).where(WatchItem.active.is_(True))
                       .order_by(WatchItem.created_at).limit(1)).first()
    return first.created_at + interval() if first else None


def last_run(db: Session) -> WatchRun | None:
    return db.scalars(select(WatchRun).where(WatchRun.finished_at.is_not(None))
                      .order_by(WatchRun.finished_at.desc()).limit(1)).first()


def run_brief(r: WatchRun | None) -> dict[str, Any] | None:
    if r is None:
        return None
    return {"id": r.id, "trigger": r.trigger, "actor": r.actor, "checked": r.checked, "changes": r.changes,
            "started_at": r.started_at.isoformat(), "finished_at": r.finished_at.isoformat() if r.finished_at else None}


def event_brief(db: Session, e: WatchEvent) -> dict[str, Any]:
    item = db.get(WatchItem, e.item_id)
    app = db.get(Application, e.application_id)
    return {"id": e.id, "item_id": e.item_id, "application_id": e.application_id,
            "institution": app.institution.name if app else None, "change": e.change,
            "previous_state": e.previous_state, "severity": e.severity, "detail": e.detail,
            "finding_id": e.finding_id, "open": e.open, "created_at": e.created_at.isoformat(),
            "label": item.label if item else None, "ref_no": item.ref_no if item else None,
            "issuer": item.issuer_name if item else None, "simulated": True}


def item_brief(i: WatchItem) -> dict[str, Any]:
    return {"id": i.id, "document_id": i.document_id, "declared_type": i.declared_type, "label": i.label,
            "issuer_code": i.issuer_code, "issuer": i.issuer_name, "ref_no": i.ref_no, "valid_until": i.valid_until,
            "state": i.state, "detail": i.detail, "baseline": i.baseline, "active": i.active,
            "last_checked_at": i.last_checked_at.isoformat() if i.last_checked_at else None,
            "created_at": i.created_at.isoformat(), "simulated": True}


def status(db: Session) -> dict[str, Any]:
    nxt = next_check(db)
    s = get_settings()
    return {"interval_hours": s.watch_interval_hours, "scheduler_enabled": s.watch_scheduler,
            "last_run": run_brief(last_run(db)), "next_check": nxt.isoformat() if nxt else None,
            "active_items": len(db.scalars(select(WatchItem.id).where(WatchItem.active.is_(True))).all())}


def application_watch(db: Session, app: Application) -> dict[str, Any]:
    out = current_outcome(db, app.id)
    actor = db.get(User, out.actor_id) if out else None
    items = db.scalars(select(WatchItem).where(WatchItem.application_id == app.id, WatchItem.active.is_(True))
                       .order_by(WatchItem.created_at)).all()
    events = db.scalars(select(WatchEvent).where(WatchEvent.application_id == app.id)
                        .order_by(WatchEvent.created_at.desc()).limit(30)).all()
    return {
        "outcome": {"id": out.id, "outcome": out.outcome, "label": OUTCOMES.get(out.outcome, out.outcome),
                    "reason": out.reason, "round": out.round, "run_id": out.run_id,
                    "recorded_by": actor.display_name if actor else None,
                    "created_at": out.created_at.isoformat()} if out else None,
        "outcomes": [{"value": k, "label": v} for k, v in OUTCOMES.items()],
        "items": [item_brief(i) for i in items],
        "events": [event_brief(db, e) for e in events],
        **status(db),
    }


def dashboard_alerts(db: Session, alerts: list[dict[str, Any]]) -> None:
    """Open watch events as dashboard alerts, ahead of others of the same severity; the finding alert for the
    same finding is replaced rather than repeated."""
    for e in db.scalars(select(WatchEvent).where(WatchEvent.open.is_(True))):
        f = db.get(Finding, e.finding_id) if e.finding_id else None
        if f is not None and f.review_status not in OPEN_REVIEW:
            continue
        item = db.get(WatchItem, e.item_id)
        app = db.get(Application, e.application_id)
        alert = {"application_id": e.application_id, "institution": app.institution.name if app else "",
                 "finding_id": e.finding_id, "severity": e.severity, "category": "verification",
                 "title": f"{item.label if item else 'Certificate'}: {STATES[e.change][3]} (SIMULATED registry)",
                 "kind": "watch_change", "watch_event_id": e.id}
        same = next((a for a in alerts if e.finding_id and a.get("finding_id") == e.finding_id), None)
        if same is not None:
            alerts.remove(same)
        # Something changed after an official decided; it leads its severity group
        alerts.insert(0, alert)


async def _scheduler_loop() -> None:
    while True:
        try:
            wait = await asyncio.to_thread(_seconds_until_due)
            if wait is not None and wait <= 0:
                await asyncio.to_thread(run_watch, "scheduler", "scheduler")
                continue
            # Wake regularly so a manual run or a new outcome moves the schedule
            await asyncio.sleep(300 if wait is None else min(wait, 300))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001  the scheduler must survive a failed pass
            log.exception("re-verification watch pass failed")
            await asyncio.sleep(300)


def _seconds_until_due() -> float | None:
    db = SessionLocal()
    try:
        nxt = next_check(db)
        return None if nxt is None else (nxt - utcnow()).total_seconds()
    finally:
        db.close()


def start_scheduler() -> asyncio.Task | None:
    if not get_settings().watch_scheduler:
        return None
    return asyncio.get_running_loop().create_task(_scheduler_loop(), name="re-verification-watch")
