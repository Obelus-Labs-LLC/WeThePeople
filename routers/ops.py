"""
Internal ops endpoints for pipeline monitoring and data quality.

NOT public-facing — gated behind require_press_key (same as /ops/runtime).
Provides visibility into:
  - Scheduler job health (from scheduler_state.json)
  - Dead letter queue (failed items that need retry)
  - Data quality checks (null rates, stale data, orphan records)
  - Database stats (table row counts, file size, index count)
"""

import html
import json
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from models.database import get_db, DATABASE_URL, engine
from services.auth import require_press_key
from utils.db_compat import is_sqlite, is_oracle, all_tables_sql, index_count_sql, table_row_count_sql
from utils.logging import get_logger

router = APIRouter(prefix="/ops", tags=["ops"], dependencies=[Depends(require_press_key)])
logger = get_logger(__name__)

ROOT = Path(__file__).resolve().parents[1]
STATE_FILE = ROOT / "scheduler_state.json"
DLQ_FILE = ROOT / "dlq.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_json(path: Path) -> Any:
    """Load a JSON file, returning empty dict/list on missing or corrupt."""
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load %s: %s", path, exc)
        return {}


def _save_json(path: Path, data: Any) -> None:
    """Atomically write JSON file."""
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    tmp.replace(path)


def _load_dlq() -> List[Dict[str, Any]]:
    """Load the dead letter queue from database (with JSON file fallback for legacy items)."""
    from models.database import SessionLocal
    from models.pipeline_models import FailedRecord

    items: List[Dict[str, Any]] = []
    db = SessionLocal()
    try:
        rows = db.query(FailedRecord).order_by(FailedRecord.created_at.desc()).limit(200).all()
        for r in rows:
            items.append({
                "id": str(r.id),
                "job": r.job_name,
                "error": r.error_message,
                "context": {"record_data": r.record_data} if r.record_data else {},
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "retries": r.retry_count,
                "status": "resolved" if r.resolved_at else "pending",
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
            })
    finally:
        db.close()

    # Also load any legacy JSON items for backward compat
    legacy = _load_json(DLQ_FILE)
    if isinstance(legacy, list) and legacy:
        items.extend(legacy)

    return items


def _save_dlq(items: List[Dict[str, Any]]) -> None:
    """Persist legacy DLQ items to JSON (new items use database via pipeline_reliability)."""
    _save_json(DLQ_FILE, items)


def _get_db_path() -> Optional[str]:
    """Extract the SQLite file path from DATABASE_URL, or None for non-SQLite."""
    if DATABASE_URL.startswith("sqlite"):
        # sqlite:///./wethepeople.db  or  sqlite:///path/to/db
        path = DATABASE_URL.split("///", 1)[-1]
        if path.startswith("./"):
            return str(ROOT / path[2:])
        return path
    return None


# ---------------------------------------------------------------------------
# Job interval map — mirrors scheduler.py JOB_REGISTRY without importing it
# (to avoid pulling in fcntl/fastscheduler at API import time).
# We parse the scheduler_state.json which already has last-run timestamps.
# ---------------------------------------------------------------------------

# Expected interval per job (hours). If a job hasn't run in 2x this, it's overdue.
# This is a best-effort map — unknown jobs default to 24h.
from utils.job_intervals import EXPECTED_INTERVALS as _EXPECTED_INTERVALS


# ---------------------------------------------------------------------------
# POST helper: enqueue a DLQ item (used by other code or manually)
# ---------------------------------------------------------------------------

