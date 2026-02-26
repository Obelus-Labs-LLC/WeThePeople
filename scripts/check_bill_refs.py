from models.database import SessionLocal, Claim

db = SessionLocal()

claims = db.query(Claim).filter(Claim.person_id == 'chuck_schumer').all()

print(f'Total Schumer claims: {len(claims)}')

refs_count = sum(1 for c in claims if c.bill_refs_json)
print(f'Claims with bill_refs_json: {refs_count}')

print('\nSample claims:')
for c in claims[:5]:
    print(f'\nClaim #{c.id}: {c.text[:100]}...')
    print(f'  URL: {c.claim_source_url.split("/")[-1][:60]}')
    print(f'  Bill refs: {c.bill_refs_json}')

db.close()
