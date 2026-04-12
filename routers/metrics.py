"""
Prometheus-compatible Metrics Endpoint

Exposes /metrics in Prometheus text exposition format. No external dependencies
— uses stdlib dicts and threading.Lock for thread safety.

Tracked metrics:
  - wtp_request_total (counter, by method/path/status)
  - wtp_request_duration_seconds (histogram, by method/path)
  - wtp_active_connections (gauge)
  - wtp_db_query_total (counter)
  - wtp_db_slow_query_total (counter)
  - wtp_external_api_calls_total (counter, by connector)
  - wtp_error_total (counter)
  - wtp_uptime_seconds (gauge)
  - wtp_db_size_bytes (gauge)

Usage from other modules:
    from routers.metrics import record_request, record_db_query, record_external_call, record_error
"""

import os
import threading
import time

from fastapi import APIRouter
from starlette.responses import PlainTextResponse

router = APIRouter(tags=["observability"])

# --- Startup time ---
_start_time = time.time()

# --- Thread-safe counters and histograms ---
_lock = threading.Lock()

# request_total{method, path, status}
_request_counts: dict[tuple[str, str, int], int] = {}

# request_duration histogram buckets (seconds)
_HISTOGRAM_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
# _duration_buckets[method, path] = {bucket_le: count}
_duration_buckets: dict[tuple[str, str], dict[float, int]] = {}
# _duration_sums[method, path] = (total_seconds, count)
_duration_sums: dict[tuple[str, str], list[float]] = {}  # [sum, count]

# db queries
_db_query_count = 0
_db_slow_query_count = 0

# external API calls by connector
_external_api_calls: dict[str, int] = {}

# error count
_error_count = 0

# Path normalization: collapse IDs to reduce cardinality
def _normalize_path(path: str) -> str:
    """Collapse path segments that look like IDs to '{id}' to limit cardinality."""
    parts = path.strip("/").split("/")
    normalized = []
    for part in parts:
        # Collapse numeric IDs, UUIDs, hashes
        if part.isdigit() or (len(part) >= 16 and all(c in "0123456789abcdef-" for c in part)):
            normalized.append("{id}")
        else:
            normalized.append(part)
    return "/" + "/".join(normalized)


# --- Recording functions (called from middleware/tracing.py and database.py) ---

def record_request(method: str, path: str, status: int, duration_s: float) -> None:
    """Record a completed HTTP request."""
    path = _normalize_path(path)
    key = (method, path, status)
    dur_key = (method, path)

    with _lock:
        _request_counts[key] = _request_counts.get(key, 0) + 1

        # Histogram buckets
        if dur_key not in _duration_buckets:
            _duration_buckets[dur_key] = {b: 0 for b in _HISTOGRAM_BUCKETS}
            _duration_sums[dur_key] = [0.0, 0]

        for bucket in _HISTOGRAM_BUCKETS:
            if duration_s <= bucket:
                _duration_buckets[dur_key][bucket] += 1

        _duration_sums[dur_key][0] += duration_s
        _duration_sums[dur_key][1] += 1


def record_db_query(slow: bool = False) -> None:
    """Record a database query. Set slow=True for queries >500ms."""
    global _db_query_count, _db_slow_query_count
    with _lock:
        _db_query_count += 1
        if slow:
            _db_slow_query_count += 1


def record_external_call(connector: str) -> None:
    """Record an external API call by connector name."""
    with _lock:
        _external_api_calls[connector] = _external_api_calls.get(connector, 0) + 1


def record_error() -> None:
    """Record an application error."""
    global _error_count
    with _lock:
        _error_count += 1


# Register the db query hook so models/database.py can record without importing routers
try:
    from utils.metrics_hooks import set_db_query_hook
    set_db_query_hook(record_db_query)
except ImportError:
    pass


# --- DB size helper ---

def _get_db_size_bytes() -> int:
    """Get database file size. Returns file size for SQLite, 0 for other backends."""
    try:
        from utils.db_compat import is_sqlite
        if is_sqlite():
            from models.database import DATABASE_URL
            db_path = DATABASE_URL.replace("sqlite:///", "").replace("sqlite://", "")
            if db_path.startswith("./"):
                db_path = db_path[2:]
            if os.path.exists(db_path):
                return os.path.getsize(db_path)
        # Oracle and PostgreSQL manage storage differently; return 0
    except Exception:
        pass
    return 0


# --- Last sync timestamps from scheduler ---

