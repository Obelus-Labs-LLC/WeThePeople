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
    "connect-src 'self' https://api.wethepeopleforus.com:8006"
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
        if any(path.startswith(prefix) for prefix in _SENSITIVE_PREFIXES):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
        elif "Cache-Control" not in response.headers:
            # Default: allow short caching for public data endpoints
            response.headers["Cache-Control"] = "public, max-age=60"

        return response
