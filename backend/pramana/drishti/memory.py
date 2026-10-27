"""Conversation memory: the last 10 turns per conversation, in memory, scoped to one user, gone after 30 idle minutes.

A turn keeps the validated intent and the items of its answer, never the message text. Like the rate limiter it is
per process and resets on restart.
"""

import secrets
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

MAX_TURNS = 10
IDLE_S = 30 * 60
MAX_CONVERSATIONS = 5000
DATA_INTENTS = {"count_applications", "list_applications", "list_decisions", "list_findings", "expiring_certificates",
                "awaiting_confirmation", "application_summary"}

_clock: Callable[[], float] = time.monotonic
_lock = threading.Lock()


@dataclass
class Turn:
    intent: dict[str, Any]
    items: list[dict[str, Any]]


@dataclass
class Conversation:
    id: str
    user_id: str
    touched: float
    turns: deque[Turn] = field(default_factory=lambda: deque(maxlen=MAX_TURNS))

    def last_data(self) -> Turn | None:
        """The latest turn a follow-up can refine: a question about records."""
        return next((t for t in reversed(self.turns) if t.intent.get("intent") in DATA_INTENTS), None)

    def last_items(self) -> list[dict[str, Any]]:
        """Items of the latest answer that listed records, for "open the first one"."""
        for t in reversed(self.turns):
            if t.items and t.intent.get("intent") != "navigate":
                return t.items
        return []


_store: dict[str, Conversation] = {}


def set_clock(fn: Callable[[], float] | None) -> None:
    global _clock
    _clock = fn or time.monotonic


def _expired(c: Conversation, now: float) -> bool:
    return now - c.touched > IDLE_S


def get(conversation_id: str | None, user_id: str) -> Conversation | None:
    """The user's live conversation, or None when it is unknown, expired or someone else's."""
    if not conversation_id:
        return None
    now = _clock()
    with _lock:
        c = _store.get(conversation_id)
        if c is None or c.user_id != user_id:
            return None
        if _expired(c, now):
            _store.pop(conversation_id, None)
            return None
        c.touched = now
        return c


def start(user_id: str) -> Conversation:
    now = _clock()
    with _lock:
        if len(_store) >= MAX_CONVERSATIONS:
            for k in [k for k, c in _store.items() if _expired(c, now)]:
                del _store[k]
            if len(_store) >= MAX_CONVERSATIONS:
                del _store[min(_store, key=lambda k: _store[k].touched)]
        c = Conversation(id=f"c_{secrets.token_urlsafe(12)}", user_id=user_id, touched=now)
        _store[c.id] = c
        return c


def remember(c: Conversation, intent: dict[str, Any], items: list[dict[str, Any]]) -> None:
    with _lock:
        c.turns.append(Turn(intent=intent, items=items))
        c.touched = _clock()


def reset() -> None:
    with _lock:
        _store.clear()
