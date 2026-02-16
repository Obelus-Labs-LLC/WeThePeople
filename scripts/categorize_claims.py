"""Categorize claims by type (legislative, earmark, announcement, test_data)."""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from models.database import SessionLocal, Claim

db = SessionLocal()

# Patterns for non-legislative claims
earmark_pattern = re.compile(
    r'secured \$|delivered \$|announced.*\$|federal funding for|funding for.*county|funding for.*airport',
    re.IGNORECASE
)
town_hall_pattern = re.compile(r'town hall', re.IGNORECASE)
test_pattern = re.compile(r'^claim \d+$', re.IGNORECASE)

claims = db.query(Claim).all()
updated = 0

for claim in claims:
    text = claim.text or ''
    new_cat = None

    if test_pattern.search(text):
        new_cat = 'test_data'
    elif town_hall_pattern.search(text):
        new_cat = 'announcement'
    elif earmark_pattern.search(text):
        new_cat = 'earmark'

    if new_cat and claim.category != new_cat:
        old_cat = claim.category
        claim.category = new_cat
        updated += 1
        print(f'  [{claim.person_id}] {old_cat} -> {new_cat}: {text[:80]}')

db.commit()
print(f'\nUpdated {updated} claims')
db.close()
