from models.database import SessionLocal, ClaimEvaluation, Claim

db = SessionLocal()

# Check all evaluations
evals = db.query(ClaimEvaluation).all()
print(f"Total evaluations: {len(evals)}")

# Tier distribution
tiers = {}
for e in evals:
    tiers[e.tier] = tiers.get(e.tier, 0) + 1

print("\nTier distribution:")
for tier, count in tiers.items():
    print(f"  {tier}: {count}")

# Check AOC specifically
aoc_claims = db.query(Claim).filter(Claim.person_id == 'alexandria_ocasio_cortez').all()
print(f"\nAOC claims: {len(aoc_claims)}")
for c in aoc_claims:
    eval = c.evaluations[0] if c.evaluations else None
    if eval:
        print(f"  Claim #{c.id}: tier={eval.tier}, score={eval.score}, matched_bill={eval.matched_bill_id}")

db.close()
