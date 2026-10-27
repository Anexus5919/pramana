"""Fixed queries per intent, filtered by the signed-in user's role (docs/features/drishti-spec.md, section 6).

Every number in a reply is counted here, and the records behind it come back as items. Nothing here writes: requests
to act are answered with a link to the screen where an official does it.
"""

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..api.applications import latest_run
from ..insights import proof
from ..models import (
    Application,
    AuditEvent,
    Document,
    Finding,
    Institution,
    RectificationRequest,
    User,
    VerificationAttempt,
)
from ..officer.common import run_findings
from ..rules.engine import active_ruleset
from . import periods
from . import replies as rp
from .glossary import HOWTOS, TERMS
from .guard import Catalog
from .intents import Intent
from .rules import Parsed

MAX_ITEMS = 8
OFFICIAL = {"officer", "verifier", "admin"}
ALLOWED = {
    "verifier": {"awaiting_confirmation", "list_findings", "application_summary", "explain_term", "how_to", "navigate",
                 "greeting", "clarify", "out_of_scope"},
    "institution": {"application_summary", "explain_term", "how_to", "navigate", "greeting", "clarify", "out_of_scope"},
}
PAGE_ROLES = {"audit": {"officer", "admin"}, "platform": {"officer", "admin"}, "portal": {"institution"}}
PAGE_HREF = {"queue": "/dashboard", "analyse": "/analyse", "integrity": "/integrity", "issuer_simulator": "/issuers",
             "rules": "/rules", "audit": "/audit", "platform": "/platform", "portal": "/portal"}
CATEGORY_DB = {"eoa": "EOA", "increase_intake": "INCREASE_INTAKE"}
OPEN_REVIEW = {"open", "acknowledged", "evidence_requested"}
NEEDS_MANUAL = {"source_unavailable", "verification_pending", "manual_review_required"}
LAPSING = ("expired_at_submission", "lapses_before_session", "expires_in_session")
DECISION_ACTIONS = {"rectification": "rectification.requested", "outcome": "scrutiny.outcome_recorded"}
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
# What each finding is about, read from its code, title and document type
TOPIC_RX = {
    "fire_safety": r"fire",
    "building": r"occupancy|structural|ssc|building|built-up|oc-area|\boc\b",
    "land": r"\bland\b|land-area|satmap|satellite|acre",
    "faculty": r"faculty|fsr|roster",
    "fees": r"\bter\b|ter_receipt|\bfees?\b|payment",
    "signature": r"signature|dsc",
    "qr": r"\bqr\b|signed_qr",
    "photo": r"photo|\bph-|img-|geotag|workstation|c2pa",
    "seal": r"seal",
    "edits": r"overwritten|revision|overlaid|whiteout|font|modified|edit",
    "accounts": r"accounts|audited",
    "intake": r"intake|core-branches|core branch|no-increase|nba",
    "bandwidth": r"bandwidth",
}


@dataclass
class Result:
    kind: str
    key: str
    data: dict[str, Any] = field(default_factory=dict)
    count: int | None = None
    # Items carry _app and _page for conversation memory; the API strips keys starting with an underscore
    items: list[dict[str, Any]] = field(default_factory=list)
    more_href: str | None = None
    intent: Intent | None = None


def item(type_: str, id_: str, title: str, subtitle: str, href: str, app: str | None = None,
         page: str | None = None) -> dict[str, Any]:
    return {"type": type_, "id": id_, "title": title, "subtitle": subtitle, "href": href, "_app": app, "_page": page}


def app_href(role: str, app_id: str, section: str | None = None, **params: str) -> str:
    if role == "institution":
        return f"/portal/applications/{app_id}"
    base = f"/applications/{app_id}" + (f"/{section}" if section and section != "summary" else "")
    q = "&".join(f"{k}={v}" for k, v in params.items() if v)
    return f"{base}?{q}" if q else base


def resolve_app(cat: Catalog, ref: str | None) -> str | None:
    if not ref:
        return None
    ref = ref.strip().upper()
    return cat.aliases.get(ref, ref)


