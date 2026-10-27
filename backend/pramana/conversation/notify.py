"""Notifications: the event code says what happened, channels decide how people hear about it.

Every event names a template key and its parameters. The in-app channel renders a title and a body from the
template and writes one row per recipient. Email is designed as a second channel over the same keys and
parameters (EmailChannel), so adding it does not touch any event code.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Application, User
from .models import Notification
from .settings import conversation_settings

log = logging.getLogger(__name__)

INSTITUTION = "institution"
CELL = "cell"
CELL_ROLES = ("officer", "admin")


@dataclass(frozen=True)
class Template:
    audience: str
    event: str
    title: str
    body: str


# Keys are stable: an email channel names its subject and body files after them
TEMPLATES: dict[str, Template] = {
    "rect.letter_finalised": Template(INSTITUTION, "letter_finalised", "AICTE sent a deficiency letter",
                                      "{round_label} for {application_id}: {item_count} to correct. "
                                      "Respond by {respond_by}."),
    "rect.requested": Template(INSTITUTION, "letter_finalised", "AICTE asked for corrections",
                               "{round_label} for {application_id}: {item_count} to correct."),
    "rect.institution_reply": Template(CELL, "institution_message", "{institution} replied on {where}",
                                       "{round_label}, {application_id}: {item_title}"),
    "rect.institution_question": Template(CELL, "institution_message", "{institution} asked a question on {where}",
                                          "{round_label}, {application_id}: {item_title}"),
    "rect.review_requested": Template(CELL, "review_requested", "{institution} requested a review of {where}",
                                      "{round_label}, {application_id}. Reply before recording an outcome."),
    "rect.cell_reply": Template(INSTITUTION, "cell_reply", "AICTE Scrutiny Cell replied on {where}",
                                "{round_label}, {application_id}: {item_title}"),
    "rect.status_changed": Template(INSTITUTION, "status_changed", "{where_cap} is now {status_label}",
                                    "{round_label}, {application_id}: {item_title}"),
    "outcome.recorded": Template(INSTITUTION, "outcome_recorded", "Scrutiny outcome recorded for {application_id}",
                                 "{outcome_label}. Open the application to read the reasons."),
    "rect.deadline_soon": Template(INSTITUTION, "deadline_soon", "Response {due_phrase}",
                                   "{round_label} for {application_id}: respond by {respond_by}."),
}


@dataclass
class Rendered:
    """One event, rendered for its audience; what a channel delivers."""

    template: str
    audience: str
    event: str
    title: str
    body: str
    link: str
    application_id: str
    params: dict[str, Any] = field(default_factory=dict)
    thread_id: str | None = None
    dedupe: str | None = None


class NotificationChannel(Protocol):
    name: str
    available: bool

    def deliver(self, db: Session, note: Rendered, users: list[User]) -> int:
        """Deliver to each user; returns how many were delivered. The caller commits."""
        ...


class InAppChannel:
    """Rows in the notifications table, read by the bell in the top bar."""

    name = "in_app"
    available = True

    def deliver(self, db: Session, note: Rendered, users: list[User]) -> int:
        n = 0
        for u in users:
            key = f"{note.dedupe}:{u.id}" if note.dedupe else None
            if key and db.scalars(select(Notification.id).where(Notification.dedupe_key == key)).first():
                continue
            db.add(Notification(user_id=u.id, audience=note.audience, event=note.event, template=note.template,
                                params=note.params, title=note.title[:200], body=note.body[:500], link=note.link,
                                application_id=note.application_id, thread_id=note.thread_id, dedupe_key=key))
            n += 1
        db.flush()
        return n


class EmailChannel:
    """Designed, not built: email through Azure Communication Services (ACS) Email.

    It plugs in without touching any event code:
    1. Add the `azure-communication-email` package, a connection string read from the secret store at run time
       (never committed) and a sender address on a domain verified in ACS.
    2. Give users an email address (a `User.email` column, or a lookup in the AICTE directory) and an opt-out.
    3. Write a subject and an HTML body per key in TEMPLATES (templates/email/<key>.html), filled from the same
       `params` the in-app channel stores. Institution emails follow the portal's rule: the sender is the
       "AICTE Scrutiny Cell", never an official's name, and no finding, rule or detector detail.
    4. Implement deliver() with `EmailClient.begin_send`, one message per recipient, and record a
       `notification.email_sent` audit event with the template key and recipient id, never the address or body.
    5. Set `available = True` and add "email" to PRAMANA_NOTIFY_CHANNELS.
    """

    name = "email"
    available = False

    def deliver(self, db: Session, note: Rendered, users: list[User]) -> int:
        raise NotImplementedError("the email channel is designed but not built; see EmailChannel")


_REGISTRY: dict[str, NotificationChannel] = {"in_app": InAppChannel(), "email": EmailChannel()}
_warned: set[str] = set()


def channels() -> list[NotificationChannel]:
    out = []
    for name in (n.strip() for n in conversation_settings().notify_channels.split(",") if n.strip()):
        ch = _REGISTRY.get(name)
        if ch is None or not ch.available:
            if name not in _warned:
                _warned.add(name)
                log.warning("notification channel %r is not available; skipped", name)
            continue
        out.append(ch)
    return out


def recipients(db: Session, audience: str, institution_id: str | None) -> list[User]:
    q = select(User).where(User.active.is_(True))
    if audience == INSTITUTION:
        q = q.where(User.role == "institution", User.institution_id == institution_id)
    else:
        q = q.where(User.role.in_(CELL_ROLES))
    return list(db.scalars(q.order_by(User.username)))


def link_for(audience: str, app_id: str, thread_id: str | None = None, show: str | None = None) -> str:
    base = f"/portal/applications/{quote(app_id)}" if audience == INSTITUTION else f"/applications/{quote(app_id)}/rectification"
    if thread_id:
        return f"{base}?thread={quote(thread_id)}"
    return f"{base}?show={quote(show)}" if show else base


def notify(db: Session, key: str, app: Application, params: dict[str, Any], *, thread_id: str | None = None,
           show: str | None = None, dedupe: str | None = None) -> int:
    """Render one event for its audience and hand it to every enabled channel. The caller commits."""
    t = TEMPLATES[key]
    params = {"application_id": app.id, "institution": app.institution.name, **params}
    note = Rendered(template=key, audience=t.audience, event=t.event, title=t.title.format_map(params),
                    body=t.body.format_map(params), link=link_for(t.audience, app.id, thread_id, show),
                    application_id=app.id, params=params, thread_id=thread_id, dedupe=dedupe)
    users = recipients(db, t.audience, app.institution_id)
    return sum(ch.deliver(db, note, users) for ch in channels())


def notification_json(n: Notification) -> dict[str, Any]:
    return {"id": n.id, "event": n.event, "title": n.title, "body": n.body, "link": n.link,
            "application_id": n.application_id, "thread_id": n.thread_id, "created_at": n.created_at.isoformat(),
            "read": n.read_at is not None}
