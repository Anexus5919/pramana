"""Server-side sessions in httpOnly cookies, role checks and object-level access control."""

import hashlib
import secrets
from datetime import UTC, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import Application, AuthSession, User, utcnow

COOKIE = "pramana_session"
CSRF_HEADER = "x-csrf-token"

ROLES = {
    "institution": "Institution applicant",
    "officer": "AICTE scrutiny officer",
    "verifier": "Verification cell",
    "admin": "Administrator / auditor",
}
OFFICIAL_ROLES = {"officer", "verifier", "admin"}

_ph = PasswordHasher()


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def check_password(stored: str, pw: str) -> bool:
    try:
        return _ph.verify(stored, pw)
    except VerifyMismatchError:
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Session, user: User, response: Response) -> AuthSession:
    token = secrets.token_urlsafe(32)
    s = get_settings()
    sess = AuthSession(
        token_hash=_token_hash(token),
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(24),
        expires_at=utcnow() + timedelta(minutes=s.session_ttl_minutes),
    )
    db.add(sess)
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="strict", secure=s.cookie_secure, max_age=s.session_ttl_minutes * 60
    )
    return sess


def end_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        sess = db.get(AuthSession, _token_hash(token))
        if sess:
            db.delete(sess)
    response.delete_cookie(COOKIE)


def current_session(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not signed in")
    sess = db.get(AuthSession, _token_hash(token))
    if not sess:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session expired")
    exp = sess.expires_at if sess.expires_at.tzinfo else sess.expires_at.replace(tzinfo=UTC)
    if exp < utcnow():
        db.delete(sess)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "session expired")
    # Unsafe methods must echo the CSRF token, which a cross-site page cannot read
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        sent = request.headers.get(CSRF_HEADER, "")
        if not secrets.compare_digest(sent, sess.csrf_token):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "missing or invalid CSRF token")
    return sess


def current_user(sess: AuthSession = Depends(current_session), db: Session = Depends(get_db)) -> User:
    user = db.get(User, sess.user_id)
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "account disabled")
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"requires role: {', '.join(roles)}")
        return user

    return dep


def can_access_application(user: User, app: Application) -> bool:
    if user.role in OFFICIAL_ROLES:
        return True
    return user.role == "institution" and user.institution_id == app.institution_id


def load_application(db: Session, user: User, app_id: str) -> Application:
    """Fetch an application with object-level authorization; institutions only see their own."""
    app = db.get(Application, app_id)
    if not app or not can_access_application(user, app):
        # 404 rather than 403 so other institutions' application IDs are not confirmed to exist
        raise HTTPException(status.HTTP_404_NOT_FOUND, "application not found")
    return app
