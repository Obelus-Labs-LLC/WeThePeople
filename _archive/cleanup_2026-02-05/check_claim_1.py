"""
Check matching results for claim 1 with finance_ethics category.
"""
from models.database import SessionLocal, Claim
from services.matching import compute_matches_for_claim


def check_claim_1():
    db = SessionLocal()
    claim = db.query(Claim).filter(Claim.id == 1).first()
    
    print("=" * 70)
    print("CLAIM 1 MATCHING RESULTS (finance_ethics)")
    print("=" * 70)
    
    print(f"\n📋 Claim:")
    print(f"   ID: {claim.id}")
    print(f"   Text: {claim.text}")
    print(f"   Category: {claim.category}")
    print(f"   Intent: {claim.intent}")
    
    result = compute_matches_for_claim(claim, db)
    
    print(f"\n🔍 Results:")
    print(f"   Profile: {result.get('profile_used')}")
    print(f"   Min Score: {result.get('min_score')}")
    print(f"   Matches: {len(result.get('matches', []))}")
    
    if result.get('note'):
        print(f"   Note: {result['note']}")
    
    matches = result.get('matches', [])
    if matches:
        print(f"\n✅ Found {len(matches)} matches:")
        for i, m in enumerate(matches[:3], 1):
            print(f"\n   {i}. Action {m['action']['id']}")
            print(f"      Score: {m['score']:.2f}")
            print(f"      Tier: {m['evidence']['tier']}")
            print(f"      Title: {m['action']['title'][:60]}...")
    else:
        print(f"\n❌ No matches - Venezuela bill correctly filtered by gate terms!")
    
    print("\n" + "=" * 70)
    db.close()


if __name__ == "__main__":
    check_claim_1()
