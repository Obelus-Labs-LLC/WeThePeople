"""
Data Retention Service — SOC2 compliance.

Defines per-table retention policies and enforces them by deleting records older
than their retention window. Safe to run daily/weekly via the scheduler.

Tables with retention policies:
  - AuditLog:          2 years  (security audit trail — long retention required)
  - RateLimitRecord:   30 days  (ephemeral request counters)
  - TweetLog:          1 year   (social media posting history)
  - PipelineRun:       90 days  (sync job execution logs)
  - Anomaly:           1 year   (detected anomalies — useful for trend analysis)
  - Story (archived):  1 year   (archived stories only; published/draft retained)

Usage:
    from services.data_retention import enforce_retention, get_retention_report

    # In a scheduler job or management script:
    db = SessionLocal()
    try:
        results = enforce_retention(db)
        report = get_retention_report(db)
    finally:
        db.close()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class RetentionPolicy:
    """Defines how long records in a given table are kept."""

    table_name: str
    display_name: str
    retention_days: int
    timestamp_column: str  # Column name used to determine record age
    # Optional filter: only delete records matching this condition.
    # For example, only delete archived stories, not published ones.
    extra_filter: Optional[str] = None
    description: str = ""


# ---------------------------------------------------------------------------
# Retention policy registry
# ---------------------------------------------------------------------------

RETENTION_POLICIES: List[RetentionPolicy] = [
    RetentionPolicy(
        table_name="audit_logs",
        display_name="Audit Logs",
        retention_days=730,  # 2 years
        timestamp_column="timestamp",
        description="Security audit trail — 2-year retention for SOC2 compliance",
    ),
    RetentionPolicy(
        table_name="rate_limit_records",
        display_name="Rate Limit Records",
        retention_days=30,
        timestamp_column="window_start",
        description="Ephemeral rate limit counters — 30-day cleanup",
    ),
    RetentionPolicy(
        table_name="tweet_log",
        display_name="Tweet Log",
        retention_days=365,  # 1 year
        timestamp_column="posted_at",
        description="Twitter bot posting history — 1-year retention",
    ),
    RetentionPolicy(
        table_name="pipeline_runs",
        display_name="Pipeline Runs",
        retention_days=90,
        timestamp_column="started_at",
        description="Sync job execution logs — 90-day retention",
    ),
    RetentionPolicy(
        table_name="anomalies",
        display_name="Anomalies",
        retention_days=365,  # 1 year
        timestamp_column="detected_at",
        description="Detected suspicious patterns — 1-year retention",
    ),
    RetentionPolicy(
        table_name="stories",
        display_name="Stories (archived)",
        retention_days=365,  # 1 year, archived only
        timestamp_column="created_at",
        extra_filter="status = 'archived'",
        description="Archived stories — 1-year retention (published/draft kept indefinitely)",
    ),
]


def _get_policy_map() -> Dict[str, RetentionPolicy]:
    """Return a dict of table_name -> RetentionPolicy."""
    return {p.table_name: p for p in RETENTION_POLICIES}


# ---------------------------------------------------------------------------
# Enforcement
# ---------------------------------------------------------------------------

@dataclass
class RetentionResult:
    """Result of enforcing retention on a single table."""

    table_name: str
    display_name: str
    retention_days: int
    deleted_count: int
    cutoff_date: str  # ISO format
    error: Optional[str] = None


def enforce_retention(
    db: Session,
    *,
    dry_run: bool = False,
) -> List[RetentionResult]:
    """Delete records older than their retention period.

    Iterates over all registered retention policies and deletes expired records.
    Uses raw SQL for efficiency (avoids loading ORM objects into memory).

    Args:
        db: Active SQLAlchemy session.
        dry_run: If True, count deletable rows but don't actually delete.

    Returns:
        List of RetentionResult with per-table deletion counts.
    """
    results: List[RetentionResult] = []
    now = datetime.now(timezone.utc)

    for policy in RETENTION_POLICIES:
        cutoff = now - timedelta(days=policy.retention_days)
        cutoff_iso = cutoff.isoformat()

        try:
            # Build the WHERE clause
            # rate_limit_records uses epoch floats for window_start, not datetimes
            if policy.table_name == "rate_limit_records":
                cutoff_value = cutoff.timestamp()
                where_clause = f'"{policy.timestamp_column}" < :cutoff'
            else:
                cutoff_value = cutoff_iso
                where_clause = f'"{policy.timestamp_column}" < :cutoff'

            if policy.extra_filter:
                where_clause += f" AND {policy.extra_filter}"

            if dry_run:
                count_sql = f'SELECT COUNT(*) FROM "{policy.table_name}" WHERE {where_clause}'
                row = db.execute(text(count_sql), {"cutoff": cutoff_value}).scalar()
                deleted = row or 0
            else:
                delete_sql = f'DELETE FROM "{policy.table_name}" WHERE {where_clause}'
                result = db.execute(text(delete_sql), {"cutoff": cutoff_value})
                deleted = result.rowcount
                db.commit()

            results.append(RetentionResult(
                table_name=policy.table_name,
                display_name=policy.display_name,
                retention_days=policy.retention_days,
                deleted_count=deleted,
                cutoff_date=cutoff_iso,
            ))

            if deleted > 0:
                action = "Would delete" if dry_run else "Deleted"
                logger.info(
                    "%s %d rows from %s (cutoff: %s)",
                    action, deleted, policy.table_name, cutoff_iso,
                    extra={
                        "job": "data_retention",
                        "step": "enforce",
                        "count": deleted,
                    },
                )

        except Exception as exc:
            db.rollback()
            error_msg = str(exc)
            logger.error(
                "Retention enforcement failed for %s: %s",
                policy.table_name, error_msg,
                extra={"job": "data_retention", "error_type": type(exc).__name__},
            )
            results.append(RetentionResult(
                table_name=policy.table_name,
                display_name=policy.display_name,
                retention_days=policy.retention_days,
                deleted_count=0,
                cutoff_date=cutoff_iso,
                error=error_msg,
            ))

    return results


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

@dataclass
class TableRetentionInfo:
    """Status information for a single table's retention."""

    table_name: str
    display_name: str
    retention_days: int
    description: str
    total_records: int
    oldest_record: Optional[str]  # ISO timestamp of the oldest record
    expired_count: int  # Records past their retention window
    extra_filter: Optional[str]


