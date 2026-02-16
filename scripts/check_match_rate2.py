"""Match rate analysis v2 — excludes non-legislative claims."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.database import SessionLocal, ClaimEvaluation, Claim
from collections import defaultdict

db = SessionLocal()
evals = db.query(ClaimEvaluation, Claim).join(Claim, Claim.id == ClaimEvaluation.claim_id).all()

# Separate legislative from non-legislative
NON_LEG_CATEGORIES = {'earmark', 'announcement', 'test_data', 'oversight'}

leg_evals = [(ev, c) for ev, c in evals if c.category not in NON_LEG_CATEGORIES]
non_leg = [(ev, c) for ev, c in evals if c.category in NON_LEG_CATEGORIES]

# Overall
total = len(evals)
matched_all = sum(1 for ev, c in evals if ev.tier != 'none')
leg_total = len(leg_evals)
leg_matched = sum(1 for ev, c in leg_evals if ev.tier != 'none')

print('=' * 70)
print('MATCH RATE REPORT')
print('=' * 70)
print(f'\nALL claims:         {matched_all}/{total} = {matched_all/total*100:.1f}%')
print(f'Legislative only:   {leg_matched}/{leg_total} = {leg_matched/leg_total*100:.1f}%')
print(f'Non-legislative:    {len(non_leg)} claims excluded ({", ".join(NON_LEG_CATEGORIES)})')

# Per-person (legislative only)
print('\n' + '-' * 70)
print('PER-PERSON (legislative claims only):')
print('-' * 70)
person_data = defaultdict(lambda: {'total': 0, 'matched': 0, 'tiers': defaultdict(int)})
for ev, claim in leg_evals:
    person_data[claim.person_id]['total'] += 1
    person_data[claim.person_id]['tiers'][ev.tier] += 1
    if ev.tier != 'none':
        person_data[claim.person_id]['matched'] += 1

for pid in sorted(person_data.keys()):
    d = person_data[pid]
    rate = d['matched'] / d['total'] * 100 if d['total'] else 0
    tiers = ', '.join(f'{t}:{c}' for t, c in sorted(d['tiers'].items()))
    print(f'  {pid:40s} {d["matched"]:2d}/{d["total"]:2d} ({rate:5.1f}%)  [{tiers}]')

# Show non-leg breakdown
print('\n' + '-' * 70)
print('NON-LEGISLATIVE breakdown:')
print('-' * 70)
cat_counts = defaultdict(int)
for ev, c in non_leg:
    cat_counts[c.category] += 1
for cat, count in sorted(cat_counts.items()):
    print(f'  {cat}: {count}')

# Show matched claim details
print('\n' + '-' * 70)
print('MATCHED CLAIMS (tier != none):')
print('-' * 70)
for ev, claim in evals:
    if ev.tier != 'none':
        print(f'  [{claim.person_id}] tier={ev.tier} score={ev.score:.1f}')
        print(f'    {claim.text[:100]}')
        if ev.matched_bill_id:
            print(f'    -> bill: {ev.matched_bill_id}')
        print()

db.close()
