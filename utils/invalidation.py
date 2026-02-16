"""
Utility to invalidate evaluation cache when bill lifecycle data changes.

When bills are enriched/updated, mark affected claims as needing recomputation.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from sqlalchemy import text

from models.database import SessionLocal, Claim, ClaimEvaluation, Action
from utils.normalization import normalize_bill_id


def invalidate_claims_for_bill(congress: int, bill_type: str, bill_number: int, db: Session):
    """
    Mark all claims matching this bill as needing recomputation.
    
    Call this whenever bill lifecycle data is enriched/updated.
    
    Args:
        congress: Bill congress (e.g. 119)
        bill_type: Bill type (e.g. "hr", "s", "hconres")
        bill_number: Bill number (e.g. 2670)
        db: Database session
    
    Returns:
        Number of claims marked for recomputation
    """
    bill_id = normalize_bill_id(congress, bill_type, bill_number)
    
    # Find all actions for this bill (case-insensitive comparison)
    # Action table stores bill_type in various cases (HR, HCONRES, hr, etc.)
    actions = (
        db.query(Action)
        .filter(
            Action.bill_congress == congress,
            Action.bill_type.ilike(bill_type),  # Case-insensitive
            Action.bill_number == str(bill_number)
        )
        .all()
    )
    
    if not actions:
        return 0
    
    action_ids = [a.id for a in actions]
    
    # Find all evaluations using these actions
    evaluations = (
        db.query(ClaimEvaluation)
        .filter(ClaimEvaluation.best_action_id.in_(action_ids))
        .all()
    )
    
    if not evaluations:
        return 0
    
    claim_ids = list(set(e.claim_id for e in evaluations))
    
    # Mark claims as needing recomputation
    db.query(Claim).filter(Claim.id.in_(claim_ids)).update(
        {"needs_recompute": 1},
        synchronize_session=False
    )
    
    db.commit()
    
    return len(claim_ids)


def invalidate_all_claims(db: Session):
    """Mark ALL claims as needing recomputation (nuclear option)."""
    count = db.query(Claim).update({"needs_recompute": 1}, synchronize_session=False)
    db.commit()
    return count


def get_claims_needing_recompute(db: Session, limit: int = None):
    """Get all claims marked as needing recomputation."""
    q = db.query(Claim).filter(Claim.needs_recompute == 1).order_by(Claim.id.asc())
    if limit:
        q = q.limit(limit)
    return q.all()


def clear_recompute_flag(claim_id: int, db: Session):
    """Clear recompute flag after successful evaluation."""
    db.query(Claim).filter(Claim.id == claim_id).update(
        {"needs_recompute": 0},
        synchronize_session=False
    )
    db.commit()


def test_invalidation():
    """Test the invalidation system."""
    db = SessionLocal()
    
    print("=" * 70)
    print("TESTING INVALIDATION SYSTEM")
    print("=" * 70)
    
    # Test: invalidate claims for HCONRES 68
    print("\n1. Invalidating claims for HCONRES 68 (119th Congress)...")
    count = invalidate_claims_for_bill(119, "hconres", 68, db)
    print(f"   ✅ Marked {count} claims for recomputation")
    
    # Check which claims were marked
    dirty_claims = get_claims_needing_recompute(db)
    print(f"\n2. Claims needing recomputation: {len(dirty_claims)}")
    for claim in dirty_claims[:5]:  # Show first 5
        print(f"   - Claim {claim.id}: {claim.text[:60]}...")
    
    # Clear flag for claim 1
    print(f"\n3. Clearing flag for claim 1...")
    clear_recompute_flag(1, db)
    
    # Check again
    dirty_claims = get_claims_needing_recompute(db)
    print(f"   ✅ Claims still dirty: {len(dirty_claims)}")
    
    print("\n" + "=" * 70)
    db.close()


if __name__ == "__main__":
    test_invalidation()
