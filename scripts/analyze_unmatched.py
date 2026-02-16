"""Analyze unmatched claims to identify non-legislative content."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.database import SessionLocal, ClaimEvaluation, Claim

db = SessionLocal()
evals = db.query(ClaimEvaluation, Claim).join(Claim, Claim.id == ClaimEvaluation.claim_id).all()

non_legislative_patterns = [
    (r'town hall', 'town_hall'),
    (r'secured \$|delivered \$|announced.*\$[\d,]+|funding for|federal funding', 'earmark_funding'),
    (r'claim \d+$', 'test_data'),
]

print('ANALYSIS OF UNMATCHED CLAIMS:')
print('=' * 80)
categories = {}
for ev, claim in evals:
    if ev.tier == 'none':
        text = (claim.text or '')[:300].lower()
        url = (claim.claim_source_url or '').lower()

        cat = 'potentially_matchable'
        for pattern, category in non_legislative_patterns:
            if re.search(pattern, text, re.IGNORECASE) or re.search(pattern, url, re.IGNORECASE):
                cat = category
                break

        categories.setdefault(cat, []).append((claim.person_id, claim.text[:100]))

for cat, claims_list in sorted(categories.items()):
    print(f'\n{cat} ({len(claims_list)}):')
    for pid, text in claims_list:
        print(f'  [{pid}] {text}')

# Count
total_unmatched = sum(len(v) for v in categories.values())
filterable = sum(len(v) for k, v in categories.items() if k in ['town_hall', 'earmark_funding', 'test_data'])

print(f'\n\nSUMMARY:')
print(f'Total unmatched: {total_unmatched}')
print(f'Non-legislative (could filter): {filterable}')
print(f'Potentially matchable: {total_unmatched - filterable}')

total_evals = len(evals)
matched = sum(1 for ev, c in evals if ev.tier != 'none')
new_total = total_evals - filterable
new_rate = matched / new_total * 100 if new_total else 0
print(f'\nIf we remove non-legislative claims:')
print(f'  {matched}/{new_total} = {new_rate:.1f}% (was {matched}/{total_evals} = {matched/total_evals*100:.1f}%)')

db.close()
