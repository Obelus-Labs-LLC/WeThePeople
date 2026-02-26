"""SilverClaim dedupe test

Guarantees:
- SilverClaim writes are idempotent
- Unique key prevents duplicates

Usage:
    python test_silver_claims_dedupe.py
"""

import sys
import warnings
from datetime import datetime, date

warnings.filterwarnings("ignore", category=DeprecationWarning)

from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from models.database import (
    SessionLocal,
    engine,
    BronzeDocument,
    Claim,
    SilverClaim,
)


def _ensure_table():
    SilverClaim.__table__.create(bind=engine, checkfirst=True)
    # If the table already existed (created before constraints were added),
    # SQLAlchemy won't retrofit the UniqueConstraint. Ensure the backing unique
    # index exists so dedupe is truly enforced.
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_silver_claims_person_url_text
                ON silver_claims (person_id, source_url, normalized_text)
                """
            )
        )


def test_silver_claim_dedupe():
    print("=" * 70)
    print("SILVER CLAIM DEDUPE TEST")
    print("=" * 70)
    print()

    _ensure_table()

    db = SessionLocal()
    bronze = None
    claim = None
    sc1 = None

    try:
        person_id = "test_person"
        url = "https://example.com/silver-claim"
        text = "I Introduced H.R. 1234!"
        normalized = "i introduced hr 1234"

        bronze = BronzeDocument(
            person_id=person_id,
            source_url=url,
            fetched_at=datetime.utcnow(),
            content_type="html",
            raw_html="<html>ok</html>",
            raw_text=None,
            fetch_hash="deadbeefdeadbeefdeadbeefdeadbeef",
        )
        db.add(bronze)
        db.commit()

        claim = Claim(
            person_id=person_id,
            text=text,
            category="general",
            intent=None,
            claim_date=date.today(),
            claim_source_url=url,
            bill_refs_json=None,
            claim_hash=f"testhash-{datetime.utcnow().timestamp()}",
            needs_recompute=0,
        )
        db.add(claim)
        db.commit()

        key = (person_id, url, normalized)

        sc1 = SilverClaim(
            bronze_id=bronze.id,
            person_id=person_id,
            normalized_text=normalized,
            intent_type="sponsored",
            policy_area=None,
            source_url=url,
            published_at=claim.claim_date,
            created_at=datetime.utcnow(),
        )
        db.add(sc1)
        db.commit()

        # Attempt duplicate insert with same key
        sc2 = SilverClaim(
            bronze_id=bronze.id,
            person_id=person_id,
            normalized_text=normalized,
            intent_type="sponsored",
            policy_area=None,
            source_url=url,
            published_at=claim.claim_date,
            created_at=datetime.utcnow(),
        )
        db.add(sc2)

        duplicate_rejected = False
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            duplicate_rejected = True

        assert duplicate_rejected, "Expected duplicate SilverClaim insert to be rejected"

        count = (
            db.query(SilverClaim)
            .filter(
                SilverClaim.person_id == key[0],
                SilverClaim.source_url == key[1],
                SilverClaim.normalized_text == key[2],
            )
            .count()
        )
        assert count == 1, f"Expected 1 SilverClaim for key, found {count}"

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
        # Cleanup (defensive: delete by key, not by instance)
        try:
            db.query(SilverClaim).filter(
                SilverClaim.person_id == "test_person",
                SilverClaim.source_url == "https://example.com/silver-claim",
            ).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()

        try:
            if claim is not None:
                db.delete(claim)
                db.commit()
        except Exception:
            db.rollback()

        try:
            if bronze is not None:
                db.delete(bronze)
                db.commit()
        except Exception:
            db.rollback()

        db.close()


if __name__ == "__main__":
    ok = test_silver_claim_dedupe()
    sys.exit(0 if ok else 1)