def _own(user: User, app: Application) -> bool:
    return user.role in OFFICIAL or app.institution_id == user.institution_id


def _app_filters(q, f, cat: Catalog):
    """Category, status, round, place, institution and application filters on an Application query."""
    if f.category:
        q = q.where(Application.category == CATEGORY_DB[f.category])
    if f.status:
        q = q.where(Application.status.in_(f.status))
    else:
        q = q.where(Application.status != "draft")
    if f.round == "first":
        q = q.where(Application.round == 1)
    elif f.round == "correction":
        q = q.where(Application.round > 1)
    if f.place:
        q = q.where(or_(Institution.district.ilike(f.place), Institution.state.ilike(f.place)))
    if f.institution:
        frag = f.institution.strip()
        words = [w for w in re.findall(r"\w+", frag) if len(w) >= 4]
        conds = [Institution.name.ilike(f"%{frag}%"), Institution.aicte_id == frag]
        conds += [Institution.name.ilike(f"%{w}%") for w in words[:1]]
        q = q.where(or_(*conds))
    if f.application:
        q = q.where(Application.id == resolve_app(cat, f.application))
    return q


def _session_year(db: Session) -> str | None:
    years = [y for (y,) in db.execute(select(Application.academic_year).distinct())]
    return max(years) if years else None


def _window(intent: Intent) -> periods.Window:
    f = intent.filters
    return periods.window(f.period, f.date_from, f.date_to)


def _app_item(a: Application, role: str, lang: str) -> dict[str, Any]:
    sub = ", ".join(x for x in [a.id, rp.category_label(a.category, lang),
                                rp.submitted_on(a.submitted_at, lang) if a.submitted_at else rp.status_label(a.status, lang)]
                    if x)
    return item("application", a.id, a.institution.name, sub, app_href(role, a.id), a.id, "application")


# ---------------------------------------------------------------- intents


def _applications(db: Session, user: User, intent: Intent, cat: Catalog, lang: str) -> Result:
    f = intent.filters
    w = _window(intent)
    base = _app_filters(select(Application).join(Institution), f, cat)
    q = base
    session = None
    if f.period == "this_session":
        session = _session_year(db)
        q = q.where(Application.academic_year == session)
    elif w.bounded:
        if w.start:
            q = q.where(Application.submitted_at >= w.start)
        if w.end:
            q = q.where(Application.submitted_at < w.end)
    apps = list(db.scalars(q.order_by(Application.submitted_at.desc(), Application.id.desc())))
    latest = None
    if not apps and (w.bounded or session):
        last = db.scalars(base.where(Application.submitted_at.is_not(None))
                          .order_by(Application.submitted_at.desc()).limit(1)).first()
        if last:
            latest = {"date": last.submitted_at, "institution": last.institution.name, "app_id": last.id}
    data = {"mode": "count" if intent.intent == "count_applications" else "list", "n": len(apps), "filters": f,
            "window": w, "session": session, "latest": latest}
    items = [_app_item(a, user.role, lang) for a in apps[:MAX_ITEMS]]
    if latest and not apps:
        last_app = db.get(Application, latest["app_id"])
        items = [_app_item(last_app, user.role, lang)]
    return Result("answer", "apps", data, len(apps), items, "/dashboard" if len(apps) > MAX_ITEMS else None)


