"""Silver layer invariant checks

These checks are designed to be:
- fast
- deterministic
- safe to run repeatedly

Validations:
- silver_claims has no duplicate keys (person_id, source_url, normalized_text)
- silver_actions has no duplicate keys (bill_id, action_date, description)
- silver_actions timeline is sortable (action_date not null)

Usage:
    python scripts/check_silver_invariants.py
"""

import os
import sys
from collections import defaultdict

# Add repo root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func
from sqlalchemy import text

from models.database import SessionLocal, engine, SilverClaim, SilverAction


def _ensure_tables_exist() -> None:
    SilverClaim.__table__.create(bind=engine, checkfirst=True)
    SilverAction.__table__.create(bind=engine, checkfirst=True)
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
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_silver_actions_bill_date_desc
                ON silver_actions (bill_id, action_date, description)
                """
            )
        )


def main() -> int:
    _ensure_tables_exist()

    db = SessionLocal()
    try:
        # Invariant 1: no duplicate silver claims by canonical key
        dup_claims = (
            db.query(
                SilverClaim.person_id,
                SilverClaim.source_url,
                SilverClaim.normalized_text,
                func.count(SilverClaim.id).label("c"),
            )
            .group_by(SilverClaim.person_id, SilverClaim.source_url, SilverClaim.normalized_text)
            .having(func.count(SilverClaim.id) > 1)
            .all()
        )
        if dup_claims:
            print("❌ FAIL: Duplicate SilverClaim keys found")
            for person_id, source_url, normalized_text, c in dup_claims[:10]:
                print(f"  person_id={person_id} url={source_url} count={c} text={normalized_text[:60]}")
            return 1

        # Invariant 2: no duplicate silver actions by canonical key
        dup_actions = (
            db.query(
                SilverAction.bill_id,
                SilverAction.action_date,
                SilverAction.description,
                func.count(SilverAction.id).label("c"),
            )
            .group_by(SilverAction.bill_id, SilverAction.action_date, SilverAction.description)
            .having(func.count(SilverAction.id) > 1)
            .all()
        )
        if dup_actions:
            print("❌ FAIL: Duplicate SilverAction keys found")
            for bill_id, action_date, description, c in dup_actions[:10]:
                print(f"  bill_id={bill_id} date={action_date} count={c} desc={str(description)[:60]}")
            return 1

        # Invariant 3: action_date must be present
        missing_date = db.query(SilverAction).filter(SilverAction.action_date.is_(None)).count()
        if missing_date:
            print(f"❌ FAIL: SilverAction rows missing action_date: {missing_date}")
            return 1

        print("✅ Silver invariants: PASS")
        print(f"  silver_claims: {db.query(SilverClaim).count()}")
        print(f"  silver_actions: {db.query(SilverAction).count()}")
        return 0

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
