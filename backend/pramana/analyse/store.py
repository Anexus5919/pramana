"""Short-lived holding of an analysed file, for page images and the revision time machine.

Nothing is written to disk. The bytes and any page renders stay in this process's memory, are served only
to the official who uploaded the file, and are dropped after TTL_S, when the official forgets the file, or
earliest first once MAX_ENTRIES or MAX_BYTES is reached.
"""

import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

TTL_S = 15 * 60
MAX_ENTRIES = 8
MAX_BYTES = 160 * 1024 * 1024


@dataclass
class Held:
    user_id: str
    data: bytes
    mime: str
    page_count: int
    ends: list[int]
    expires: float
    renders: dict[str, bytes] = field(default_factory=dict)

    def size(self) -> int:
        return len(self.data) + sum(len(v) for v in self.renders.values())


_items: dict[str, Held] = {}
_lock = threading.Lock()


def new_token() -> str:
    return "an-" + secrets.token_hex(12)


def _purge(now: float) -> None:
    for k in [k for k, v in _items.items() if v.expires <= now]:
        del _items[k]
    while _items and (len(_items) > MAX_ENTRIES or sum(v.size() for v in _items.values()) > MAX_BYTES):
        del _items[min(_items, key=lambda k: _items[k].expires)]


def put(token: str, user_id: str, data: bytes, mime: str, page_count: int, ends: list[int]) -> str:
    """Hold the file and return when it expires, as an ISO timestamp."""
    now = time.monotonic()
    with _lock:
        _items[token] = Held(user_id, data, mime, page_count, ends, now + TTL_S)
        _purge(now)
    return (datetime.now(UTC) + timedelta(seconds=TTL_S)).isoformat()


def get(token: str, user_id: str) -> Held | None:
    with _lock:
        _purge(time.monotonic())
        h = _items.get(token)
        return h if h and h.user_id == user_id else None


def keep_render(token: str, key: str, png: bytes) -> None:
    with _lock:
        h = _items.get(token)
        if h:
            h.renders[key] = png
            _purge(time.monotonic())


def drop(token: str, user_id: str) -> bool:
    with _lock:
        h = _items.get(token)
        if not h or h.user_id != user_id:
            return False
        del _items[token]
        return True


def held_count() -> int:
    with _lock:
        _purge(time.monotonic())
        return len(_items)


def clear() -> None:
    with _lock:
        _items.clear()
