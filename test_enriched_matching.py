"""Test enriched matching with Bill table data"""
import requests
import json

print("="*70)
print("ENRICHED MATCHING TEST")
print("="*70)
print("Testing that matches use Bill table data instead of Action heuristics")
print("="*70)

# Test with claim that has enriched bills
response = requests.get("http://127.0.0.1:8000/claims/1/matches")
data = response.json()

if data.get("matches"):
    match = data["matches"][0]
    
    print(f"\n📊 Top Match:")
    print(f"  Score: {match['score']}")
    print(f"  Bill: {match['action']['bill_type']} {match['action']['bill_number']}")
    
    why = match.get("why", {})
    
    print(f"\n🔍 Evidence Context (from 'why' object):")
    print(f"  Overlap basic: {len(why.get('overlap_basic', []))} terms")
    print(f"  Overlap enriched: {len(why.get('overlap_enriched', []))} terms")
    
    # NEW: Enriched Bill data
    print(f"\n✨ Enriched Bill Data (receipt-backed):")
    print(f"  Latest Action: {why.get('latest_action_text', 'N/A')[:80]}...")
    print(f"  Latest Date: {why.get('latest_action_date', 'N/A')}")
    print(f"  Progress Bucket: {why.get('progress_bucket', 'N/A')}")
    print(f"  Status Reason: {why.get('status_reason', 'N/A')[:80] if why.get('status_reason') else 'N/A'}...")
    print(f"  Timeline Count: {why.get('timeline_count', 'N/A')}")
    
    # Recent actions from BillAction timeline
    if why.get('recent_actions'):
        print(f"\n📅 Recent Actions (top 3 from BillAction timeline):")
        for i, action in enumerate(why['recent_actions'], 1):
            print(f"  {i}. {action['date']}: {action['text']}")
            print(f"     Chamber: {action.get('chamber', 'N/A')}")
    else:
        print(f"\n📅 Recent Actions: None (bill not enriched yet)")

    # Evidence tier
    evidence = match.get("evidence", {})
    print(f"\n⚖️  Evidence Tier: {evidence.get('tier', 'N/A')}")
    print(f"  Relevance: {evidence.get('relevance', 'N/A')}")
    print(f"  Progress: {evidence.get('progress', 'N/A')}")
    print(f"  Timing: {evidence.get('timing', 'N/A')}")

else:
    print("\n❌ No matches found")

print("\n" + "="*70)
print("KEY IMPROVEMENTS:")
print("  1. latest_action_text/date from Bill table (not Action heuristics)")
print("  2. progress_bucket + status_reason (transparent, defensible)")
print("  3. timeline_count + recent_actions (top 3 from BillAction)")
print("  4. No new fuzzy matching - just better evidence context")
print("="*70)
