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

from fastapi import APIRouter, Depends, HTTPException, Request
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
    """Retry a failed DLQ item by re-running its job in a background thread.

    Marks the item as 'retrying' immediately and returns. The job runs
    asynchronously; poll GET /pipeline/dlq to check status.
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

    def _run_retry():
        """Background thread: run the job and update DLQ status."""
        try:
            proc = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True, text=True,
                timeout=300,  # 5 min max for retry
                cwd=str(ROOT),
            )
            dlq = _load_dlq()
            t = next((i for i in dlq if i.get("id") == item_id), None)
            if t is None:
                return
            if proc.returncode == 0:
                t["status"] = "resolved"
                t["resolved_at"] = datetime.now(timezone.utc).isoformat()
            else:
                t["status"] = "pending"
                t["error"] = proc.stderr[-1000:] if proc.stderr else f"exit code {proc.returncode}"
            _save_dlq(dlq)
        except subprocess.TimeoutExpired:
            dlq = _load_dlq()
            t = next((i for i in dlq if i.get("id") == item_id), None)
            if t:
                t["status"] = "pending"
                t["error"] = "Retry timed out (5 min)"
                _save_dlq(dlq)
        except Exception as exc:
            logger.error("DLQ retry background error for %s: %s", item_id, exc)
            dlq = _load_dlq()
            t = next((i for i in dlq if i.get("id") == item_id), None)
            if t:
                t["status"] = "pending"
                t["error"] = str(exc)[:500]
                _save_dlq(dlq)

    import threading as _threading
    _threading.Thread(target=_run_retry, daemon=True).start()

    return {"item": target, "message": "Retry started in background. Poll /pipeline/dlq for status."}


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

from pydantic import BaseModel, Field
from models.stories_models import Story


class StoryReviewDecision(BaseModel):
    reason: Optional[str] = None
    # Set true to publish a draft whose right-to-respond is still
    # 'pending' for one or more entities. The override is logged.
    override_right_to_respond: Optional[bool] = False


class StoryEditPatch(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    body: Optional[str] = None
    category: Optional[str] = None
    sector: Optional[str] = None


class RightToRespondEntry(BaseModel):
    """One entity's right-to-respond state. Editor records this per
    entity named in the story before approving."""
    # entity_id matches our entity_id slugs (kebab-case companies,
    # snake_case people). 256 is well above any real slug we use; bigger
    # payloads are abusive.
    entity_id: str = Field(..., min_length=1, max_length=256)
    # 'sent'      = comment request sent to the entity, awaiting reply
    # 'received'  = entity replied (response_text captures the reply)
    # 'no_reply'  = sent, 24h elapsed, no response received (publishable)
    # 'skipped'   = editor decided this entity doesn't require a comment
    #               request (data brief, public official quote, etc.)
    #               and recorded a reason
    # 'pending'   = no action recorded yet; the default
    status: str = Field(..., min_length=1, max_length=32)
    # response_text holds the entity's reply (or a summary). Cap at
    # 16K so a malicious or buggy submission can't bloat the JSON
    # evidence column to the point that the row stops fitting in
    # SQLite's page cache.
    response_text: Optional[str] = Field(default=None, max_length=16384)
    reason: Optional[str] = Field(default=None, max_length=2048)


class RightToRespondPatch(BaseModel):
    """Whole-checklist update. Sent from the review page form."""
    # Cap at 200 entries — way more than any realistic story would
    # name, but bounded so a malicious POST can't stuff the column
    # with megabytes.
    entries: List[RightToRespondEntry] = Field(..., max_length=200)


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
        # Previously returned {"total": 0, "stories": []} on error, making the
        # admin UI look like "nothing to review" when the DB was actually
        # misbehaving — a backlog could silently hide. Surface the error.
        logger.error("story queue query failed", exc_info=True)
        raise HTTPException(status_code=500, detail="story-queue query failed")

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
    except Exception:
        logger.error("story queue stats failed", exc_info=True)
        raise HTTPException(status_code=500, detail="story-queue stats query failed")
    return {"drafts": drafts, "published": published, "retracted": retracted}


_RTR_VALID_STATUSES = frozenset({"sent", "received", "no_reply", "skipped", "pending"})


def _rtr_entries(story: Story) -> List[Dict[str, Any]]:
    """Pull the per-entity right-to-respond entries off a story.

    Reads from evidence.right_to_respond.entries (the canonical store).
    Falls back to constructing a fresh pending list from
    evidence.right_to_respond.entities_to_contact (the orchestrator's
    initial stamp) so legacy drafts work without a backfill.
    """
    if not isinstance(story.evidence, dict):
        return []
    rtr = story.evidence.get("right_to_respond") or {}
    if not isinstance(rtr, dict):
        return []
    entries = rtr.get("entries")
    if isinstance(entries, list) and entries:
        return [e for e in entries if isinstance(e, dict) and e.get("entity_id")]
    # Fallback: build a default pending list from the original stamp.
    raw_entities = rtr.get("entities_to_contact") or []
    if not isinstance(raw_entities, list):
        return []
    return [
        {"entity_id": str(eid), "status": "pending", "response_text": None, "reason": None}
        for eid in raw_entities if eid
    ]


def _rtr_unresolved(story: Story) -> List[str]:
    """Return entity_ids whose right-to-respond status is still
    'pending' (i.e. not yet acted on by the editor). Used by the
    approve flow to warn before publishing."""
    return [
        e["entity_id"]
        for e in _rtr_entries(story)
        if e.get("status", "pending") == "pending"
    ]


@router.post("/story-queue/{story_id}/respond")
def story_queue_respond(
    story_id: int,
    patch: RightToRespondPatch,
    db: Session = Depends(get_db),
):
    """Record per-entity right-to-respond state on a draft.

    Idempotent: replaces evidence.right_to_respond.entries with the
    submitted list. Editors call this from the review page form
    before approving an investigative draft.
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
            detail=f"Story {story_id} is '{story.status}', not 'draft'",
        )

    cleaned: List[Dict[str, Any]] = []
    for e in patch.entries:
        status = (e.status or "pending").strip().lower()
        if status not in _RTR_VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"invalid status '{status}' for entity {e.entity_id}",
            )
        cleaned.append({
            "entity_id": e.entity_id,
            "status": status,
            "response_text": (e.response_text or "").strip() or None,
            "reason": (e.reason or "").strip() or None,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })

    # Concurrency note: this is a read-modify-write on the JSON
    # `evidence` column without a row lock. Two simultaneous editors
    # could lose each other's writes (last write wins). Acceptable
    # while WTP is single-editor; revisit when we add a second
    # reviewer (use SQLite's `json_patch` or an UPDATE WHERE for
    # optimistic locking on a version column).
    evidence = dict(story.evidence) if isinstance(story.evidence, dict) else {}
    rtr = dict(evidence.get("right_to_respond") or {})
    rtr["entries"] = cleaned
    evidence["right_to_respond"] = rtr
    story.evidence = evidence
    try:
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(story, "evidence")
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to record right-to-respond for story %d: %s", story_id, exc)
        raise HTTPException(status_code=500, detail="Failed to record right-to-respond")

    return {
        "story_id": story_id,
        "entries": cleaned,
        "unresolved": _rtr_unresolved(story),
    }


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

    # Right-to-respond enforcement. Block by default when entities
    # named in the story haven't had their right-to-respond resolved.
    # The decision payload can carry override=true to publish anyway,
    # which is logged for the audit trail.
    unresolved = _rtr_unresolved(story)
    override = bool(getattr(decision, "override_right_to_respond", False)) if decision else False
    if unresolved and not override:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "right_to_respond_unresolved",
                "message": (
                    "This draft names entities that don't have a recorded "
                    "right-to-respond decision. Resolve them via "
                    f"/ops/story-queue/{story_id}/respond, or pass "
                    "override_right_to_respond=true to publish anyway "
                    "(the override is logged)."
                ),
                "unresolved_entities": unresolved,
            },
        )

    story.status = "published"
    story.published_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to approve story %d: %s", story_id, exc)
        raise HTTPException(status_code=500, detail="Failed to approve story")
    logger.info(
        "story-queue approve: id=%d slug=%s reason=%s rtr_override=%s unresolved=%s",
        story_id,
        story.slug,
        (decision.reason if decision else ""),
        override,
        unresolved if unresolved else "none",
    )
    # Fire-and-forget Wayback snapshot. Best-effort: failure does not
    # roll back the publish. Press credentials and academic citations
    # depend on a permanent archived URL. Stores the snapshot URL
    # back to the story when successful.
    _fire_wayback_snapshot(story.slug, story_id=story.id, db=db)
    # Fire-and-forget Action Panel seeding. The seeder is idempotent
    # (skips stories that already have actions), so re-approval after
    # an editorial revision doesn't duplicate rows. Failure to seed
    # never blocks publication; the panel just renders empty until
    # someone runs scripts/seed_story_actions.py manually.
    try:
        from scripts.seed_story_actions import seed_one as _seed_actions
        inserted = _seed_actions(db, story, replace=False, dry_run=False)
        if inserted:
            db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning(
            "action-seed on approve failed for story %d (%s): %s",
            story.id, story.slug, exc,
        )
    return {
        "id": story.id,
        "slug": story.slug,
        "status": "published",
        "published_at": story.published_at.isoformat(),
        "right_to_respond_override": override if unresolved else None,
    }