def _decisions(db: Session, user: User, intent: Intent, cat: Catalog, lang: str) -> Result:
    f = intent.filters
    w = _window(intent)
    acts = [DECISION_ACTIONS[f.decision_type]] if f.decision_type else list(DECISION_ACTIONS.values())
    base = select(AuditEvent).where(AuditEvent.action.in_(acts))
    actor = user.username if f.actor == "me" else f.actor
    if actor:
        base = base.where(AuditEvent.actor == actor)
    if f.application or f.institution or f.place or f.category:
        ids = list(db.scalars(_app_filters(select(Application.id).join(Institution), f, cat)))
        base = base.where(AuditEvent.application_id.in_(ids))
    q = base
    if w.start:
        q = q.where(AuditEvent.ts >= w.start)
    if w.end:
        q = q.where(AuditEvent.ts < w.end)
    events = list(db.scalars(q.order_by(AuditEvent.seq.desc())))
    names = {a.id: a.institution.name for a in db.scalars(select(Application).where(
        Application.id.in_({e.application_id for e in events[:MAX_ITEMS]} | set())))}

    def ev_item(e: AuditEvent) -> dict[str, Any]:
        kind = "rectification" if e.action == "rectification.requested" else "outcome"
        sub = rp.decision_subtitle(kind, e.details or {}, e.ts, e.actor, lang)
        return item("decision", str(e.seq), names.get(e.application_id) or e.application_id or "", sub,
                    app_href(user.role, e.application_id, "activity", view="audit"), e.application_id, "application")

    latest = None
    items = [ev_item(e) for e in events[:MAX_ITEMS]]
    if not events and w.bounded:
        last = db.scalars(base.order_by(AuditEvent.seq.desc()).limit(1)).first()
        if last:
            a = db.get(Application, last.application_id)
            names[last.application_id] = a.institution.name if a else last.application_id
            latest = {"date": last.ts, "institution": names[last.application_id],
                      "kind": "rectification" if last.action == "rectification.requested" else "outcome"}
            items = [ev_item(last)]
    data = {"n": len(events), "filters": f, "actor": f.actor, "window": w, "latest": latest}
    return Result("answer", "decisions", data, len(events), items, "/audit" if user.role in ("officer", "admin") else None)


def topics_of(f: Finding, doc_type: str | None) -> set[str]:
    text = f"{f.code} {f.title} {doc_type or ''}".lower()
    return {k for k, p in TOPIC_RX.items() if re.search(p, text)}


def _scoped_apps(db: Session, intent: Intent, cat: Catalog) -> list[Application]:
    q = _app_filters(select(Application).join(Institution), intent.filters, cat)
    return list(db.scalars(q.order_by(Application.id)))


def _findings(db: Session, user: User, intent: Intent, cat: Catalog, lang: str) -> Result:
    f = intent.filters
    apps = _scoped_apps(db, intent, cat)
    rows: list[tuple[Application, Finding]] = []
    for a in apps:
        fs = run_findings(db, latest_run(db, a.id))
        doc_types = {d.id: d.declared_type for d in a.documents}
        for x in fs:
            if f.open_only is not False and x.review_status not in OPEN_REVIEW:
                continue
            if f.severity and not (x.severity == f.severity or (f.severity == "high" and x.severity == "critical")):
                continue
            if f.topic and f.topic not in topics_of(x, doc_types.get(x.document_id)):
                continue
            # The verification cell sees verification findings only
            if user.role == "verifier" and x.category != "verification":
                continue
            rows.append((a, x))
    rows.sort(key=lambda r: (SEVERITY_ORDER.get(r[1].severity, 9), r[0].id))
    items = [item("finding", x.id, x.title, rp.finding_subtitle(a.institution.name, a.id, x.severity, lang),
                  app_href(user.role, a.id, "findings", finding=x.id), a.id, "application") for a, x in rows[:MAX_ITEMS]]
    single = apps[0] if len(apps) == 1 and (f.application or f.institution) else None
    sev = Counter("high" if x.severity == "critical" else x.severity for _, x in rows)
    data = {"n": len(rows), "filters": f, "apps": len({a.id for a, _ in rows}), "by_severity": dict(sev),
            "single": {"app_id": single.id, "institution": single.institution.name} if single else None,
            "verification_only": user.role == "verifier"}
    more = app_href(user.role, single.id, "findings") if single else ("/dashboard" if len(rows) > MAX_ITEMS else None)
    return Result("answer", "findings", data, len(rows), items, more)


