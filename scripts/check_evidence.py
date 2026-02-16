"""Check evidence fields are populated"""
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.database import SessionLocal, ClaimEvaluation, Claim
import json

db = SessionLocal()

evals = db.query(ClaimEvaluation, Claim).join(
    Claim, ClaimEvaluation.claim_id == Claim.id
).filter(ClaimEvaluation.tier != 'none').all()

print(f"\nFound {len(evals)} meaningful matches\n")
print("="*80)

for e, claim in evals:
    print(f"\nClaim #{e.claim_id}: {claim.text[:60]}...")
    print(f"  Matched bill: {e.matched_bill_id}")
    print(f"  Score: {e.score}")
    print(f"  Tier: {e.tier}")
    
    evidence = json.loads(e.evidence_json) if e.evidence_json else []
    print(f"  Evidence ({len(evidence)} signals):")
    for ev in evidence:
        print(f"    - {ev}")

print("\n" + "="*80)

db.close()
