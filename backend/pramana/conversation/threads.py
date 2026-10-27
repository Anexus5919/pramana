"""Correction-round threads: one per deficiency-letter item and one general thread per round.

The institution writes as itself and officials write as the AICTE Scrutiny Cell. An institution never learns which
official wrote, and its thread payloads carry no finding ids, rule or detector codes. Message text is stored here;
the audit chain records ids, kinds and a digest of the text.
"""

import hashlib
import re
import uuid
from datetime import date
from pathlib import PurePath
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit
from ..config import get_settings
from ..crypto import store_document
from ..history.watch import OUTCOMES, current_outcome
from ..models import Application, DeficiencyLetter, RectificationRequest, User, round_label
from ..officer.common import FORBIDDEN_WORDS
from . import notify
from .models import RectMessage, RectStatusChange, RectThread
from .settings import conversation_settings

CELL_NAME = "AICTE Scrutiny Cell"
INSTITUTION_KINDS = ("reply", "question", "review_request")
CELL_KIND = "cell_reply"
OFFICIAL_STATUSES = ("resolved", "still_open")
STATUS_WORDS = {"open": "open", "responded": "responded", "resolved": "resolved", "still_open": "still open",
                "review_requested": "review requested"}
MAX_BODY = 2000
MIN_REASON = 10
CLOSED_APP = ("closed", "withdrawn")
# Magic bytes, the media type and the file extensions each may carry
ATTACHMENT_TYPES = (
    (b"%PDF-", "application/pdf", (".pdf",)),
    (b"\x89PNG\r\n\x1a\n", "image/png", (".png",)),
    (b"\xff\xd8\xff", "image/jpeg", (".jpg", ".jpeg")),
)
WHAT_NEXT = {
    "no_deficiency": "Nothing more is needed from you for this scrutiny. AICTE tells you directly about any further step.",
    "deficiencies_recorded": "The reasons above say what was recorded. Keep the related documents ready. AICTE tells "
                             "you directly about any further step.",
    "referred_for_visit": "An expert visit committee may visit the campus. Keep the original documents ready for it. "
                          "AICTE tells you the dates directly.",
}
DEFAULT_NEXT = "AICTE tells you directly about any further step."


def _clean(text: str | None) -> str:
    return "".join(ch for ch in (text or "") if ch in "\n\t" or ord(ch) >= 32).strip()


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def round_name(rect: RectificationRequest) -> str:
    # A request raised in round n opens correction round n
    return f"Correction round {rect.round}"


def where(item_no: int) -> str:
    return f"item {item_no}" if item_no else "the general thread"


def days_left(respond_by: str | None, today: date | None = None) -> int | None:
    return (date.fromisoformat(respond_by[:10]) - (today or date.today())).days if respond_by else None


# ------------------------------------------------------------------ rounds and items


def rounds(db: Session, app: Application) -> list[RectificationRequest]:
    return list(db.scalars(select(RectificationRequest).where(RectificationRequest.application_id == app.id)
                           .order_by(RectificationRequest.created_at)))


def final_letter(db: Session, rect: RectificationRequest) -> DeficiencyLetter | None:
    return db.scalars(select(DeficiencyLetter).where(DeficiencyLetter.rectification_id == rect.id,
                                                     DeficiencyLetter.status == "final")).first()


def round_items(db: Session, rect: RectificationRequest) -> list[dict[str, Any]]:
    """The numbered items the institution reads: the final letter's items, else the request's items in the
    wording an institution may read. Numbering matches the portal's list."""
    from ..api.applications import institution_item
    from ..rules.engine import active_ruleset

    letter = final_letter(db, rect)
    if letter:
        return [{"no": n, "title": it["title"], "respond_by": it.get("respond_by"),
                 "finding_ids": list(it.get("finding_ids") or [])} for n, it in enumerate(letter.items, start=1)]
    rs = active_ruleset()
    return [{"no": n, "title": institution_item(db, it, rs)["title"] or f"Item {n}", "respond_by": None,
             "finding_ids": [it["finding_id"]] if it.get("finding_id") else []}
            for n, it in enumerate(rect.items, start=1)]


