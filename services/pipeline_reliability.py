"""
Pipeline reliability services: Dead Letter Queue, exactly-once processing,
and data quality monitoring.

These tools help sync jobs handle failures gracefully, avoid reprocessing
the same records, and detect data quality regressions after syncs.
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from models.pipeline_models import FailedRecord, ProcessedRecord, DataQualityCheck  # noqa: F401
from utils.db_compat import limit_sql
from utils.logging import get_logger

logger = get_logger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# 1. Dead Letter Queue (DLQ)
# ═══════════════════════════════════════════════════════════════════════════


def send_to_dlq(
    db: Session,
    job_name: str,
    record_data: Any,
    error: str,
    auto_commit: bool = True,
) -> FailedRecord:
    """Store a failed record in the dead letter queue.

    Args:
        db: SQLAlchemy session.
        job_name: Name of the sync job that failed (e.g. "sync_finance_data").
        record_data: The raw record that caused the failure (dict/list/str).
        error: Error message or traceback string.
        auto_commit: If True (default), commits immediately. Set False to let
                     the caller control the transaction boundary.

    Returns:
        The created FailedRecord.
    """
    serialized = json.dumps(record_data, default=str) if not isinstance(record_data, str) else record_data
    item = FailedRecord(
        job_name=job_name,
        record_data=serialized,
        error_message=str(error)[:5000],  # Truncate long tracebacks
    )
    db.add(item)
    if auto_commit:
        db.commit()
        db.refresh(item)
    else:
        db.flush()
    logger.warning("DLQ: %s — %s", job_name, str(error)[:200])
    return item


def get_dlq_items(
    db: Session,
    job_name: Optional[str] = None,
    include_resolved: bool = False,
    limit: int = 100,
) -> List[FailedRecord]:
    """Retrieve failed records from the DLQ.

    Args:
        db: SQLAlchemy session.
        job_name: Filter by job name. None returns all jobs.
        include_resolved: If True, include records that have been resolved.
        limit: Max records to return.

    Returns:
        List of FailedRecord objects.
    """
    q = db.query(FailedRecord)
    if job_name:
        q = q.filter(FailedRecord.job_name == job_name)
    if not include_resolved:
        q = q.filter(FailedRecord.resolved_at.is_(None))
    return q.order_by(FailedRecord.created_at.desc()).limit(limit).all()


def retry_dlq_item(db: Session, item_id: int) -> FailedRecord:
    """Mark a DLQ item as retried (increments retry_count, updates last_retry_at).

    The caller is responsible for actually re-processing the record data.
    If reprocessing succeeds, call resolve_dlq_item().

    Args:
        db: SQLAlchemy session.
        item_id: Primary key of the FailedRecord.

    Returns:
        Updated FailedRecord.

    Raises:
        ValueError: If item_id not found or already resolved.
    """
    item = db.query(FailedRecord).filter(FailedRecord.id == item_id).first()
    if item is None:
        raise ValueError(f"DLQ item {item_id} not found")
    if item.resolved_at is not None:
        raise ValueError(f"DLQ item {item_id} already resolved at {item.resolved_at}")
    item.retry_count += 1
    item.last_retry_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


def resolve_dlq_item(db: Session, item_id: int) -> FailedRecord:
    """Mark a DLQ item as resolved (sets resolved_at timestamp).

    Args:
        db: SQLAlchemy session.
        item_id: Primary key of the FailedRecord.

    Returns:
        Updated FailedRecord.

    Raises:
        ValueError: If item_id not found.
    """
    item = db.query(FailedRecord).filter(FailedRecord.id == item_id).first()
    if item is None:
        raise ValueError(f"DLQ item {item_id} not found")
    item.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    logger.info("DLQ resolved: item %d (%s)", item_id, item.job_name)
    return item


# ═══════════════════════════════════════════════════════════════════════════
# 2. Exactly-Once Processing
# ═══════════════════════════════════════════════════════════════════════════



def _compute_hash(record_data: Any) -> str:
    """Compute a stable SHA-256 hash from record data.

    Handles dicts (sorted keys for stability), strings, and other types.
    """
    if isinstance(record_data, dict):
        canonical = json.dumps(record_data, sort_keys=True, default=str)
    elif isinstance(record_data, str):
        canonical = record_data
    else:
        canonical = json.dumps(record_data, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def already_processed(db: Session, job_name: str, record_data: Any) -> bool:
    """Check if a record has already been processed by the given job.

    Args:
        db: SQLAlchemy session.
        job_name: Name of the sync job.
        record_data: The raw record (dict, str, etc.) to check.

    Returns:
        True if this exact record has been processed before.
    """
    record_hash = _compute_hash(record_data)
    exists = (
        db.query(ProcessedRecord.id)
        .filter(
            ProcessedRecord.job_name == job_name,
            ProcessedRecord.record_hash == record_hash,
        )
        .first()
    )
    return exists is not None


def mark_processed(
    db: Session, job_name: str, record_data: Any, auto_commit: bool = True,
) -> ProcessedRecord:
    """Mark a record as successfully processed.

    Args:
        db: SQLAlchemy session.
        job_name: Name of the sync job.
        record_data: The raw record (dict, str, etc.) that was processed.
        auto_commit: If True (default), commits immediately. Set False to let
                     the caller control the transaction boundary.

    Returns:
        The created ProcessedRecord.
    """
    record_hash = _compute_hash(record_data)
    rec = ProcessedRecord(
        job_name=job_name,
        record_hash=record_hash,
    )
    db.add(rec)
    if auto_commit:
        db.commit()
        db.refresh(rec)
    else:
        db.flush()
    return rec


# ═══════════════════════════════════════════════════════════════════════════
# 3. Data Quality Monitoring
# ═══════════════════════════════════════════════════════════════════════════



def _count_rows(db: Session, table_name: str) -> int:
    """Count rows in a table using raw SQL (works for any table name)."""
    result = db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"'))
    return result.scalar() or 0


def _table_exists(db: Session, table_name: str) -> bool:
    """Check if a table exists in the database."""
    try:
        db.execute(text(f'SELECT 1 FROM "{table_name}" {limit_sql(1)}'))
        return True
    except Exception:
        return False


def _record_check(
    db: Session,
    check_name: str,
    table_name: str,
    expected_min: Optional[float],
    actual_count: float,
    passed: bool,
) -> DataQualityCheck:
    """Persist a quality check result."""
    check = DataQualityCheck(
        check_name=check_name,
        table_name=table_name,
        expected_min=expected_min,
        actual_count=actual_count,
        passed=1 if passed else 0,
    )
    db.add(check)
    return check


def run_quality_checks(db: Session) -> List[Dict[str, Any]]:
    """Run all data quality checks and return a summary.

    Checks performed:
    1. Each tracked entity table has > 0 records
    2. Vote count is in expected range (> 0 if table exists)
    3. No orphaned MemberVote records (vote_id references non-existent Vote)
    4. Lobbying records have non-null income fields

    Returns:
        List of dicts with check results: {name, table, expected_min, actual, passed}
    """
    results = []

    # ── Check 1: Tracked entity tables are non-empty ──────────────────
    entity_tables = [
        "tracked_members",
        "tracked_institutions",     # Finance
        "tracked_companies",        # Health
        "tracked_tech_companies",
        "tracked_energy_companies",
        "tracked_transportation_companies",
        "tracked_defense_companies",
    ]

    for table in entity_tables:
        if not _table_exists(db, table):
            check = _record_check(db, f"entity_table_exists:{table}", table, 1, 0, False)
            results.append({
                "name": check.check_name,
                "table": table,
                "expected_min": 1,
                "actual": 0,
                "passed": False,
            })
            continue

        count = _count_rows(db, table)
        passed = count > 0
        check = _record_check(db, f"entity_table_non_empty:{table}", table, 1, count, passed)
        results.append({
            "name": check.check_name,
            "table": table,
            "expected_min": 1,
            "actual": count,
            "passed": passed,
        })

    # ── Check 2: Votes table has records ──────────────────────────────
    if _table_exists(db, "votes"):
        vote_count = _count_rows(db, "votes")
        passed = vote_count > 0
        check = _record_check(db, "votes_non_empty", "votes", 1, vote_count, passed)
        results.append({
            "name": "votes_non_empty",
            "table": "votes",
            "expected_min": 1,
            "actual": vote_count,
            "passed": passed,
        })

    # ── Check 3: No orphaned MemberVote records ──────────────────────
    if _table_exists(db, "member_votes") and _table_exists(db, "votes"):
        orphan_result = db.execute(text(
            "SELECT COUNT(*) FROM member_votes mv "
            "LEFT JOIN votes v ON mv.vote_id = v.id "
            "WHERE v.id IS NULL"
        ))
        orphan_count = orphan_result.scalar() or 0
        passed = orphan_count == 0
        check = _record_check(
            db, "no_orphaned_member_votes", "member_votes", 0, orphan_count, passed
        )
        results.append({
            "name": "no_orphaned_member_votes",
            "table": "member_votes",
            "expected_min": 0,
            "actual": orphan_count,
            "passed": passed,
        })

    # ── Check 4: Lobbying records have non-null income ────────────────
    lobbying_tables = [
        "finance_lobbying_records",
        "health_lobbying_records",
        "lobbying_records",               # Tech
        "energy_lobbying_records",
        "transportation_lobbying_records",
        "defense_lobbying_records",
    ]

    for table in lobbying_tables:
        if not _table_exists(db, table):
            continue

        total = _count_rows(db, table)
        if total == 0:
            # Empty table is not a lobbying quality failure
            continue

        null_income_result = db.execute(text(
            f'SELECT COUNT(*) FROM "{table}" WHERE income IS NULL'
        ))
        null_count = null_income_result.scalar() or 0
        # Allow up to 10% null income fields (some filings legitimately omit income)
        threshold = total * 0.10
        passed = null_count <= threshold
        check = _record_check(
            db,
            f"lobbying_income_populated:{table}",
            table,
            total * 0.90,
            total - null_count,
            passed,
        )
        results.append({
            "name": check.check_name,
            "table": table,
            "expected_min": round(total * 0.90, 1),
            "actual": total - null_count,
            "passed": passed,
        })

    db.commit()

    # Log summary
    total_checks = len(results)
    passed_checks = sum(1 for r in results if r["passed"])
    failed_checks = total_checks - passed_checks
    logger.info(
        "Data quality: %d/%d checks passed (%d failed)",
        passed_checks, total_checks, failed_checks,
    )
    if failed_checks > 0:
        for r in results:
            if not r["passed"]:
                logger.warning("  FAILED: %s — expected >= %s, got %s", r["name"], r["expected_min"], r["actual"])

    return results
