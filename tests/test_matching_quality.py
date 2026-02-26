"""
Check if the Venezuela resolution still matches the stock trading claim.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from models.database import SessionLocal, Claim
from services.matching import compute_matches_for_claim


def test_stock_trading_claim():
    """Test claim 1 (stock trading ban) to see what matches."""
    db = SessionLocal()
    
    claim = db.query(Claim).filter(Claim.id == 1).first()
    
    if not claim:
        print("❌ Claim 1 not found")
        return
    
    print("=" * 70)
    print("MATCHING QUALITY TEST")
    print("=" * 70)
    print(f"\n📋 CLAIM {claim.id}:")
    print(f"   Text: {claim.text}")
    print(f"   Category: {claim.category}")
    print(f"   Intent: {claim.intent}")
    
    result = compute_matches_for_claim(claim, db, limit=5)
    matches = result.get("matches", [])
    
    print(f"\n🎯 TOP {len(matches)} MATCHES:\n")
    
    bad_matches = []
    
    for idx, match in enumerate(matches, 1):
        action = match.get("action", {})
        evidence = match.get("evidence", {})
        why = match.get("why", {})
        
        bill_id = f"{action.get('bill_type', '').upper()}{action.get('bill_number')}"
        title = action.get("title", "")
        
        print(f"{idx}. {bill_id} (Congress {action.get('bill_congress')})")
        print(f"   Score: {match.get('score'):.3f}")
        print(f"   Tier: {evidence.get('tier')}")
        print(f"   Title: {title[:80]}...")
        print(f"   Progress: {why.get('progress_bucket', 'N/A')}")
        
        # Check for Venezuela
        if "venezuela" in title.lower():
            bad_matches.append({
                'rank': idx,
                'bill': bill_id,
                'title': title,
                'score': match.get('score')
            })
            print("   ⚠️  IRRELEVANT: Venezuela resolution!")
        
        print()
    
    print("=" * 70)
    
    if bad_matches:
        print("\n❌ PROBLEM: Irrelevant matches still present!\n")
        for bad in bad_matches:
            print(f"   Rank {bad['rank']}: {bad['bill']} (score {bad['score']:.3f})")
            print(f"   {bad['title'][:80]}...")
            print()
        print("Enrichment added lifecycle context but didn't fix matching quality.")
        print("Need better relevance filtering, not just better evidence context.")
    else:
        print("\n✅ No obvious irrelevant matches found.")
    
    db.close()


if __name__ == "__main__":
    test_stock_trading_claim()
