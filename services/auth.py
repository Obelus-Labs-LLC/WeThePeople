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
import re
import hmac
import ipaddress
from typing import Optional

from fastapi import Header, HTTPException, Query, Request, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from services.rate_limit_store import check_rate_limit

_CLAIMS_FREE_LIMIT = int(os.getenv("WTP_CLAIMS_FREE_LIMIT", "5"))  # per day per IP
_CLAIMS_WINDOW = 86400  # 24 hours


# ---------------------------------------------------------------------------
# Trusted-proxy IP resolution
# ---------------------------------------------------------------------------
# X-Forwarded-For is trivially spoofable by any client that talks directly
# to uvicorn — `curl -H "X-Forwarded-For: 1.1.1.1"` would have made every
# rate-limit bucket per-spoofed-IP, defeating the limit entirely.
#
# Only honor XFF when the immediate connection came from an IP listed in
# WTP_TRUSTED_PROXIES (comma-separated CIDRs). Default 127.0.0.0/8 +
# 10.0.0.0/8 covers the typical "uvicorn behind nginx on the same box"
# topology; production deployments behind a managed proxy should set the
# env var to that proxy's egress range.

def _parse_trusted_proxies() -> list:
    raw = os.getenv("WTP_TRUSTED_PROXIES", "127.0.0.0/8,10.0.0.0/8")
    networks = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        try:
            networks.append(ipaddress.ip_network(chunk, strict=False))
        except ValueError:
            # Malformed CIDR — skip silently rather than refuse to boot.
            pass
    return networks


_TRUSTED_PROXY_NETWORKS = _parse_trusted_proxies()


def get_client_ip(request: Request) -> str:
    """Resolve the real client IP, honoring X-Forwarded-For only when the
    direct connection came from a configured trusted proxy.

    Returns ``"unknown"`` if the connection IP can't be determined.
    """
    direct = request.client.host if request.client else None
    if direct is None:
        return "unknown"

    # Only trust XFF if the immediate hop is a configured proxy
    try:
        direct_ip = ipaddress.ip_address(direct)
    except ValueError:
        return direct

    direct_is_trusted = any(direct_ip in net for net in _TRUSTED_PROXY_NETWORKS)
    if direct_is_trusted:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            # First IP is the original client. Strip whitespace; reject
            # malformed entries.
            first = forwarded.split(",")[0].strip()
            if first:
                try:
                    ipaddress.ip_address(first)
                    return first
                except ValueError:
                    pass
    return direct


def _require_auth() -> bool:
    """Fail-closed: auth is required unless BOTH ``WTP_ENV=development`` AND
    ``WTP_REQUIRE_AUTH=0`` are set. Either alone falls back to enforcement.

    The previous logic let an operator silence local-dev auth errors with
    a one-line ``WTP_REQUIRE_AUTH=0`` in a personal ``.env`` file — which
    then leaked to prod if the file was copied without ``WTP_ENV`` being
    flipped back. Tying the override to both env vars makes that misuse
    much harder.
    """
    env = os.getenv("WTP_ENV", "production").lower()
    explicit_disable = os.getenv("WTP_REQUIRE_AUTH", "1") == "0"
    if env == "development" and explicit_disable:
        return False
    return True


def _press_api_key() -> str:
    return os.getenv("WTP_PRESS_API_KEY", "")


_SIGNED_TOKEN_PATH_RE = re.compile(
    r"^/(?:api/v1/)?ops/(?:story|draft)-queue/(\d+)(?:/(approve|reject|respond))?/?$"
)

# Methods we accept signed tokens on, per action. GET for the email-tap
# flows (approve/reject/view); POST for the right-to-respond form
# submission (the editor arrived via signed-token GET and the JS posts
# back with the same token).
_TOKEN_METHODS_BY_ACTION = {
    "approve": {"GET"},
    "reject": {"GET"},
    "view": {"GET"},
    "respond": {"GET", "POST"},
}