def _fire_wayback_snapshot(
    slug: str,
    story_id: Optional[int] = None,
    db: Optional[Session] = None,
) -> Optional[str]:
    """Submit a published story to the Wayback Machine and persist the
    archived URL on success.

    Best-effort: runs synchronously, never raises, never blocks
    publish. On success, writes the snapshot URL to
    `story.evidence.wayback_url` so the story page can render
    "View on Wayback" and citations have a permanent URL. On failure,
    logs the failure for the retry-sweep cron at
    `jobs/retry_wayback_snapshots.py` to pick up next run.

    Returns the snapshot URL when successful, None otherwise.
    """
    if not slug:
        return None
    try:
        from services.wayback_archive import archive_published_story
        snapshot = archive_published_story(slug)
    except Exception as e:
        logger.warning("wayback: snapshot for %s errored: %s", slug, e)
        return None

    if not snapshot:
        logger.warning("wayback: snapshot for %s did not return URL", slug)
        return None

    logger.info("wayback: snapshotted %s -> %s", slug, snapshot)

    # Persist the URL onto the story so it survives across requests.
    # Skip persistence when caller didn't pass a story_id+db (legacy
    # call sites). Failures here are logged and tolerated; the
    # snapshot URL itself is still in the logs even if the persist
    # step fails, and the retry sweep will rediscover.
    if story_id is None or db is None:
        return snapshot
    try:
        from models.stories_models import Story
        from sqlalchemy.orm.attributes import flag_modified
        story = db.query(Story).filter(Story.id == story_id).first()
        if story is None:
            return snapshot
        evidence = dict(story.evidence) if isinstance(story.evidence, dict) else {}
        evidence["wayback_url"] = snapshot
        evidence["wayback_archived_at"] = datetime.now(timezone.utc).isoformat()
        story.evidence = evidence
        flag_modified(story, "evidence")
        db.commit()
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning(
            "wayback: persist for story_id=%s slug=%s failed (URL still logged): %s",
            story_id, slug, e,
        )

    return snapshot


