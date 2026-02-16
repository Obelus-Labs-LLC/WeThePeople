from models.database import SessionLocal, Bill, Claim, ClaimEvaluation

db = SessionLocal()

# Check DEFIANCE Act
bill = db.query(Bill).filter(Bill.bill_id == 'hr3562-119').first()
print(f"DEFIANCE Act found: {bill is not None}")
if bill:
    print(f"Title: {bill.title}")
    print(f"Needs enrichment: {bill.needs_enrichment}")

# Check AOC claim #2 (should match DEFIANCE)
claim = db.query(Claim).filter(Claim.id == 2).first()
print(f"\nClaim #2:")
print(f"Text preview: {claim.text[:100]}...")
print(f"Source URL: {claim.claim_source_url}")

eval = db.query(ClaimEvaluation).filter(ClaimEvaluation.claim_id == 2).first()
print(f"\nEvaluation:")
print(f"Tier: {eval.tier}")
print(f"Score: {eval.score}")
print(f"Matched bill: {eval.matched_bill_id}")
print(f"Evidence: {eval.evidence_json}")

db.close()
