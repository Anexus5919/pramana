"""Login throttling per client address and per username, with each lockout recorded in the audit trail.

Counters live in memory (pramana.ratelimit), so they reset when the server restarts and are per process; a
deployment with several server processes needs a shared store. A username lockout also stops the right
password until the window passes, which is the point, and is why the window is short.
"""

import time

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from . import audit, ratelimit
from .config import get_settings

_noted: dict[str, float] = {}


def client_ip(request: Request) -> str:
    # Behind a reverse proxy run uvicorn with --proxy-headers so this is the real client address
    return request.client.host if request.client else "unknown"


def _user_key(username: str) -> str:
    return f"login-fail:user:{username.strip().lower()[:80]}"


def _lockout(db: Session, scope: str, ip: str, username: str, retry: int) -> None:
    """Audit the first refused attempt of each lockout, not every one, so a flood cannot bloat the chain."""
    s = get_settings()
    key = f"{scope}:{ip if scope == 'ip' else username.strip().lower()}"
    now = time.monotonic()
    if _noted.get(key, 0) > now:
        return
    _noted[key] = now + retry
    audit.record(db, actor=username[:80] or "unknown", actor_role="anonymous", action="auth.locked_out",
                 object_type="user", details={"scope": scope, "ip": ip, "retry_after_s": retry,
                                              "window_s": s.login_window_s,
                                              "limit": s.login_max_per_ip if scope == "ip" else
                                              s.login_max_failures_per_user})
    db.commit()


def check(db: Session, request: Request, username: str) -> None:
    """Call before checking the password; raises 429 while the address or the username is locked out."""
    s = get_settings()
    ip = client_ip(request)
    try:
        ratelimit.limit(f"login:ip:{ip}", s.login_max_per_ip, s.login_window_s)
    except HTTPException as e:
        _lockout(db, "ip", ip, username, int(e.headers.get("Retry-After", s.login_window_s)))
        raise
    key = _user_key(username)
    if ratelimit.count(key, s.login_window_s) >= s.login_max_failures_per_user:
        retry = ratelimit.retry_after(key, s.login_window_s)
        _lockout(db, "username", ip, username, retry)
        raise HTTPException(429, "Too many failed sign-ins for this account. Try again later.",
                            headers={"Retry-After": str(retry)})


def failed(username: str) -> None:
    ratelimit.hit(_user_key(username))


def succeeded(username: str) -> None:
    ratelimit.clear(_user_key(username))


def reset() -> None:
    ratelimit.reset()
    _noted.clear()