def require_press_key(
    request: Request,
    x_wtp_api_key: str = Header(default=""),
    key: str = Query(default=""),
    token: str = Query(default=""),
) -> None:
    """FastAPI dependency -- raises 401 unless auth is satisfied by one of:

    1. Global press key via `X-WTP-API-Key` header (operators)
    2. Global press key via `?key=` query parameter (legacy)
    3. Per-story signed `?token=` scoped to a specific story_id and action.
       Accepted on GET /ops/{story,draft}-queue/{id}/{approve,reject},
       GET on the bare /ops/{story,draft}-queue/{id} (action='view'),
       and BOTH GET+POST on /ops/{story,draft}-queue/{id}/respond
       (action='respond'). The respond-POST exception lets the email
       flow submit the right-to-respond form without the operator's
       root press key.
       See services/press_signed_token.py for the signing format.

    The signed-token path is what the Gate 5 review emails now use, so the
    root press key never appears in outbound mail or confirmation pages.
    """
    if not _require_auth():
        return  # dev mode -- allow everything

    expected = _press_api_key()
    if not expected:
        # Fail closed: if auth required but no key configured, block all PRESS requests.
        raise HTTPException(status_code=401, detail="unauthorized")

    # Path 1 & 2: global press key (header wins when both present).
    provided = x_wtp_api_key or key
    if provided and hmac.compare_digest(provided, expected):
        return

    # Path 3: per-story signed token — narrow surface, gated by the
    # action's allowed-methods set. Most actions are GET-only; respond
    # accepts POST too so the JS form submission works from the email
    # flow.
    if token:
        m = _SIGNED_TOKEN_PATH_RE.match(request.url.path)
        if m:
            from services.press_signed_token import verify_story_action
            story_id = int(m.group(1))
            # No action suffix in the path => view-only access to the draft page.
            action = m.group(2) or "view"
            allowed_methods = _TOKEN_METHODS_BY_ACTION.get(action, {"GET"})
            if request.method in allowed_methods:
                ok, _reason = verify_story_action(token, story_id, action)
                if ok:
                    return

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


def _auth_result_for_user(user, db: Session) -> dict:
    """Translate a verified User row into the auth-dict shape the
    `/claims/verify` endpoint expects, applying the role's daily quota
    and consuming one slot from the rate-limit store.

    Raises HTTPException(429) when the user is over their daily cap.

    Extracted from the inline JWT branch so the new session-cookie
    branch (added 2026-05-02) can reuse the same quota logic without
    duplication."""
    from services.rbac import get_daily_limit
    limit = get_daily_limit(user.role)
    tier = user.role if user.role != "admin" else "enterprise"
    if limit == 0:
        return {
            "tier": tier, "rate_limited": False,
            "daily_limit": 0, "remaining_today": -1,
            "reset_seconds": 0, "user_id": user.id,
        }
    key_for_limit = f"user:{user.id}"
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
            detail={
                "error": "rate_limited",
                "message": f"You've used today's {limit} {tier} verifications. Upgrade or wait for reset.",
                "tier": tier,
                "daily_limit": limit,
                "reset_seconds": reset_time,
            },
        )
    return {
        "tier": tier, "rate_limited": True,
        "daily_limit": limit, "remaining_today": remaining,
        "reset_seconds": reset_time, "user_id": user.id,
    }


