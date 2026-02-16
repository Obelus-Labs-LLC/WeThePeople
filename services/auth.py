"""Env-driven API key gating for PRESS tier endpoints.

Env vars:
  WTP_REQUIRE_AUTH  – "1" to enforce auth; default "0" (dev mode, all open).
  WTP_PRESS_API_KEY – required when WTP_REQUIRE_AUTH=1.

Usage in FastAPI:
  from services.auth import require_press_key
  press_router = APIRouter(dependencies=[Depends(require_press_key)])
"""

import os
import hmac

from fastapi import Header, HTTPException


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
