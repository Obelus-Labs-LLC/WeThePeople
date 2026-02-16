"""Normalize Claims into SilverClaim

Silver layer is additive: it does not replace Bronze -> Claim ingestion.

This job:
- Reads existing Claim records
- Computes normalized_text + intent_type
- Optionally links to BronzeDocument by (person_id, source_url)
- Writes idempotently into silver_claims (no duplicates)

Usage:
    python jobs/normalize_claims_to_silver.py --limit 500
    python jobs/normalize_claims_to_silver.py --person-id aoc --dry-run
"""

import argparse
import os
import re
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
    Claim,
    ClaimEvaluation,
    Action,
    Bill,
    BronzeDocument,
    SilverClaim,
)

from services.matching.core import detect_intent


def _ensure_tables_exist() -> None:
    SilverClaim.__table__.create(bind=engine, checkfirst=True)
    # Ensure unique key enforcement even if the table pre-exists (checkfirst
    # does not retrofit UniqueConstraint on SQLite).
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_silver_claims_person_url_text
                ON silver_claims (person_id, source_url, normalized_text)
                """
            )
        )


def normalize_claim_text(text: str) -> str:
    """Normalize claim text for Silver layer deduplication."""
    t = (text or "").lower()
    t = re.sub(r"[^\w\s]", "", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _find_bronze_id(db: Session, person_id: str, source_url: Optional[str]) -> Optional[int]:
    if not source_url:
        return None
    row = (
        db.query(BronzeDocument.id)
        .filter(
            BronzeDocument.person_id == person_id,
            BronzeDocument.source_url == source_url,
        )
        .order_by(BronzeDocument.fetched_at.desc())
        .first()
    )
    return int(row[0]) if row else None


def _infer_policy_area(db: Session, claim_id: int) -> Optional[str]:
    """Best-effort policy_area for the SilverClaim.

    Conservative: only uses existing evaluation->action/bill enrichment if present.
    """
    ev = (
        db.query(ClaimEvaluation)
        .filter(ClaimEvaluation.claim_id == claim_id)
        .first()
    )
    if not ev or not ev.best_action_id:
        return None

    action = db.query(Action).filter(Action.id == ev.best_action_id).first()
    if action and action.policy_area:
        return action.policy_area

    if action and action.bill_congress and action.bill_type and action.bill_number:
        bill_id = f"{str(action.bill_type).lower()}{action.bill_number}-{action.bill_congress}"
        bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
        if bill and bill.policy_area:
            return bill.policy_area

    return None


def normalize_claims_to_silver(
    person_id: Optional[str] = None,
    limit: Optional[int] = None,
    dry_run: bool = False,
) -> dict:
    _ensure_tables_exist()

    db: Session = SessionLocal()
    created = 0
    skipped = 0

    try:
        q = db.query(Claim)
        if person_id:
            q = q.filter(Claim.person_id == person_id)
        q = q.order_by(Claim.id.asc())
        if limit:
            q = q.limit(limit)

        for claim in q.all():
            normalized_text = normalize_claim_text(claim.text)
            intent_type = claim.intent or detect_intent(claim.text)
            bronze_id = _find_bronze_id(db, claim.person_id, claim.claim_source_url)
            policy_area = _infer_policy_area(db, claim.id)

            key_person_id = claim.person_id
            key_source_url = claim.claim_source_url or ""

            existing = (
                db.query(SilverClaim)
                .filter(
                    SilverClaim.person_id == key_person_id,
                    SilverClaim.source_url == key_source_url,
                    SilverClaim.normalized_text == normalized_text,
                )
                .first()
            )
            if existing:
                skipped += 1
                continue

            row = SilverClaim(
                bronze_id=bronze_id,
                person_id=key_person_id,
                normalized_text=normalized_text,
                intent_type=intent_type,
                policy_area=policy_area,
                source_url=key_source_url,
                published_at=claim.claim_date,
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
    parser = argparse.ArgumentParser(description="Normalize Claim -> SilverClaim")
    parser.add_argument("--person-id", type=str, help="Filter by person_id")
    parser.add_argument("--limit", type=int, help="Max claims to process")
    parser.add_argument("--dry-run", action="store_true", help="Do not write, just count")

    args = parser.parse_args()

    result = normalize_claims_to_silver(
        person_id=args.person_id,
        limit=args.limit,
        dry_run=args.dry_run,
    )

    print(
        f"SILVER CLAIM NORMALIZATION | created={result['created']} skipped={result['skipped']} dry_run={result['dry_run']}"
    )
    sys.exit(0)
