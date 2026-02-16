"""
Quick script to recompute evaluation for claim 1 with enriched data.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from jobs.recompute_evaluations import recompute_for_person

if __name__ == "__main__":
    # Recompute just claim 1 (it belongs to person_id we can query)
    from models.database import SessionLocal, Claim
    
    db = SessionLocal()
    claim_1 = db.query(Claim).filter(Claim.id == 1).first()
    
    if claim_1:
        print(f"Recomputing claim 1 (person_id: {claim_1.person_id})...")
        # Recompute for that person, limit 1
        recompute_for_person(person_id=claim_1.person_id, limit=1)
        print("✅ Done! Now test with: python test_api_evaluation.py")
    else:
        print("❌ Claim 1 not found")
    
    db.close()