def round_due(items: list[dict[str, Any]]) -> str | None:
    dates = sorted(i["respond_by"] for i in items if i.get("respond_by"))
    return dates[0] if dates else None


def ensure_threads(db: Session, rect: RectificationRequest, items: list[dict[str, Any]] | None = None) -> bool:
    """Create the round's threads that do not exist yet; returns whether anything was written."""
    items = round_items(db, rect) if items is None else items
    have = {t.item_no: t for t in db.scalars(select(RectThread).where(RectThread.rectification_id == rect.id))}
    changed = False
    for no, title in [(0, "General thread"), *((i["no"], i["title"]) for i in items)]:
        t = have.get(no)
        if t is None:
            db.add(RectThread(application_id=rect.application_id, rectification_id=rect.id, item_no=no,
                              title=title[:300]))
            changed = True
        elif t.title != title[:300]:
            # A letter attached later rewords the request's items
            t.title = title[:300]
            changed = True
    if changed:
        db.flush()
    return changed


def threads_of(db: Session, rect_id: str) -> list[RectThread]:
    ts = db.scalars(select(RectThread).where(RectThread.rectification_id == rect_id)).all()
    # Items in letter order, the general thread last
    return sorted(ts, key=lambda t: (t.item_no == 0, t.item_no))


def institution_may_post(db: Session, app: Application, rect: RectificationRequest) -> tuple[bool, str | None]:
    """The institution writes in the latest round until the application closes or an outcome is recorded."""
    if app.status in CLOSED_APP:
        return False, f"This application is {app.status}, so its conversation is closed."
    latest = rounds(db, app)[-1]
    if latest.id != rect.id:
        return False, "A later correction round is open. Write in that round instead."
    out = current_outcome(db, app.id)
    if out is not None and out.created_at >= rect.created_at:
        return False, "A scrutiny outcome has been recorded, so this round is closed for new messages."
    return True, None


def cell_may_post(app: Application) -> tuple[bool, str | None]:
    # The cell can always answer, so an earlier review request never stays without a reply
    if app.status in CLOSED_APP:
        return False, f"This application is {app.status}, so its conversation is closed."
    return True, None


# ------------------------------------------------------------------ thread state


def _activity(db: Session, thread_ids: list[str]) -> tuple[dict[str, list[RectMessage]], dict[str, list[RectStatusChange]]]:
    msgs: dict[str, list[RectMessage]] = {i: [] for i in thread_ids}
    changes: dict[str, list[RectStatusChange]] = {i: [] for i in thread_ids}
    if not thread_ids:
        return msgs, changes
    for m in db.scalars(select(RectMessage).where(RectMessage.thread_id.in_(thread_ids)).order_by(RectMessage.created_at)):
        msgs[m.thread_id].append(m)
    for c in db.scalars(select(RectStatusChange).where(RectStatusChange.thread_id.in_(thread_ids))
                        .order_by(RectStatusChange.created_at)):
        changes[c.thread_id].append(c)
    return msgs, changes


def _last_cell_action(msgs: list[RectMessage], changes: list[RectStatusChange]):
    times = [m.created_at for m in msgs if m.side == "cell"] + [c.created_at for c in changes if c.side == "cell"]
    return max(times) if times else None


def awaiting_cell(msgs: list[RectMessage], changes: list[RectStatusChange]) -> bool:
    """The institution wrote last: a reply, a question or a review request the cell has not answered."""
    inst = [m.created_at for m in msgs if m.side == "institution"]
    if not inst:
        return False
    cell = _last_cell_action(msgs, changes)
    return cell is None or max(inst) > cell


def pending_review(msgs: list[RectMessage], changes: list[RectStatusChange]) -> bool:
    """A review request with no cell reply or status decision after it."""
    asked = [m.created_at for m in msgs if m.kind == "review_request"]
    if not asked:
        return False
    cell = _last_cell_action(msgs, changes)
    return cell is None or max(asked) > cell


def pending_reviews(db: Session, app: Application) -> list[tuple[RectificationRequest, RectThread]]:
    """Review requests in any round of the application that the cell has not answered."""
    out = []
    for rect in rounds(db, app):
        ts = threads_of(db, rect.id)
        msgs, changes = _activity(db, [t.id for t in ts])
        out += [(rect, t) for t in ts if pending_review(msgs[t.id], changes[t.id])]
    return out