def _get_last_sync_timestamps() -> dict[str, float]:
    """Try to read scheduler state for last sync times. Best-effort."""
    timestamps = {}
    try:
        state_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs", "scheduler_state.json")
        if os.path.exists(state_file):
            import json
            with open(state_file, "r") as f:
                state = json.load(f)
            for job_name, info in state.items():
                if isinstance(info, dict) and "last_run" in info:
                    timestamps[job_name] = info["last_run"]
    except Exception:
        pass
    return timestamps


# --- Prometheus text exposition ---

@router.get("/metrics", response_class=PlainTextResponse, include_in_schema=False)
def metrics_endpoint():
    """Prometheus-compatible metrics in text exposition format."""
    lines = []

    uptime = time.time() - _start_time

    # Uptime
    lines.append("# HELP wtp_uptime_seconds Time since application start")
    lines.append("# TYPE wtp_uptime_seconds gauge")
    lines.append(f"wtp_uptime_seconds {uptime:.1f}")

    # Active connections
    try:
        from middleware.tracing import get_active_request_count
        active = get_active_request_count()
    except (ImportError, Exception):
        active = 0
    lines.append("# HELP wtp_active_connections Currently in-flight HTTP requests")
    lines.append("# TYPE wtp_active_connections gauge")
    lines.append(f"wtp_active_connections {active}")

    with _lock:
        # Request counts
        lines.append("# HELP wtp_request_total Total HTTP requests")
        lines.append("# TYPE wtp_request_total counter")
        for (method, path, status), count in sorted(_request_counts.items()):
            lines.append(f'wtp_request_total{{method="{method}",path="{path}",status="{status}"}} {count}')

        # Request duration histogram
        lines.append("# HELP wtp_request_duration_seconds HTTP request duration")
        lines.append("# TYPE wtp_request_duration_seconds histogram")
        for (method, path), buckets in sorted(_duration_buckets.items()):
            cumulative = 0
            for le in _HISTOGRAM_BUCKETS:
                cumulative += buckets.get(le, 0)
                lines.append(f'wtp_request_duration_seconds_bucket{{method="{method}",path="{path}",le="{le}"}} {cumulative}')
            total_sum, total_count = _duration_sums.get((method, path), [0, 0])
            lines.append(f'wtp_request_duration_seconds_bucket{{method="{method}",path="{path}",le="+Inf"}} {int(total_count)}')
            lines.append(f'wtp_request_duration_seconds_sum{{method="{method}",path="{path}"}} {total_sum:.6f}')
            lines.append(f'wtp_request_duration_seconds_count{{method="{method}",path="{path}"}} {int(total_count)}')

        # DB queries
        lines.append("# HELP wtp_db_query_total Total database queries")
        lines.append("# TYPE wtp_db_query_total counter")
        lines.append(f"wtp_db_query_total {_db_query_count}")

        lines.append("# HELP wtp_db_slow_query_total Database queries exceeding 500ms")
        lines.append("# TYPE wtp_db_slow_query_total counter")
        lines.append(f"wtp_db_slow_query_total {_db_slow_query_count}")

        # External API calls
        lines.append("# HELP wtp_external_api_calls_total External API calls by connector")
        lines.append("# TYPE wtp_external_api_calls_total counter")
        for connector, count in sorted(_external_api_calls.items()):
            lines.append(f'wtp_external_api_calls_total{{connector="{connector}"}} {count}')

        # Errors
        lines.append("# HELP wtp_error_total Total application errors")
        lines.append("# TYPE wtp_error_total counter")
        lines.append(f"wtp_error_total {_error_count}")

    # DB size (outside lock — file stat is fast)
    db_size = _get_db_size_bytes()
    lines.append("# HELP wtp_db_size_bytes SQLite database file size")
    lines.append("# TYPE wtp_db_size_bytes gauge")
    lines.append(f"wtp_db_size_bytes {db_size}")

    # Last sync timestamps
    sync_times = _get_last_sync_timestamps()
    if sync_times:
        lines.append("# HELP wtp_last_sync_timestamp_seconds Unix timestamp of last sync run")
        lines.append("# TYPE wtp_last_sync_timestamp_seconds gauge")
        for job, ts in sorted(sync_times.items()):
            lines.append(f'wtp_last_sync_timestamp_seconds{{job="{job}"}} {ts}')

    lines.append("")  # trailing newline
    return "\n".join(lines)
