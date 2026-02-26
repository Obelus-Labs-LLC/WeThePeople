from models.database import SessionLocal, Claim
from services.matching import compute_matches_for_claim

db = SessionLocal()

# Get claim #2 (one of the DEFIANCE claims)
claim = db.query(Claim).filter(Claim.id == 2).first()

print(f"Claim #{claim.id}:")
print(f"Text: {claim.text[:150]}...")
print(f"URL: {claim.claim_source_url}")
print(f"Category: {claim.category}")
print(f"Intent: {claim.intent}")
print()

# Run matcher
result = compute_matches_for_claim(claim, db, limit=5)

print(f"Total matches: {len(result['matches'])}")
print()

if result['matches']:
    for i, match in enumerate(result['matches'][:3], 1):
        print(f"=== MATCH #{i} ===")
        print(f"Bill: {match['action'].get('title', 'Unknown')[:80]}...")
        print(f"Score: {match.get('score')}")
        print(f"Evidence:")
        print(f"  Relevance: {match['evidence'].get('relevance')}")
        print(f"  Progress: {match['evidence'].get('progress')}")
        print(f"  Timing: {match['evidence'].get('timing')}")
        print(f"  Tier: {match['evidence'].get('tier')}")
        print(f"Why:")
        why = match.get('why', {})
        print(f"  Phrase hits: {why.get('phrase_hits', [])}")
        print(f"  Overlap basic: {why.get('overlap_basic', [])}")
        print(f"  URL boost: {why.get('url_boost', 0)}")
        print()
else:
    print("NO MATCHES FOUND")

db.close()
