"""Gold ledger build test

Guarantees:
- Gold ledger build job materializes ClaimEvaluation into gold_ledger
- Running the job twice does not create duplicates (unique claim_id)

Usage:
    python test_gold_ledger_build.py
"""

import sys
import warnings
from datetime import datetime, date

warnings.filterwarnings("ignore", category=DeprecationWarning)

from sqlalchemy.exc import IntegrityError

from models.database import (
    SessionLocal,
    engine,
    Claim,
    ClaimEvaluation,
    SilverClaim,
    GoldLedgerEntry,
)

from jobs.build_gold_ledger import build_gold_ledger


def _ensure_tables() -> None:
    # Ensure dependent tables exist in environments where Alembic hasn't been run.
    Claim.__table__.create(bind=engine, checkfirst=True)
    ClaimEvaluation.__table__.create(bind=engine, checkfirst=True)
    SilverClaim.__table__.create(bind=engine, checkfirst=True)
    GoldLedgerEntry.__table__.create(bind=engine, checkfirst=True)


def test_gold_ledger_build() -> bool:
    print("=" * 70)
    print("GOLD LEDGER BUILD TEST")
    print("=" * 70)
    print()

    _ensure_tables()

    db = SessionLocal()
    claim = None
    ev = None
    gold_id = None

    try:
        person_id = "test_person"
        url = "https://example.com/gold-claim"
        text_value = "I voted for H.R. 1234."
        normalized = "i voted for hr 1234"

        claim = Claim(
            person_id=person_id,
            text=text_value,
            category="general",
            intent=None,
            claim_date=date.today(),
            claim_source_url=url,
            bill_refs_json=None,
            claim_hash=f"goldhash-{datetime.utcnow().timestamp()}",
            needs_recompute=0,
        )
        db.add(claim)
        db.commit()

        ev = ClaimEvaluation(
            claim_id=claim.id,
            person_id=person_id,
            best_action_id=None,
            score=0.0,
            tier="none",
            relevance="none",
            progress=None,
            timing=None,
            matched_bill_id=None,
            evidence_json="[]",
            why_json=None,
        )
        db.add(ev)
        db.commit()

        # Optional: SilverClaim present (mirrors production flow)
        sc = SilverClaim(
            bronze_id=None,
            person_id=person_id,
            normalized_text=normalized,
            intent_type="voted_for",
            policy_area=None,
            source_url=url,
            published_at=claim.claim_date,
            created_at=datetime.utcnow(),
        )
        db.add(sc)
        db.commit()

        # Run job first time
        r1 = build_gold_ledger(person_id=person_id, limit=50, dry_run=False)
        assert r1["created"] >= 1, "Expected at least 1 gold row created"

        gold = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim.id).first()
        assert gold is not None, "Expected gold row for claim"
        gold_id = gold.id
        assert gold.tier == "none"
        assert gold.normalized_text == normalized

        # Run job second time (should upsert, not duplicate)
        r2 = build_gold_ledger(person_id=person_id, limit=50, dry_run=False)
        assert r2["created"] == 0, f"Expected 0 new rows created, got {r2['created']}"

        count = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim.id).count()
        assert count == 1, f"Expected 1 gold row for claim, found {count}"

        # Attempt manual duplicate insert should fail due to unique index/constraint
        dup = GoldLedgerEntry(
            claim_id=claim.id,
            evaluation_id=ev.id,
            person_id=person_id,
            claim_date=claim.claim_date,
            source_url=url,
            normalized_text=normalized,
            intent_type="voted_for",
            policy_area=None,
            matched_bill_id=None,
            best_action_id=None,
            score=0.0,
            tier="none",
            relevance="none",
            progress=None,
            timing=None,
            evidence_json="[]",
            why_json=None,
            created_at=datetime.utcnow(),
        )
        db.add(dup)

        rejected = False
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            rejected = True

        assert rejected, "Expected duplicate GoldLedgerEntry insert to be rejected"

        print("PASS: Gold ledger build is idempotent")
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
            if gold_id is not None:
                db.query(GoldLedgerEntry).filter(GoldLedgerEntry.id == gold_id).delete(synchronize_session=False)
            if claim is not None:
                db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim.id).delete(synchronize_session=False)
                db.query(SilverClaim).filter(SilverClaim.person_id == "test_person", SilverClaim.source_url == url).delete(
                    synchronize_session=False
                )
                if ev is not None:
                    db.delete(ev)
                db.delete(claim)
            db.commit()
        except Exception:
            db.rollback()
        db.close()


if __name__ == "__main__":
    ok = test_gold_ledger_build()
    sys.exit(0 if ok else 1)
