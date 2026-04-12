"""Lightweight in-memory rate limiter for FastAPI.

NOTE: Production uses slowapi middleware in main.py. This is an alternative implementation
that may be used standalone or as a fallback.

Uses a sliding window counter per client IP. No external dependencies.

Env vars:
  WTP_RATE_LIMIT_RPM – requests per minute per IP (default 120).
  WTP_RATE_LIMIT_ENABLED – "1" to enable; default "0" (disabled in dev).
"""

import asyncio
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

    _MAX_TRACKED_IPS = 10_000
    _CLEANUP_INTERVAL = 100  # prune stale IPs every N requests

    def __init__(self, app):
        super().__init__(app)
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._request_count = 0
        self._lock = asyncio.Lock()

    async def dispatch(self, request: Request, call_next):
        if not _is_enabled():
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window = 60.0  # 1 minute
        limit = _rpm_limit()

        async with self._lock:
            # Periodic cleanup: prune IPs not seen in the last hour
            self._request_count += 1
            if self._request_count % self._CLEANUP_INTERVAL == 0:
                stale_cutoff = now - 3600.0
                stale_ips = [
                    ip for ip, ts in self._requests.items()
                    if not ts or ts[-1] < stale_cutoff
                ]
                for ip in stale_ips:
                    del self._requests[ip]
                # Hard cap: if still too many IPs, drop the oldest half
                if len(self._requests) > self._MAX_TRACKED_IPS:
                    sorted_ips = sorted(
                        self._requests.keys(),
                        key=lambda ip: self._requests[ip][-1] if self._requests[ip] else 0,
                    )
                    for ip in sorted_ips[: len(sorted_ips) // 2]:
                        del self._requests[ip]

            # Prune old entries
            cutoff = now - window
            self._requests[client_ip] = [t for t in self._requests[client_ip] if t > cutoff]

            if len(self._requests[client_ip]) >= limit:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "rate limit exceeded"},
                    headers={"Retry-After": "60"},
                )

            self._requests[client_ip].append(now)

        return await call_next(request)
