"""Quick match rate analysis."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import re
from models.database import SessionLocal, ClaimEvaluation, Claim

db = SessionLocal()
evals = db.query(ClaimEvaluation, Claim).join(Claim, Claim.id == ClaimEvaluation.claim_id).all()

act_pattern = re.compile(r'\b\w+\s+Act\b', re.IGNORECASE)
bill_pattern = re.compile(r'\b(H\.?R\.?|S\.?)\s*\d+', re.IGNORECASE)

specific = []
general = []

for ev, claim in evals:
    text = claim.text or ''
    url = claim.claim_source_url or ''
    has_act = bool(act_pattern.search(text)) or bool(act_pattern.search(url))
    has_bill = bool(bill_pattern.search(text))
    if has_act or has_bill:
        specific.append((ev, claim))
    else:
        general.append((ev, claim))

spec_match = sum(1 for ev, c in specific if ev.tier != 'none')
gen_match = sum(1 for ev, c in general if ev.tier != 'none')

print(f'SPECIFIC claims (mention Acts/bill numbers): {len(specific)}')
if specific:
    print(f'  Match rate: {spec_match}/{len(specific)} = {spec_match/len(specific)*100:.1f}%')
print()
print(f'GENERAL claims (no specific legislation): {len(general)}')
if general:
    print(f'  Match rate: {gen_match}/{len(general)} = {gen_match/len(general)*100:.1f}%')
print()
total = spec_match + gen_match
print(f'OVERALL: {total}/{len(evals)} = {total/len(evals)*100:.1f}%')
print()

# Show failed specific claims
print('Failed SPECIFIC claims:')
for ev, claim in specific:
    if ev.tier == 'none':
        print(f'  [{claim.person_id[:12]}] {claim.text[:100]}')

# Show person breakdown
print('\nPer-person breakdown:')
from collections import defaultdict
person_data = defaultdict(lambda: {'total': 0, 'matched': 0})
for ev, claim in evals:
    person_data[claim.person_id]['total'] += 1
    if ev.tier != 'none':
        person_data[claim.person_id]['matched'] += 1

for pid in sorted(person_data.keys()):
    d = person_data[pid]
    rate = d['matched'] / d['total'] * 100
    print(f'  {pid}: {d["matched"]}/{d["total"]} ({rate:.0f}%)')

db.close()
