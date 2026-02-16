"""Debug unmatched legislative claims - show what the matcher found."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.database import SessionLocal, ClaimEvaluation, Claim, Action
from services.matching.core import extract_bill_names_from_text, compute_matches_for_claim

NON_LEG = {'earmark', 'announcement', 'test_data', 'oversight'}
db = SessionLocal()
evals = db.query(ClaimEvaluation, Claim).join(
    Claim, Claim.id == ClaimEvaluation.claim_id
).filter(ClaimEvaluation.tier == 'none').all()

print(f'Unmatched legislative claims:')
print('=' * 80)
for ev, claim in evals:
    if claim.category in NON_LEG:
        continue
    print(f'\n[{claim.person_id}] score={ev.score} cat={claim.category}')
    print(f'  TEXT: {claim.text[:150]}')
    print(f'  URL:  {(claim.claim_source_url or "")[:100]}')

    # Check what bill names we can extract
    names = extract_bill_names_from_text(claim.text)
    if names:
        print(f'  EXTRACTED NAMES: {names}')

    # Count actions for this person
    action_count = db.query(Action).filter(Action.person_id == claim.person_id).count()
    print(f'  ACTIONS for {claim.person_id}: {action_count}')

db.close()