def enqueue_dlq(
    job_name: str,
    error: str,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Add a failed item to the dead letter queue (database-backed). Returns the new item."""
    from models.database import SessionLocal
    from services.pipeline_reliability import send_to_dlq

    db = SessionLocal()
    try:
        record = send_to_dlq(
            db=db,
            job_name=job_name,
            record_data=context or {},
            error=error,
        )
        return {
            "id": str(record.id),
            "job": job_name,
            "error": error[:2000],
            "context": context or {},
            "created_at": record.created_at.isoformat() if record.created_at else None,
            "retries": 0,
            "status": "pending",
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/pipeline/health")
def pipeline_health():
    """Return health status of each scheduled job.

    Reads scheduler_state.json (written by fastscheduler) to determine
    last run time, duration, and whether each job is overdue.
    """
    state = _load_json(STATE_FILE)
    now = datetime.now(timezone.utc)

    jobs: List[Dict[str, Any]] = []
    overdue_count = 0

    # scheduler_state.json can have various formats depending on fastscheduler version.
    # Common shape: {"job_name": {"last_run": "ISO", ...}} or a flat list.
    # We handle both dict-of-dicts and list-of-dicts.
    if isinstance(state, dict):
        entries = state.items() if state else []
    else:
        entries = [(e.get("name", "unknown"), e) for e in state] if isinstance(state, list) else []

    for key, val in entries:
        if not isinstance(val, dict):
            continue

        job_name = val.get("job", key)
        last_run_raw = val.get("finished_at") or val.get("last_run")
        status = val.get("status", "unknown")
        duration = val.get("duration_sec", None)
        error = val.get("error")

        # Parse last run time
        last_run_dt = None
        if last_run_raw:
            try:
                last_run_dt = datetime.fromisoformat(last_run_raw.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                pass

        # Check if overdue (2x expected interval)
        expected_hours = _EXPECTED_INTERVALS.get(job_name, 24)
        overdue = False
        hours_since = None
        if last_run_dt:
            delta = now - last_run_dt
            hours_since = round(delta.total_seconds() / 3600, 1)
            if hours_since > expected_hours * 2:
                overdue = True
                overdue_count += 1

        jobs.append({
            "job": job_name,
            "status": status,
            "last_run": last_run_raw,
            "hours_since_last_run": hours_since,
            "expected_interval_hours": expected_hours,
            "overdue": overdue,
            "duration_sec": duration,
            "error": error,
        })

    # Also check for jobs in the registry that have NEVER run
    known_jobs = {j["job"] for j in jobs}
    for job_name, interval in _EXPECTED_INTERVALS.items():
        if job_name not in known_jobs:
            jobs.append({
                "job": job_name,
                "status": "never_run",
                "last_run": None,
                "hours_since_last_run": None,
                "expected_interval_hours": interval,
                "overdue": True,
                "duration_sec": None,
                "error": None,
            })
            overdue_count += 1

    overall = "healthy"
    if overdue_count > 0:
        overall = "degraded" if overdue_count <= 3 else "critical"

    return {
        "overall": overall,
        "total_jobs": len(jobs),
        "overdue_count": overdue_count,
        "checked_at": now.isoformat(),
        "state_file": str(STATE_FILE),
        "jobs": sorted(jobs, key=lambda j: (not j["overdue"], j["job"])),
    }


@router.get("/pipeline/dlq")
def pipeline_dlq(status: Optional[str] = None):
    """Return items in the dead letter queue.

    Optional ?status=pending|retrying|resolved filter.
    """
    items = _load_dlq()
    if status:
        items = [i for i in items if i.get("status") == status]

    # Compute age for each item
    now = datetime.now(timezone.utc)
    for item in items:
        created = item.get("created_at")
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                item["age_hours"] = round((now - dt).total_seconds() / 3600, 1)
            except (ValueError, AttributeError):
                item["age_hours"] = None

    return {
        "total": len(items),
        "items": sorted(items, key=lambda i: i.get("created_at", ""), reverse=True),
    }


@router.post("/pipeline/dlq/{item_id}/retry")
def retry_dlq_item(item_id: str):
    """Retry a failed DLQ item by re-running its job via subprocess.

    Marks the item as 'retrying', runs the job script, then updates
    status to 'resolved' on success or increments retry count on failure.
    """
    import subprocess
    import sys

    items = _load_dlq()
    target = None
    for item in items:
        if item.get("id") == item_id:
            target = item
            break

    if target is None:
        raise HTTPException(status_code=404, detail=f"DLQ item {item_id} not found")

    if target.get("status") == "resolved":
        raise HTTPException(status_code=400, detail="Item already resolved")

    job_name = target.get("job", "")
    target["status"] = "retrying"
    target["retries"] = target.get("retries", 0) + 1
    target["last_retry_at"] = datetime.now(timezone.utc).isoformat()
    _save_dlq(items)

    # Find the job script. We import the registry names lazily to
    # map job_name -> script path.
    script_map = _build_script_map()
    script = script_map.get(job_name)
    if not script:
        target["status"] = "pending"
        target["error"] = f"Unknown job: {job_name}. Cannot retry."
        _save_dlq(items)
        raise HTTPException(status_code=400, detail=f"No script found for job '{job_name}'")

    script_path = ROOT / script
    if not script_path.exists():
        target["status"] = "pending"
        target["error"] = f"Script not found: {script}"
        _save_dlq(items)
        raise HTTPException(status_code=400, detail=f"Script not found: {script}")

    # Run the job in a subprocess (non-blocking would be better, but keep it
    # simple: short timeout, caller can poll DLQ status).
    try:
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True, text=True,
            timeout=300,  # 5 min max for retry
            cwd=str(ROOT),
        )
        if proc.returncode == 0:
            target["status"] = "resolved"
            target["resolved_at"] = datetime.now(timezone.utc).isoformat()
        else:
            target["status"] = "pending"
            target["error"] = proc.stderr[-1000:] if proc.stderr else f"exit code {proc.returncode}"
    except subprocess.TimeoutExpired:
        target["status"] = "pending"
        target["error"] = "Retry timed out (5 min)"
    except Exception as exc:
        target["status"] = "pending"
        target["error"] = str(exc)

    _save_dlq(items)
    return {"item": target}


def _build_script_map() -> Dict[str, str]:
    """Build job_name -> script_path map from scheduler registry."""
    mapping: Dict[str, str] = {}
    try:
        # Lazy import to avoid pulling in scheduler dependencies at API startup
        from jobs.scheduler import JOB_REGISTRY
        for job in JOB_REGISTRY:
            mapping[job.name] = job.script
    except ImportError:
        # Fallback: common job names
        pass
    return mapping


@router.get("/pipeline/quality")
def pipeline_quality(db: Session = Depends(get_db)):
    """Run data quality checks and return results.

    Checks:
      1. Null rate on critical columns (lobbying amounts, trade amounts)
      2. Stale data (tables with no recent inserts)
      3. Orphan records (member_votes referencing missing votes)
      4. Duplicate detection (claims with same hash)
    """
    checks: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    # Helper to run a check safely
    def run_check(name: str, query: str, threshold: Any = None, check_type: str = "info"):
        try:
            result = db.execute(text(query)).fetchone()
            value = result[0] if result else None
            passed = True
            if threshold is not None and value is not None:
                passed = value <= threshold
            checks.append({
                "check": name,
                "type": check_type,
                "value": value,
                "threshold": threshold,
                "passed": passed,
            })
        except Exception as exc:
            checks.append({
                "check": name,
                "type": check_type,
                "value": None,
                "threshold": threshold,
                "passed": False,
                "error": str(exc)[:200],
            })

    # 1. Null rate checks on financial columns
    null_checks = [
        ("finance_lobbying_null_income",
         "SELECT ROUND(100.0 * SUM(CASE WHEN total_income IS NULL OR total_income = 0 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) FROM finance_lobbying",
         50.0),
        ("health_contracts_null_amount",
         "SELECT ROUND(100.0 * SUM(CASE WHEN total_obligation IS NULL OR total_obligation = 0 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) FROM health_contracts",
         50.0),
        ("congressional_trades_null_amount",
         "SELECT ROUND(100.0 * SUM(CASE WHEN amount IS NULL THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 1) FROM congressional_trades",
         30.0),
    ]
    for name, query, threshold in null_checks:
        run_check(name, query, threshold=threshold, check_type="null_rate")

    # 2. Stale data checks — tables that should have recent data
    if is_sqlite():
        stale_checks = [
            ("votes_staleness_days",
             "SELECT CAST(julianday('now') - julianday(MAX(date)) AS INTEGER) FROM votes",
             14),
            ("congressional_trades_staleness_days",
             "SELECT CAST(julianday('now') - julianday(MAX(transaction_date)) AS INTEGER) FROM congressional_trades",
             14),
        ]
    elif is_oracle():
        stale_checks = [
            ("votes_staleness_days",
             "SELECT TRUNC(SYSDATE - MAX(\"date\")) FROM votes",
             14),
            ("congressional_trades_staleness_days",
             "SELECT TRUNC(SYSDATE - MAX(transaction_date)) FROM congressional_trades",
             14),
        ]
    else:
        # PostgreSQL
        stale_checks = [
            ("votes_staleness_days",
             "SELECT EXTRACT(DAY FROM NOW() - MAX(date))::INTEGER FROM votes",
             14),
            ("congressional_trades_staleness_days",
             "SELECT EXTRACT(DAY FROM NOW() - MAX(transaction_date))::INTEGER FROM congressional_trades",
             14),
        ]
    for name, query, threshold in stale_checks:
        run_check(name, query, threshold=threshold, check_type="staleness")

    # 3. Orphan records
    orphan_checks = [
        ("orphan_member_votes",
         "SELECT COUNT(*) FROM member_votes mv LEFT JOIN votes v ON mv.vote_id = v.id WHERE v.id IS NULL",
         0),
    ]
    for name, query, threshold in orphan_checks:
        run_check(name, query, threshold=threshold, check_type="orphan")

    # 4. Duplicate checks
    dup_checks = [
        ("duplicate_claims_by_hash",
         "SELECT COUNT(*) - COUNT(DISTINCT claim_hash) FROM claims WHERE claim_hash IS NOT NULL",
         10),
    ]
    for name, query, threshold in dup_checks:
        run_check(name, query, threshold=threshold, check_type="duplicates")

    failed_count = sum(1 for c in checks if not c.get("passed", True))
    return {
        "overall": "healthy" if failed_count == 0 else ("degraded" if failed_count <= 2 else "critical"),
        "total_checks": len(checks),
        "failed_checks": failed_count,
        "checked_at": now.isoformat(),
        "checks": checks,
    }


@router.get("/db/stats")
def db_stats(db: Session = Depends(get_db)):
    """Return database statistics: table row counts, file size, index count."""
    stats: Dict[str, Any] = {
        "database_url": DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

    # Database size
    if is_sqlite():
        db_path = _get_db_path()
        if db_path and os.path.exists(db_path):
            size_bytes = os.path.getsize(db_path)
            stats["file_size_bytes"] = size_bytes
            stats["file_size_mb"] = round(size_bytes / (1024 * 1024), 1)

            # WAL file size
            wal_path = db_path + "-wal"
            if os.path.exists(wal_path):
                stats["wal_size_mb"] = round(os.path.getsize(wal_path) / (1024 * 1024), 1)
    elif is_oracle():
        try:
            size_row = db.execute(text("SELECT SUM(bytes) FROM user_segments")).fetchone()
            if size_row and size_row[0]:
                stats["file_size_bytes"] = int(size_row[0])
                stats["file_size_mb"] = round(int(size_row[0]) / (1024 * 1024), 1)
        except Exception:
            pass

    # Table row counts
    tables: List[Dict[str, Any]] = []
    try:
        rows = db.execute(text(all_tables_sql())).fetchall()
        table_names = [r[0] for r in rows]

        for tname in table_names:
            try:
                count = db.execute(text(table_row_count_sql(tname))).fetchone()[0]
                tables.append({"table": tname, "rows": count})
            except Exception:
                tables.append({"table": tname, "rows": None, "error": "count failed"})

    except Exception as exc:
        stats["table_error"] = str(exc)[:200]

    # Sort by row count descending (largest tables first)
    tables.sort(key=lambda t: t.get("rows") or 0, reverse=True)
    stats["tables"] = tables
    stats["total_tables"] = len(tables)
    stats["total_rows"] = sum(t.get("rows") or 0 for t in tables)

    # Index count
    try:
        idx_count = db.execute(text(index_count_sql())).fetchone()[0]
        stats["index_count"] = idx_count
    except Exception:
        stats["index_count"] = None

    # Disk usage (SQLite only — file-based)
    if is_sqlite():
        try:
            db_path = _get_db_path()
            if db_path:
                import shutil
                total, used, free = shutil.disk_usage(os.path.dirname(db_path) or ".")
                stats["disk"] = {
                    "total_gb": round(total / (1024**3), 1),
                    "used_gb": round(used / (1024**3), 1),
                    "free_gb": round(free / (1024**3), 1),
                    "usage_pct": round(100 * used / total, 1),
                }
        except Exception:
            pass

    return stats


# ---------------------------------------------------------------------------
# Token Usage Tracking
# ---------------------------------------------------------------------------

@router.get("/token-usage")
def get_token_usage(
    days: int = 7,
    feature: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get token usage breakdown by feature and model.

    Returns per-feature totals, per-model totals, daily totals,
    and individual call log for the specified period.
    """
    try:
        from models.token_usage import TokenUsageLog
    except ImportError:
        return {"error": "Token usage tracking not available"}

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    query = db.query(TokenUsageLog).filter(TokenUsageLog.created_at >= cutoff)
    if feature:
        query = query.filter(TokenUsageLog.feature == feature)

    rows = query.order_by(TokenUsageLog.created_at.desc()).all()

    # Aggregate by feature
    by_feature: Dict[str, Any] = {}
    by_model: Dict[str, Any] = {}
    by_day: Dict[str, Any] = {}
    total_cost = 0.0
    total_tokens = 0

    for r in rows:
        # Per feature
        if r.feature not in by_feature:
            by_feature[r.feature] = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
        by_feature[r.feature]["calls"] += 1
        by_feature[r.feature]["input_tokens"] += r.input_tokens
        by_feature[r.feature]["output_tokens"] += r.output_tokens
        by_feature[r.feature]["cost_usd"] = round(by_feature[r.feature]["cost_usd"] + r.cost_usd, 6)

        # Per model
        if r.model not in by_model:
            by_model[r.model] = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
        by_model[r.model]["calls"] += 1
        by_model[r.model]["input_tokens"] += r.input_tokens
        by_model[r.model]["output_tokens"] += r.output_tokens
        by_model[r.model]["cost_usd"] = round(by_model[r.model]["cost_usd"] + r.cost_usd, 6)

        # Per day
        day_key = r.created_at.strftime("%Y-%m-%d") if r.created_at else "unknown"
        if day_key not in by_day:
            by_day[day_key] = {"calls": 0, "tokens": 0, "cost_usd": 0.0}
        by_day[day_key]["calls"] += 1
        by_day[day_key]["tokens"] += r.total_tokens
        by_day[day_key]["cost_usd"] = round(by_day[day_key]["cost_usd"] + r.cost_usd, 6)

        total_cost += r.cost_usd
        total_tokens += r.total_tokens

    # Recent calls (last 20)
    recent = [
        {
            "feature": r.feature,
            "model": r.model,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "cost_usd": r.cost_usd,
            "detail": r.detail,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows[:20]
    ]

    return {
        "period_days": days,
        "total_calls": len(rows),
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost, 4),
        "by_feature": by_feature,
        "by_model": by_model,
        "by_day": dict(sorted(by_day.items())),
        "recent_calls": recent,
    }


# ---------------------------------------------------------------------------
# Gate 5 — Story Review Queue
# ---------------------------------------------------------------------------
# Every story that passes Gates 1-4 lands here as status='draft'. A human
# approves or rejects before it becomes visible to the public. This is the
# last line of defense after the April 2026 mass retraction.

from pydantic import BaseModel
from models.stories_models import Story


class StoryReviewDecision(BaseModel):
    reason: Optional[str] = None


class StoryEditPatch(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    sector: Optional[str] = None


@router.get("/story-queue")
def story_queue(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    """List all draft stories awaiting human review, newest first.

    Stories appear here after auto-generation passes Gates 1-4 but before
    any public exposure. Frontend: pairs with /ops/story-queue/{id}/approve
    and /ops/story-queue/{id}/reject.
    """
    try:
        q = db.query(Story).filter(Story.status == "draft")
        total = q.count()
        rows = q.order_by(Story.created_at.desc()).offset(offset).limit(limit).all()
    except Exception as exc:
        logger.warning("story queue query failed: %s", exc)
        return {"total": 0, "stories": []}

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "stories": [
            {
                "id": s.id,
                "title": s.title,
                "slug": s.slug,
                "summary": s.summary,
                "body": s.body,
                "category": s.category,
                "sector": s.sector,
                "entity_ids": s.entity_ids,
                "data_sources": s.data_sources,
                "evidence": s.evidence,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in rows
        ],
    }


@router.get("/story-queue/stats")
def story_queue_stats(db: Session = Depends(get_db)):
    """Quick counts: how many drafts, how many published, how many retracted."""
    try:
        drafts = db.query(Story).filter(Story.status == "draft").count()
        published = db.query(Story).filter(Story.status == "published").count()
        retracted = db.query(Story).filter(Story.status == "retracted").count()
    except Exception as exc:
        logger.warning("story queue stats failed: %s", exc)
        return {"drafts": 0, "published": 0, "retracted": 0}
    return {"drafts": drafts, "published": published, "retracted": retracted}


@router.post("/story-queue/{story_id}/approve")
def story_queue_approve(
    story_id: int,
    decision: Optional[StoryReviewDecision] = None,
    db: Session = Depends(get_db),
):
    """Human approves a draft story. Sets status='published' and published_at=now."""
    try:
        story = db.query(Story).filter(Story.id == story_id).first()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")
    if not story:
        raise HTTPException(status_code=404, detail=f"Story {story_id} not found")
    if story.status != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Story {story_id} is '{story.status}', not 'draft'",
        )

    story.status = "published"
    story.published_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to approve story %d: %s", story_id, exc)
        raise HTTPException(status_code=500, detail="Failed to approve story")
    logger.info("story-queue approve: id=%d slug=%s reason=%s",
                story_id, story.slug, (decision.reason if decision else ""))
    return {
        "id": story.id,
        "slug": story.slug,
        "status": "published",
        "published_at": story.published_at.isoformat(),
    }


@router.get("/story-queue/{story_id}/approve")
def story_queue_approve_get(
    story_id: int,
    confirm: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_press_key),
):
    """GET version for email link taps — shows a confirmation page first.

    Two-step: initial GET shows a confirm button (safe against email scanners
    that prefetch links). Only `?confirm=yes` actually publishes.
    """
    from fastapi.responses import HTMLResponse
    try:
        story = db.query(Story).filter(Story.id == story_id).first()
    except Exception as exc:
        logger.error("Story queue approve error: %s", exc)
        return HTMLResponse("<h2>Error</h2><p>Internal server error.</p>", status_code=500)
    if not story:
        return HTMLResponse(f"<h2>Not found</h2><p>Story {story_id} not found.</p>", status_code=404)

    journal_base = os.getenv("WTP_JOURNAL_BASE", "https://journal.wethepeopleforus.com")
    safe_slug = html.escape(story.slug or "")
    article_url = f"{journal_base}/story/{safe_slug}" if safe_slug else journal_base
    safe_title = html.escape(story.title or "Untitled")

    if story.status == "published":
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
            f"<h2 style='color:#16a34a'>Already published</h2>"
            f"<p><strong>{safe_title}</strong> was already approved.</p>"
            f"<p style='margin-top:24px'>"
            f"<a href='{article_url}' style='display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600'>View Article &rarr;</a>"
            f"</p>"
            f"</body></html>"
        )
    if story.status != "draft":
        return HTMLResponse(
            f"<h2>Cannot approve</h2><p>Story is '{html.escape(story.status)}', not 'draft'.</p>",
            status_code=400,
        )

    # Step 1: show confirmation page (email scanners stop here)
    if confirm != "yes":
        from urllib.parse import urlencode, urlparse, parse_qs, urlunparse, urljoin
        from starlette.requests import Request
        # Build the confirm URL by appending &confirm=yes
        # We reconstruct from the current path to preserve the key param
        key_param = f"key={html.escape(os.getenv('WTP_PRESS_API_KEY', os.getenv('WTP_PRESS_KEY', '')))}"
        confirm_url = f"/ops/story-queue/{story_id}/approve?{key_param}&amp;confirm=yes"
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
            f"<h2>Approve this story?</h2>"
            f"<p><strong>{safe_title}</strong></p>"
            f"<p style='color:#64748b;font-size:13px;margin-bottom:24px;'>"
            f"{html.escape((story.summary or '')[:200])}</p>"
            f"<a href='{confirm_url}' style='display:inline-block;background:#16a34a;color:#fff;"
            f"text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:16px;'>"
            f"Confirm Publish</a>"
            f"<p style='color:#94a3b8;font-size:11px;margin-top:16px;'>Click to confirm. "
            f"This extra step prevents email scanners from auto-approving stories.</p>"
            f"</body></html>"
        )

    # Step 2: confirmed — publish
    story.status = "published"
    story.published_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to approve story %d: %s", story_id, exc)
        return HTMLResponse("<h2>Error</h2><p>Failed to publish story.</p>", status_code=500)
    logger.info("story-queue approve (GET+confirm): id=%d slug=%s", story_id, story.slug)
    return HTMLResponse(
        f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
        f"<h2 style='color:#16a34a'>&#10003; Published</h2>"
        f"<p><strong>{safe_title}</strong> is now live.</p>"
        f"<p style='color:#64748b;font-size:14px'>Published at {story.published_at.strftime('%Y-%m-%d %H:%M UTC')}</p>"
        f"<p style='margin-top:24px'>"
        f"<a href='{article_url}' style='display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600'>View Article &rarr;</a>"
        f"</p>"
        f"</body></html>"
    )