def get_retention_report(db: Session) -> List[TableRetentionInfo]:
    """Generate a retention status report for all managed tables.

    Shows record counts, oldest records, and how many records are past
    their retention window for each table with a defined policy.

    Args:
        db: Active SQLAlchemy session.

    Returns:
        List of TableRetentionInfo objects.
    """
    report: List[TableRetentionInfo] = []
    now = datetime.now(timezone.utc)

    for policy in RETENTION_POLICIES:
        cutoff = now - timedelta(days=policy.retention_days)

        try:
            # For rate_limit_records, window_start is an epoch float
            is_epoch = policy.table_name == "rate_limit_records"
            cutoff_value = cutoff.timestamp() if is_epoch else cutoff.isoformat()

            # Total count
            filter_clause = f"WHERE {policy.extra_filter}" if policy.extra_filter else ""
            count_sql = f'SELECT COUNT(*) FROM "{policy.table_name}" {filter_clause}'
            total = db.execute(text(count_sql)).scalar() or 0

            # Oldest record
            oldest_sql = (
                f'SELECT MIN("{policy.timestamp_column}") '
                f'FROM "{policy.table_name}" {filter_clause}'
            )
            oldest_raw = db.execute(text(oldest_sql)).scalar()

            if oldest_raw is not None:
                if is_epoch:
                    oldest_str = datetime.fromtimestamp(float(oldest_raw), tz=timezone.utc).isoformat()
                elif isinstance(oldest_raw, str):
                    oldest_str = oldest_raw
                else:
                    oldest_str = str(oldest_raw)
            else:
                oldest_str = None

            # Expired count
            expired_where = f'"{policy.timestamp_column}" < :cutoff'
            if policy.extra_filter:
                expired_where += f" AND {policy.extra_filter}"
            expired_sql = f'SELECT COUNT(*) FROM "{policy.table_name}" WHERE {expired_where}'
            expired = db.execute(text(expired_sql), {"cutoff": cutoff_value}).scalar() or 0

            report.append(TableRetentionInfo(
                table_name=policy.table_name,
                display_name=policy.display_name,
                retention_days=policy.retention_days,
                description=policy.description,
                total_records=total,
                oldest_record=oldest_str,
                expired_count=expired,
                extra_filter=policy.extra_filter,
            ))

        except Exception as exc:
            logger.warning(
                "Could not generate retention report for %s: %s",
                policy.table_name, exc,
            )
            report.append(TableRetentionInfo(
                table_name=policy.table_name,
                display_name=policy.display_name,
                retention_days=policy.retention_days,
                description=policy.description,
                total_records=-1,
                oldest_record=None,
                expired_count=-1,
                extra_filter=policy.extra_filter,
            ))

    return report


