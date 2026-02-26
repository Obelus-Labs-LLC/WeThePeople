"""
Test /claims/{id}/matches endpoint to verify enriched fields in match list.
"""
import requests
from utils.env import get_api_base_url


def test_matches_endpoint(claim_id=1, limit=3):
    """Test that /claims/{id}/matches returns enriched "why" fields."""
    base_url = get_api_base_url()
    url = f"{base_url}/claims/{claim_id}/matches?limit={limit}"
    
    print("=" * 70)
    print("API MATCHES ENDPOINT TEST")
    print("=" * 70)
    print(f"URL: {url}\n")
    
    try:
        response = requests.get(url, timeout=60)
    except Exception as e:
        print(f"❌ REQUEST FAILED: {e}")
        return
    
    if response.status_code != 200:
        print(f"❌ HTTP {response.status_code}")
        print(f"Response: {response.text[:500]}")
        return
    
    data = response.json()
    matches = data.get("matches", [])
    
    print(f"📊 Found {len(matches)} matches\n")
    
    for idx, match in enumerate(matches, 1):
        action = match.get("action", {})
        why = match.get("why", {})
        evidence = match.get("evidence", {})
        
        print(f"🎯 MATCH {idx}:")
        print(f"   Score: {match.get('score')}")
        print(f"   Bill: {action.get('bill_type', '').upper()}{action.get('bill_number')} ({action.get('bill_congress')})")
        print(f"   Tier: {evidence.get('tier')}")
        
        # Check enriched fields
        enriched = {
            'progress_bucket': why.get('progress_bucket'),
            'status_reason': why.get('status_reason', '')[:60] + "..." if why.get('status_reason') else None,
            'timeline_count': why.get('timeline_count'),
            'recent_actions': len(why.get('recent_actions', [])),
        }
        
        print(f"\n   ✨ Enriched fields:")
        for key, val in enriched.items():
            status = "✅" if val is not None else "❌"
            print(f"   {status} {key}: {val}")
        
        print()


if __name__ == "__main__":
    test_matches_endpoint()
