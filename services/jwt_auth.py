"""
JWT token creation, verification, and FastAPI dependency for authenticated routes.

Env vars:
  WTP_JWT_SECRET          - HMAC signing key (REQUIRED in production)
  WTP_TOKEN_EXPIRY_HOURS  - Access token lifetime in hours (default: 24)
  WTP_REFRESH_EXPIRY_DAYS - Refresh token lifetime in days (default: 30)

Usage:
  from services.jwt_auth import get_current_user, get_optional_user
  @router.get("/me")
  def me(user = Depends(get_current_user)): ...
"""

import os
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from models.database import get_db
from models.auth_models import User, RevokedToken

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SECRET_KEY = os.getenv("WTP_JWT_SECRET", "")
if not SECRET_KEY:
    raise RuntimeError(
        "WTP_JWT_SECRET env var is not set. "
        "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("WTP_TOKEN_EXPIRY_HOURS", "24"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("WTP_REFRESH_EXPIRY_DAYS", "30"))

# tokenUrl points at the login endpoint so Swagger UI works automatically
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

# Cross-subdomain session cookie name. The login endpoint sets this with
# Domain=.wethepeopleforus.com so journal/research/verify subdomains
# share auth state with the core site without each rebuilding their own
# AuthContext.
SESSION_COOKIE_NAME = os.getenv("WTP_SESSION_COOKIE", "wtp_session")
# Cross-subdomain cookie domain. Empty in dev so the cookie scopes to
# the actual host (localhost). Set WTP_COOKIE_DOMAIN=.wethepeopleforus.com
# in prod.
SESSION_COOKIE_DOMAIN = os.getenv("WTP_COOKIE_DOMAIN", "")


def _resolve_token_from_request(
    header_token: Optional[str],
    request: Optional[Request],
) -> Optional[str]:
    """Pick a JWT from the Authorization header first, falling back to
    the cross-subdomain session cookie. Sibling sites (journal /
    research / verify) don't have their own JWT-in-localStorage
    machinery; the cookie is the only handoff."""
    if header_token:
        return header_token
    if request is None:
        return None
    return request.cookies.get(SESSION_COOKIE_NAME)


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token.

    ``data`` must include at minimum ``{"sub": "<user_email>"}``.
    Additional claims (``role``, ``user_id``) are recommended.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a longer-lived refresh token (used to obtain new access tokens).

    Includes a unique ``jti`` claim so the token can be revoked individually
    without invalidating every refresh token the user holds.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "jti": uuid.uuid4().hex,
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


PASSWORD_RESET_TTL_MINUTES = 30


def create_password_reset_token(user_id: int, email: str) -> str:
    """Mint a short-lived JWT used to verify a password-reset request.

    The token carries a `purpose="password_reset"` claim so the consumer
    on /auth/reset-password can refuse access tokens / refresh tokens
    accidentally posted to it. 30-minute TTL — long enough for a slow
    email flow, short enough that a leaked reset link is mostly harmless.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_TTL_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "purpose": "password_reset",
        "exp": expire,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_password_reset_token(token: str) -> dict:
    """Decode + validate a password-reset token. Raises HTTPException(401)
    on invalid signature, expiry, or wrong purpose."""
    payload = verify_token(token)
    if payload.get("purpose") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return payload


def verify_token(token: str) -> dict:
    """Decode and validate a JWT.  Returns the payload dict or raises.

    Note: refresh-token revocation is checked separately by callers that have
    a DB session — see ``is_refresh_token_revoked``. This function only
    verifies the JWT's signature and expiry.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        # Don't include the underlying jose error in the response — it leaks
        # implementation details ("Signature verification failed",
        # "Not enough segments", etc.) useful for algo-confusion probing.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def is_refresh_token_revoked(payload: dict, db: Session) -> bool:
    """Return True if the refresh token's jti has been revoked."""
    jti = payload.get("jti")
    if not jti:
        # Older tokens issued before jti tracking was added — treat as
        # non-revocable (they expire on their own within 30 days).
        return False
    return (
        db.query(RevokedToken.id)
        .filter(RevokedToken.jti == jti)
        .first()
        is not None
    )


def revoke_refresh_token(payload: dict, db: Session, reason: str = "logout") -> None:
    """Insert the refresh token's jti into the revocation list.

    Idempotent — safely no-ops if the jti is already revoked or the token
    lacks a jti claim (older issuance).
    """
    jti = payload.get("jti")
    if not jti:
        return
    if db.query(RevokedToken.id).filter(RevokedToken.jti == jti).first():
        return
    exp = payload.get("exp")
    if isinstance(exp, (int, float)):
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
    else:
        expires_at = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    user_sub = payload.get("user_id")
    db.add(RevokedToken(
        jti=jti,
        user_id=user_sub if isinstance(user_sub, int) else None,
        expires_at=expires_at,
        reason=reason[:50],
    ))
    db.commit()


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Require a valid JWT and return the associated User row.

    Token can come from the Authorization header (the historical
    behavior) or from the `wtp_session` cross-subdomain cookie (added
    so sibling sites can authenticate without rebuilding the
    JWT-in-localStorage flow). Raises 401 if the token is missing,
    expired, or the user is inactive.
    """
    token = _resolve_token_from_request(token, request)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = verify_token(token)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type — use an access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email: Optional[str] = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_optional_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Return the authenticated User if a valid token is present, else None.

    Use this for endpoints that work for anonymous users but provide extra
    features when authenticated. Falls back to the cross-subdomain
    cookie if no Authorization header is present.
    """
    token = _resolve_token_from_request(token, request)
    if token is None:
        return None

    try:
        payload = verify_token(token)
    except HTTPException:
        return None

    if payload.get("type") != "access":
        return None

    email = payload.get("sub")
    if not email:
        return None

    user = db.query(User).filter(User.email == email).first()
    if user is None or not user.is_active:
        return None

    return user