@router.get("/story-queue/{story_id}/reject")
def story_queue_reject_get(
    story_id: int,
    confirm: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_press_key),
):
    """GET version for email link taps — shows confirmation page first.

    Two-step: initial GET shows confirm button. Only `?confirm=yes` retracts.
    """
    from fastapi.responses import HTMLResponse
    try:
        story = db.query(Story).filter(Story.id == story_id).first()
    except Exception as exc:
        logger.error("Story queue reject error: %s", exc)
        return HTMLResponse("<h2>Error</h2><p>Internal server error.</p>", status_code=500)
    if not story:
        return HTMLResponse(f"<h2>Not found</h2><p>Story {story_id} not found.</p>", status_code=404)
    safe_title = html.escape(story.title or "Untitled")
    if story.status == "retracted":
        return HTMLResponse(
            f"<h2>Already rejected</h2><p><strong>{safe_title}</strong> was already retracted.</p>",
        )
    if story.status not in ("draft", "published"):
        return HTMLResponse(
            f"<h2>Cannot reject</h2><p>Story is '{html.escape(story.status)}'.</p>",
            status_code=400,
        )

    # Step 1: show confirmation page
    if confirm != "yes":
        key_param = f"key={html.escape(os.getenv('WTP_PRESS_API_KEY', os.getenv('WTP_PRESS_KEY', '')))}"
        confirm_url = f"/ops/story-queue/{story_id}/reject?{key_param}&amp;confirm=yes"
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
            f"<h2>Reject this story?</h2>"
            f"<p><strong>{safe_title}</strong></p>"
            f"<p style='color:#64748b;font-size:13px;margin-bottom:24px;'>"
            f"{html.escape((story.summary or '')[:200])}</p>"
            f"<a href='{confirm_url}' style='display:inline-block;background:#dc2626;color:#fff;"
            f"text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:16px;'>"
            f"Confirm Reject</a>"
            f"<p style='color:#94a3b8;font-size:11px;margin-top:16px;'>Click to confirm. "
            f"This extra step prevents email scanners from auto-rejecting stories.</p>"
            f"</body></html>"
        )

    # Step 2: confirmed — retract
    story.status = "retracted"
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to reject story %d: %s", story_id, exc)
        return HTMLResponse("<h2>Error</h2><p>Failed to reject story.</p>", status_code=500)
    logger.info("story-queue reject (GET+confirm): id=%d slug=%s", story_id, story.slug)
    return HTMLResponse(
        f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
        f"<h2 style='color:#dc2626'>&#10007; Rejected</h2>"
        f"<p><strong>{safe_title}</strong> has been retracted.</p>"
        f"<p style='color:#64748b;font-size:14px'>Story is archived for audit purposes but not shown publicly.</p>"
        f"</body></html>"
    )


