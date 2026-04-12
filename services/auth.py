"""Env-driven API key gating for PRESS and ENTERPRISE tier endpoints.

Backward-compatible with the original flat API key system AND the new
JWT + per-user API key system.

Env vars:
  WTP_REQUIRE_AUTH      -- "1" to enforce auth; default "0" (dev mode, all open).
  WTP_PRESS_API_KEY     -- required when WTP_REQUIRE_AUTH=1.
  WTP_ENTERPRISE_API_KEY -- optional key for unlimited claims access.

Usage in FastAPI:
  from services.auth import require_press_key, require_enterprise_or_rate_limit
  press_router = APIRouter(dependencies=[Depends(require_press_key)])
"""

import os
import hmac
from typing import Optional

from fastapi import Header, HTTPException, Query, Request, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from services.rate_limit_store import check_rate_limit

_CLAIMS_FREE_LIMIT = int(os.getenv("WTP_CLAIMS_FREE_LIMIT", "5"))  # per day per IP
_CLAIMS_WINDOW = 86400  # 24 hours


def _require_auth() -> bool:
    env = os.getenv("WTP_ENV", "production").lower()
    # Default to requiring auth in production/staging; opt-in to disable in dev
    default = "0" if env == "development" else "1"
    return os.getenv("WTP_REQUIRE_AUTH", default) == "1"


def _press_api_key() -> str:
    return os.getenv("WTP_PRESS_API_KEY", "")


def require_press_key(
    x_wtp_api_key: str = Header(default=""),
    key: str = Query(default=""),
) -> None:
    """FastAPI dependency -- raises 401 if auth is required and key is wrong/missing.

    Accepts either the X-WTP-API-Key header (preferred) or a `?key=` query
    parameter. The query parameter is used by the Gate 5 review-queue email
    so reviewers can approve/reject with a single click from their inbox.
    """
    if not _require_auth():
        return  # dev mode -- allow everything

    expected = _press_api_key()
    if not expected:
        # Fail closed: if auth required but no key configured, block all PRESS requests.
        raise HTTPException(status_code=401, detail="unauthorized")

    # Either source is acceptable; header wins when both are present.
    provided = x_wtp_api_key or key
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


# ---------------------------------------------------------------------------
# Enterprise tier + free rate limiting for claims endpoints
# ---------------------------------------------------------------------------


def _check_legacy_enterprise_key(api_key: str) -> bool:
    """Check if the key matches the legacy WTP_ENTERPRISE_API_KEY env var."""
    enterprise_key = os.getenv("WTP_ENTERPRISE_API_KEY", "")
    return bool(enterprise_key and api_key and hmac.compare_digest(api_key, enterprise_key))


def _check_legacy_press_key(api_key: str) -> bool:
    """Check if the key matches the legacy WTP_PRESS_API_KEY env var."""
    press_key = _press_api_key()
    return bool(press_key and api_key and hmac.compare_digest(api_key, press_key))


def _resolve_new_system_user(api_key: str, db: Session) -> Optional[dict]:
    """Try to resolve the key via the new JWT/API-key system.

    Returns {"tier": ..., "role": ...} or None if the key doesn't match.
    """
    try:
        from services.rbac import resolve_api_key, ROLE_RATE_LIMITS
        user = resolve_api_key(api_key, db)
        if user:
            limit = ROLE_RATE_LIMITS.get(user.role, 5)
            tier = "enterprise" if limit == 0 else user.role
            return {"tier": tier, "role": user.role, "user_id": user.id}
    except Exception:
        pass
    return None


def require_enterprise_or_rate_limit(
    request: Request,
    x_wtp_api_key: str = Header(default=""),
    db: Session = Depends(get_db),
) -> dict:
    """
    Allow free users with rate limit (5/day by IP) or enterprise key for unlimited.

    Checks in order:
      1. Legacy WTP_ENTERPRISE_API_KEY env var
      2. New per-user API key system (role-based limits)
      3. Legacy WTP_PRESS_API_KEY (treated as pro tier)
      4. Anonymous IP-based rate limiting (persistent SQLite store)

    Returns:
        {"tier": "enterprise"|"pro"|"free", "rate_limited": bool}
    """

    # --- 1. Legacy enterprise key ---
    if _check_legacy_enterprise_key(x_wtp_api_key):
        return {"tier": "enterprise", "rate_limited": False}

    # --- 2. New API key system ---
    if x_wtp_api_key:
        result = _resolve_new_system_user(x_wtp_api_key, db)
        if result:
            from services.rbac import get_daily_limit
            limit = get_daily_limit(result["role"])
            rate_limited = limit > 0
            tier = result["tier"]
            if not rate_limited:
                return {"tier": tier, "rate_limited": False}
            # Apply role-based rate limit via persistent store
            key_for_limit = f"user:{result['user_id']}"
            allowed, remaining, reset_time = check_rate_limit(
                ip=key_for_limit,
                endpoint="claims",
                max_requests=limit,
                window_seconds=_CLAIMS_WINDOW,
                db=db,
            )
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail=f"Rate limit exceeded: {limit} verification requests per day for {tier} tier.",
                )
            return {"tier": tier, "rate_limited": True}

    # --- 3. Legacy press key (treat as pro) ---
    if _check_legacy_press_key(x_wtp_api_key):
        return {"tier": "pro", "rate_limited": False}

    # --- 4. Anonymous free tier: persistent IP rate limit ---
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else "unknown"

    allowed, remaining, reset_time = check_rate_limit(
        ip=client_ip,
        endpoint="claims",
        max_requests=_CLAIMS_FREE_LIMIT,
        window_seconds=_CLAIMS_WINDOW,
        db=db,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: {_CLAIMS_FREE_LIMIT} verification requests per day. "
                   f"Register for an account or set X-WTP-API-KEY header for higher limits.",
        )

    return {"tier": "free", "rate_limited": True}
