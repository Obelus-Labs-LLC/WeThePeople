"""Third pass: catch letter/oversight/commentary claims."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.database import SessionLocal, Claim

db = SessionLocal()

patterns = [
    # Letters to agencies/companies/officials
    (re.compile(r'writing to|wrote to|letter to|pressed?\b.*(?:administration|secretary|ceo|chief executive|president)', re.I), 'letter'),
    (re.compile(r'led \d+ (?:lawmakers|members|colleagues) in (?:writing|pressing|urging|calling)', re.I), 'letter'),
    (re.compile(r'probe|investigation into|watchdog confirmed', re.I), 'oversight'),
    # Vague commentary without legislation reference
    (re.compile(r'100 years ago.*market concentration', re.I), 'commentary'),
    # Election/ballot policy without legislation
    (re.compile(r'mailed ballots being rejected|election officials', re.I), 'commentary'),
    # Letters to companies
    (re.compile(r'wrote to Pepsi|letter to Apple|urge Apple|urge Google', re.I), 'letter'),
    # Fundraising scheme oversight
    (re.compile(r'wrote to Trust President|fundraising scheme', re.I), 'oversight'),
]

claims = db.query(Claim).filter(Claim.category == 'general').all()
updated = 0

for claim in claims:
    text = claim.text or ''
    url = claim.claim_source_url or ''
    for pattern, new_cat in patterns:
        if pattern.search(text) or pattern.search(url):
            claim.category = new_cat
            updated += 1
            print(f'  [{claim.person_id}] -> {new_cat}: {text[:80]}')
            break

db.commit()
print(f'\nUpdated {updated} more claims')

# Show remaining general claims
remaining = db.query(Claim).filter(Claim.category == 'general').all()
print(f'\nRemaining general claims: {len(remaining)}')
for c in remaining:
    print(f'  [{c.person_id}] {c.text[:100]}')

db.close()