@router.post("/story-queue/{story_id}/reject")
def story_queue_reject(
    story_id: int,
    decision: Optional[StoryReviewDecision] = None,
    db: Session = Depends(get_db),
):
    """Human rejects a draft story. Sets status='retracted' — retained in DB
    for auditing but invisible to the public.
    """
    try:
        story = db.query(Story).filter(Story.id == story_id).first()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")
    if not story:
        raise HTTPException(status_code=404, detail=f"Story {story_id} not found")
    if story.status not in ("draft", "published"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject a story in status '{story.status}'",
        )

    story.status = "retracted"
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to reject story %d: %s", story_id, exc)
        raise HTTPException(status_code=500, detail="Failed to reject story")
    logger.info("story-queue reject: id=%d slug=%s reason=%s",
                story_id, story.slug, (decision.reason if decision else ""))
    return {
        "id": story.id,
        "slug": story.slug,
        "status": "retracted",
    }


@router.post("/story-queue/{story_id}/edit")
def story_queue_edit(
    story_id: int,
    patch: StoryEditPatch,
    db: Session = Depends(get_db),
):
    """Human edits a draft before approving.

    Accepts any of: title, summary, body, category, sector. Leaves the story
    in 'draft' status so it can still be approved or rejected afterwards.
    """
    try:
        story = db.query(Story).filter(Story.id == story_id).first()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")
    if not story:
        raise HTTPException(status_code=404, detail=f"Story {story_id} not found")
    if story.status != "draft":
        raise HTTPException(
            status_code=400,
            detail=f"Can only edit drafts, not '{story.status}'",
        )

    changed = []
    for key, value in patch.model_dump(exclude_unset=True).items():
        setattr(story, key, value)
        changed.append(key)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to edit story %d: %s", story_id, exc)
        raise HTTPException(status_code=500, detail="Failed to edit story")
    logger.info("story-queue edit: id=%d fields=%s", story_id, changed)
    return {"id": story.id, "slug": story.slug, "changed": changed}


