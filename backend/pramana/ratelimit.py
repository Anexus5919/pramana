import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def limit(key: str, max_hits: int, window_s: float) -> None:
    """Sliding-window limit per key; raises 429 with Retry-After once max_hits is reached inside window_s."""
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= max_hits:
            retry = int(window_s - (now - q[0])) + 1
            raise HTTPException(429, "Too many attempts. Try again shortly.", headers={"Retry-After": str(retry)})
        q.append(now)


def reset() -> None:
    with _lock:
        _hits.clear()
