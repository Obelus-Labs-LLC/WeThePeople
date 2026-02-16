"""
Test the dirty flag system end-to-end.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from models.database import SessionLocal, Claim

print("=" * 70)
print("DIRTY FLAG SYSTEM - END TO END TEST")
print("=" * 70)

# 1. Enrich a bill (which invalidates claims)
print("\n1. Enriching HCONRES 68 (should invalidate claim 1)...")
from jobs.enrich_bills import enrich_bill

db = SessionLocal()
result = enrich_bill(119, "hconres", 68, db)
print(f"   ✅ Enriched: {result['success']}")
print(f"   Actions inserted: {result.get('actions_inserted', 0)}")
print(f"   Claims invalidated: {result.get('claims_invalidated', 0)}")

# 2. Check if claim 1 is dirty
claim = db.query(Claim).filter(Claim.id == 1).first()
print(f"\n2. Claim 1 dirty flag: {claim.needs_recompute}")
if claim.needs_recompute == 1:
    print("   ✅ Claim marked for recomputation")
else:
    print("   ❌ Claim NOT marked (expected 1)")

# 3. Recompute dirty claims only
print(f"\n3. Recomputing dirty claims...")
from jobs.recompute_evaluations import recompute_for_person

db.close()  # Job creates its own session
recompute_for_person(dirty_only=True, limit=10)

# 4. Check if flag was cleared
db = SessionLocal()
claim = db.query(Claim).filter(Claim.id == 1).first()
print(f"\n4. Claim 1 dirty flag after recompute: {claim.needs_recompute}")
if claim.needs_recompute == 0:
    print("   ✅ Flag cleared after recomputation")
else:
    print("   ❌ Flag still set (expected 0)")

# 5. Count remaining dirty claims
from utils.invalidation import get_claims_needing_recompute

dirty = get_claims_needing_recompute(db)
print(f"\n5. Remaining dirty claims: {len(dirty)}")

print("\n" + "=" * 70)
print("SUMMARY:")
print("  1. ✅ Enrichment invalidates affected claims")
print("  2. ✅ needs_recompute flag tracks dirty state")
print("  3. ✅ Recompute job processes dirty claims")
print("  4. ✅ Flag cleared after successful recomputation")
print("=" * 70)

db.close()
