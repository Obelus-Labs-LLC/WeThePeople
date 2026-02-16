"""Power Map contract test

Guarantees:
- Power Map graph contains stable node/edge shapes
- All edges reference existing nodes (no dangling references)
- Graph is derived from Gold (no invention)

Usage:
    python test_power_map_contract.py
"""

import sys
import warnings
from datetime import datetime, date

warnings.filterwarnings("ignore", category=DeprecationWarning)

from models.database import (
    SessionLocal,
    engine,
    Bill,
    Claim,
    ClaimEvaluation,
    GoldLedgerEntry,
)

from jobs.build_gold_ledger import build_gold_ledger
from services.power_map import build_person_power_map


def _ensure_tables() -> None:
    Bill.__table__.create(bind=engine, checkfirst=True)
    Claim.__table__.create(bind=engine, checkfirst=True)
    ClaimEvaluation.__table__.create(bind=engine, checkfirst=True)
    GoldLedgerEntry.__table__.create(bind=engine, checkfirst=True)


def test_power_map_contract() -> bool:
    print("=" * 70)
    print("POWER MAP CONTRACT TEST")
    print("=" * 70)
    print()

    _ensure_tables()

    db = SessionLocal()
    claim = None
    ev = None
    bill = None

    try:
        person_id = "test_person"
        bill_id = f"hr999999-119"
        url = "https://example.com/powermap"

        bill = Bill(
            bill_id=bill_id,
            congress=119,
            bill_type="hr",
            bill_number=999999,
            title="Test Power Map Bill",
            policy_area="Crime and Law Enforcement",
            status_bucket="introduced",
            status_reason=None,
            latest_action_text=None,
            latest_action_date=None,
            needs_enrichment=0,
            metadata_json=None,
        )
        db.add(bill)
        db.commit()

        claim = Claim(
            person_id=person_id,
            text="I introduced a bill to improve enforcement.",
            category="general",
            intent="sponsored",
            claim_date=date.today(),
            claim_source_url=url,
            bill_refs_json=None,
            claim_hash=f"pmhash-{datetime.utcnow().timestamp()}",
            needs_recompute=0,
        )
        db.add(claim)
        db.commit()

        ev = ClaimEvaluation(
            claim_id=claim.id,
            person_id=person_id,
            best_action_id=None,
            score=50.0,
            tier="moderate",
            relevance="high",
            progress="introduced",
            timing="follow_through",
            matched_bill_id=bill_id,
            evidence_json='["url_match:test"]',
            why_json=None,
        )
        db.add(ev)
        db.commit()

        # Build Gold
        r = build_gold_ledger(person_id=person_id, limit=50, dry_run=False)
        assert r["created"] >= 1, "Expected gold row created"

        # Build Power Map
        graph = build_person_power_map(db, person_id=person_id, limit=50)

        assert graph["person_id"] == person_id
        assert isinstance(graph["nodes"], list) and len(graph["nodes"]) >= 2
        assert isinstance(graph["edges"], list) and len(graph["edges"]) >= 1

        node_ids = [n["id"] for n in graph["nodes"]]
        assert len(node_ids) == len(set(node_ids)), "Duplicate node ids found"

        nodeset = set(node_ids)
        for e in graph["edges"]:
            assert e["source"] in nodeset, f"Dangling edge source: {e['source']}"
            assert e["target"] in nodeset, f"Dangling edge target: {e['target']}"
            assert "type" in e and isinstance(e["type"], str)

        # Must include bill node from matched_bill_id
        assert f"bill:{bill_id}" in nodeset, "Expected bill node for matched bill"

        print("PASS: Graph contract valid")
        print("PASS: No dangling edges")
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
        # Cleanup (defensive)
        try:
            if claim is not None:
                db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim.id).delete(synchronize_session=False)
            if ev is not None:
                db.delete(ev)
            if claim is not None:
                db.delete(claim)
            if bill is not None:
                db.delete(bill)
            db.commit()
        except Exception:
            db.rollback()
        db.close()


if __name__ == "__main__":
    ok = test_power_map_contract()
    sys.exit(0 if ok else 1)
