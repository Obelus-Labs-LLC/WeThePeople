"""Second pass: catch more earmark claims missed by first pass."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.database import SessionLocal, Claim

db = SessionLocal()

# More specific patterns for remaining earmark-style claims
patterns = [
    (re.compile(r'preserved funding|protects? (?:federal )?funding|protect it because', re.I), 'earmark'),
    (re.compile(r'I fought to (?:protect|authorize|secure)', re.I), 'earmark'),
    (re.compile(r'Job Corps', re.I), 'earmark'),  # Job Corps funding is earmark-style
    (re.compile(r'reverse.*reckless|demanded.*reverse', re.I), 'oversight'),
]

claims = db.query(Claim).filter(Claim.category == 'general').all()
updated = 0

for claim in claims:
    text = claim.text or ''
    for pattern, new_cat in patterns:
        if pattern.search(text):
            claim.category = new_cat
            updated += 1
            print(f'  [{claim.person_id}] -> {new_cat}: {text[:80]}')
            break

db.commit()
print(f'\nUpdated {updated} more claims')
db.close()