def review_block_message(pending: list[tuple[RectificationRequest, RectThread]]) -> str:
    rect, t = pending[0]
    more = f" (and {len(pending) - 1} more)" if len(pending) > 1 else ""
    return (f"Reply to the institution's review request first. {where(t.item_no).capitalize()} of "
            f"{round_name(rect).lower()}{more} is waiting for a reply from the {CELL_NAME}. Requesting another "
            "rectification stays possible.")


# ------------------------------------------------------------------ payloads


def _names(db: Session, ids: set[str]) -> dict[str, User]:
    return {u.id: u for u in (db.get(User, i) for i in ids) if u}


def attachment_json(m: RectMessage) -> dict[str, Any] | None:
    if not m.attachment_storage:
        return None
    return {"name": m.attachment_name, "mime": m.attachment_mime, "size": m.attachment_size,
            "sha256": m.attachment_sha256, "url": f"/api/rectification-messages/{m.id}/attachment"}


def _message_json(m: RectMessage, users: dict[str, User], official: bool) -> dict[str, Any]:
    u = users.get(m.author_id)
    out = {"type": "message", "id": m.id, "side": m.side, "kind": m.kind, "body": m.body,
           "created_at": m.created_at.isoformat(), "attachment": attachment_json(m)}
    if m.side == "cell":
        # Institutions only ever see the cell; officials also see which colleague wrote
        out["author"] = CELL_NAME
        if official:
            out["author_name"] = u.display_name if u else None
    else:
        out["author"] = u.display_name if u else "Institution"
    return out


def _change_json(c: RectStatusChange, users: dict[str, User], official: bool) -> dict[str, Any]:
    out = {"type": "status", "id": c.id, "side": c.side, "from": c.from_status, "to": c.to_status, "note": c.note,
           "created_at": c.created_at.isoformat(), "author": CELL_NAME}
    if official:
        u = users.get(c.actor_id)
        out["author_name"] = u.display_name if u else None
    return out


def thread_json(t: RectThread, item: dict[str, Any] | None, msgs: list[RectMessage], changes: list[RectStatusChange],
                users: dict[str, User], official: bool, today: date | None = None) -> dict[str, Any]:
    # Status lines an institution's own message caused are implied by that message, so only the cell's are listed
    entries = [_message_json(m, users, official) for m in msgs] + \
        [_change_json(c, users, official) for c in changes if c.side == "cell"]
    entries.sort(key=lambda e: e["created_at"])
    respond_by = (item or {}).get("respond_by")
    left = days_left(respond_by, today)
    out = {"id": t.id, "item_no": t.item_no, "general": t.item_no == 0, "title": (item or {}).get("title") or t.title,
           "status": t.status, "status_note": t.status_note,
           "status_at": t.status_at.isoformat() if t.status_at else None,
           "respond_by": respond_by, "days_left": left,
           "past_due": left is not None and left < 0 and t.status not in ("resolved",),
           "awaiting_reply": awaiting_cell(msgs, changes), "pending_review": pending_review(msgs, changes),
           "last_activity_at": t.last_activity_at.isoformat(), "entries": entries}
    if official:
        out["finding_ids"] = (item or {}).get("finding_ids", [])
    return out


