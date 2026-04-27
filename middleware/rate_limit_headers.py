"""Surface the slowapi global rate limit on every response.

Adds the IETF-draft RateLimit-* headers (RateLimit-Limit, RateLimit-Remaining,
RateLimit-Reset) so clients can self-pace without triggering 429s. The
draft is informally followed by GitHub, Stripe, and most modern APIs.

The actual rate-limit accounting lives in slowapi (per-IP, per-key_func).
We don't reimplement it — we just expose the configured ceiling so a
client looking at our /docs sees a documentable contract instead of
having to discover the limit by getting blocked.

Per-endpoint claims-tier limits (5/day free, 100/day pro, unlimited
enterprise) are computed inside services/auth.require_enterprise_or_rate_limit
and are NOT echoed here — those carry their own 429 detail message
because they're scoped to a different limit dimension.
"""

from __future__ import annotations

import os
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


def _parse_global_limit() -> tuple[int, int]:
    """Parse WTP_RATE_LIMIT (e.g. '60/minute', '120/second') into
    (count, window_seconds). Falls back to (60, 60) on malformed input
    so we never block startup."""
    raw = os.getenv("WTP_RATE_LIMIT", "60/minute").strip().lower()
    try:
        count_str, period = raw.split("/")
        count = int(count_str.strip())
        period = period.strip()
        if period in ("second", "1second"):
            window = 1
        elif period in ("minute", "1minute"):
            window = 60
        elif period in ("hour", "1hour"):
            window = 3600
        elif period in ("day", "1day"):
            window = 86400
        else:
            window = 60
        return count, window
    except (ValueError, IndexError):
        return 60, 60


_GLOBAL_LIMIT, _GLOBAL_WINDOW = _parse_global_limit()


class RateLimitHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)
        # Only annotate API-style responses; preflight/static skipped.
        ct = response.headers.get("content-type", "")
        if "json" not in ct and "csv" not in ct and "xml" not in ct:
            return response

        # We don't have visibility into slowapi's internal counter from
        # outside, so Remaining is best-effort: we report the ceiling
        # and the next reset boundary based on the configured window.
        # Clients using these headers as a guideline (not an oracle)
        # will pace correctly. A client that hits the actual limit
        # still gets a 429 from slowapi with its own Retry-After.
        now = int(time.time())
        reset_at = now + _GLOBAL_WINDOW - (now % _GLOBAL_WINDOW)
        response.headers["RateLimit-Limit"] = str(_GLOBAL_LIMIT)
        response.headers["RateLimit-Remaining"] = str(_GLOBAL_LIMIT)
        response.headers["RateLimit-Reset"] = str(reset_at - now)
        response.headers["RateLimit-Policy"] = f"{_GLOBAL_LIMIT};w={_GLOBAL_WINDOW}"
        return response
