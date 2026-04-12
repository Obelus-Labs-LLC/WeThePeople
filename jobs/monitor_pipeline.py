"""
Pipeline health monitor — checks scheduler state, DLQ, and disk usage.

Can be run manually or via the scheduler as a daily job.
Outputs a human-readable health report to stdout.
Returns exit code 1 if any CRITICAL issue is found, 0 otherwise.

Usage:
    python jobs/monitor_pipeline.py
    python jobs/monitor_pipeline.py --json   # Machine-readable output
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

# Project root
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

STATE_FILE = ROOT / "scheduler_state.json"
DLQ_FILE = ROOT / "dlq.json"
DB_FILE = ROOT / "wethepeople.db"

# Expected interval per job (hours). Overdue = 2x this value.
from utils.job_intervals import EXPECTED_INTERVALS

# Disk usage threshold (percent) — CRITICAL if exceeded
DISK_USAGE_CRITICAL_PCT = 90
DISK_USAGE_WARN_PCT = 80

# DLQ stuck threshold (hours) — items older than this are stuck
DLQ_STUCK_HOURS = 24


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def check_scheduler_health() -> List[Dict[str, Any]]:
    """Check scheduler_state.json for overdue jobs (not run in 2x expected interval)."""
    issues: List[Dict[str, Any]] = []
    state = _load_json(STATE_FILE)
    now = datetime.now(timezone.utc)

    if not state:
        issues.append({
            "level": "warn",
            "check": "scheduler_state",
            "message": f"scheduler_state.json not found or empty at {STATE_FILE}",
        })
        return issues

    # Build a set of jobs that have run
    seen_jobs: Dict[str, Dict[str, Any]] = {}

    if isinstance(state, dict):
        entries = list(state.items())
    elif isinstance(state, list):
        entries = [(e.get("name", "unknown"), e) for e in state]
    else:
        entries = []

    for key, val in entries:
        if not isinstance(val, dict):
            continue

        job_name = val.get("job", key)
        last_run_raw = val.get("finished_at") or val.get("last_run")
        status = val.get("status", "unknown")

        seen_jobs[job_name] = val

        # Check if the last run failed
        if status in ("failed", "error", "timeout"):
            error_msg = val.get("error", "no details")
            issues.append({
                "level": "warn",
                "check": "job_last_status",
                "message": f"Job '{job_name}' last run status: {status} — {error_msg[:100]}",
            })

        # Check if overdue
        if last_run_raw:
            try:
                last_run_dt = datetime.fromisoformat(last_run_raw.replace("Z", "+00:00"))
                expected_h = EXPECTED_INTERVALS.get(job_name, 24)
                hours_since = (now - last_run_dt).total_seconds() / 3600

                if hours_since > expected_h * 2:
                    level = "critical" if hours_since > expected_h * 4 else "warn"
                    issues.append({
                        "level": level,
                        "check": "job_overdue",
                        "message": (
                            f"Job '{job_name}' overdue: last ran {hours_since:.0f}h ago "
                            f"(expected every {expected_h:.0f}h, threshold {expected_h * 2:.0f}h)"
                        ),
                    })
            except (ValueError, AttributeError):
                pass

    # Check for jobs that have NEVER run
    for job_name in EXPECTED_INTERVALS:
        if job_name not in seen_jobs:
            issues.append({
                "level": "warn",
                "check": "job_never_run",
                "message": f"Job '{job_name}' has never run (not in scheduler_state.json)",
            })

    return issues


def check_dlq() -> List[Dict[str, Any]]:
    """Check DLQ for stuck items (older than DLQ_STUCK_HOURS).

    Reads from the database FailedRecord table (the actual DLQ),
    falling back to the legacy dlq.json file if the DB is unavailable.
    """
    issues: List[Dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    # Try database first (authoritative source)
    try:
        from models.database import SessionLocal
        from services.pipeline_reliability import FailedRecord
        db = SessionLocal()
        try:
            pending = (
                db.query(FailedRecord)
                .filter(FailedRecord.resolved_at.is_(None))
                .all()
            )
            stuck_count = 0
            for item in pending:
                if item.created_at:
                    created_dt = item.created_at if item.created_at.tzinfo else item.created_at.replace(tzinfo=timezone.utc)
                    age_hours = (now - created_dt).total_seconds() / 3600
                    if age_hours > DLQ_STUCK_HOURS:
                        stuck_count += 1

            if stuck_count > 0:
                issues.append({
                    "level": "critical" if stuck_count >= 5 else "warn",
                    "check": "dlq_stuck",
                    "message": f"{stuck_count} DLQ item(s) stuck for >{DLQ_STUCK_HOURS}h (total pending: {len(pending)})",
                })
            if len(pending) > 0:
                issues.append({
                    "level": "info",
                    "check": "dlq_pending",
                    "message": f"{len(pending)} pending DLQ item(s)",
                })
            return issues
        finally:
            db.close()
    except Exception:
        pass

    # Fallback: legacy flat-file DLQ
    data = _load_json(DLQ_FILE)
    if not isinstance(data, list):
        return issues

    pending = [i for i in data if i.get("status") in ("pending", "retrying")]
    if not pending:
        return issues

    stuck_count = 0
    for item in pending:
        created_raw = item.get("created_at")
        if not created_raw:
            continue
        try:
            created_dt = datetime.fromisoformat(created_raw.replace("Z", "+00:00"))
            age_hours = (now - created_dt).total_seconds() / 3600
            if age_hours > DLQ_STUCK_HOURS:
                stuck_count += 1
        except (ValueError, AttributeError):
            pass

    if stuck_count > 0:
        issues.append({
            "level": "critical" if stuck_count >= 5 else "warn",
            "check": "dlq_stuck",
            "message": f"{stuck_count} DLQ item(s) stuck for >{DLQ_STUCK_HOURS}h (total pending: {len(pending)})",
        })
    if len(pending) > 0:
        issues.append({
            "level": "info",
            "check": "dlq_pending",
            "message": f"{len(pending)} pending DLQ item(s)",
        })

    return issues


def check_disk_usage() -> List[Dict[str, Any]]:
    """Check disk usage where the DB lives."""
    issues: List[Dict[str, Any]] = []

    # Check the directory containing the DB (or project root as fallback)
    check_dir = str(DB_FILE.parent) if DB_FILE.exists() else str(ROOT)
    try:
        total, used, free = shutil.disk_usage(check_dir)
        pct = round(100 * used / total, 1)
        free_gb = round(free / (1024 ** 3), 1)

        if pct >= DISK_USAGE_CRITICAL_PCT:
            issues.append({
                "level": "critical",
                "check": "disk_usage",
                "message": f"Disk {pct}% full ({free_gb} GB free) — CRITICAL threshold {DISK_USAGE_CRITICAL_PCT}%",
            })
        elif pct >= DISK_USAGE_WARN_PCT:
            issues.append({
                "level": "warn",
                "check": "disk_usage",
                "message": f"Disk {pct}% full ({free_gb} GB free) — warn threshold {DISK_USAGE_WARN_PCT}%",
            })
        else:
            issues.append({
                "level": "info",
                "check": "disk_usage",
                "message": f"Disk {pct}% full ({free_gb} GB free)",
            })
    except Exception as exc:
        issues.append({
            "level": "warn",
            "check": "disk_usage",
            "message": f"Could not check disk usage: {exc}",
        })

    # DB file size
    if DB_FILE.exists():
        db_mb = round(DB_FILE.stat().st_size / (1024 ** 2), 1)
        issues.append({
            "level": "info",
            "check": "db_file_size",
            "message": f"Database file: {db_mb} MB",
        })

    return issues


def run_health_check(as_json: bool = False) -> int:
    """Run all checks and output a report. Returns 1 if critical issues found."""
    all_issues: List[Dict[str, Any]] = []
    all_issues.extend(check_scheduler_health())
    all_issues.extend(check_dlq())
    all_issues.extend(check_disk_usage())

    critical_count = sum(1 for i in all_issues if i["level"] == "critical")
    warn_count = sum(1 for i in all_issues if i["level"] == "warn")
    info_count = sum(1 for i in all_issues if i["level"] == "info")

    if as_json:
        report = {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "overall": "critical" if critical_count > 0 else ("warn" if warn_count > 0 else "healthy"),
            "critical": critical_count,
            "warnings": warn_count,
            "info": info_count,
            "issues": all_issues,
        }
        print(json.dumps(report, indent=2))
    else:
        # Human-readable output
        print("=" * 70)
        print("  WeThePeople Pipeline Health Report")
        print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
        print("=" * 70)

        if critical_count > 0:
            print(f"\n  STATUS: CRITICAL ({critical_count} critical, {warn_count} warnings)\n")
        elif warn_count > 0:
            print(f"\n  STATUS: WARNING ({warn_count} warnings)\n")
        else:
            print(f"\n  STATUS: HEALTHY\n")

        # Group by level
        for level in ("critical", "warn", "info"):
            level_issues = [i for i in all_issues if i["level"] == level]
            if not level_issues:
                continue

            label = {"critical": "CRITICAL", "warn": "WARNING", "info": "INFO"}[level]
            print(f"  [{label}]")
            for issue in level_issues:
                prefix = {"critical": "  !! ", "warn": "  !  ", "info": "     "}[level]
                print(f"{prefix}{issue['message']}")
            print()

        print("=" * 70)

    # Also write the DLQ entry for this monitor run if there are critical issues
    if critical_count > 0:
        try:
            # Import enqueue_dlq from the ops router
            from routers.ops import enqueue_dlq
            enqueue_dlq(
                job_name="monitor_pipeline",
                error=f"{critical_count} critical issue(s) detected",
                context={
                    "critical_issues": [i for i in all_issues if i["level"] == "critical"],
                },
            )
        except Exception:
            pass  # Don't fail the monitor if DLQ write fails

    return 1 if critical_count > 0 else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Pipeline health monitor")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()
    return run_health_check(as_json=args.json)


if __name__ == "__main__":
    raise SystemExit(main())
