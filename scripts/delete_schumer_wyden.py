"""Delete and re-ingest Schumer and Wyden claims with claim relevance filtering"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.database import SessionLocal, Claim, ClaimEvaluation

db = SessionLocal()

print("Deleting Schumer and Wyden claims...")

# Delete evaluations first (foreign key)
schumer_wyden_evals = db.query(ClaimEvaluation).filter(
    ClaimEvaluation.person_id.in_(['chuck_schumer', 'ron_wyden'])
).delete()

# Delete claims
schumer_wyden_claims = db.query(Claim).filter(
    Claim.person_id.in_(['chuck_schumer', 'ron_wyden'])
).delete()

db.commit()

print(f"Deleted {schumer_wyden_evals} evaluations")
print(f"Deleted {schumer_wyden_claims} claims")

# Verify
remaining_schumer = db.query(Claim).filter(Claim.person_id == 'chuck_schumer').count()
remaining_wyden = db.query(Claim).filter(Claim.person_id == 'ron_wyden').count()

print(f"\nRemaining Schumer claims: {remaining_schumer}")
print(f"Remaining Wyden claims: {remaining_wyden}")

db.close()
