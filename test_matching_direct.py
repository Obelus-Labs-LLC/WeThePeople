"""Direct test of compute_matches_for_claim"""
from models.database import SessionLocal, Claim
from services.matching import compute_matches_for_claim

db = SessionLocal()

# Get a claim
claim = db.query(Claim).filter(Claim.id == 1).first()

print(f"Testing claim: {claim.text[:60]}...")

try:
    result = compute_matches_for_claim(claim, db, limit=5)
    print(f"✅ Success! Got {len(result.get('matches', []))} matches")
    
    if result.get('matches'):
        for i, match in enumerate(result['matches'][:2], 1):
            action = match['action']
            why = match.get('why', {})
            
            print(f"\n--- Match {i} ---")
            print(f"  Bill: {action.get('bill_type')} {action.get('bill_number')}")
            print(f"  Score: {match['score']}")
            print(f"  latest_action_text: {why.get('latest_action_text', 'N/A')[:40] if why.get('latest_action_text') else 'N/A'}...")
            print(f"  progress_bucket: {why.get('progress_bucket', 'N/A')}")
            print(f"  status_reason: {why.get('status_reason', 'N/A')[:40] if why.get('status_reason') else 'N/A'}...")
            print(f"  timeline_count: {why.get('timeline_count', 'N/A')}")
            print(f"  recent_actions: {len(why.get('recent_actions', [])) if why.get('recent_actions') else 0} actions")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

db.close()
