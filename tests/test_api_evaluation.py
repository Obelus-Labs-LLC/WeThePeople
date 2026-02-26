"""
Test /claims/{id}/evaluation endpoint to verify enriched "why" fields.
"""
import requests
from utils.env import get_api_base_url


def test_evaluation_endpoint(claim_id=1):
    """Test that /claims/{id}/evaluation returns enriched lifecycle data."""
    base_url = get_api_base_url()
    url = f"{base_url}/claims/{claim_id}/evaluation"
    
    print("=" * 70)
    print("API EVALUATION ENDPOINT TEST")
    print("=" * 70)
    print(f"URL: {url}\n")
    
    try:
        response = requests.get(url, timeout=10)
    except requests.exceptions.ConnectionError as e:
        print(f"❌ CONNECTION FAILED")
        print(f"   Base URL: {base_url}")
        print(f"   Error: {e}")
        print("\nIs the API server running?")
        print("Try: uvicorn api_server:app --reload --port 8001")
        return
    except Exception as e:
        print(f"❌ REQUEST FAILED: {e}")
        return
    
    if response.status_code != 200:
        print(f"❌ HTTP {response.status_code}")
        print(f"Response: {response.text[:500]}")
        return
    
    data = response.json()
    
    # Extract key sections
    claim = data.get("claim", {})
    evaluation = data.get("evaluation", {})
    why = evaluation.get("why", {})
    matches = data.get("matches", [])
    
    print("📋 CLAIM:")
    print(f"   ID: {claim.get('id')}")
    print(f"   Text: {claim.get('text', '')[:80]}...")
    
    print("\n⚖️  EVALUATION:")
    print(f"   Tier: {evaluation.get('tier')}")
    print(f"   Progress: {evaluation.get('progress')}")
    print(f"   Timing: {evaluation.get('timing')}")
    print(f"   Relevance: {evaluation.get('relevance')}")
    
    print("\n🔍 WHY OBJECT KEYS:")
    why_keys = list(why.keys())
    for key in sorted(why_keys):
        print(f"   - {key}: {type(why[key]).__name__}")
    
    # Check for enriched fields
    enriched_fields = [
        'latest_action_text',
        'latest_action_date', 
        'progress_bucket',
        'status_reason',
        'timeline_count',
        'recent_actions'
    ]
    
    print("\n✨ ENRICHED FIELDS CHECK:")
    present = []
    missing = []
    for field in enriched_fields:
        if field in why:
            present.append(field)
            value = why[field]
            if isinstance(value, str):
                display = value[:60] + "..." if len(value) > 60 else value
            elif isinstance(value, list):
                display = f"[{len(value)} items]"
            else:
                display = str(value)
            print(f"   ✅ {field}: {display}")
        else:
            missing.append(field)
            print(f"   ❌ {field}: MISSING")
    
    print(f"\n📊 SUMMARY: {len(present)}/{len(enriched_fields)} enriched fields present")
    
    # Show first match details
    if matches:
        print(f"\n🎯 TOP MATCH (of {len(matches)}):")
        match = matches[0]
        action = match.get("action", {})
        bill_text = action.get("bill_text", {})
        
        print(f"   Score: {match.get('score')}")
        print(f"   Bill: {action.get('bill_type', '').upper()}{action.get('bill_number')} ({action.get('bill_congress')})")
        print(f"   Latest Action: {action.get('latest_action_text', 'N/A')[:80]}...")
        print(f"   Latest Date: {action.get('latest_action_date', 'N/A')}")
        
        if bill_text:
            latest_version = bill_text.get("latest_version", {})
            print(f"   Bill Text: {bill_text.get('has_text', False)}")
            if latest_version:
                print(f"   Latest Version: {latest_version.get('code', 'N/A')}")
    
    print("\n" + "=" * 70)
    
    if missing:
        print("\n⚠️  ISSUE: Some enriched fields are missing from API response")
        print("   Expected fields from Bill/BillAction tables not present")
        print("   Check if endpoint uses enriched evaluator or cached data")
    else:
        print("\n✅ SUCCESS: All enriched fields present in API response")


if __name__ == "__main__":
    test_evaluation_endpoint()