@router.get("/story-queue/{story_id}")
def story_queue_view(
    story_id: int,
    token: Optional[str] = None,
    key: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_press_key),
):
    """Render a single draft for human review with inline approve/reject.

    Auth passes through ``require_press_key``, which accepts:
      - X-WTP-API-Key header
      - ``?key=<press key>`` (legacy)
      - ``?token=<signed view token>`` scoped to this story_id + action="view"

    The draft-arrival email links here with a signed view token so the
    raw press key never lands in mail server logs / archives. Approve
    and Reject buttons on this page carry their own action-scoped
    tokens generated server-side at render time.
    """
    from fastapi.responses import HTMLResponse
    from services.press_signed_token import sign_story_action

    try:
        story = db.query(Story).filter(Story.id == story_id).first()
    except Exception as exc:
        logger.error("Story queue view error: %s", exc)
        return HTMLResponse("<h2>Error</h2><p>Internal server error.</p>", status_code=500)
    if not story:
        return HTMLResponse(
            f"<h2>Not found</h2><p>Story {story_id} not found.</p>", status_code=404,
        )

    api_base = os.getenv("WTP_API_BASE", "https://api.wethepeopleforus.com")
    journal_base = os.getenv("WTP_JOURNAL_BASE", "https://journal.wethepeopleforus.com")

    safe_title = html.escape(story.title or "Untitled")
    safe_summary = html.escape(story.summary or "")
    safe_body = html.escape(story.body or "").replace("\n\n", "</p><p>").replace("\n", "<br>")
    safe_category = html.escape(story.category or "uncategorized")
    safe_sector = html.escape(story.sector or "cross-sector")
    safe_status = html.escape(story.status or "?")
    safe_slug = html.escape(story.slug or "")

    entities = ", ".join(story.entity_ids or []) if isinstance(story.entity_ids, list) else ""
    sources = ", ".join(story.data_sources or []) if isinstance(story.data_sources, list) else ""

    verification_tier = html.escape(story.verification_tier or "—")
    verification_score = (
        f"{story.verification_score:.2f}"
        if isinstance(story.verification_score, (int, float))
        else "—"
    )

    # Implication-review flags + right-to-respond requirement (both
    # set by the orchestrator's editor pass). Stored on evidence.* so
    # they round-trip through the JSON evidence column without a
    # schema change.
    evidence_obj = story.evidence if isinstance(story.evidence, dict) else {}

    # Right-to-respond block. Renders an interactive form: per-entity
    # status select + reason/response textarea. Submits to
    # POST /ops/story-queue/{id}/respond which persists into
    # evidence.right_to_respond.entries. The approve flow blocks
    # when any entry is still 'pending' unless explicitly overridden.
    # Mint a respond-action signed token so the JS form submission
    # works for editors who arrived via the view-token email link.
    # The view-token doesn't authorize POST to /respond (different
    # action). The respond-token is scoped to (story_id, "respond")
    # and expires per the press_signed_token TTL.
    rtr_respond_token = ""
    try:
        from services.press_signed_token import sign_story_action
        rtr_respond_token = sign_story_action(story.id, "respond")
    except Exception as e:
        logger.warning("could not mint respond token for story %s: %s", story.id, e)

    rtr_block = ""
    rtr = evidence_obj.get("right_to_respond") if isinstance(evidence_obj, dict) else None
    if isinstance(rtr, dict) and (rtr.get("entities_to_contact") or rtr.get("entries")):
        rtr_entries = _rtr_entries(story)
        rows_html = ""
        # CSRF-style risk note: this admin page is gated by
        # require_press_key, so the form submission carries the same
        # auth via the page's cookie/header. Token-tap paths use the
        # signed-token query string and are read-only on this view
        # (no JS submit). For full interactivity, the operator hits
        # this page authenticated.
        for i, entry in enumerate(rtr_entries):
            eid = html.escape(str(entry.get("entity_id", "")))
            current_status = (entry.get("status") or "pending").lower()

            def _opt(val: str, label: str) -> str:
                sel = " selected" if val == current_status else ""
                return f"<option value='{val}'{sel}>{label}</option>"

            options_html = (
                _opt("pending", "Pending — no action recorded")
                + _opt("sent", "Sent — comment request sent, awaiting reply")
                + _opt("received", "Received — entity replied")
                + _opt("no_reply", "No reply — sent + 24h elapsed")
                + _opt("skipped", "Skipped — comment request not required")
            )
            response_text = html.escape(str(entry.get("response_text") or ""))
            reason = html.escape(str(entry.get("reason") or ""))
            recorded_at = html.escape(str(entry.get("recorded_at") or "—"))
            rows_html += (
                f"<div style='padding:12px;border:1px solid #fde047;border-radius:6px;background:#fffbea;margin-bottom:10px'>"
                f"<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'>"
                f"<strong style='font-size:14px;color:#0f172a'>{eid}</strong>"
                f"<span style='font-size:11px;color:#92400e'>{recorded_at}</span>"
                f"</div>"
                f"<input type='hidden' name='entries[{i}][entity_id]' value='{eid}'>"
                f"<select name='entries[{i}][status]' style='width:100%;padding:6px;font-size:13px;border:1px solid #fbbf24;border-radius:4px'>"
                f"{options_html}"
                f"</select>"
                f"<textarea name='entries[{i}][response_text]' rows='2' "
                f"placeholder='If received: paste the response or a summary' "
                f"style='width:100%;margin-top:6px;padding:6px;font-size:12px;border:1px solid #fbbf24;border-radius:4px'>"
                f"{response_text}</textarea>"
                f"<input type='text' name='entries[{i}][reason]' value='{reason}' "
                f"placeholder='If skipped or no_reply: short reason' "
                f"style='width:100%;margin-top:6px;padding:6px;font-size:12px;border:1px solid #fbbf24;border-radius:4px'>"
                f"</div>"
            )
        # JavaScript: collect form values and POST as JSON with the
        # press-key passed through the signed token if available.
        # The page's URL contains the token; we extract it client-side.
        rtr_block = (
            f"<div id='rtr-block' style='margin-bottom:20px;padding:14px 16px;background:#fefce8;"
            f"border:1px solid #fde047;border-radius:8px'>"
            f"<div style='font-size:13px;color:#854d0e;font-weight:700;margin-bottom:10px'>"
            f"Right-to-respond &mdash; record per-entity decision before approving"
            f"</div>"
            f"{rows_html}"
            f"<button type='button' id='rtr-save' "
            f"style='background:#854d0e;color:#fff;border:0;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer'>"
            f"Save right-to-respond decisions</button>"
            f"<span id='rtr-status' style='margin-left:12px;font-size:12px;color:#854d0e'></span>"
            f"<div style='margin-top:8px;font-size:11px;color:#854d0e;font-style:italic'>"
            f"Approve will be blocked until every entity is marked with a status other than 'pending', "
            f"unless an explicit override is recorded."
            f"</div></div>"
            f"<script>(function(){{"
            f"var btn = document.getElementById('rtr-save');"
            f"var statusEl = document.getElementById('rtr-status');"
            f"if (!btn) return;"
            f"btn.addEventListener('click', function(){{"
            f"  var entries = [];"
            f"  var rows = document.querySelectorAll('#rtr-block input[type=hidden][name$=\"[entity_id]\"]');"
            f"  rows.forEach(function(h, idx){{"
            f"    var prefix = 'entries['+idx+']';"
            f"    var statusEl2 = document.querySelector('[name=\"'+prefix+'[status]\"]');"
            f"    var respEl = document.querySelector('[name=\"'+prefix+'[response_text]\"]');"
            f"    var reasonEl = document.querySelector('[name=\"'+prefix+'[reason]\"]');"
            f"    entries.push({{entity_id: h.value, status: statusEl2.value, response_text: respEl.value || null, reason: reasonEl.value || null}});"
            f"  }});"
            f"  var qp = new URLSearchParams(window.location.search);"
            f"  var url = '/ops/story-queue/{story.id}/respond';"
            # Prefer the server-minted respond-token (scoped to this
            # story_id + 'respond' action). The view-token in the URL
            # won't authorize POST. If neither is available, fall
            # back to ?key= for the operator path.
            f"  var respondToken = '{html.escape(rtr_respond_token)}';"
            f"  if (respondToken) url += '?token=' + encodeURIComponent(respondToken);"
            f"  else if (qp.get('key')) url += '?key=' + encodeURIComponent(qp.get('key'));"
            f"  statusEl.textContent = 'Saving...';"
            f"  fetch(url, {{method:'POST', headers:{{'Content-Type':'application/json'}}, body: JSON.stringify({{entries: entries}})}})"
            f"    .then(function(r){{ return r.json().then(function(d){{ return {{status: r.status, body: d}}; }}); }})"
            f"    .then(function(out){{"
            f"      if (out.status >= 400){{ statusEl.textContent = 'Error: ' + (out.body.detail || 'failed'); statusEl.style.color = '#7f1d1d'; }}"
            f"      else {{ statusEl.textContent = 'Saved. Unresolved: ' + (out.body.unresolved || []).length; statusEl.style.color = '#15803d'; }}"
            f"    }})"
            f"    .catch(function(e){{ statusEl.textContent = 'Network error'; statusEl.style.color = '#7f1d1d'; }});"
            f"}});"
            f"}})();</script>"
        )

    # Implication-review flags.
    implication_block = ""
    flags = evidence_obj.get("implication_flags") if isinstance(evidence_obj, dict) else None
    if isinstance(flags, list) and flags:
        items_html = ""
        for f in flags:
            if not isinstance(f, dict):
                continue
            flag_sentence = html.escape(str(f.get("sentence") or ""))
            flag_reason = html.escape(str(f.get("reason") or ""))
            flag_fix = html.escape(str(f.get("suggested_fix") or ""))
            items_html += (
                f"<li style='margin-bottom:14px'>"
                f"<div style='font-size:14px;color:#7f1d1d'><strong>Flagged:</strong> &ldquo;{flag_sentence}&rdquo;</div>"
                f"<div style='font-size:12px;color:#64748b;margin-top:4px'><strong>Reason:</strong> {flag_reason}</div>"
            )
            if flag_fix:
                items_html += (
                    f"<div style='font-size:12px;color:#0f172a;margin-top:4px'>"
                    f"<strong>Suggested rewording:</strong> {flag_fix}</div>"
                )
            items_html += "</li>"
        implication_block = (
            f"<div style='margin-bottom:20px;padding:14px 16px;background:#fef2f2;"
            f"border:1px solid #fca5a5;border-radius:8px'>"
            f"<div style='font-size:13px;color:#7f1d1d;font-weight:700;margin-bottom:10px'>"
            f"Implication review flagged {len(flags)} sentence{'s' if len(flags) != 1 else ''}"
            f"</div>"
            f"<ul style='margin:0;padding-left:18px'>{items_html}</ul>"
            f"<div style='font-size:11px;color:#7f1d1d;margin-top:8px;font-style:italic'>"
            f"These flags imply causation between donations / lobbying and votes / policy "
            f"without explicit evidence in the body. Review and revise before approving."
            f"</div></div>"
        )

    if story.status == "published":
        published_url = f"{journal_base}/story/{safe_slug}" if safe_slug else journal_base
        action_block = (
            f"<div style='padding:16px;background:#dcfce7;border:1px solid #86efac;border-radius:8px;margin-top:24px'>"
            f"<strong>Already published.</strong> "
            f"<a href='{published_url}'>View on the journal &rarr;</a>"
            f"</div>"
        )
    elif story.status != "draft":
        action_block = (
            f"<div style='padding:16px;background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;margin-top:24px'>"
            f"<strong>Status: {safe_status}.</strong> Approve / reject not available."
            f"</div>"
        )
    else:
        approve_token = sign_story_action(story.id, "approve")
        reject_token = sign_story_action(story.id, "reject")
        approve_url = f"{api_base}/ops/story-queue/{story.id}/approve?token={approve_token}"
        reject_url = f"{api_base}/ops/story-queue/{story.id}/reject?token={reject_token}"
        action_block = (
            f"<div style='margin-top:24px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px'>"
            f"<a href='{approve_url}' "
            f"style='display:inline-block;background:#16a34a;color:#fff;text-decoration:none;"
            f"padding:10px 20px;border-radius:6px;font-weight:600;margin-right:8px'>Approve & Publish</a>"
            f"<a href='{reject_url}' "
            f"style='display:inline-block;background:#dc2626;color:#fff;text-decoration:none;"
            f"padding:10px 20px;border-radius:6px;font-weight:600'>Reject</a>"
            f"<div style='margin-top:8px;font-size:12px;color:#64748b'>"
            f"Both buttons require press-key auth (signed tokens, 72h expiry, scoped to this story)."
            f"</div></div>"
        )

    return HTMLResponse(
        f"<!DOCTYPE html><html><head><meta charset='utf-8'>"
        f"<title>Draft #{story.id}: {safe_title}</title>"
        f"<meta name='robots' content='noindex,nofollow'>"
        f"</head><body style='font-family:system-ui,sans-serif;max-width:780px;margin:32px auto;padding:24px;color:#0f172a'>"
        f"<div style='font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em'>"
        f"Draft #{story.id} · {safe_category} · {safe_sector} · {safe_status}"
        f"</div>"
        f"<h1 style='font-size:26px;margin:8px 0 12px'>{safe_title}</h1>"
        f"<p style='font-size:15px;color:#475569;font-style:italic;margin:0 0 16px'>{safe_summary}</p>"
        f"{rtr_block}"
        f"{implication_block}"
        f"<div style='font-size:13px;color:#64748b;background:#f1f5f9;padding:12px;border-radius:6px;margin-bottom:20px'>"
        f"<div><strong>Entities:</strong> {html.escape(entities) or '<em>none</em>'}</div>"
        f"<div><strong>Sources:</strong> {html.escape(sources) or '<em>none</em>'}</div>"
        f"<div><strong>Verification:</strong> {verification_tier} (score {verification_score})</div>"
        f"</div>"
        f"<div style='font-size:14px;line-height:1.65;background:#fff;padding:16px;border-left:3px solid #3b82f6;border-radius:4px'>"
        f"<p>{safe_body}</p>"
        f"</div>"
        f"{action_block}"
        f"</body></html>"
    )