def round_json(db: Session, app: Application, rect: RectificationRequest, user: User,
               today: date | None = None) -> dict[str, Any]:
    official = user.role != "institution"
    items = round_items(db, rect)
    ts = threads_of(db, rect.id)
    msgs, changes = _activity(db, [t.id for t in ts])
    ids = {m.author_id for ms in msgs.values() for m in ms} | {c.actor_id for cs in changes.values() for c in cs}
    users = _names(db, ids)
    by_no = {i["no"]: i for i in items}
    # Threads beyond the current item list only matter if someone wrote in them
    shown = [t for t in ts if t.item_no == 0 or t.item_no in by_no or msgs[t.id]]
    threads = [thread_json(t, by_no.get(t.item_no), msgs[t.id], changes[t.id], users, official, today) for t in shown]
    may, why = (cell_may_post(app) if official else institution_may_post(db, app, rect))
    if user.role == "verifier":
        may, why = False, "The verification cell reads the conversation; officers and administrators reply."
    due = round_due(items)
    left = days_left(due, today)
    letter = final_letter(db, rect)
    all_rounds = rounds(db, app)
    return {
        "application_id": app.id,
        "rounds": [{"rectification_id": r.id, "round": r.round, "label": round_name(r), "status": r.status,
                    "created_at": r.created_at.isoformat()} for r in all_rounds],
        "round": {"rectification_id": rect.id, "round": rect.round, "label": round_name(rect), "status": rect.status,
                  "latest": all_rounds[-1].id == rect.id, "issued_at": (letter.finalised_at if letter else rect.created_at).isoformat(),
                  "responded_at": rect.responded_at.isoformat() if rect.responded_at else None,
                  "letter_id": letter.id if letter else None, "respond_by": due, "days_left": left,
                  "past_due": left is not None and left < 0 and rect.status == "open"},
        "can_post": may, "closed_reason": why, "can_set_status": user.role in ("officer", "admin") and may,
        "counts": {"awaiting_reply": sum(1 for t in threads if t["awaiting_reply"]),
                   "pending_reviews": sum(1 for t in threads if t["pending_review"]),
                   "pending_reviews_all_rounds": len(pending_reviews(db, app)) if official else None},
        "threads": threads,
    }


# ------------------------------------------------------------------ writing


def check_attachment(name: str, data: bytes) -> str:
    """Media type of an attachment from its magic bytes; anything but a PDF, JPG or PNG within the size limit is refused."""
    limit_mb = get_settings().max_upload_mb
    if not data:
        raise HTTPException(422, "The attachment is empty.")
    if len(data) > limit_mb * 1024 * 1024:
        raise HTTPException(422, f"The attachment is larger than {limit_mb} MB.")
    match = next(((mime, exts) for magic, mime, exts in ATTACHMENT_TYPES if data.startswith(magic)), None)
    if match is None:
        raise HTTPException(422, "Attach a PDF, JPG or PNG file. This file's contents are not one of those types.")
    ext = PurePath(name).suffix.lower()
    if ext not in match[1]:
        raise HTTPException(422, f"The file's contents do not match its extension ({ext or 'none'}). "
                                 "Save it again as a PDF, JPG or PNG.")
    return match[0]


