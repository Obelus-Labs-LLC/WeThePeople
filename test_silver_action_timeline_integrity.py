"""SilverAction timeline integrity test

Guarantees:
- SilverAction can represent bill timelines
- Ordering by (bill_id, action_date) is stable
- Dedupe unique key prevents duplicates

Usage:
    python test_silver_action_timeline_integrity.py
"""

import sys
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore", category=DeprecationWarning)

from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from models.database import SessionLocal, engine, Bill, SilverAction


def _ensure_table():
    SilverAction.__table__.create(bind=engine, checkfirst=True)
    # If the table already existed (created before constraints were added),
    # SQLAlchemy won't retrofit the UniqueConstraint. Ensure the backing unique
    # index exists so dedupe is enforced.
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_silver_actions_bill_date_desc
                ON silver_actions (bill_id, action_date, description)
                """
            )
        )


def test_silver_action_timeline_integrity():
    print("=" * 70)
    print("SILVER ACTION TIMELINE INTEGRITY TEST")
    print("=" * 70)
    print()

    _ensure_table()

    db = SessionLocal()
    bill = None
    a1 = None
    a2 = None
    bill_id = None

    try:
        bill_id = f"testbill-119-{int(datetime.utcnow().timestamp())}"
        bill = Bill(
            bill_id=bill_id,
            congress=119,
            bill_type="hr",
            bill_number=999999,
            title="Test Bill",
            policy_area=None,
            status_bucket="introduced",
            status_reason=None,
            latest_action_text=None,
            latest_action_date=None,
            needs_enrichment=0,
            metadata_json=None,
        )
        db.add(bill)
        db.commit()

        t0 = datetime.utcnow()
        t1 = t0 + timedelta(days=1)

        a1 = SilverAction(
            bill_id=bill_id,
            action_type="Intro-H",
            chamber="House",
            canonical_status="introduced",
            description="Introduced in House",
            action_date=t0,
            created_at=datetime.utcnow(),
        )
        a2 = SilverAction(
            bill_id=bill_id,
            action_type="Referred",
            chamber="House",
            canonical_status="in_committee",
            description="Referred to committee",
            action_date=t1,
            created_at=datetime.utcnow(),
        )

        db.add(a2)
        db.add(a1)
        db.commit()

        ordered = (
            db.query(SilverAction)
            .filter(SilverAction.bill_id == bill_id)
            .order_by(SilverAction.action_date.asc(), SilverAction.id.asc())
            .all()
        )

        assert len(ordered) == 2, f"Expected 2 actions, got {len(ordered)}"
        assert ordered[0].description == "Introduced in House"
        assert ordered[1].description == "Referred to committee"

        # Dedupe check: inserting same (bill_id, action_date, description) should fail
        dup = SilverAction(
            bill_id=bill_id,
            action_type="Intro-H",
            chamber="House",
            canonical_status="introduced",
            description="Introduced in House",
            action_date=t0,
            created_at=datetime.utcnow(),
        )
        db.add(dup)

        rejected = False
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            rejected = True

        assert rejected, "Expected duplicate SilverAction insert to be rejected"

        print("PASS: Timeline ordering stable")
        print("PASS: Duplicate prevented by unique constraint")
        print()
        print("=" * 70)
        print("ALL TESTS PASSED")
        print("=" * 70)
        return True

    except Exception as e:
        print(f"FAIL: Test failed: {e}")
        db.rollback()
        return False

    finally:
        # Cleanup
        try:
            if bill_id:
                db.query(SilverAction).filter(SilverAction.bill_id == bill_id).delete(synchronize_session=False)
            if bill is not None:
                db.delete(bill)
            db.commit()
        except Exception:
            db.rollback()
        db.close()


if __name__ == "__main__":
    ok = test_silver_action_timeline_integrity()
    sys.exit(0 if ok else 1)