def _expiring(db: Session, user: User, intent: Intent, cat: Catalog, lang: str) -> Result:
    f = intent.filters
    w = _window(intent)
    by_session = f.period in (None, "this_session", "all") and not (f.date_from or f.date_to)
    rows = []
    sessions = set()
    for a in _scoped_apps(db, intent, cat):
        run, rs, docs, attempts, findings = proof._context(db, a)
        if run is None:
            continue
        cov = proof.coverage(db, a, run, rs, docs, attempts, findings, today=periods.today())
        if not cov:
            continue
        sessions.add(cov["session"]["label"])
        for c in cov["certificates"]:
            end = c["end"]["date"]
            keep = c["status"] in LAPSING if by_session else bool(
                end and (w.first is None or end >= w.first.isoformat()) and (w.last is None or end <= w.last.isoformat()))
            if keep:
                rows.append((a, c))
    rows.sort(key=lambda r: (r[1]["end"]["date"] or "", r[0].id))
    items = [item("certificate", c["document_id"], f"{rp.doc_label(c['doc_type'], c['label'], lang)}: {a.institution.name}",
                  rp.cert_subtitle(c, lang), app_href(user.role, a.id, "documents", doc=c["document_id"]), a.id,
                  "application") for a, c in rows[:MAX_ITEMS]]
    data = {"n": len(rows), "filters": f, "window": w, "by_session": by_session,
            "session": ", ".join(sorted(sessions)) or None,
            "by_status": dict(Counter(c["status"] for _, c in rows))}
    return Result("answer", "expiring", data, len(rows), items, "/dashboard" if len(rows) > MAX_ITEMS else None)


def _awaiting(db: Session, user: User, intent: Intent, cat: Catalog, lang: str) -> Result:
    rs = active_ruleset()
    rows = []
    for a in _scoped_apps(db, intent, cat):
        run = latest_run(db, a.id)
        if run is None:
            continue
        atts = list(db.scalars(select(VerificationAttempt).where(VerificationAttempt.application_id == a.id)))
        followed = {(x.request or {}).get("follows") for x in atts if x.channel == "manual_confirmation"}
        for x in atts:
            if x.run_id == run.id and x.status in NEEDS_MANUAL and x.channel != "manual_confirmation" \
                    and x.id not in followed:
                rows.append((a, x))
    docs = {d.id: d.declared_type for d in db.scalars(select(Document).where(
        Document.id.in_({x.document_id for _, x in rows if x.document_id})))}
    items = []
    for a, x in rows[:MAX_ITEMS]:
        t = docs.get(x.document_id)
        label = rp.doc_label(t, rs.doc_types.get(t, {}).get("label", t or "Document"), lang)
        items.append(item("verification", x.id, f"{label}: {a.institution.name}",
                          rp.attempt_subtitle(x.status, x.source_name, lang),
                          app_href(user.role, a.id, "documents", view="verification", attempt=x.id), a.id,
                          "application"))
    data = {"n": len(rows), "apps": len({a.id for a, _ in rows})}
    return Result("answer", "awaiting", data, len(rows), items, "/dashboard" if len(rows) > MAX_ITEMS else None)


def _summary_official(db: Session, user: User, app: Application, why: bool, lang: str) -> Result:
    run = latest_run(db, app.id)
    fs = [x for x in run_findings(db, run) if x.review_status in OPEN_REVIEW]
    if user.role == "verifier":
        shown = [x for x in fs if x.category == "verification"] or fs
    else:
        shown = fs
    sev = Counter("high" if x.severity == "critical" else x.severity for x in fs)
    items = [item("finding", x.id, x.title, rp.finding_subtitle(app.institution.name, app.id, x.severity, lang),
                  app_href(user.role, app.id, "findings", finding=x.id), app.id, "application") for x in shown[:3]]
    items.append(item("page", f"{app.id}:workspace", rp.t("open_workspace", lang), app.id, app_href(user.role, app.id),
                      app.id, "application"))
    if user.role == "officer":
        items.append(item("page", f"{app.id}:ask", rp.t("ask_why", lang), app.id,
                          app_href(user.role, app.id, ask="1"), app.id, "application"))
    data = {"app_id": app.id, "institution": app.institution.name, "status": app.status, "round": app.round,
            "has_run": run is not None and run.status == "complete", "open": len(fs), "by_severity": dict(sev),
            "why": why, "category": app.category}
    return Result("answer", "summary", data, len(fs), items, app_href(user.role, app.id, "findings"))


