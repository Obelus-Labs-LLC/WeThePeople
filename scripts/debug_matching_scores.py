"""Add debug logging to matching service to see top 5 candidates."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Claim, Action
from services.matching import score_action_against_claim, CATEGORY_PROFILES
from utils.normalization import normalize_bill_id
from sqlalchemy import desc

db = SessionLocal()

# Get claim #2 (mentions DEFIANCE Act in source URL)
claim = db.query(Claim).filter(Claim.id == 2).first()

if not claim:
    print("Claim #2 not found")
    sys.exit(1)

print("="*70)
print(f"CLAIM #{claim.id}")
print("="*70)
print(f"Text: {claim.text}")
print(f"Source URL: {claim.claim_source_url}")
print(f"Category: {claim.category}")

profile = CATEGORY_PROFILES.get(claim.category or "general", CATEGORY_PROFILES["general"])

# Get all AOC actions
rows = (
    db.query(Action)
    .filter(Action.person_id == claim.person_id)
    .order_by(desc(Action.date))
    .limit(200)
    .all()
)

print(f"\nTotal candidate actions: {len(rows)}")

print("\n" + "="*70)
print("SCORING ALL CANDIDATES")
print("="*70)

scored_candidates = []

for a in rows:
    meta = a.metadata_json if isinstance(a.metadata_json, dict) else {}
    
    s = score_action_against_claim(claim.text, a.title, a.summary, meta, profile, claim.claim_source_url)
    
    # Construct bill_id if available
    bill_id = None
    if a.bill_congress and a.bill_type and a.bill_number:
        bill_id = normalize_bill_id(a.bill_congress, a.bill_type, a.bill_number)
    
    scored_candidates.append({
        "action_id": a.id,
        "bill_id": bill_id,
        "title": a.title,
        "score": s["score"],
        "overlap_basic": s["overlap_basic"],
        "overlap_enriched": s.get("overlap_enriched", []),
        "phrase_hits": s.get("phrase_hits", []),
        "url_boost": s.get("url_boost", 0.0),
        "url_hint": s.get("url_hint"),
    })

# Sort by score descending
scored_candidates.sort(key=lambda x: x["score"], reverse=True)

print("\nTOP 10 CANDIDATES:")
for i, cand in enumerate(scored_candidates[:10], 1):
    print(f"\n{i}. Score: {cand['score']:.2f} (URL boost: +{cand['url_boost']:.1f}) | Bill: {cand['bill_id'] or 'N/A'}")
    print(f"   Title: {cand['title'][:80]}")
    if cand['url_hint']:
        print(f"   URL hint: {cand['url_hint']}")
    print(f"   Overlap (basic): {cand['overlap_basic']}")
    print(f"   Overlap (enriched): {cand['overlap_enriched'][:5]}")
    if cand['phrase_hits']:
        print(f"   Phrase hits: {cand['phrase_hits'][:3]}")

# Check if DEFIANCE Act is in the list
print("\n" + "="*70)
print("SEARCHING FOR DEFIANCE ACT")
print("="*70)

defiance_candidates = [c for c in scored_candidates if c['bill_id'] in ['hr3562-119', 'hr7569-118', 's1837-119']]
if defiance_candidates:
    for cand in defiance_candidates:
        rank = scored_candidates.index(cand) + 1
        print(f"\nFound at rank #{rank}")
        print(f"  Bill ID: {cand['bill_id']}")
        print(f"  Score: {cand['score']:.2f}")
        print(f"  Title: {cand['title']}")
        print(f"  Overlap (basic): {cand['overlap_basic']}")
        print(f"  Overlap (enriched): {cand['overlap_enriched']}")
else:
    print("\n[!] DEFIANCE Act bills NOT FOUND in candidate set!")
    print("This is a candidate generation problem (Type B)")

db.close()
