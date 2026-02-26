"""
Test boilerplate overlap guardrail to prevent false matches on generic civic terms.
"""
from models.database import SessionLocal, Claim
from services.matching import compute_matches_for_claim


def test_boilerplate_guardrail():
    """
    Test that general/unknown claims with only boilerplate overlap get tier=none.
    """
    db = SessionLocal()
    
    print("=" * 70)
    print("BOILERPLATE GUARDRAIL TEST")
    print("=" * 70)
    
    # Find claim 1 (should have general category or unknown intent)
    claim = db.query(Claim).filter(Claim.id == 1).first()
    
    if not claim:
        print("❌ Claim 1 not found")
        db.close()
        return
    
    print(f"\n📋 Claim ID: {claim.id}")
    print(f"   Text: {claim.text}")
    print(f"   Category: {claim.category}")
    print(f"   Intent: {claim.intent}")
    print(f"   Person: {claim.person_id}")
    
    # Run matching
    result = compute_matches_for_claim(claim, db)
    
    print(f"\n🔍 Matching Results:")
    print(f"   Profile Used: {result.get('profile_used')}")
    print(f"   Min Score: {result.get('min_score')}")
    print(f"   Matches Found: {len(result.get('matches', []))}")
    
    # Show top 3 matches
    matches = result.get("matches", [])
    if matches:
        print(f"\n🎯 Top Matches:")
        for i, match in enumerate(matches[:3], 1):
            evidence = match.get("evidence", {})
            why = match.get("why", {})
            print(f"\n   {i}. Score: {match.get('score'):.2f}")
            print(f"      Tier: {evidence.get('tier')}")
            print(f"      Relevance: {evidence.get('relevance')}")
            print(f"      Progress: {evidence.get('progress')}")
            print(f"      Overlap Basic: {why.get('overlap_basic', [])}")
            print(f"      Overlap Enriched: {why.get('overlap_enriched', [])}")
            
            # Check if only boilerplate
            overlap = set(why.get('overlap_basic', []) + why.get('overlap_enriched', []))
            boilerplate = {"congress","bill","act","legislation","law","house","senate",
                          "committee","introduced","passed","vote","voted","voting",
                          "resolution","amendment","member","members"}
            non_boilerplate = overlap - boilerplate
            
            if overlap and not non_boilerplate:
                print(f"      ⚠️  ONLY BOILERPLATE OVERLAP - Should be tier=none!")
            elif non_boilerplate:
                print(f"      ✅ Has domain-specific terms: {non_boilerplate}")
    else:
        print("\n   No matches found")
    
    print("\n" + "=" * 70)
    
    # Test expected behavior
    if claim.category in {"general", "unknown"} or not claim.intent:
        print("\n✅ GUARDRAIL ACTIVE:")
        print("   - Claim has general/unknown category or no intent")
        print("   - Moderate/Strong should be blocked")
        print("   - Weak allowed only with domain-specific terms")
        print("   - Pure boilerplate overlap should be tier=none")
        
        # Check that no moderate/strong matches exist
        strong_moderate = [m for m in matches if m.get("evidence", {}).get("tier") in {"moderate", "strong"}]
        if strong_moderate:
            print(f"\n❌ GUARDRAIL FAILED: Found {len(strong_moderate)} moderate/strong matches")
        else:
            print("\n✅ No moderate/strong matches (correct)")
        
        # Check boilerplate-only matches are tier=none
        boilerplate_matches = []
        for m in matches:
            why = m.get("why", {})
            overlap = set(why.get('overlap_basic', []) + why.get('overlap_enriched', []))
            boilerplate = {"congress","bill","act","legislation","law","house","senate",
                          "committee","introduced","passed","vote","voted","voting",
                          "resolution","amendment","member","members"}
            non_boilerplate = overlap - boilerplate
            
            if overlap and not non_boilerplate:
                boilerplate_matches.append(m)
        
        if boilerplate_matches:
            none_tier = [m for m in boilerplate_matches if m.get("evidence", {}).get("tier") == "none"]
            print(f"\n   Boilerplate-only matches: {len(boilerplate_matches)}")
            print(f"   With tier=none: {len(none_tier)}")
            if len(none_tier) == len(boilerplate_matches):
                print("   ✅ All boilerplate-only matches correctly downgraded to none")
            else:
                print("   ❌ Some boilerplate-only matches not downgraded!")
    else:
        print("\n⚠️  GUARDRAIL INACTIVE (claim has specific category + intent)")
    
    print("=" * 70)
    
    db.close()


if __name__ == "__main__":
    test_boilerplate_guardrail()
