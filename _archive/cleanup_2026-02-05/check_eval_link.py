"""Check what evaluation references."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from models.database import SessionLocal, ClaimEvaluation, Action

db = SessionLocal()
ev = db.query(ClaimEvaluation).filter(ClaimEvaluation.claim_id == 1).first()

if ev and ev.best_action_id:
    act = db.query(Action).filter(Action.id == ev.best_action_id).first()
    print(f"Claim 1 evaluation:")
    print(f"  best_action_id: {ev.best_action_id}")
    print(f"  Action: {act.bill_type}{act.bill_number} (Congress {act.bill_congress})")
    print(f"  Title: {act.title[:80]}...")
    
    # Now test invalidation for this bill
    from utils.invalidation import invalidate_claims_for_bill
    
    count = invalidate_claims_for_bill(act.bill_congress, act.bill_type, int(act.bill_number), db)
    print(f"\nInvalidated {count} claims for this bill")
    
    # Check if claim 1 is marked
    from models.database import Claim
    claim = db.query(Claim).filter(Claim.id == 1).first()
    print(f"Claim 1 needs_recompute: {claim.needs_recompute}")

db.close()
