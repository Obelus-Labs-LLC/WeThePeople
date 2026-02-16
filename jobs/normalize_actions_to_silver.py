"""Normalize BillAction timeline into SilverAction

Silver layer is additive: it does not replace Bill/BillAction tables.

This job:
- Reads BillAction records
- Normalizes chamber and status conservatively
- Writes idempotently into silver_actions (no duplicates)

Usage:
    python jobs/normalize_actions_to_silver.py --limit 5000
    python jobs/normalize_actions_to_silver.py --bill-id hr3562-119
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import text

from models.database import (
    SessionLocal,
    engine,
    Bill,
    BillAction,
    SilverAction,
)

from utils.normalization import extract_chamber_from_action


def _ensure_tables_exist() -> None:
    SilverAction.__table__.create(bind=engine, checkfirst=True)
    # Ensure unique key enforcement even if the table pre-exists (checkfirst
    # does not retrofit UniqueConstraint on SQLite).
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_silver_actions_bill_date_desc
                ON silver_actions (bill_id, action_date, description)
                """
            )
        )


def normalize_actions_to_silver(
    bill_id: Optional[str] = None,
    limit: Optional[int] = None,
    dry_run: bool = False,
) -> dict:
    _ensure_tables_exist()

    db: Session = SessionLocal()
    created = 0
    skipped = 0

    try:
        q = db.query(BillAction)
        if bill_id:
            q = q.filter(BillAction.bill_id == bill_id)
        q = q.order_by(BillAction.bill_id.asc(), BillAction.action_date.asc(), BillAction.id.asc())
        if limit:
            q = q.limit(limit)

        for ba in q.all():
            bill = db.query(Bill).filter(Bill.bill_id == ba.bill_id).first()
            canonical_status = bill.status_bucket if bill else None

            chamber = ba.chamber
            if not chamber:
                chamber = extract_chamber_from_action(ba.action_code, ba.action_text)

            action_type = ba.action_code or None
            description = ba.action_text or ""

            existing = (
                db.query(SilverAction)
                .filter(
                    SilverAction.bill_id == ba.bill_id,
                    SilverAction.action_date == ba.action_date,
                    SilverAction.description == description,
                )
                .first()
            )
            if existing:
                skipped += 1
                continue

            row = SilverAction(
                bill_id=ba.bill_id,
                action_type=action_type,
                chamber=chamber,
                canonical_status=canonical_status,
                description=description,
                action_date=ba.action_date,
                created_at=datetime.utcnow(),
            )

            if dry_run:
                created += 1
                continue

            db.add(row)
            try:
                db.commit()
                created += 1
            except IntegrityError:
                db.rollback()
                skipped += 1

        return {"created": created, "skipped": skipped, "dry_run": dry_run}

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Normalize BillAction -> SilverAction")
    parser.add_argument("--bill-id", type=str, help="Filter by bill_id")
    parser.add_argument("--limit", type=int, help="Max actions to process")
    parser.add_argument("--dry-run", action="store_true", help="Do not write, just count")

    args = parser.parse_args()

    result = normalize_actions_to_silver(
        bill_id=args.bill_id,
        limit=args.limit,
        dry_run=args.dry_run,
    )

    print(
        f"SILVER ACTION NORMALIZATION | created={result['created']} skipped={result['skipped']} dry_run={result['dry_run']}"
    )
    sys.exit(0)