# ── Draft Quote-Tweet Queue (Gate 5 extension for Twitter monitor) ─────────────

@router.get("/draft-queue")
def draft_queue(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """List draft quote-tweets awaiting human review.

    The twitter_monitor generates drafts when it finds matching entities
    in watchdog account tweets. Drafts must be approved here before posting.

    Optional ?status=pending|approved|posted|rejected filter.
    """
    from models.twitter_models import DraftReply

    query = db.query(DraftReply)
    if status:
        query = query.filter(DraftReply.status == status)
    query = query.order_by(DraftReply.score.desc(), DraftReply.created_at.desc())

    total = query.count()
    drafts = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "drafts": [
            {
                "id": d.id,
                "target_tweet_id": d.target_tweet_id,
                "target_username": d.target_username,
                "target_text": d.target_text,
                "suggested_text": d.suggested_text,
                "matched_entity": d.matched_entity,
                "matched_data": d.matched_data,
                "score": d.score,
                "status": d.status,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "posted_at": d.posted_at.isoformat() if d.posted_at else None,
            }
            for d in drafts
        ],
    }


@router.get("/draft-queue/stats")
def draft_queue_stats(db: Session = Depends(get_db)):
    """Quick counts for draft queue."""
    from models.twitter_models import DraftReply

    pending = db.query(DraftReply).filter(DraftReply.status == "pending").count()
    approved = db.query(DraftReply).filter(DraftReply.status == "approved").count()
    posted = db.query(DraftReply).filter(DraftReply.status == "posted").count()
    rejected = db.query(DraftReply).filter(DraftReply.status == "rejected").count()

    return {
        "pending": pending,
        "approved": approved,
        "posted": posted,
        "rejected": rejected,
        "total": pending + approved + posted + rejected,
    }


