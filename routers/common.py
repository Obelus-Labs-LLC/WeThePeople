"""
Common routes — ops, news, health check. Shared across sectors.
"""

import os
import subprocess
from datetime import datetime

from fastapi import APIRouter
from models.database import SessionLocal, DATABASE_URL

router = APIRouter(tags=["common"])


@router.get("/ops/runtime")
def get_runtime_info():
    """Debug endpoint: expose runtime configuration."""
    db_display = DATABASE_URL
    if "@" in db_display:
        parts = db_display.split("@")
        user_pass = parts[0].split("//")[1]
        if ":" in user_pass:
            user = user_pass.split(":")[0]
            db_display = db_display.replace(user_pass, f"{user}:***")

    db_file = None
    if db_display.startswith("sqlite:///"):
        db_file = db_display.replace("sqlite:///", "").replace("./", "")

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
        "db_url": db_display, "db_file": db_file, "git_sha": git_sha,
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
    counts = {}
    db_engine = ""

    try:
        db = SessionLocal()
        # Quick connectivity check
        db.execute(text("SELECT 1"))
        db_ok = True

        counts = {
            "members": db.query(func.count(TrackedMember.id)).filter(TrackedMember.is_active == 1).scalar() or 0,
            "bills": db.query(func.count(Bill.bill_id)).scalar() or 0,
            "groundtruth": db.query(func.count(MemberBillGroundTruth.id)).scalar() or 0,
        }

        # Detect engine type
        db_engine = "sqlite" if "sqlite" in DATABASE_URL else "postgresql"

        db.close()
    except Exception as e:
        status = "degraded"
        db_ok = False

    return {
        "status": status,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "database": {"connected": db_ok, "engine": db_engine, "counts": counts},
        "version": "1.0.0",
    }


@router.get("/news/{query}")
def get_news(query: str, limit: int = 10):
    """Fetch recent news headlines from Google News RSS for any query."""
    from connectors.news_feed import fetch_news
    articles = fetch_news(query, limit=min(limit, 20))
    return {"query": query, "articles": articles}
