"""
Common routes — ops, news, health check. Shared across sectors.
"""

import os
import subprocess
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from models.database import get_db, DATABASE_URL
from services.auth import require_press_key
from models.response_schemas import HealthResponse
from utils.logging import get_logger

router = APIRouter(tags=["common"])
logger = get_logger(__name__)

# Cache git SHA and start time at module load
_GIT_SHA = None
_START_TIME = time.time()

try:
    _result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True, timeout=2,
    )
    if _result.returncode == 0:
        _GIT_SHA = _result.stdout.strip()
except Exception:
    pass


@router.get("/ops/runtime", dependencies=[Depends(require_press_key)])
def get_runtime_info():
    """Debug endpoint: expose runtime configuration."""
    db_display = DATABASE_URL
    if "@" in db_display:
        parts = db_display.split("@")
        user_pass = parts[0].split("//")[1]
        if ":" in user_pass:
            user = user_pass.split(":")[0]
            db_display = db_display.replace(user_pass, f"{user}:***")

    return {
        "db_url": db_display, "git_sha": _GIT_SHA,
        "disable_startup_fetch": os.getenv("DISABLE_STARTUP_FETCH") == "1",
        "no_network": os.getenv("NO_NETWORK") == "1",
    }


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    """Health endpoint for uptime monitoring.

    Returns DB connection status, uptime, version, memory usage, and active traces.
    Kept lightweight — no heavy DB queries, just a connectivity check.
    Point UptimeRobot / similar at this endpoint.
    """
    from sqlalchemy import text

    status = "ok"
    db_ok = False

    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        status = "degraded"
        logger.warning("Health check DB failure: %s", e)

    # Uptime
    uptime_seconds = round(time.time() - _START_TIME, 1)

    # Memory usage (lightweight — stdlib os on Linux, fallback otherwise)
    memory_mb = None
    try:
        # Linux: read /proc/self/status for VmRSS (no psutil needed)
        with open("/proc/self/status", "r") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    memory_mb = round(int(line.split()[1]) / 1024, 1)  # kB -> MB
                    break
    except (FileNotFoundError, OSError):
        # Non-Linux (dev machine) — use resource module if available
        try:
            import resource
            usage = resource.getrusage(resource.RUSAGE_SELF)
            memory_mb = round(usage.ru_maxrss / 1024, 1)  # kB -> MB on Linux
        except (ImportError, Exception):
            pass

    # Active request count
    active_traces = 0
    try:
        from middleware.tracing import get_active_request_count
        active_traces = get_active_request_count()
    except (ImportError, Exception):
        pass

    return {
        "status": status,
        "database": {"connected": db_ok},
        "uptime_seconds": uptime_seconds,
        "version": _GIT_SHA or "unknown",
        "memory_mb": memory_mb,
        "active_traces": active_traces,
    }


@router.get("/news/{query}")
def get_news(query: str, limit: int = 10):
    """Fetch recent news headlines from Google News RSS for any query."""
    import re as _re
    if len(query) > 200:
        raise HTTPException(status_code=400, detail="Query too long (max 200 characters)")
    # Strip non-printable characters
    query = _re.sub(r'[^\x20-\x7E]', '', query)
    try:
        from connectors.news_feed import fetch_news
    except (ImportError, ModuleNotFoundError):
        raise HTTPException(status_code=501, detail="News feed connector not implemented")
    articles = fetch_news(query, limit=min(limit, 20))
    return {"query": query, "articles": articles}