# ---------------------------------------------------------------------------
# CLI entry point (for manual runs / cron)
# ---------------------------------------------------------------------------

def main() -> int:
    """Run retention enforcement from the command line."""
    import argparse
    import json
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from models.database import SessionLocal

    parser = argparse.ArgumentParser(description="WeThePeople data retention enforcement")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without deleting")
    parser.add_argument("--report", action="store_true", help="Print retention report (no deletions)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.report:
            report = get_retention_report(db)
            if args.json:
                data = [
                    {
                        "table": r.table_name,
                        "display_name": r.display_name,
                        "retention_days": r.retention_days,
                        "total_records": r.total_records,
                        "oldest_record": r.oldest_record,
                        "expired_count": r.expired_count,
                        "description": r.description,
                    }
                    for r in report
                ]
                print(json.dumps(data, indent=2))
            else:
                print(f"\n{'Table':<25} {'Retention':<12} {'Total':<10} {'Expired':<10} {'Oldest Record'}")
                print("-" * 90)
                for r in report:
                    retention_str = f"{r.retention_days}d"
                    oldest = r.oldest_record[:19] if r.oldest_record else "—"
                    total = str(r.total_records) if r.total_records >= 0 else "error"
                    expired = str(r.expired_count) if r.expired_count >= 0 else "error"
                    print(f"  {r.display_name:<23} {retention_str:<12} {total:<10} {expired:<10} {oldest}")
                print()
            return 0

        action = "DRY RUN" if args.dry_run else "ENFORCING"
        logger.info("Data retention %s starting...", action)

        results = enforce_retention(db, dry_run=args.dry_run)

        if args.json:
            data = [
                {
                    "table": r.table_name,
                    "deleted": r.deleted_count,
                    "cutoff": r.cutoff_date,
                    "error": r.error,
                }
                for r in results
            ]
            print(json.dumps(data, indent=2))
        else:
            total_deleted = sum(r.deleted_count for r in results)
            errors = [r for r in results if r.error]
            verb = "would delete" if args.dry_run else "deleted"
            print(f"\nRetention enforcement complete: {verb} {total_deleted} total rows")
            for r in results:
                if r.deleted_count > 0:
                    print(f"  {r.display_name}: {r.deleted_count} rows (>{r.retention_days}d)")
            if errors:
                print(f"\n{len(errors)} table(s) had errors:")
                for r in errors:
                    print(f"  {r.display_name}: {r.error}")
            print()

        return 1 if any(r.error for r in results) else 0

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
