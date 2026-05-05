"""
Security Headers Middleware

Adds defense-in-depth HTTP headers to every response:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 1; mode=block
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: camera=(), microphone=(), geolocation=()
  - Strict-Transport-Security (HSTS): max-age=1 year, includeSubDomains
  - Content-Security-Policy (skipped for /docs and /redoc)
  - Cache-Control: no-store for sensitive endpoints (auth, claims, chat, digest)

Usage:
    from middleware.security import SecurityHeadersMiddleware
    app.add_middleware(SecurityHeadersMiddleware)
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


# Paths where CSP is skipped (Swagger UI and ReDoc need inline scripts)
_CSP_SKIP_PATHS = ("/docs", "/redoc", "/openapi.json")

_CSP_VALUE = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://vercel.live; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com; "
    "connect-src 'self' https://api.wethepeopleforus.com"
)

# HSTS: 1 year max-age, include subdomains
_HSTS_VALUE = "max-age=31536000; includeSubDomains"

# Sensitive endpoint prefixes that should never be cached
_SENSITIVE_PREFIXES = (
    "/auth",
    "/claims",
    "/chat",
    "/digest",
    "/v1/auth",
    "/v1/claims",
    "/v1/chat",
    "/v1/digest",
    "/health",
    "/metrics",
)


# Tiered caching for public read-only endpoints. Browsers/CDNs serve
# the cached response for `max-age` seconds without any network call,
# then for the next `stale-while-revalidate` seconds they SERVE the
# cached response and silently revalidate in the background. The user
# perceives every repeat visit within the SWR window as instant.
#
# Aggressive numbers are safe because:
#   * Underlying data changes on a daily-or-slower cadence (sync jobs
#     run nightly or weekly).
#   * SWR semantics mean stale-but-not-dead, with a backend round trip
#     happening behind the user's back to refresh.
#
# Order matters — first match wins.
_CACHE_TIERS = (
    # Semi-static config + schema. OpenAPI changes per deploy; the
    # browser will refetch on Cache-Control: max-age expiry.
    ("/openapi.json", "public, max-age=600, stale-while-revalidate=86400"),
    ("/docs", "public, max-age=600, stale-while-revalidate=86400"),
    ("/redoc", "public, max-age=600, stale-while-revalidate=86400"),
    # ZIP / state / lookups change essentially never (district maps
    # update once per redistricting cycle).
    ("/lookup/", "public, max-age=3600, stale-while-revalidate=86400"),
    ("/states/", "public, max-age=600, stale-while-revalidate=3600"),
    ("/representatives", "public, max-age=600, stale-while-revalidate=3600"),
    # Dashboard + influence aggregates rebuild from sync jobs that run
    # daily. 5-minute fresh window is plenty; SWR=10min means a casual
    # browse never blocks on an API call.
    ("/dashboard/", "public, max-age=300, stale-while-revalidate=600"),
    ("/influence/", "public, max-age=300, stale-while-revalidate=600"),
    ("/aggregate/", "public, max-age=300, stale-while-revalidate=600"),
    ("/anomalies", "public, max-age=300, stale-while-revalidate=600"),
    # Per-entity detail pages (most-visited): 2-min fresh, 10-min SWR.
    # The vast majority of repeat visits within a session land on warm.
    ("/finance/", "public, max-age=120, stale-while-revalidate=600"),
    ("/health/", "public, max-age=120, stale-while-revalidate=600"),
    ("/tech/", "public, max-age=120, stale-while-revalidate=600"),
    ("/energy/", "public, max-age=120, stale-while-revalidate=600"),
    ("/defense/", "public, max-age=120, stale-while-revalidate=600"),
    ("/transportation/", "public, max-age=120, stale-while-revalidate=600"),
    ("/agriculture/", "public, max-age=120, stale-while-revalidate=600"),
    ("/chemicals/", "public, max-age=120, stale-while-revalidate=600"),
    ("/telecom/", "public, max-age=120, stale-while-revalidate=600"),
    ("/education/", "public, max-age=120, stale-while-revalidate=600"),
    ("/people", "public, max-age=120, stale-while-revalidate=600"),
    ("/bills", "public, max-age=120, stale-while-revalidate=600"),
    ("/votes", "public, max-age=120, stale-while-revalidate=600"),
    ("/committees", "public, max-age=300, stale-while-revalidate=3600"),
    ("/stories", "public, max-age=120, stale-while-revalidate=600"),
    ("/balance-of-power", "public, max-age=300, stale-while-revalidate=3600"),
    ("/research/", "public, max-age=300, stale-while-revalidate=3600"),
    ("/civic/", "public, max-age=120, stale-while-revalidate=600"),
    ("/search", "public, max-age=60, stale-while-revalidate=300"),
    ("/actions", "public, max-age=120, stale-while-revalidate=600"),
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Injects security headers into every HTTP response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response: Response = await call_next(request)

        # Always-on headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )

        # HSTS — tells browsers to always use HTTPS
        response.headers["Strict-Transport-Security"] = _HSTS_VALUE

        # CSP — skip for docs/redoc so Swagger UI works
        path = request.url.path
        if not any(path.startswith(skip) for skip in _CSP_SKIP_PATHS):
            response.headers["Content-Security-Policy"] = _CSP_VALUE

        # Cache-Control — no-store for sensitive endpoints to prevent
        # browser/proxy caching of auth tokens, user data, etc.
        # Skip on non-GET so POST/PATCH responses don't get cached.
        if any(path.startswith(prefix) for prefix in _SENSITIVE_PREFIXES):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
        elif request.method != "GET":
            # Mutations don't get cached.
            if "Cache-Control" not in response.headers:
                response.headers["Cache-Control"] = "no-store"
        elif "Cache-Control" not in response.headers:
            # Tier-matched stale-while-revalidate caching for public GETs.
            # Falls back to the legacy 60-second value if no tier matches.
            # `/v1/<path>` is the versioned mirror of every public route;
            # strip the prefix so the v1 traffic gets the same tier as the
            # canonical path (otherwise everything under /v1 would default
            # to the 60-second floor).
            tier_path = path
            if tier_path.startswith("/v1/"):
                tier_path = tier_path[3:]  # "/v1/aggregate/..." → "/aggregate/..."
            cache_value = "public, max-age=60, stale-while-revalidate=300"
            for prefix, value in _CACHE_TIERS:
                if tier_path.startswith(prefix):
                    cache_value = value
                    break
            response.headers["Cache-Control"] = cache_value
            # `Vary: Accept-Encoding` so caches don't serve a brotli'd
            # body to a client that only accepts gzip (or vice versa).
            # The GZipMiddleware doesn't add this on its own.
            existing_vary = response.headers.get("Vary", "")
            if "Accept-Encoding" not in existing_vary:
                response.headers["Vary"] = (
                    f"{existing_vary}, Accept-Encoding".lstrip(", ")
                )

        return response
