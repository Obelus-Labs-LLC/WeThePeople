"""
Common routes — ops, news, health check. Shared across sectors.
"""

import os
import subprocess
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from models.database import SessionLocal, DATABASE_URL
from services.auth import require_press_key

router = APIRouter(tags=["common"])


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

    git_sha = None
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=1,
        )
        if result.returncode == 0:
            git_sha = result.stdout.strip()
    except Exception:
        pass

    return {
        "db_url": db_display, "git_sha": git_sha,
        "disable_startup_fetch": os.getenv("DISABLE_STARTUP_FETCH") == "1",
        "no_network": os.getenv("NO_NETWORK") == "1",
    }


@router.get("/health")
def health_check():
    """Health endpoint for uptime monitoring.

    Returns DB connection status, row counts, last sync timestamp, and API version.
    Point UptimeRobot / similar at this endpoint.
    """
    from sqlalchemy import func, text
    from models.database import TrackedMember, Bill, MemberBillGroundTruth

    status = "ok"
    db_ok = False

    try:
        db = SessionLocal()
        # Quick connectivity check
        db.execute(text("SELECT 1"))
        db_ok = True
        db.close()
    except Exception as e:
        status = "degraded"
        db_ok = False

    return {
        "status": status,
        "database": {"connected": db_ok},
    }


@router.get("/news/{query}")
def get_news(query: str, limit: int = 10):
    """Fetch recent news headlines from Google News RSS for any query."""
    import re as _re
    if len(query) > 200:
        raise HTTPException(status_code=400, detail="Query too long (max 200 characters)")
    # Strip non-printable characters
    query = _re.sub(r'[^\x20-\x7E]', '', query)
    from connectors.news_feed import fetch_news
    articles = fetch_news(query, limit=min(limit, 20))
    return {"query": query, "articles": articles}