def _safe_name(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", name.rsplit("/", 1)[-1].rsplit("\\", 1)[-1])[:120]
    return base or "attachment"


def _item_params(rect: RectificationRequest, t: RectThread) -> dict[str, Any]:
    w = where(t.item_no)
    return {"round_label": round_name(rect), "item_no": t.item_no, "item_title": t.title, "where": w,
            "where_cap": w[0].upper() + w[1:]}


def _change_status(db: Session, t: RectThread, to: str, user: User, side: str, *, note: str | None = None,
                   message_id: str | None = None) -> RectStatusChange:
    c = RectStatusChange(thread_id=t.id, application_id=t.application_id, side=side, from_status=t.status,
                         to_status=to, note=note, actor_id=user.id, message_id=message_id)
    db.add(c)
    db.flush()
    audit.record(db, actor=user.username, actor_role=user.role, action="rectification.item_status_changed",
                 object_type="rect_thread", object_id=t.id, application_id=t.application_id,
                 details={"rectification_id": t.rectification_id, "item_no": t.item_no, "from": t.status, "to": to,
                          "by": "message" if message_id else side, "message_id": message_id,
                          "note_sha256": _sha(note) if note else None})
    t.status = to
    if side == "cell":
        t.status_note, t.status_by, t.status_at = note, user.id, c.created_at
    return c


def post_message(db: Session, user: User, app: Application, t: RectThread, kind: str | None, body: str,
                 attachment: tuple[str, bytes] | None = None) -> RectMessage:
    from ..ratelimit import limit

    rect = db.get(RectificationRequest, t.rectification_id)
    side = "institution" if user.role == "institution" else "cell"
    kind = kind or ("reply" if side == "institution" else CELL_KIND)
    if side == "institution" and kind not in INSTITUTION_KINDS:
        raise HTTPException(400, f"kind must be one of {list(INSTITUTION_KINDS)}")
    if side == "cell" and kind != CELL_KIND:
        raise HTTPException(400, f"officials post kind '{CELL_KIND}'")
    may, why = institution_may_post(db, app, rect) if side == "institution" else cell_may_post(app)
    if not may:
        raise HTTPException(409, why)
    text = _clean(body)
    if not text:
        raise HTTPException(400, "Write a message.")
    if len(text) > MAX_BODY:
        raise HTTPException(400, f"A message has at most {MAX_BODY} characters.")
    if kind == "review_request":
        if t.item_no == 0:
            raise HTTPException(400, "A review request is about one item of the letter; open that item to ask.")
        if t.status == "resolved":
            raise HTTPException(409, "This item is resolved, so there is nothing to review. Write a reply if "
                                     "something is still unclear.")
        if len(text) < MIN_REASON:
            raise HTTPException(400, "Give your reason in a sentence or two.")
    if side == "cell" and FORBIDDEN_WORDS.search(text):
        raise HTTPException(400, "Describe the issue neutrally (for example 'could not be confirmed') instead of "
                                 "judging the document.")
    limit(f"rect-post:{user.id}", conversation_settings().thread_posts_per_minute, 60)

    m = RectMessage(thread_id=t.id, application_id=app.id, side=side, author_id=user.id, kind=kind, body=text)
    if attachment is not None:
        name, data = attachment
        m.attachment_mime = check_attachment(name, data)
        m.attachment_name, m.attachment_size = _safe_name(name), len(data)
        m.attachment_sha256 = hashlib.sha256(data).hexdigest()
        m.attachment_storage = f"msg_{uuid.uuid4().hex}.bin"
        store_document(m.attachment_storage, data)
    db.add(m)
    db.flush()
    t.last_activity_at = m.created_at
    audit.record(db, actor=user.username, actor_role=user.role, action="rectification.message_posted",
                 object_type="rect_message", object_id=m.id, application_id=app.id,
                 details={"rectification_id": rect.id, "thread_id": t.id, "item_no": t.item_no, "kind": kind,
                          "side": side, "body_sha256": _sha(text), "chars": len(text),
                          "attachment": {"sha256": m.attachment_sha256, "size": m.attachment_size,
                                         "mime": m.attachment_mime} if m.attachment_storage else None})
    if t.item_no and kind == "reply" and t.status in ("open", "still_open"):
        _change_status(db, t, "responded", user, side, message_id=m.id)
    elif kind == "review_request" and t.status != "review_requested":
        _change_status(db, t, "review_requested", user, side, message_id=m.id)

    params = _item_params(rect, t)
    key = {"reply": "rect.institution_reply", "question": "rect.institution_question",
           "review_request": "rect.review_requested", CELL_KIND: "rect.cell_reply"}[kind]
    notify.notify(db, key, app, params, thread_id=t.id)
    return m


def set_status(db: Session, user: User, app: Application, t: RectThread, status: str, note: str) -> RectStatusChange:
    from ..ratelimit import limit

    if status not in OFFICIAL_STATUSES:
        raise HTTPException(400, f"status must be one of {list(OFFICIAL_STATUSES)}")
    if t.item_no == 0:
        raise HTTPException(400, "The general thread has no status; set it on an item.")
    may, why = cell_may_post(app)
    if not may:
        raise HTTPException(409, why)
    text = _clean(note)
    if len(text) < 3:
        raise HTTPException(400, "Add a short note the institution can read.")
    if len(text) > 1000:
        raise HTTPException(400, "A note has at most 1000 characters.")
    if FORBIDDEN_WORDS.search(text):
        raise HTTPException(400, "Describe the issue neutrally (for example 'could not be confirmed') instead of "
                                 "judging the document.")
    limit(f"rect-post:{user.id}", conversation_settings().thread_posts_per_minute, 60)
    rect = db.get(RectificationRequest, t.rectification_id)
    c = _change_status(db, t, status, user, "cell", note=text)
    t.last_activity_at = c.created_at
    notify.notify(db, "rect.status_changed", app, {**_item_params(rect, t), "status_label": STATUS_WORDS[status]},
                  thread_id=t.id)
    return c


# ------------------------------------------------------------------ queue, reminders and the outcome


def awaiting(db: Session) -> dict[str, Any]:
    """Threads where the institution wrote last, across every application still open, for the review queue."""
    items = []
    pending = 0
    ts = db.scalars(select(RectThread)).all()
    msgs, changes = _activity(db, [t.id for t in ts])
    for t in ts:
        if not awaiting_cell(msgs[t.id], changes[t.id]) and not pending_review(msgs[t.id], changes[t.id]):
            continue
        app = db.get(Application, t.application_id)
        if app is None or app.status in CLOSED_APP:
            continue
        rect = db.get(RectificationRequest, t.rectification_id)
        last = next(m for m in reversed(msgs[t.id]) if m.side == "institution")
        review = pending_review(msgs[t.id], changes[t.id])
        pending += review
        items.append({"application_id": app.id, "institution": app.institution.name, "thread_id": t.id,
                      "rectification_id": rect.id, "round_label": round_name(rect), "item_no": t.item_no,
                      "title": t.title, "kind": "review_request" if review else last.kind,
                      "pending_review": review, "last_at": last.created_at.isoformat()})
    # Review requests first: they hold up the outcome
    items.sort(key=lambda i: (not i["pending_review"], i["last_at"]))
    return {"awaiting": len(items), "pending_reviews": pending, "items": items}


def deadline_sweep(db: Session, institution_id: str | None = None, today: date | None = None) -> int:
    """One reminder per open round and response date once it is a few days away; runs when the portal or the queue
    loads, and never twice for the same round and date. The caller commits."""
    days = conversation_settings().deadline_notice_days
    q = select(RectificationRequest).where(RectificationRequest.status == "open")
    made = 0
    for rect in db.scalars(q):
        app = db.get(Application, rect.application_id)
        if app is None or app.status in CLOSED_APP or (institution_id and app.institution_id != institution_id):
            continue
        letter = final_letter(db, rect)
        if letter is None:
            continue
        due = round_due([{"respond_by": i.get("respond_by")} for i in letter.items])
        left = days_left(due, today)
        if left is None or left > days:
            continue
        phrase = ("was due on " + date.fromisoformat(due).strftime("%d %b %Y").lstrip("0") if left < 0
                  else "due today" if left == 0 else "due tomorrow" if left == 1 else f"due in {left} days")
        made += notify.notify(db, "rect.deadline_soon", app,
                              {"round_label": round_name(rect), "respond_by": date.fromisoformat(due).strftime("%d %b %Y").lstrip("0"),
                               "days_left": left, "due_phrase": phrase},
                              show="letter", dedupe=f"deadline:{rect.id}:{due}")
    return made


def outcome_view(db: Session, app: Application, official: bool) -> dict[str, Any] | None:
    """The recorded scrutiny outcome with the official's written reasons, and a neutral next step."""
    out = current_outcome(db, app.id)
    if out is None:
        return None
    view = {"outcome": out.outcome, "label": OUTCOMES.get(out.outcome, out.outcome), "reasons": out.reason,
            "recorded_at": out.created_at.isoformat(), "round": out.round, "round_label": round_label(out.round),
            "what_next": WHAT_NEXT.get(out.outcome, DEFAULT_NEXT)}
    if official:
        actor = db.get(User, out.actor_id)
        view["recorded_by"] = actor.display_name if actor else None
    return view


def notify_round_opened(db: Session, app: Application, rect: RectificationRequest, letter: DeficiencyLetter | None) -> int:
    """The institution hears that a round opened: with the letter's item count and date, or the request's items."""
    items = letter.items if letter else rect.items
    n = len(items)
    params = {"round_label": round_name(rect), "item_count": f"{n} item{'' if n == 1 else 's'}"}
    if letter:
        due = round_due([{"respond_by": i.get("respond_by")} for i in letter.items])
        params["respond_by"] = date.fromisoformat(due).strftime("%d %b %Y").lstrip("0") if due else "the date in the letter"
        return notify.notify(db, "rect.letter_finalised", app, params, show="letter")
    return notify.notify(db, "rect.requested", app, params, show="letter")
