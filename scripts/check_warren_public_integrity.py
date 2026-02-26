from models.database import SessionLocal, Claim

db = SessionLocal()
claims = db.query(Claim).filter(Claim.person_id == 'elizabeth_warren').all()
for c in claims:
    if 'public integrity' in c.text.lower():
        print(f"\n=== CLAIM ID {c.id} ===")
        print(f"Text: {c.text}")
        print(f"Source: {c.claim_source_url}")
db.close()