@router.get("/story-queue/{story_id}/approve")
def story_queue_approve_get(
    story_id: int,
    confirm: Optional[str] = None,
    token: Optional[str] = None,
    key: Optional[str] = None,
    override_rtr: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_press_key),
):
    """GET version for email link taps — shows a confirmation page first.

    Two-step: initial GET shows a confirm button (safe against email scanners
    that prefetch links). Only `?confirm=yes` actually publishes.

    Auth passes through ``require_press_key`` which accepts the scoped
    ``?token=`` signed for this (story_id, action), the legacy ``?key=``
    press key, or the header. The confirmation button reuses whichever
    credential the reviewer arrived with — we never embed the raw press
    key in the response HTML.
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

    # Right-to-respond enforcement at the GET path. The reviewer can
    # see unresolved entities on the confirmation page and either
    # resolve them via the review page first OR pass &override_rtr=yes
    # to publish anyway (the override is logged).
    unresolved_rtr = _rtr_unresolved(story)

    # Step 1: show confirmation page (email scanners stop here)
    if confirm != "yes":
        # Reuse the credential the reviewer arrived with. A signed token is
        # scoped to (story_id, action) and short-lived, so it's safe to echo
        # back into the HTML. The raw press key is NEVER echoed — if only a
        # key was supplied, fall back to a header-based flow (operator path).
        if token:
            cred_param = f"token={html.escape(token)}"
        elif key:
            # Operator with the root key: don't echo it into HTML. They can
            # add the ``?confirm=yes`` themselves, or use the POST endpoint.
            cred_param = None
        else:
            cred_param = None

        rtr_warning = ""
        rtr_extra_param = ""
        if unresolved_rtr:
            ents_html = "".join(f"<li>{html.escape(e)}</li>" for e in unresolved_rtr)
            rtr_warning = (
                f"<div style='margin:16px 0;padding:14px 16px;background:#fef2f2;"
                f"border:1px solid #fca5a5;border-radius:8px;color:#7f1d1d'>"
                f"<strong>Right-to-respond unresolved.</strong>"
                f"<ul style='margin:8px 0 0 0;padding-left:18px'>{ents_html}</ul>"
                f"<div style='margin-top:8px;font-size:12px'>"
                f"Use the review page (<code>/ops/story-queue/{story_id}</code>) "
                f"to record sent / received / no-reply / skipped per entity, "
                f"or override below to publish anyway."
                f"</div></div>"
            )
            rtr_extra_param = "&amp;override_rtr=yes"

        if cred_param:
            confirm_url = f"/ops/story-queue/{story_id}/approve?{cred_param}&amp;confirm=yes{rtr_extra_param}"
            label = "Override & Publish" if unresolved_rtr else "Confirm Publish"
            color = "#dc2626" if unresolved_rtr else "#16a34a"
            confirm_button = (
                f"<a href='{confirm_url}' style='display:inline-block;background:{color};color:#fff;"
                f"text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:16px;'>"
                f"{label}</a>"
            )
        else:
            confirm_button = (
                f"<p style='color:#64748b;font-size:13px;'>Re-submit the URL with "
                f"<code>&amp;confirm=yes</code> (and <code>&amp;override_rtr=yes</code> "
                f"if right-to-respond is unresolved) to publish, or use the POST endpoint.</p>"
            )
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
            f"<h2>Approve this story?</h2>"
            f"<p><strong>{safe_title}</strong></p>"
            f"<p style='color:#64748b;font-size:13px;margin-bottom:16px;'>"
            f"{html.escape((story.summary or '')[:200])}</p>"
            f"{rtr_warning}"
            f"{confirm_button}"
            f"<p style='color:#94a3b8;font-size:11px;margin-top:16px;'>Click to confirm. "
            f"This extra step prevents email scanners from auto-approving stories.</p>"
            f"</body></html>"
        )

    # Step 2: confirmed — gate on right-to-respond unless explicitly
    # overridden in the URL.
    if unresolved_rtr and (override_rtr or "").lower() != "yes":
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
            f"<h2 style='color:#7f1d1d'>Right-to-respond unresolved</h2>"
            f"<p>This draft names entities without a recorded right-to-respond "
            f"decision: <strong>{html.escape(', '.join(unresolved_rtr))}</strong>.</p>"
            f"<p>Resolve them at "
            f"<a href='/ops/story-queue/{story_id}'>the review page</a> "
            f"first, or re-submit this approval URL with "
            f"<code>&amp;override_rtr=yes</code> to publish anyway "
            f"(the override is logged).</p>"
            f"</body></html>",
            status_code=409,
        )

    # Step 3: confirmed and right-to-respond resolved (or explicitly overridden) — publish
    story.status = "published"
    story.published_at = datetime.now(timezone.utc)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to approve story %d: %s", story_id, exc)
        return HTMLResponse("<h2>Error</h2><p>Failed to publish story.</p>", status_code=500)
    logger.info(
        "story-queue approve (GET+confirm): id=%d slug=%s rtr_override=%s unresolved=%s",
        story_id, story.slug, bool(unresolved_rtr), unresolved_rtr or "none",
    )
    _fire_wayback_snapshot(story.slug, story_id=story.id, db=db)
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
    token: Optional[str] = None,
    key: Optional[str] = None,
    db: Session = Depends(get_db),
    _auth: None = Depends(require_press_key),
):
    """GET version for email link taps — shows confirmation page first.

    Two-step: initial GET shows confirm button. Only `?confirm=yes` retracts.
    See story_queue_approve_get for the credential-handling rationale.
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
        # Same credential-echo policy as approve: only the short-lived signed
        # token is echoed back. A raw press key is never reflected into HTML.
        if token:
            cred_param = f"token={html.escape(token)}"
        else:
            cred_param = None
        if cred_param:
            confirm_url = f"/ops/story-queue/{story_id}/reject?{cred_param}&amp;confirm=yes"
            confirm_button = (
                f"<a href='{confirm_url}' style='display:inline-block;background:#dc2626;color:#fff;"
                f"text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:16px;'>"
                f"Confirm Reject</a>"
            )
        else:
            confirm_button = (
                f"<p style='color:#64748b;font-size:13px;'>Re-submit the URL with "
                f"<code>&amp;confirm=yes</code> to retract, or use the POST endpoint.</p>"
            )
        return HTMLResponse(
            f"<html><body style='font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px'>"
            f"<h2>Reject this story?</h2>"
            f"<p><strong>{safe_title}</strong></p>"
            f"<p style='color:#64748b;font-size:13px;margin-bottom:24px;'>"
            f"{html.escape((story.summary or '')[:200])}</p>"
            f"{confirm_button}"
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


# ---------------------------------------------------------------------------
# Tip moderation (Phase 2 contributor onboarding)
# ---------------------------------------------------------------------------
# Server-rendered HTML at /ops/tips and /ops/tips/{id} so editors can
# triage incoming tips without standing up a React admin app first.
# Same auth as the story queue (require_press_key, inherited via the
# router-level dependency at the top of this module).

_TIP_STATUSES = ("new", "in_review", "published", "dismissed")


def _tip_status_badge(status: str) -> str:
    palette = {
        "new":        ("#fef9c3", "#854d0e"),
        "in_review":  ("#dbeafe", "#1e40af"),
        "published":  ("#dcfce7", "#166534"),
        "dismissed":  ("#e5e7eb", "#475569"),
    }
    bg, fg = palette.get(status, ("#e5e7eb", "#1f2937"))
    return (
        "<span style='background:" + bg + ";color:" + fg + ";"
        "padding:2px 8px;border-radius:999px;font-size:11px;"
        "font-weight:600;text-transform:uppercase;letter-spacing:.08em;'>"
        + html.escape(status) + "</span>"
    )


@router.get("/tips")
def tips_queue_view(
    status: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List incoming tips for triage. Press-key gated (router-level)."""
    from fastapi.responses import HTMLResponse
    from models.tips_models import Tip

    q = db.query(Tip)
    if status and status in _TIP_STATUSES:
        q = q.filter(Tip.status == status)
    rows = q.order_by(Tip.created_at.desc()).limit(max(1, min(limit, 500))).all()

    chips: List[str] = []
    for s in ("all",) + _TIP_STATUSES:
        href = "/ops/tips" if s == "all" else f"/ops/tips?status={s}"
        active = (s == "all" and not status) or (s == status)
        chip_style = (
            "padding:4px 10px;border-radius:999px;text-decoration:none;"
            "font-size:12px;font-weight:600;border:1px solid #b45309;"
            "color:#fff;background:#b45309;"
            if active else
            "padding:4px 10px;border-radius:999px;text-decoration:none;"
            "font-size:12px;font-weight:600;border:1px solid #cbd5e1;"
            "color:#1e293b;background:#fff;"
        )
        chips.append(
            "<a href='" + href + "' style='" + chip_style + "'>" + s + "</a>"
        )
    chip_row = (
        "<div style='display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;'>"
        + "".join(chips) + "</div>"
    )

    counts: Dict[str, int] = {
        s: db.query(Tip).filter(Tip.status == s).count() for s in _TIP_STATUSES
    }
    count_row = (
        "<div style='font-size:12px;color:#475569;margin-bottom:12px;font-family:monospace;'>"
        + " · ".join(f"{s}: <b>{counts[s]}</b>" for s in _TIP_STATUSES)
        + "</div>"
    )

    if not rows:
        body = "<p style='color:#64748b;'>No tips match this filter.</p>"
    else:
        items = []
        for t in rows:
            subj = html.escape(t.subject or "(no subject)")
            preview = html.escape((t.body or "")[:200])
            if t.body and len(t.body) > 200:
                preview += "…"
            contact = html.escape(t.contact_email or t.contact_name or "anonymous")
            sector = html.escape(t.hint_sector or "")
            related = html.escape(t.related_story_slug or "")
            created = (
                t.created_at.strftime("%Y-%m-%d %H:%M") if t.created_at else "?"
            )
            sector_html = (" · sector: " + sector) if sector else ""
            related_html = ""
            if related:
                related_html = (
                    " · related: <a href='https://journal.wethepeopleforus.com/story/"
                    + related + "' target='_blank' style='color:#b45309;'>"
                    + related + "</a>"
                )
            items.append(
                "<div style='padding:14px 16px;background:#fff;border:1px solid "
                "#e2e8f0;border-radius:10px;margin-bottom:10px;'>"
                "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;'>"
                "<a href='/ops/tips/" + str(t.id) + "' style='font-size:16px;"
                "font-weight:600;color:#0f172a;text-decoration:none;'>" + subj + "</a>"
                + _tip_status_badge(t.status) + "</div>"
                "<div style='font-size:13px;color:#475569;line-height:1.5;margin-bottom:6px;'>"
                + preview + "</div>"
                "<div style='font-size:11px;color:#64748b;font-family:monospace;'>#"
                + str(t.id) + " · " + created + " · from " + contact
                + sector_html + related_html + "</div>"
                "</div>"
            )
        body = "\n".join(items)

    page = (
        "<!DOCTYPE html><html><head><title>WTP Tips Queue</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        "margin:0;padding:24px;max-width:920px;margin:0 auto;background:#f8fafc;color:#0f172a;}"
        "h1{font-size:24px;margin:0 0 6px;}"
        ".header-meta{color:#64748b;font-size:13px;margin-bottom:20px;}"
        "a:hover{opacity:.85;}"
        "</style></head><body>"
        "<h1>Contributor Tips</h1>"
        "<div class='header-meta'>Triage queue. Click a tip to read the "
        "full body and update status.</div>"
        + chip_row + count_row + body
        + "</body></html>"
    )
    return HTMLResponse(page)


@router.get("/tips/{tip_id}")
def tip_detail_view(
    tip_id: int,
    flash: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Detail page with status-change buttons + admin notes textarea."""
    from fastapi.responses import HTMLResponse
    from models.tips_models import Tip

    t = db.query(Tip).filter(Tip.id == tip_id).first()
    if not t:
        return HTMLResponse(
            "<h2>Not found</h2><p>Tip " + str(tip_id) + " not found. "
            "<a href='/ops/tips'>Back</a></p>",
            status_code=404,
        )

    subj = html.escape(t.subject or "(no subject)")
    body_text = (
        html.escape(t.body or "").replace("\n\n", "</p><p>").replace("\n", "<br>")
    )
    contact = html.escape(t.contact_email or "")
    name = html.escape(t.contact_name or "")
    sector = html.escape(t.hint_sector or "")
    entity = html.escape(t.hint_entity or "")
    related = html.escape(t.related_story_slug or "")
    notes = html.escape(t.admin_notes or "")
    ip_str = html.escape(t.submitter_ip or "—")
    triaged_by = html.escape(t.triaged_by or "—")
    triaged_at = (
        t.triaged_at.strftime("%Y-%m-%d %H:%M %Z") if t.triaged_at else "—"
    )
    created = t.created_at.strftime("%Y-%m-%d %H:%M %Z") if t.created_at else "?"

    status_buttons: List[str] = []
    for s in _TIP_STATUSES:
        if s == t.status:
            status_buttons.append(
                "<span style='padding:6px 12px;border-radius:6px;background:#e2e8f0;"
                "color:#475569;font-size:13px;font-weight:600;'>" + s
                + " (current)</span>"
            )
            continue
        status_buttons.append(
            "<form method='post' action='/ops/tips/" + str(tip_id)
            + "/status' style='display:inline;'>"
            "<input type='hidden' name='status' value='" + s + "'>"
            "<button type='submit' style='padding:6px 12px;border-radius:6px;"
            "background:#fff;border:1px solid #cbd5e1;color:#0f172a;"
            "font-size:13px;font-weight:600;cursor:pointer;'>Mark "
            + s.replace("_", " ") + "</button></form>"
        )
    status_row = (
        "<div style='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;'>"
        + "".join(status_buttons) + "</div>"
    )

    flash_html = ""
    if flash:
        flash_html = (
            "<div style='padding:8px 12px;background:#dcfce7;border:1px solid #86efac;"
            "color:#166534;border-radius:8px;margin-bottom:14px;font-size:13px;'>"
            + html.escape(flash) + "</div>"
        )

    related_link = ""
    if related:
        related_link = (
            "<a href='https://journal.wethepeopleforus.com/story/" + related
            + "' target='_blank' style='color:#b45309;'>" + related + "</a>"
        )

    page = (
        "<!DOCTYPE html><html><head><title>Tip #" + str(tip_id) + " — "
        + subj + "</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        "margin:0;padding:24px;max-width:760px;margin:0 auto;background:#f8fafc;color:#0f172a;}"
        "h1{font-size:22px;margin:0 0 8px;}"
        ".meta{font-family:monospace;font-size:12px;color:#64748b;margin-bottom:18px;}"
        ".card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;"
        "padding:16px 18px;margin-bottom:16px;}"
        ".card-label{font-size:11px;font-weight:700;letter-spacing:.12em;"
        "text-transform:uppercase;color:#64748b;margin-bottom:8px;}"
        ".body-text{font-size:15px;line-height:1.55;color:#0f172a;}"
        "textarea{width:100%;min-height:110px;font-family:-apple-system,BlinkMacSystemFont,"
        "'Segoe UI',sans-serif;font-size:14px;padding:10px;border:1px solid #cbd5e1;"
        "border-radius:8px;box-sizing:border-box;resize:vertical;}"
        "a{color:#b45309;}"
        "a.back{display:inline-block;margin-bottom:12px;font-size:13px;}"
        "</style></head><body>"
        "<a class='back' href='/ops/tips'>← Back to queue</a>"
        + flash_html
        + "<h1>" + subj + " " + _tip_status_badge(t.status) + "</h1>"
        "<div class='meta'>#" + str(tip_id) + " · created " + created
        + " · ip " + ip_str + "</div>"
        "<div class='card'><div class='card-label'>Body</div>"
        "<div class='body-text'><p>" + body_text + "</p></div></div>"
        "<div class='card'><div class='card-label'>Contributor</div>"
        "<div style='font-size:14px;line-height:1.6;'>"
        "<div>Name: <b>" + (name or "—") + "</b></div>"
        "<div>Email: <b>" + (contact or "—") + "</b></div>"
        "<div>Sector hint: <b>" + (sector or "—") + "</b></div>"
        "<div>Entity hint: <b>" + (entity or "—") + "</b></div>"
        "<div>Related story: " + (related_link or "—") + "</div>"
        "</div></div>"
        "<div class='card'><div class='card-label'>Status</div>"
        + status_row
        + "<div style='font-size:11px;color:#64748b;font-family:monospace;'>"
        "last triaged " + triaged_at + " by " + triaged_by + "</div></div>"
        "<div class='card'><div class='card-label'>Admin notes</div>"
        "<form method='post' action='/ops/tips/" + str(tip_id) + "/notes'>"
        "<textarea name='admin_notes' placeholder='Triage notes — visible only to editors.'>"
        + notes + "</textarea>"
        "<div style='margin-top:8px;display:flex;justify-content:flex-end;'>"
        "<button type='submit' style='padding:8px 16px;border-radius:6px;"
        "background:#b45309;color:#fff;border:0;font-size:13px;font-weight:600;"
        "cursor:pointer;'>Save notes</button>"
        "</div></form></div>"
        "</body></html>"
    )
    return HTMLResponse(page)


@router.post("/tips/{tip_id}/status")
async def tip_status_update(
    tip_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Form-encoded status update from the detail page."""
    from fastapi.responses import RedirectResponse
    from models.tips_models import Tip

    form = await request.form()
    new_status = (form.get("status") or "").strip().lower()
    if new_status not in _TIP_STATUSES:
        raise HTTPException(status_code=422, detail=f"invalid status {new_status!r}")

    t = db.query(Tip).filter(Tip.id == tip_id).first()
    if not t:
        raise HTTPException(status_code=404, detail=f"Tip {tip_id} not found")

    t.status = new_status
    t.triaged_at = datetime.now(timezone.utc)
    t.triaged_by = "ops"
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("tip status update failed for id=%d: %s", tip_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update tip")

    logger.info("tip status: id=%d -> %s", tip_id, new_status)
    return RedirectResponse(
        f"/ops/tips/{tip_id}?flash=Status+set+to+{new_status}",
        status_code=303,
    )


@router.post("/tips/{tip_id}/notes")
async def tip_notes_update(
    tip_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Form-encoded admin-notes update."""
    from fastapi.responses import RedirectResponse
    from models.tips_models import Tip

    form = await request.form()
    new_notes = (form.get("admin_notes") or "").strip()

    t = db.query(Tip).filter(Tip.id == tip_id).first()
    if not t:
        raise HTTPException(status_code=404, detail=f"Tip {tip_id} not found")

    t.admin_notes = new_notes or None
    t.triaged_at = datetime.now(timezone.utc)
    t.triaged_by = "ops"
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("tip notes update failed for id=%d: %s", tip_id, exc)
        raise HTTPException(status_code=500, detail="Failed to update notes")

    logger.info("tip notes updated: id=%d", tip_id)
    return RedirectResponse(
        f"/ops/tips/{tip_id}?flash=Notes+saved",
        status_code=303,
    )


# ---------------------------------------------------------------------------
# /ops landing dashboard
# ---------------------------------------------------------------------------
# Lightweight HTML index so editors can hit a single URL after the
# email link expires and see what's waiting. Replaces the "type the
# right /ops/foo path from memory" friction. Press-key gated via the
# router-level dependency; same auth as every other /ops surface.

@router.get("")
@router.get("/")
def ops_dashboard(db: Session = Depends(get_db)):
    """Server-rendered HTML index for the ops surface."""
    from fastapi.responses import HTMLResponse
    from models.tips_models import Tip

    # Pull all the queue counts in parallel-ish (single session).
    # Failures collapse to "?" so the page still renders even if
    # one query is broken.
    def _safe_count(q) -> str:
        try:
            return str(q())
        except Exception as exc:
            logger.warning("ops dashboard count failed: %s", exc)
            return "?"

    drafts_pending = _safe_count(
        lambda: db.query(Story).filter(Story.status == "draft").count()
    )
    stories_published = _safe_count(
        lambda: db.query(Story).filter(Story.status == "published").count()
    )
    tips_new = _safe_count(
        lambda: db.query(Tip).filter(Tip.status == "new").count()
    )
    tips_in_review = _safe_count(
        lambda: db.query(Tip).filter(Tip.status == "in_review").count()
    )

    # Card colors signal urgency: gold when there's work waiting,
    # neutral gray when the queue is empty.
    def _card(label: str, count: str, href: str, urgent: bool) -> str:
        bg = "#fef3c7" if urgent else "#f1f5f9"
        border = "#fbbf24" if urgent else "#cbd5e1"
        fg = "#92400e" if urgent else "#475569"
        return (
            "<a href='" + href + "' style='text-decoration:none;'>"
            "<div style='background:" + bg + ";border:1px solid " + border + ";"
            "border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;"
            "gap:6px;min-width:180px;'>"
            "<div style='font-family:monospace;font-size:11px;font-weight:700;"
            "letter-spacing:.14em;text-transform:uppercase;color:" + fg + ";'>"
            + html.escape(label) + "</div>"
            "<div style='font-family:Georgia,serif;font-size:32px;font-weight:700;"
            "color:#0f172a;line-height:1;'>" + html.escape(count) + "</div>"
            "</div></a>"
        )

    drafts_urgent = drafts_pending not in ("0", "?")
    tips_urgent = tips_new not in ("0", "?")
    review_urgent = tips_in_review not in ("0", "?")

    cards = (
        _card("Drafts pending", drafts_pending, "/ops/story-queue", drafts_urgent)
        + _card("Tips new",     tips_new,       "/ops/tips?status=new", tips_urgent)
        + _card("Tips in review", tips_in_review, "/ops/tips?status=in_review", review_urgent)
        + _card("Stories published", stories_published, "/ops/story-queue?status=published", False)
    )

    quick_links = """
      <div style='display:flex;flex-wrap:wrap;gap:10px;margin-top:24px;'>
        <a href='/ops/story-queue' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>Story queue</a>
        <a href='/ops/tips' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>Tips</a>
        <a href='/ops/engagement' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>Engagement</a>
        <a href='/ops/calendar' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>Calendar</a>
        <a href='/ops/data-freshness' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>Data freshness</a>
        <a href='/ops/draft-queue' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>Draft replies</a>
        <a href='/ops/pipeline/health' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>Pipeline health</a>
        <a href='/ops/pipeline/dlq' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>DLQ</a>
        <a href='/ops/db/stats' style='padding:8px 14px;border-radius:8px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;font-size:13px;font-weight:600;'>DB stats</a>
      </div>
    """

    page = (
        "<!DOCTYPE html><html><head><title>WTP Ops</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        "margin:0;padding:32px;max-width:920px;margin:0 auto;background:#f8fafc;color:#0f172a;}"
        "h1{font-size:26px;margin:0 0 6px;}"
        ".sub{color:#64748b;font-size:13px;margin-bottom:24px;}"
        "a:hover{filter:brightness(.97);}"
        "</style></head><body>"
        "<h1>Ops dashboard</h1>"
        "<div class='sub'>Queue snapshot. Cards highlight when there's work waiting.</div>"
        "<div style='display:flex;flex-wrap:wrap;gap:14px;'>"
        + cards + "</div>"
        + quick_links
        + "</body></html>"
    )
    return HTMLResponse(page)


# ---------------------------------------------------------------------------
# /ops/engagement — Phase 3 thread A
# ---------------------------------------------------------------------------
# Aggregates the action_clicks table over a rolling window. Three
# rollups: by action_type, by sector, top stories. Same press-key
# gate as the rest of /ops.

@router.get("/engagement")
def engagement_dashboard(
    window_days: int = 30,
    db: Session = Depends(get_db),
):
    """Server-rendered HTML view over action_clicks aggregates."""
    from fastapi.responses import HTMLResponse
    from datetime import datetime, timedelta, timezone
    from models.stories_models import ActionClick
    from sqlalchemy import func

    if window_days < 1 or window_days > 365:
        window_days = 30
    since = datetime.now(timezone.utc) - timedelta(days=window_days)

    total = (
        db.query(func.count(ActionClick.id))
        .filter(ActionClick.clicked_at >= since)
        .scalar() or 0
    )
    by_type = (
        db.query(ActionClick.action_type, func.count(ActionClick.id))
        .filter(ActionClick.clicked_at >= since)
        .group_by(ActionClick.action_type)
        .order_by(func.count(ActionClick.id).desc())
        .all()
    )
    by_sector = (
        db.query(Story.sector, func.count(ActionClick.id))
        .join(ActionClick, ActionClick.story_id == Story.id)
        .filter(ActionClick.clicked_at >= since)
        .group_by(Story.sector)
        .order_by(func.count(ActionClick.id).desc())
        .limit(20)
        .all()
    )
    top_stories = (
        db.query(Story.slug, Story.title, func.count(ActionClick.id))
        .join(ActionClick, ActionClick.story_id == Story.id)
        .filter(ActionClick.clicked_at >= since)
        .group_by(Story.slug, Story.title)
        .order_by(func.count(ActionClick.id).desc())
        .limit(10)
        .all()
    )

    def _row(label: str, count: int, max_count: int) -> str:
        pct = int((count / max_count) * 100) if max_count > 0 else 0
        return (
            "<tr>"
            "<td style='padding:6px 10px;font-family:monospace;font-size:13px;color:#0f172a;width:42%;'>"
            + html.escape(label) + "</td>"
            "<td style='padding:6px 10px;width:48%;'>"
            "<div style='background:#fef3c7;height:18px;border-radius:4px;width:"
            + str(pct) + "%;min-width:1px;'></div>"
            "</td>"
            "<td style='padding:6px 10px;font-family:monospace;font-size:13px;color:#475569;text-align:right;'>"
            + str(count) + "</td>"
            "</tr>"
        )

    type_max = max((c for _, c in by_type), default=0)
    sector_max = max((c for _, c in by_sector), default=0)
    type_html = "".join(_row(t or "(none)", c, type_max) for t, c in by_type)
    sector_html = "".join(_row(s or "(none)", c, sector_max) for s, c in by_sector)

    if top_stories:
        story_rows = "".join(
            "<tr>"
            "<td style='padding:8px 10px;font-size:13px;'>"
            "<a href='https://journal.wethepeopleforus.com/story/"
            + html.escape(slug or "")
            + "' target='_blank' style='color:#b45309;text-decoration:none;'>"
            + html.escape((title or slug or "")[:90])
            + "</a></td>"
            "<td style='padding:8px 10px;font-family:monospace;font-size:13px;color:#475569;text-align:right;'>"
            + str(c) + "</td>"
            "</tr>"
            for slug, title, c in top_stories
        )
    else:
        story_rows = (
            "<tr><td colspan='2' style='padding:12px;color:#94a3b8;font-size:13px;'>"
            "No clicks recorded in this window.</td></tr>"
        )

    page = (
        "<!DOCTYPE html><html><head><title>WTP Engagement</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        "margin:0;padding:24px;max-width:920px;margin:0 auto;background:#f8fafc;color:#0f172a;}"
        "h1{font-size:24px;margin:0 0 6px;}"
        ".sub{color:#64748b;font-size:13px;margin-bottom:20px;}"
        ".card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:18px;}"
        ".card-label{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:10px;}"
        "table{width:100%;border-collapse:collapse;}"
        "a:hover{filter:brightness(.97);}"
        "</style></head><body>"
        "<a href='/ops' style='color:#b45309;font-size:13px;text-decoration:none;'>← Ops dashboard</a>"
        "<h1 style='margin-top:8px;'>Engagement</h1>"
        "<div class='sub'>"
        "Action Panel CTA clicks, last " + str(window_days) + " days. "
        "Total: <b>" + str(total) + "</b>. "
        "<a href='?window_days=7' style='color:#b45309;'>7d</a> · "
        "<a href='?window_days=30' style='color:#b45309;'>30d</a> · "
        "<a href='?window_days=90' style='color:#b45309;'>90d</a>"
        "</div>"
        "<div class='card'>"
        "<div class='card-label'>By action type</div>"
        "<table>"
        + (type_html or "<tr><td style='padding:12px;color:#94a3b8;'>No clicks yet.</td></tr>")
        + "</table></div>"
        "<div class='card'>"
        "<div class='card-label'>By sector</div>"
        "<table>"
        + (sector_html or "<tr><td style='padding:12px;color:#94a3b8;'>No clicks yet.</td></tr>")
        + "</table></div>"
        "<div class='card'>"
        "<div class='card-label'>Top stories</div>"
        "<table>" + story_rows + "</table>"
        "</div>"
        "</body></html>"
    )
    return HTMLResponse(page)


# ---------------------------------------------------------------------------
# /ops/data-freshness — Phase 4-W trust dashboard
# ---------------------------------------------------------------------------
# Probes every primary data source for "rows in last 7 days" and the
# max(created_at) so editors (and funders during a demo) see at a
# glance whether the platform is current. Press-key gated.

@router.get("/data-freshness")
def data_freshness_view(db: Session = Depends(get_db)):
    """HTML view of when each big table was last touched."""
    from fastapi.responses import HTMLResponse
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import text

    # Tables to probe. Each entry is (label, table_name, date_col).
    # date_col = None means we just count rows. The probe runs each
    # query in its own try so a missing/renamed table doesn't break
    # the dashboard.
    targets = [
        ("Stories",                  "stories",                       "published_at"),
        ("Story actions",            "story_actions",                 "created_at"),
        ("Action clicks",            "action_clicks",                 "clicked_at"),
        ("Tips",                     "tips",                          "created_at"),
        ("Bills",                    "bills",                         "latest_action_date"),
        ("Bill actions",             "bill_actions",                  "action_date"),
        ("Congressional trades",     "congressional_trades",          "transaction_date"),
        ("Anomalies",                "anomalies",                     "detected_at"),
        ("Company donations",        "company_donations",             "donation_date"),
        ("State legislators",        "state_legislators",             "created_at"),
        ("State bills",              "state_bills",                   "latest_action_date"),
        ("Lobbying (cross-sector)",  "lobbying_records",              "created_at"),
        ("Finance lobbying",         "finance_lobbying_records",      "created_at"),
        ("Health lobbying",          "health_lobbying_records",       "created_at"),
        ("Tracked members",          "tracked_members",               "updated_at"),
        ("Stories outcome history",  "story_outcome_history",         "transitioned_at"),
    ]

    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).date()

    rows: List[str] = []
    for label, table, date_col in targets:
        try:
            total = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0
        except Exception:
            rows.append(
                f"<tr><td style='padding:8px 12px;font-size:13px;'>{html.escape(label)}</td>"
                f"<td colspan='3' style='padding:8px 12px;font-size:12px;color:#94a3b8;'>"
                f"table missing</td></tr>"
            )
            continue
        recent = "—"
        last = "—"
        recent_class = "color:#94a3b8;"
        if date_col:
            try:
                recent_cnt = db.execute(
                    text(f"SELECT COUNT(*) FROM {table} WHERE {date_col} >= :since"),
                    {"since": week_ago},
                ).scalar() or 0
                recent = str(recent_cnt)
                if recent_cnt > 0:
                    recent_class = "color:#15803d;font-weight:600;"
                else:
                    recent_class = "color:#b91c1c;"
            except Exception:
                pass
            try:
                last_val = db.execute(
                    text(f"SELECT MAX({date_col}) FROM {table}"),
                ).scalar()
                if last_val:
                    last = str(last_val)[:10]
            except Exception:
                pass
        rows.append(
            f"<tr>"
            f"<td style='padding:8px 12px;font-size:13px;font-weight:600;color:#0f172a;'>"
            f"{html.escape(label)}<div style='font-family:monospace;font-size:11px;"
            f"color:#94a3b8;font-weight:400;margin-top:2px;'>{html.escape(table)}</div></td>"
            f"<td style='padding:8px 12px;font-family:monospace;font-size:13px;color:#475569;text-align:right;'>"
            f"{total:,}</td>"
            f"<td style='padding:8px 12px;font-family:monospace;font-size:13px;{recent_class}text-align:right;'>"
            f"{recent}</td>"
            f"<td style='padding:8px 12px;font-family:monospace;font-size:12px;color:#475569;white-space:nowrap;'>"
            f"{last}</td>"
            f"</tr>"
        )

    page = (
        "<!DOCTYPE html><html><head><title>WTP Data Freshness</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        "margin:0;padding:24px;max-width:1000px;margin:0 auto;background:#f8fafc;color:#0f172a;}"
        "h1{font-size:24px;margin:0 0 6px;}"
        ".sub{color:#64748b;font-size:13px;margin-bottom:20px;}"
        "table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;"
        "border-radius:10px;overflow:hidden;}"
        "thead th{padding:10px 12px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;"
        "color:#64748b;text-align:left;background:#f1f5f9;border-bottom:1px solid #e2e8f0;}"
        "thead th.r{text-align:right;}"
        "tbody tr+tr td{border-top:1px solid #e2e8f0;}"
        "</style></head><body>"
        "<a href='/ops' style='color:#b45309;font-size:13px;text-decoration:none;'>← Ops dashboard</a>"
        "<h1 style='margin-top:8px;'>Data freshness</h1>"
        "<div class='sub'>"
        "Row counts and most recent timestamps across every primary "
        "table. Green numbers = activity in the last 7 days; red = stale.</div>"
        "<table>"
        "<thead><tr>"
        "<th>Table</th>"
        "<th class='r'>Total rows</th>"
        "<th class='r'>Last 7 days</th>"
        "<th>Newest</th>"
        "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table></body></html>"
    )
    return HTMLResponse(page)


# ---------------------------------------------------------------------------
# /ops/calendar — Phase 4-Z editorial calendar view
# ---------------------------------------------------------------------------
# Reads scheduler_state.json so editors can see what's queued without
# SSH access. Press-key gated like the rest of /ops.

@router.get("/calendar")
def calendar_view():
    """Server-rendered HTML of the scheduler's job calendar."""
    from fastapi.responses import HTMLResponse
    from datetime import datetime
    import json as _json
    from pathlib import Path

    state_path = Path(__file__).resolve().parents[1] / "scheduler_state.json"
    try:
        state = _json.loads(state_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return HTMLResponse(
            "<h2>No scheduler state</h2><p>The scheduler has not run yet.</p>",
            status_code=404,
        )
    except Exception as exc:
        return HTMLResponse(
            f"<h2>Error</h2><p>Failed to read scheduler state: "
            f"{html.escape(str(exc))}</p>",
            status_code=500,
        )

    jobs = state.get("jobs", []) or []
    jobs.sort(key=lambda j: j.get("next_run") or 0)

    now_ts = datetime.now().timestamp()
    rows: List[str] = []
    for j in jobs:
        if not isinstance(j, dict):
            continue
        name = j.get("func_name") or "(anonymous)"
        next_run = j.get("next_run")
        last_run = j.get("last_run")
        run_count = j.get("run_count", 0)
        status = j.get("status", "?")
        paused = j.get("paused", False)
        interval_sec = j.get("interval", 0)

        next_str = (
            datetime.fromtimestamp(next_run).strftime("%Y-%m-%d %H:%M")
            if next_run else "—"
        )
        last_str = (
            datetime.fromtimestamp(last_run).strftime("%Y-%m-%d %H:%M")
            if last_run else "never"
        )
        eta = ""
        if next_run:
            delta = next_run - now_ts
            if delta < 0:
                eta = "<span style='color:#b91c1c;'>overdue</span>"
            elif delta < 3600:
                eta = f"in {int(delta / 60)} min"
            elif delta < 86400:
                eta = f"in {int(delta / 3600)}h"
            else:
                eta = f"in {int(delta / 86400)}d"

        if interval_sec >= 86400:
            interval_label = f"{interval_sec // 86400}d"
        elif interval_sec >= 3600:
            interval_label = f"{interval_sec // 3600}h"
        elif interval_sec >= 60:
            interval_label = f"{interval_sec // 60}m"
        else:
            interval_label = f"{interval_sec}s"

        paused_pill = (
            "<span style='background:#fee2e2;color:#991b1b;padding:1px 8px;"
            "border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.06em;"
            "text-transform:uppercase;'>paused</span>"
            if paused else ""
        )

        rows.append(
            "<tr>"
            "<td style='padding:8px 12px;font-family:monospace;font-size:13px;"
            "font-weight:600;color:#0f172a;'>"
            + html.escape(name) + " " + paused_pill + "</td>"
            "<td style='padding:8px 12px;font-family:monospace;font-size:12px;"
            "color:#475569;'>" + interval_label + "</td>"
            "<td style='padding:8px 12px;font-family:monospace;font-size:12px;"
            "color:#475569;white-space:nowrap;'>" + next_str
            + "<br><span style='color:#94a3b8;'>" + eta + "</span></td>"
            "<td style='padding:8px 12px;font-family:monospace;font-size:12px;"
            "color:#475569;white-space:nowrap;'>" + last_str + "</td>"
            "<td style='padding:8px 12px;font-family:monospace;font-size:12px;"
            "color:#475569;text-align:right;'>" + str(run_count) + "</td>"
            "<td style='padding:8px 12px;font-family:monospace;font-size:12px;"
            "color:" + ('#15803d' if status == 'scheduled' else '#92400e') + ";'>"
            + html.escape(str(status)) + "</td>"
            "</tr>"
        )

    body = (
        "<!DOCTYPE html><html><head><title>WTP Scheduler Calendar</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>"
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
        "margin:0;padding:24px;max-width:1100px;margin:0 auto;background:#f8fafc;color:#0f172a;}"
        "h1{font-size:24px;margin:0 0 6px;}"
        ".sub{color:#64748b;font-size:13px;margin-bottom:20px;}"
        "table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;"
        "border-radius:10px;overflow:hidden;}"
        "thead th{padding:10px 12px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;"
        "color:#64748b;text-align:left;background:#f1f5f9;border-bottom:1px solid #e2e8f0;}"
        "tbody tr+tr td{border-top:1px solid #e2e8f0;}"
        "</style></head><body>"
        "<a href='/ops' style='color:#b45309;font-size:13px;text-decoration:none;'>← Ops dashboard</a>"
        "<h1 style='margin-top:8px;'>Scheduler calendar</h1>"
        "<div class='sub'>"
        + str(len(jobs)) + " jobs registered. Sorted by next run.</div>"
        "<table>"
        "<thead><tr>"
        "<th>Job</th><th>Interval</th><th>Next run</th><th>Last run</th>"
        "<th style='text-align:right;'>Runs</th><th>Status</th>"
        "</tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table></body></html>"
    )
    return HTMLResponse(body)
