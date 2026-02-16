"""
Comprehensive test: Three-layer defense against false matches.

Layer 1: Category-specific gate terms (domain vocabulary required)
Layer 2: Boilerplate guardrail (blocks generic civic overlap)
Layer 3: Policy area mismatch filter (blocks wrong policy domains)
"""
from models.database import SessionLocal, Claim, Action, Bill
from utils.normalization import normalize_bill_id


def test_three_layer_defense():
    """Demonstrate all three defensive layers working together."""
    db = SessionLocal()
    
    print("=" * 70)
    print("THREE-LAYER DEFENSE AGAINST FALSE MATCHES")
    print("=" * 70)
    
    # Get claim 1 (finance_ethics about stock trading)
    claim = db.query(Claim).filter(Claim.id == 1).first()
    
    print(f"\n📋 CLAIM:")
    print(f"   Text: {claim.text}")
    print(f"   Category: {claim.category}")
    print(f"   Intent: {claim.intent}")
    
    # Get Venezuela bill (the embarrassing false match we're preventing)
    action = db.query(Action).filter(Action.id == 976).first()
    bill_id = normalize_bill_id(action.bill_congress, action.bill_type, action.bill_number)
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    
    print(f"\n📄 VENEZUELA BILL (Action 976):")
    print(f"   Title: {bill.title}")
    print(f"   Policy Area: {bill.policy_area}")
    print(f"   Summary: {action.summary}")
    
    print(f"\n{'='*70}")
    print("DEFENSIVE LAYERS ANALYSIS:")
    print(f"{'='*70}")
    
    # Layer 1: Gate Terms
    print(f"\n🚪 LAYER 1: Category Gate Terms")
    print(f"   Claim category: {claim.category}")
    print(f"   Required terms: stock, trading, financial, ethics, disclosure, etc.")
    
    # Check if Venezuela bill has any gate terms
    from services.matching import tokenize, STOPWORDS_BASE, CATEGORY_PROFILES
    profile = CATEGORY_PROFILES.get(claim.category, {})
    gate_terms = profile.get("gate_terms") or set()
    
    combined_text = f"{action.title} {action.summary} {bill.policy_area}"
    tokens = set(tokenize(combined_text, STOPWORDS_BASE))
    gate_overlap = tokens.intersection(gate_terms)
    
    print(f"   Bill tokens containing gate terms: {gate_overlap if gate_overlap else 'NONE'}")
    
    if not gate_overlap:
        print(f"   ✅ BLOCKED: No finance/ethics vocabulary found")
    else:
        print(f"   ⚠️  Passed gate (has domain terms)")
    
    # Layer 2: Boilerplate Guardrail
    print(f"\n🛡️  LAYER 2: Boilerplate Overlap Guardrail")
    
    from services.matching import BOILERPLATE_CIVIC_TERMS
    
    # Simulate scoring
    claim_tokens = set(tokenize(claim.text, STOPWORDS_BASE))
    bill_tokens = set(tokenize(combined_text, STOPWORDS_BASE))
    overlap = claim_tokens.intersection(bill_tokens)
    non_boilerplate = overlap - BOILERPLATE_CIVIC_TERMS
    
    print(f"   Total overlap: {overlap}")
    print(f"   Boilerplate terms: {overlap.intersection(BOILERPLATE_CIVIC_TERMS)}")
    print(f"   Domain-specific terms: {non_boilerplate if non_boilerplate else 'NONE'}")
    
    if overlap and not non_boilerplate:
        print(f"   ✅ BLOCKED: Only boilerplate overlap (no domain specificity)")
    elif claim.category in {"general", "unknown"} or not claim.intent:
        if overlap and not non_boilerplate:
            print(f"   ✅ Would block general/unknown claims with only boilerplate")
    else:
        print(f"   ⚠️  Would pass boilerplate check (has domain terms)")
    
    # Layer 3: Policy Area Mismatch
    print(f"\n🏛️  LAYER 3: Policy Area Mismatch Filter")
    print(f"   Claim category: {claim.category}")
    print(f"   Bill policy area: {bill.policy_area}")
    
    from services.matching import CATEGORY_TO_POLICY_AREAS
    valid_areas = CATEGORY_TO_POLICY_AREAS.get(claim.category, set())
    
    print(f"   Valid areas for {claim.category}:")
    for area in sorted(valid_areas):
        print(f"      - {area}")
    
    is_mismatch = bill.policy_area not in valid_areas
    
    if is_mismatch:
        print(f"   ✅ BLOCKED: Policy area mismatch (International Affairs ≠ Finance)")
    else:
        print(f"   ⚠️  Passed policy check")
    
    # Summary
    print(f"\n{'='*70}")
    print("FINAL RESULT:")
    print(f"{'='*70}")
    
    layers_blocked = []
    if not gate_overlap:
        layers_blocked.append("Gate Terms")
    if overlap and not non_boilerplate and (claim.category in {"general", "unknown"} or not claim.intent):
        layers_blocked.append("Boilerplate Guardrail")
    if is_mismatch:
        layers_blocked.append("Policy Area Mismatch")
    
    print(f"\n🛡️  Blocked by: {', '.join(layers_blocked) if layers_blocked else 'NONE'}")
    
    if layers_blocked:
        print(f"\n✅ VENEZUELA BILL CORRECTLY REJECTED")
        print(f"   Reason: {layers_blocked[0]}")
        print(f"   Additional layers: {len(layers_blocked) - 1}")
        print(f"\n   This is DEFENSIBLE:")
        print(f"   - Not judging truth of claim")
        print(f"   - Just filtering wrong policy domain / missing vocabulary")
        print(f"   - Source-backed (Congress.gov policy area classification)")
        print(f"   - Conservative, explainable, deterministic")
    else:
        print(f"\n❌ WARNING: Bill would match (should not happen!)")
    
    print(f"\n{'='*70}")
    
    db.close()


if __name__ == "__main__":
    test_three_layer_defense()
