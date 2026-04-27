"""
Role-Based Access Control (RBAC) for WeThePeople.

Role hierarchy:  free < pro < enterprise < admin
Scope system:    read, write, verify, chat, admin

Usage:
  from services.rbac import require_role, require_scope

  @router.post("/admin/users")
  def admin_users(user = Depends(require_role("admin"))): ...

  @router.post("/verify")
  def verify(user = Depends(require_scope("verify"))): ...
"""

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.orm import Session

from models.database import get_db
from models.auth_models import User, APIKeyRecord
from services.jwt_auth import get_current_user, get_optional_user

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Role hierarchy
# ---------------------------------------------------------------------------

ROLE_HIERARCHY = {
    "free": 0,
    "student": 1,    # .edu users — same hierarchy slot as paid-but-cheap
    "pro": 2,        # journalists / independent researchers
    "newsroom": 3,   # team plan, pooled quota
    "enterprise": 4, # unlimited + SLA
    "admin": 5,
}

VALID_SCOPES = {"read", "write", "verify", "chat", "admin"}


def _role_level(role: str) -> int:
    return ROLE_HIERARCHY.get(role, -1)


# ---------------------------------------------------------------------------
# API key resolution
# ---------------------------------------------------------------------------

def _hash_api_key(raw_key: str) -> str:
    """SHA-256 hash used to look up API keys in the database."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def resolve_api_key(
    key: str,
    db: Session,
) -> Optional[User]:
    """Look up a raw API key, return the owning User or None.

    Checks both:
      1. APIKeyRecord table (new system)
      2. User.api_key column (legacy flat key)
    """
    if not key:
        return None

    key_hash = _hash_api_key(key)

    # 1. New API key records
    record = (
        db.query(APIKeyRecord)
        .filter(APIKeyRecord.key_hash == key_hash, APIKeyRecord.is_active == 1)
        .first()
    )
    if record:
        # Check expiry
        if record.expires_at and record.expires_at < datetime.now(timezone.utc):
            return None
        user = db.query(User).filter(User.id == record.user_id, User.is_active == 1).first()
        return user

    # 2. Legacy flat api_key on User row (deprecated — disable with WTP_DISABLE_LEGACY_KEYS=1)
    if os.getenv("WTP_DISABLE_LEGACY_KEYS", "0") == "1":
        return None
    candidates = db.query(User).filter(User.api_key.isnot(None), User.is_active == 1).all()
    for candidate in candidates:
        if candidate.api_key and hmac.compare_digest(candidate.api_key, key):
            logger.warning(
                "Legacy plaintext API key matched for user_id=%s — migrate to hashed APIKeyRecord",
                candidate.id,
            )
            return candidate
    return None


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

def require_role(minimum_role: str):
    """Return a FastAPI dependency that enforces a minimum role level.

    Example::

        @router.get("/admin/stats")
        def admin_stats(user = Depends(require_role("admin"))): ...
    """
    min_level = _role_level(minimum_role)
    if min_level < 0:
        raise ValueError(f"Unknown role: {minimum_role}")

    def _dependency(user: User = Depends(get_current_user)) -> User:
        user_level = _role_level(user.role)
        if user_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role '{minimum_role}' or higher (you have '{user.role}')",
            )
        return user

    return _dependency


def require_scope(scope: str):
    """Return a FastAPI dependency that checks an API key carries a given scope.

    Falls back to JWT auth if no API key header is provided.  JWT-authed users
    with role >= pro automatically satisfy any non-admin scope.

    Example::

        @router.post("/verify")
        def verify(user = Depends(require_scope("verify"))): ...
    """
    if scope not in VALID_SCOPES:
        raise ValueError(f"Unknown scope: {scope}")

    def _dependency(
        x_wtp_api_key: str = Header(default=""),
        user: Optional[User] = Depends(get_optional_user),
        db: Session = Depends(get_db),
    ) -> User:
        # --- Path 1: API key header ---
        if x_wtp_api_key:
            key_hash = _hash_api_key(x_wtp_api_key)
            record = (
                db.query(APIKeyRecord)
                .filter(APIKeyRecord.key_hash == key_hash, APIKeyRecord.is_active == 1)
                .first()
            )
            if record:
                if record.expires_at and record.expires_at < datetime.now(timezone.utc):
                    raise HTTPException(status_code=401, detail="API key expired")

                try:
                    scopes = json.loads(record.scopes) if isinstance(record.scopes, str) else record.scopes
                except (json.JSONDecodeError, TypeError):
                    scopes = []

                if scope not in scopes and "admin" not in scopes:
                    raise HTTPException(
                        status_code=403,
                        detail=f"API key lacks required scope '{scope}'",
                    )

                owner = db.query(User).filter(User.id == record.user_id, User.is_active == 1).first()
                if not owner:
                    raise HTTPException(status_code=401, detail="API key owner not found")
                return owner

        # --- Path 2: JWT bearer token ---
        if user:
            # Admins can do anything
            if user.role == "admin":
                return user
            # Pro/enterprise users get all non-admin scopes automatically
            if scope != "admin" and _role_level(user.role) >= _role_level("pro"):
                return user
            # Free users only get 'read' and 'chat' scopes via JWT
            if scope in ("read", "chat"):
                return user
            raise HTTPException(
                status_code=403,
                detail=f"Your role '{user.role}' does not grant the '{scope}' scope",
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required (JWT bearer token or X-WTP-API-KEY header)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _dependency


# ---------------------------------------------------------------------------
# Rate limit multipliers by role
# ---------------------------------------------------------------------------

ROLE_RATE_LIMITS = {
    "free": 5,          # 5 verifications per day (logged-in only)
    "student": 50,      # 50/day — .edu users, $5/mo
    "pro": 200,         # 200/day — journalists, $19/mo
    "newsroom": 1000,   # 1000/day pooled across seats, $99/mo
    "enterprise": 0,    # unlimited
    "admin": 0,         # unlimited
}


# Display metadata for each tier — single source of truth so the API,
# pricing page, and account-management UI never drift on numbers.
TIER_DISPLAY = {
    "free": {
        "label": "Free",
        "daily_limit": 5,
        "monthly_price_cents": 0,
        "annual_price_cents": 0,
        "audience": "Casual users",
        "features": [
            "5 verifications per day",
            "Full read access to all civic data",
            "Public stories + research tools",
        ],
    },
    "student": {
        "label": "Student",
        "daily_limit": 50,
        "monthly_price_cents": 500,
        "annual_price_cents": 5000,
        "audience": ".edu users — academic + journalism school",
        "features": [
            "50 verifications per day",
            "Same engine as Pro",
            "Cancel anytime",
            "Requires .edu email",
        ],
    },
    "pro": {
        "label": "Pro / Journalist",
        "daily_limit": 200,
        "monthly_price_cents": 1900,
        "annual_price_cents": 19000,
        "audience": "Independent journalists, podcasters, substack writers",
        "features": [
            "200 verifications per day",
            "Priority queue",
            "API key with verify scope",
            "Email support",
        ],
    },
    "newsroom": {
        "label": "Newsroom",
        "daily_limit": 1000,
        "monthly_price_cents": 9900,
        "annual_price_cents": 99000,
        "audience": "Local + regional newsrooms (up to 5 seats)",
        "features": [
            "1,000 verifications per day pooled across team",
            "Up to 5 seats",
            "Priority support",
            "Custom onboarding",
        ],
    },
    "enterprise": {
        "label": "Enterprise",
        "daily_limit": 0,
        "monthly_price_cents": 99900,
        "annual_price_cents": None,
        "audience": "National outlets, foundations, government",
        "features": [
            "Unlimited verifications",
            "SLA + dedicated support",
            "Custom integrations",
            "Single sign-on",
        ],
    },
}


def get_daily_limit(role: str) -> int:
    """Return the daily request limit for a role.  0 means unlimited."""
    return ROLE_RATE_LIMITS.get(role, 5)