@router.post("/draft-queue/{draft_id}/approve")
def draft_queue_approve(
    draft_id: int,
    db: Session = Depends(get_db),
):
    """Approve a draft quote-tweet for posting.

    Sets status to 'approved'. The twitter_monitor --post-approved cron job
    will pick it up and post it at the next cycle.
    """
    from models.twitter_models import DraftReply

    draft = db.query(DraftReply).filter(DraftReply.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft {draft_id} not found")
    if draft.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Can only approve pending drafts, not '{draft.status}'",
        )

    draft.status = "approved"
    draft.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    logger.info("draft-queue approve: id=%d entity=%s", draft_id, draft.matched_entity)
    return {"id": draft.id, "status": "approved", "entity": draft.matched_entity}


@router.get("/draft-queue/{draft_id}/approve")
def draft_queue_approve_get(
    draft_id: int,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_press_key),
):
    """GET version for email link taps — approves the draft."""
    from models.twitter_models import DraftReply

    draft = db.query(DraftReply).filter(DraftReply.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft {draft_id} not found")
    if draft.status == "pending":
        draft.status = "approved"
        draft.reviewed_at = datetime.now(timezone.utc)
        db.commit()

    return f"""<html><body style="font-family:sans-serif;text-align:center;padding:40px">
    <h2>Draft #{draft_id} Approved</h2>
    <p>Entity: {html.escape(draft.matched_entity or '')}</p>
    <p>Will be posted at next cycle.</p>
    </body></html>"""


@router.post("/draft-queue/{draft_id}/reject")
def draft_queue_reject(
    draft_id: int,
    db: Session = Depends(get_db),
):
    """Reject a draft quote-tweet. Retained in DB for auditing."""
    from models.twitter_models import DraftReply

    draft = db.query(DraftReply).filter(DraftReply.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft {draft_id} not found")
    if draft.status not in ("pending", "approved"):
        raise HTTPException(
            status_code=400,
            detail=f"Can only reject pending/approved drafts, not '{draft.status}'",
        )

    draft.status = "rejected"
    draft.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    logger.info("draft-queue reject: id=%d entity=%s", draft_id, draft.matched_entity)
    return {"id": draft.id, "status": "rejected"}


@router.get("/draft-queue/{draft_id}/reject")
def draft_queue_reject_get(
    draft_id: int,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_press_key),
):
    """GET version for email link taps — rejects the draft."""
    from models.twitter_models import DraftReply

    draft = db.query(DraftReply).filter(DraftReply.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft {draft_id} not found")
    if draft.status in ("pending", "approved"):
        draft.status = "rejected"
        draft.reviewed_at = datetime.now(timezone.utc)
        db.commit()

    return f"""<html><body style="font-family:sans-serif;text-align:center;padding:40px">
    <h2>Draft #{draft_id} Rejected</h2>
    <p>Entity: {html.escape(draft.matched_entity or '')}</p>
    <p>Draft will not be posted.</p>
    </body></html>"""


@router.post("/draft-queue/{draft_id}/edit")
def draft_queue_edit(
    draft_id: int,
    patch: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """Edit a draft's suggested_text before approving."""
    from models.twitter_models import DraftReply

    draft = db.query(DraftReply).filter(DraftReply.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft {draft_id} not found")
    if draft.status not in ("pending", "approved"):
        raise HTTPException(
            status_code=400,
            detail=f"Can only edit pending/approved drafts, not '{draft.status}'",
        )

    if "suggested_text" in patch and isinstance(patch["suggested_text"], str):
        draft.suggested_text = patch["suggested_text"]
        db.commit()
        logger.info("draft-queue edit: id=%d", draft_id)
        return {"id": draft.id, "status": draft.status, "updated": True}

    raise HTTPException(status_code=400, detail="Only 'suggested_text' can be edited")