def _summary_institution(db: Session, user: User, app: Application, lang: str) -> Result:
    """The institution-safe view: status, next step and what to fix, never forensic signals or evidence classes."""
    from ..api.applications import institution_item
    from ..insights import readiness

    rs = active_ruleset()
    data: dict[str, Any] = {"app_id": app.id, "status": app.status, "round": app.round, "institution_view": True}
    items: list[dict[str, Any]] = []
    href = app_href("institution", app.id)
    if app.status in ("draft", "rectification_requested"):
        chk = readiness.check(db, app, today=periods.today())
        fix = [i for g in chk["groups"] for i in g["items"] if i["status"] == "fix"]
        # In a rectification round, what AICTE asked about comes first
        fix.sort(key=lambda i: not i.get("requested"))
        data.update(fix=len(fix), met=chk["counts"]["met"], total=chk["counts"]["total"],
                    waiting=chk["counts"]["waiting"])
        items = [item("readiness", i["id"], i["title"], i.get("action") or i.get("detail") or "", href, app.id,
                      "application") for i in fix[:MAX_ITEMS]]
        count = len(fix)
    else:
        rect = db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == app.id,
                                                             RectificationRequest.status == "open")).first()
        asked = [institution_item(db, i, rs) for i in (rect.items if rect else [])]
        data.update(asked=len(asked))
        items = [item("readiness", i.get("finding_id") or str(n), i["title"], i.get("message") or "", href, app.id,
                      "application") for n, i in enumerate(asked[:MAX_ITEMS])]
        count = len(asked)
    items.append(item("page", f"{app.id}:portal", rp.t("open_application", lang), app.id, href, app.id, "application"))
    return Result("answer", "summary_institution", data, count, items, None)


def _summary(db: Session, user: User, parsed: Parsed, cat: Catalog, lang: str) -> Result:
    ref = resolve_app(cat, parsed.intent.filters.application)
    if not ref and parsed.intent.filters.institution:
        apps = _scoped_apps(db, parsed.intent, cat)
        ref = apps[-1].id if apps else None
    if not ref:
        return Result("clarify", "which_app")
    app = db.get(Application, ref)
    if user.role == "institution":
        if app is None or not _own(user, app):
            return _refuse_own(db, user, lang)
        return _summary_institution(db, user, app, lang)
    if app is None:
        return Result("clarify", "not_found", {"app_id": ref})
    return _summary_official(db, user, app, parsed.why, lang)


def _action(db: Session, user: User, parsed: Parsed, cat: Catalog, lang: str) -> Result:
    ref = resolve_app(cat, parsed.intent.filters.application)
    app = db.get(Application, ref) if ref else None
    if app is not None and not _own(user, app):
        app = None
    data = {"action": parsed.action, "app_id": app.id if app else None,
            "institution": app.institution.name if app else None, "officer": user.role == "officer"}
    items = []
    if app is not None:
        if user.role == "officer":
            items.append(item("page", f"{app.id}:decide", rp.t("decide_on", lang, app=app.id), app.institution.name,
                              app_href(user.role, app.id, action="decide"), app.id, "application"))
        else:
            items.append(item("application", app.id, app.institution.name, app.id, app_href(user.role, app.id), app.id,
                              "application"))
    return Result("refuse", "action", data, None, items)


