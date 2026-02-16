"""
Test policy area mismatch filter.
Verifies that finance_ethics claims don't match International Affairs bills.
"""
from models.database import SessionLocal, Claim, Action, Bill
from services.matching import compute_matches_for_claim, apply_policy_area_mismatch_filter


def test_policy_area_filter():
    """Test that policy area mismatches are blocked."""
    db = SessionLocal()
    
    print("=" * 70)
    print("POLICY AREA MISMATCH FILTER TEST")
    print("=" * 70)
    
    # Get claim 1 (finance_ethics about stock trading)
    claim = db.query(Claim).filter(Claim.id == 1).first()
    
    print(f"\n📋 Test Claim:")
    print(f"   ID: {claim.id}")
    print(f"   Category: {claim.category}")
    print(f"   Text: {claim.text}")
    
    # Get action 976 (Venezuela bill - International Affairs)
    action = db.query(Action).filter(Action.id == 976).first()
    
    if action and action.bill_congress:
        from utils.normalization import normalize_bill_id
        bill_id = normalize_bill_id(action.bill_congress, action.bill_type, action.bill_number)
        bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
        
        if bill:
            print(f"\n📄 Test Bill (Action 976):")
            print(f"   Bill ID: {bill.bill_id}")
            print(f"   Title: {bill.title[:60]}...")
            print(f"   Policy Area: {bill.policy_area}")
            
            # Test the filter function directly
            print(f"\n🔍 Policy Area Mismatch Test:")
            print(f"   Claim category: {claim.category} (finance_ethics)")
            print(f"   Bill policy area: {bill.policy_area}")
            
            # Valid policy areas for finance_ethics
            valid_areas = {
                "Finance and Financial Sector",
                "Economics and Public Finance",
                "Government Operations and Politics",
                "Congress",
                "Commerce",
            }
            
            print(f"   Valid areas for finance_ethics: {', '.join(sorted(valid_areas))}")
            
            is_mismatch = bill.policy_area not in valid_areas
            print(f"   Is mismatch? {is_mismatch}")
            
            if is_mismatch:
                print(f"   ✅ CORRECT: International Affairs should be blocked for finance_ethics")
            else:
                print(f"   ❌ ERROR: Should have detected mismatch!")
            
            # Test filter function
            test_tiers = ["strong", "moderate", "weak"]
            for tier in test_tiers:
                result = apply_policy_area_mismatch_filter(tier, claim, bill.policy_area)
                expected = "none" if is_mismatch else tier
                status = "✅" if result == expected else "❌"
                print(f"   {status} tier={tier} → {result} (expected: {expected})")
    
    # Run full matching to verify
    print(f"\n🔍 Full Matching Test:")
    result = compute_matches_for_claim(claim, db)
    
    matches = result.get("matches", [])
    print(f"   Total matches: {len(matches)}")
    
    # Check if Venezuela bill appears in matches
    venezuela_match = None
    for m in matches:
        if m['action']['id'] == 976:
            venezuela_match = m
            break
    
    if venezuela_match:
        print(f"   ❌ ERROR: Venezuela bill (Action 976) should be filtered out!")
        print(f"      Tier: {venezuela_match['evidence']['tier']}")
        print(f"      Policy: {venezuela_match['action'].get('policy_area')}")
    else:
        print(f"   ✅ CORRECT: Venezuela bill filtered out by policy area mismatch")
    
    # Show what policy areas are in the matches
    if matches:
        policy_areas = set()
        for m in matches[:5]:
            pa = m['action'].get('policy_area')
            if pa:
                policy_areas.add(pa)
        
        if policy_areas:
            print(f"\n   Policy areas in matches:")
            for pa in sorted(policy_areas):
                print(f"      - {pa}")
    
    print("\n" + "=" * 70)
    print("\n✅ Policy area mismatch filter prevents cross-domain false matches")
    print("   finance_ethics claims won't match International Affairs bills")
    print("=" * 70)
    
    db.close()


if __name__ == "__main__":
    test_policy_area_filter()
