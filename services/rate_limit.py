"""Lightweight in-memory rate limiter for FastAPI.

Uses a sliding window counter per client IP. No external dependencies.

Env vars:
  WTP_RATE_LIMIT_RPM – requests per minute per IP (default 120).
  WTP_RATE_LIMIT_ENABLED – "1" to enable; default "0" (disabled in dev).
"""

import os
import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


def _is_enabled() -> bool:
    return os.getenv("WTP_RATE_LIMIT_ENABLED", "0") == "1"


def _rpm_limit() -> int:
    try:
        return int(os.getenv("WTP_RATE_LIMIT_RPM", "120"))
    except ValueError:
        return 120


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple per-IP sliding window rate limiter."""

    def __init__(self, app):
        super().__init__(app)
        self._requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next):
        if not _is_enabled():
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window = 60.0  # 1 minute
        limit = _rpm_limit()

        # Prune old entries
        timestamps = self._requests[client_ip]
        cutoff = now - window
        self._requests[client_ip] = [t for t in timestamps if t > cutoff]

        if len(self._requests[client_ip]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "rate limit exceeded"},
                headers={"Retry-After": "60"},
            )

        self._requests[client_ip].append(now)
        return await call_next(request)
