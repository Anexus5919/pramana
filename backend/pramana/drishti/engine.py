"""Drishti's pipeline: guardrail, rules, model, fixed queries, templated reply (docs/features/drishti-spec.md, 4).

The guardrail and the rules need no model; the model is asked only when the guardrail judged a message in scope and
the rules could not finish it. Whatever the source, the database answers and the templates write the reply.
"""

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Application, User
from . import execute, guard, intents, memory, model, replies, rules
from .lang import detect

# "In Hindi", "hinglish mein": the user picks the reply language
ASKED_LANG = [("hi", re.compile(r"\bin\s+hindi\b|\bhindi\s+(?:me|mein)\b|हिंदी\s*में", re.I)),
              ("hinglish", re.compile(r"\bin\s+hinglish\b|\bhinglish\s+(?:me|mein)\b", re.I)),
              ("en", re.compile(r"\bin\s+english\b|\benglish\s+(?:me|mein)\b|अंग्रेज़?ी\s*में", re.I))]
THANKS = re.compile(r"\b(?:thanks?|thank you|thx|ty|shukriya|dhanyavaa?d|dhanyawad)\b|धन्यवाद|शुक्रिया", re.I)
PATH_APP = re.compile(r"/(?:portal/)?applications/(APP-\d{4}-[0-9A-Z]{6})", re.I)


@dataclass
class Answer:
    conversation_id: str
    reply: dict[str, Any]
    # For the audit event: never the message text
    audit: dict[str, Any]
    application_id: str | None


def _page_application(context: dict[str, Any] | None, cat: guard.Catalog) -> str | None:
    ctx = context or {}
    ref = ctx.get("application_id") or ""
    if not ref:
        m = PATH_APP.search(str(ctx.get("path") or ""))
        ref = m.group(1) if m else ""
    ref = execute.resolve_app(cat, str(ref)[:40])
    return ref if ref and ref in cat.applications else None


def _own_applications(db: Session, user: User) -> list[str]:
    if user.role != "institution":
        return []
    return list(db.scalars(select(Application.id).where(Application.institution_id == user.institution_id)
                           .order_by(Application.created_at)))


def ask(db: Session, user: User, message: str, conversation_id: str | None = None,
        context: dict[str, Any] | None = None) -> Answer:
    msg = message.strip()
    lang = next((code for code, p in ASKED_LANG if p.search(msg)), None) or detect(msg)
    conv = memory.get(conversation_id, user.id) or memory.start(user.id)
    data_turn = conv.last_data()
    previous = intents.parse(data_turn.intent) if data_turn else None
    cat = guard.catalog(db)
    ents = guard.entities(db, msg)
    glossary_hit = bool(rules.term_key(msg) or rules.howto_key(msg))
    verdict = guard.check(msg, ents, has_history=bool(conv.turns), glossary_hit=glossary_hit)
    page_app = _page_application(context, cat)
    ctx = rules.Context(role=user.role, language=lang, previous=previous, last_items=conv.last_items(),
                        page_application=page_app, own_applications=_own_applications(db, user))

    model_failed = False
    if not verdict.in_scope:
        parsed, source = rules.Parsed(intents.out_of_scope(lang)), "guardrail"
    else:
        parsed, source = rules.parse(msg, ents, cat, ctx), "rules"
        if parsed is None:
            source = "model"
            intent = model.parse(msg, user.role, previous, lang)
            if intent is None:
                model_failed = True
                parsed = rules.Parsed(intents.clarify(lang))
            else:
                intent.language = lang
                if intent.intent == "application_summary" and not intent.filters.application and page_app:
                    intent.filters.application = page_app
                parsed = rules.Parsed(intent)

    res = execute.execute(db, user, parsed, cat, lang)
    if model_failed:
        res.key = "model_off"
    text = replies.text(res, user.role, lang, thanks=bool(THANKS.search(msg)))
    chips = replies.suggestions(res, user.role, lang)
    shown = res.intent or parsed.intent
    compact = intents.compact(shown)
    memory.remember(conv, compact, [{**i, "application_id": i.get("_app"), "page": i.get("_page")} for i in res.items])
    items = [{k: v for k, v in i.items() if not k.startswith("_")} for i in res.items]
    reply = {"kind": res.kind, "language": lang, "text": text, "count": res.count, "items": items,
             "more_href": res.more_href, "suggestions": chips, "source": source, "intent": compact}
    app_id = execute.resolve_app(cat, shown.filters.application)
    audit = {"intent": compact, "count": res.count, "source": source, "kind": res.kind, "language": lang,
             "conversation_id": conv.id}
    if source == "guardrail":
        audit["guardrail"] = verdict.reason
    if parsed.action:
        audit["action_requested"] = parsed.action
    return Answer(conv.id, reply, audit, app_id if app_id in cat.applications else None)
