"""
Internal ops endpoints for pipeline monitoring and data quality.

NOT public-facing — gated behind require_press_key (same as /ops/runtime).
Provides visibility into:
  - Scheduler job health (from scheduler_state.json)
  - Dead letter queue (failed items that need retry)
  - Data quality checks (null rates, stale data, orphan records)
  - Database stats (table row counts, file size, index count)
"""

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
    """Load the dead letter queue from disk."""
    data = _load_json(DLQ_FILE)
    if isinstance(data, list):
        return data
    return []


def _save_dlq(items: List[Dict[str, Any]]) -> None:
    """Persist the dead letter queue."""
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
_EXPECTED_INTERVALS: Dict[str, float] = {
    "sync_votes": 24, "sync_senate_votes": 24, "sync_congressional_trades": 24,
    "sync_finance_political_data": 48, "sync_health_political_data": 48,
    "sync_transportation_data": 48, "sync_defense_data": 48,
    "sync_finance_enforcement": 72, "sync_energy_enforcement": 72,
    "sync_health_enforcement": 72, "sync_transportation_enforcement": 72,
    "sync_defense_enforcement": 72,
    "sync_finance_data": 168, "sync_health_data": 168, "sync_tech_data": 168,
    "sync_energy_data": 168, "sync_donations": 168, "sync_nhtsa_data": 168,
    "sync_fuel_economy": 168, "sync_trades_from_disclosures": 168,
    "detect_anomalies": 24, "detect_stories": 24, "ai_summarize_daily": 24,
    "sync_samgov": 24, "sync_regulatory_comments": 168,
    "sync_it_dashboard": 168, "sync_site_scanning": 168,
    "sync_state_data": 720, "monitor_pipeline": 24,
}


# ---------------------------------------------------------------------------
# POST helper: enqueue a DLQ item (used by other code or manually)
# ---------------------------------------------------------------------------

def enqueue_dlq(
    job_name: str,
    error: str,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Add a failed item to the dead letter queue. Returns the new item."""
    item = {
        "id": uuid.uuid4().hex[:12],
        "job": job_name,
        "error": error[:2000],
        "context": context or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "retries": 0,
        "status": "pending",  # pending | retrying | resolved
    }
    items = _load_dlq()
    items.append(item)
    _save_dlq(items)
    return item


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