def _navigate(db: Session, user: User, parsed: Parsed, cat: Catalog, lang: str) -> Result:
    intent = parsed.intent
    if parsed.item:
        it = parsed.item
        return Result("navigate", "navigate", {"label": it["title"]}, None,
                      [item(it["type"], it["id"], it["title"], it.get("subtitle") or "", it["href"], it.get("_app"),
                            it.get("_page"))])
    tgt = intent.target
    if intent.filters.application:
        ref = resolve_app(cat, intent.filters.application)
        app = db.get(Application, ref)
        if app is None or not _own(user, app):
            return _refuse_own(db, user, lang) if user.role == "institution" else \
                Result("clarify", "not_found", {"app_id": ref})
        section = tgt.section if tgt else None
        params = {}
        if tgt and tgt.document and user.role != "institution":
            doc = db.scalars(select(Document).where(Document.application_id == app.id,
                                                    Document.declared_type == tgt.document,
                                                    Document.superseded.is_(False))).first()
            if doc:
                section, params = "documents", {"doc": doc.id}
        href = app_href(user.role, app.id, section, **params)
        label = rp.section_label(section, lang, app.institution.name)
        return Result("navigate", "navigate", {"label": label}, None,
                      [item("page", f"{app.id}:{section or 'summary'}", label, app.id, href, app.id, "application")])
    page = tgt.page if tgt else None
    if page in (None, "application"):
        return Result("clarify", "which_page")
    if page == "portal" and user.role != "institution":
        page = "queue"
    if user.role == "institution" and page != "portal":
        return _refuse_own(db, user, lang)
    allowed = PAGE_ROLES.get(page, OFFICIAL)
    if user.role not in allowed:
        return Result("refuse", "refuse_page", {"page": page})
    label = rp.page_label(page, lang)
    return Result("navigate", "navigate", {"label": label}, None,
                  [item("page", page, label, "", PAGE_HREF[page], None, page)])


def _refuse_own(db: Session, user: User, lang: str) -> Result:
    own = db.scalars(select(Application).where(Application.institution_id == user.institution_id)
                     .order_by(Application.created_at.desc())).first()
    items = [item("application", own.id, own.institution.name, own.id, app_href("institution", own.id), own.id,
                  "application")] if own else []
    return Result("refuse", "refuse_own", {}, None, items)


def _term(user: User, intent: Intent, lang: str) -> Result:
    e = TERMS[intent.term]
    href = e.href if e.href and (user.role in OFFICIAL or e.href.startswith("/portal")) else None
    items = [item("term", e.key, e.title_hi if lang == "hi" else e.title, "", href or "", None, None)] if href else []
    return Result("help", "term", {"term": e.key}, None, items)


def _howto(user: User, intent: Intent, lang: str) -> Result:
    h = HOWTOS[intent.howto]
    allowed = user.role in h.roles
    items = []
    if allowed and h.href:
        items.append(item("page", h.key, h.title_hi if lang == "hi" else h.title, "", h.href, None, None))
    return Result("help", "howto", {"howto": h.key, "allowed": allowed}, None, items)


def execute(db: Session, user: User, parsed: Parsed, cat: Catalog, lang: str) -> Result:
    intent = parsed.intent
    name = intent.intent
    if parsed.action:
        res = _action(db, user, parsed, cat, lang)
    elif name == "out_of_scope":
        res = Result("refuse", "out_of_scope")
    elif name == "greeting":
        res = Result("greeting", "greeting", {"name": user.display_name})
    elif name == "clarify":
        res = Result("clarify", "no_list" if intent.follow_up else "vague")
    elif user.role in ALLOWED and name not in ALLOWED[user.role]:
        res = _refuse_own(db, user, lang) if user.role == "institution" else Result("refuse", "refuse_role", {"intent": name})
    elif name in ("count_applications", "list_applications"):
        res = _applications(db, user, intent, cat, lang)
    elif name == "list_decisions":
        res = _decisions(db, user, intent, cat, lang)
    elif name == "list_findings":
        res = _findings(db, user, intent, cat, lang)
    elif name == "expiring_certificates":
        res = _expiring(db, user, intent, cat, lang)
    elif name == "awaiting_confirmation":
        res = _awaiting(db, user, intent, cat, lang)
    elif name == "application_summary":
        res = _summary(db, user, parsed, cat, lang)
    elif name == "navigate":
        res = _navigate(db, user, parsed, cat, lang)
    elif name == "explain_term" and intent.term:
        res = _term(user, intent, lang)
    elif name == "how_to" and intent.howto:
        res = _howto(user, intent, lang)
    else:
        res = Result("clarify", "vague")
    res.intent = intent
    return res
