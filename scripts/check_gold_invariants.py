"""Gold layer invariant checks

Validations:
- gold_ledger has no duplicate keys (claim_id)
- gold_ledger rows reference existing Claim + ClaimEvaluation
- tier is always present

Usage:
    python scripts/check_gold_invariants.py
"""

import os
import sys

# Add repo root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, text

from models.database import SessionLocal, engine, GoldLedgerEntry, Claim, ClaimEvaluation


def _ensure_tables_exist() -> None:
    GoldLedgerEntry.__table__.create(bind=engine, checkfirst=True)

    # Ensure unique key enforcement even if the table pre-exists.
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_ledger_claim_id
                ON gold_ledger (claim_id)
                """
            )
        )


def main() -> int:
    _ensure_tables_exist()

    db = SessionLocal()
    try:
        dup = (
            db.query(GoldLedgerEntry.claim_id, func.count(GoldLedgerEntry.id).label("c"))
            .group_by(GoldLedgerEntry.claim_id)
            .having(func.count(GoldLedgerEntry.id) > 1)
            .all()
        )
        if dup:
            print("FAIL: Duplicate GoldLedgerEntry claim_id found")
            for claim_id, c in dup[:10]:
                print(f"  claim_id={claim_id} count={c}")
            return 1

        missing_tier = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.tier.is_(None)).count()
        if missing_tier:
            print(f"FAIL: GoldLedgerEntry rows missing tier: {missing_tier}")
            return 1

        missing_claim = (
            db.query(GoldLedgerEntry)
            .outerjoin(Claim, Claim.id == GoldLedgerEntry.claim_id)
            .filter(Claim.id.is_(None))
            .count()
        )
        if missing_claim:
            print(f"FAIL: GoldLedgerEntry rows with missing Claim: {missing_claim}")
            return 1

        missing_eval = (
            db.query(GoldLedgerEntry)
            .outerjoin(ClaimEvaluation, ClaimEvaluation.id == GoldLedgerEntry.evaluation_id)
            .filter(ClaimEvaluation.id.is_(None))
            .count()
        )
        if missing_eval:
            print(f"FAIL: GoldLedgerEntry rows with missing ClaimEvaluation: {missing_eval}")
            return 1

        print("PASS: Gold invariants")
        print(f"  gold_ledger: {db.query(GoldLedgerEntry).count()}")
        return 0

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