def require_enterprise_or_rate_limit(
    request: Request,
    x_wtp_api_key: str = Header(default=""),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> dict:
    """
    Authenticated-only access to Veritas verification.

    As of the 2026-04-27 tier rollout, anonymous use is no longer
    permitted. Users must either:
      • Be authenticated via JWT bearer token (web/mobile session), OR
      • Be authenticated via the cross-subdomain `wtp_session` cookie
        (added 2026-05-02 — fixes "sign in to verify" wall on apex
        users whose verify-subdomain localStorage is empty), OR
      • Send a valid X-WTP-API-KEY header (CI / scripts / partners)

    Checks in order:
      1. Legacy WTP_ENTERPRISE_API_KEY env var
      2. New per-user API key system (role-based limits)
      3. Legacy WTP_PRESS_API_KEY (treated as pro tier)
      4. JWT bearer token from a logged-in session
      5. wtp_session cookie (cross-subdomain), same JWT decode path

    If none of those identify the caller, raises 401 with a structured
    detail object the frontend can use to render the signup CTA.

    Returns:
        {
            "tier": "free|student|pro|newsroom|enterprise",
            "rate_limited": bool,
            "daily_limit": int,         # 0 = unlimited
            "remaining_today": int,
            "reset_seconds": int,
            "user_id": int | None,
        }
    """

    # --- 1. Legacy enterprise key ---
    if _check_legacy_enterprise_key(x_wtp_api_key):
        return {
            "tier": "enterprise", "rate_limited": False,
            "daily_limit": 0, "remaining_today": -1,
            "reset_seconds": 0, "user_id": None,
        }

    # --- 2. New API key system ---
    if x_wtp_api_key:
        result = _resolve_new_system_user(x_wtp_api_key, db)
        if result:
            from services.rbac import get_daily_limit
            limit = get_daily_limit(result["role"])
            tier = result["tier"]
            if limit == 0:
                return {
                    "tier": tier, "rate_limited": False,
                    "daily_limit": 0, "remaining_today": -1,
                    "reset_seconds": 0, "user_id": result["user_id"],
                }
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
                    detail={
                        "error": "rate_limited",
                        "message": f"You've used today's {limit} {tier} verifications. Resets in {reset_time}s.",
                        "tier": tier,
                        "daily_limit": limit,
                        "reset_seconds": reset_time,
                    },
                )
            return {
                "tier": tier, "rate_limited": True,
                "daily_limit": limit, "remaining_today": remaining,
                "reset_seconds": reset_time, "user_id": result["user_id"],
            }

    # --- 3. Legacy press key (treat as pro) ---
    if x_wtp_api_key and _check_legacy_press_key(x_wtp_api_key):
        return {
            "tier": "pro", "rate_limited": False,
            "daily_limit": 200, "remaining_today": -1,
            "reset_seconds": 0, "user_id": None,
        }

    # --- 4. JWT bearer token from a web/mobile session ---
    # We import here to avoid a circular dep at module load.
    if authorization.startswith("Bearer "):
        try:
            from services.jwt_auth import decode_access_token
            from models.auth_models import User
            token = authorization.split(" ", 1)[1].strip()
            payload = decode_access_token(token)
            user_id = int(payload.get("sub")) if payload.get("sub") else None
            user = db.query(User).filter(User.id == user_id, User.is_active == 1).first() if user_id else None
            if user:
                return _auth_result_for_user(user, db)
        except HTTPException:
            raise
        except Exception:
            # Token invalid / expired — fall through to the cookie
            # check (and ultimately the 401 below) so the response is
            # consistently structured.
            pass

    # --- 5. wtp_session cookie (cross-subdomain) ---
    # Users who logged in on wethepeopleforus.com get a Domain=
    # .wethepeopleforus.com cookie that travels to verify/research/
    # journal subdomains. The frontend sends `credentials: "include"`,
    # so the cookie is in `request.cookies` here. Decode it the same
    # way the Bearer branch decodes its JWT.
    try:
        from services.jwt_auth import SESSION_COOKIE_NAME, decode_access_token
        cookie_token = request.cookies.get(SESSION_COOKIE_NAME) if request else None
        if cookie_token:
            from models.auth_models import User
            payload = decode_access_token(cookie_token)
            user_id = int(payload.get("sub")) if payload.get("sub") else None
            user = db.query(User).filter(User.id == user_id, User.is_active == 1).first() if user_id else None
            if user:
                return _auth_result_for_user(user, db)
    except HTTPException:
        raise
    except Exception:
        # Same fall-through behavior as the Bearer branch — we'd rather
        # 401 with the structured signup CTA than 500 on a malformed
        # cookie value.
        pass

    # --- No identity established — anonymous use is no longer permitted. ---
    # signup_url and login_url point at the React signup/login pages on the
    # main site, NOT the FastAPI POST endpoints. The previous values
    # ("/auth/register", "/auth/login") would 405-Method-Not-Allowed on a
    # GET from the browser if a frontend ever followed them. pricing_url
    # was likewise typo'd at "/api" (the API docs page) when it should
    # point at "/pricing". Verify-V6 audit fix.
    raise HTTPException(
        status_code=401,
        detail={
            "error": "auth_required",
            "message": "Verification requires a free account. Sign up to get 5 verifications per day.",
            "signup_url": "https://wethepeopleforus.com/signup",
            "login_url": "https://wethepeopleforus.com/login",
            "pricing_url": "https://wethepeopleforus.com/pricing",
        },
    )
