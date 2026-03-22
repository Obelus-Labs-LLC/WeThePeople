"""Env-driven API key gating for PRESS and ENTERPRISE tier endpoints.

Env vars:
  WTP_REQUIRE_AUTH      – "1" to enforce auth; default "0" (dev mode, all open).
  WTP_PRESS_API_KEY     – required when WTP_REQUIRE_AUTH=1.
  WTP_ENTERPRISE_API_KEY – optional key for unlimited claims access.

Usage in FastAPI:
  from services.auth import require_press_key, require_enterprise_or_rate_limit
  press_router = APIRouter(dependencies=[Depends(require_press_key)])
"""

import os
import hmac
import time
from collections import defaultdict
from threading import Lock

from fastapi import Header, HTTPException, Request


def _require_auth() -> bool:
    return os.getenv("WTP_REQUIRE_AUTH", "0") == "1"


def _press_api_key() -> str:
    return os.getenv("WTP_PRESS_API_KEY", "")


def require_press_key(
    x_wtp_api_key: str = Header(default=""),
) -> None:
    """FastAPI dependency – raises 401 if auth is required and key is wrong/missing."""
    if not _require_auth():
        return  # dev mode – allow everything

    expected = _press_api_key()
    if not expected:
        # Fail closed: if auth required but no key configured, block all PRESS requests.
        raise HTTPException(status_code=401, detail="unauthorized")

    if not hmac.compare_digest(x_wtp_api_key, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


# ---------------------------------------------------------------------------
# Enterprise tier + free rate limiting for claims endpoints
# ---------------------------------------------------------------------------

# In-memory rate limit store: {ip: [(timestamp, ...)] }
_rate_limit_store: dict = defaultdict(list)
_rate_limit_lock = Lock()
_CLAIMS_FREE_LIMIT = int(os.getenv("WTP_CLAIMS_FREE_LIMIT", "5"))  # per day per IP
_CLAIMS_WINDOW = 86400  # 24 hours


def _cleanup_old_entries(ip: str) -> None:
    """Remove entries older than the rate limit window."""
    cutoff = time.time() - _CLAIMS_WINDOW
    _rate_limit_store[ip] = [t for t in _rate_limit_store[ip] if t > cutoff]


def require_enterprise_or_rate_limit(
    request: Request,
    x_wtp_api_key: str = Header(default=""),
) -> dict:
    """
    Allow free users with rate limit (5/day by IP) or enterprise key for unlimited.

    Returns:
        {"tier": "enterprise"|"free", "rate_limited": bool}
    """
    enterprise_key = os.getenv("WTP_ENTERPRISE_API_KEY", "")

    # Enterprise tier: unlimited access
    if enterprise_key and x_wtp_api_key and hmac.compare_digest(x_wtp_api_key, enterprise_key):
        return {"tier": "enterprise", "rate_limited": False}

    # Free tier: check rate limit
    client_ip = request.client.host if request.client else "unknown"

    with _rate_limit_lock:
        _cleanup_old_entries(client_ip)
        if len(_rate_limit_store[client_ip]) >= _CLAIMS_FREE_LIMIT:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: {_CLAIMS_FREE_LIMIT} verification requests per day. "
                       f"Set X-WTP-API-KEY header with an enterprise key for unlimited access.",
            )
        _rate_limit_store[client_ip].append(time.time())

    return {"tier": "free", "rate_limited": True}
