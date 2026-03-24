"""
Request Tracing Middleware

Generates a unique trace_id (UUID4) for every HTTP request and propagates it
through Python's contextvars so all log lines within a request share the same
trace_id. Adds X-Trace-ID response header for client-side correlation.

Logs: method, path, status_code, duration_ms, client_ip, trace_id.

Usage:
    The trace_id is automatically available in all log calls via the
    JSONFormatter / StructuredFormatter in utils/logging.py.

    To read the current trace_id programmatically:
        from middleware.tracing import get_trace_id
        tid = get_trace_id()  # returns str or None
"""

import contextvars
import time
import uuid
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from utils.logging import get_logger

logger = get_logger(__name__)

# Context variable holding the current request's trace ID
_trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "trace_id", default=""
)

# Simple atomic counter for active connections
import threading
_active_count = 0
_active_lock = threading.Lock()


def get_trace_id() -> Optional[str]:
    """Return the trace_id for the current request, or None outside a request."""
    val = _trace_id_var.get("")
    return val if val else None


def get_active_request_count() -> int:
    """Return the number of currently in-flight requests."""
    return _active_count


class TracingMiddleware(BaseHTTPMiddleware):
    """FastAPI/Starlette middleware that assigns a trace_id to every request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        global _active_count

        # Generate trace ID (accept client-provided header for distributed tracing)
        trace_id = request.headers.get("X-Trace-ID") or uuid.uuid4().hex[:16]
        _trace_id_var.set(trace_id)

        # Track active connections
        with _active_lock:
            _active_count += 1

        start = time.monotonic()
        status_code = 500  # default in case of unhandled exception

        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Trace-ID"] = trace_id
            return response
        except Exception:
            raise
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 1)

            with _active_lock:
                _active_count -= 1

            # Record metrics
            try:
                from routers.metrics import record_request
                record_request(
                    method=request.method,
                    path=request.url.path,
                    status=status_code,
                    duration_s=duration_ms / 1000.0,
                )
            except (ImportError, Exception):
                pass

            # Determine client IP (respect X-Forwarded-For from reverse proxy)
            client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            if not client_ip and request.client:
                client_ip = request.client.host

            # Skip logging for noisy endpoints
            path = request.url.path
            if path not in ("/health", "/metrics", "/favicon.ico"):
                logger.info(
                    "%s %s %d %.1fms",
                    request.method, path, status_code, duration_ms,
                    extra={
                        "trace_id": trace_id,
                        "method": request.method,
                        "path": path,
                        "status_code": status_code,
                        "duration_ms": duration_ms,
                        "client_ip": client_ip,
                    },
                )

            # Clear context
            _trace_id_var.set("")
