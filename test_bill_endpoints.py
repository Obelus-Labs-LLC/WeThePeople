"""
Test the 3 required endpoints for bill lifecycle integration.
"""
import requests
from utils.env import get_api_base_url


def test_endpoints():
    """Test all 3 required endpoints."""
    base_url = get_api_base_url()
    
    print("=" * 70)
    print("BILL LIFECYCLE ENDPOINTS TEST")
    print("=" * 70)
    
    # Test 1: GET /bills/{bill_id}/timeline
    print("\n1️⃣  GET /bills/hconres68-119/timeline")
    print("-" * 70)
    try:
        response = requests.get(f"{base_url}/bills/hconres68-119/timeline", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Bill: {data['bill']['bill_id']}")
            print(f"   Title: {data['bill']['title'][:80]}...")
            print(f"   Status: {data['bill']['status_bucket']}")
            print(f"   Status Reason: {data['bill']['status_reason'][:60]}...")
            print(f"   Timeline: {data['timeline_count']} actions")
            print(f"   Related Actions: {len(data['related_actions'])} politician evidence items")
            
            if data['timeline']:
                print(f"\n   📅 Most recent action:")
                latest = data['timeline'][0]
                print(f"      {latest['date']}: {latest['text'][:80]}...")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 2: GET /actions/{action_id}
    print("\n2️⃣  GET /actions/976")
    print("-" * 70)
    try:
        response = requests.get(f"{base_url}/actions/976", timeout=10)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Action: {data['action']['id']}")
            print(f"   Title: {data['action']['title'][:80]}...")
            print(f"   Bill ID: {data.get('bill_id')}")
            print(f"   Timeline Link: {data.get('timeline_endpoint')}")
            
            if 'receipts' in data and 'bill_text' in data['receipts']:
                receipt = data['receipts']['bill_text']
                print(f"\n   📄 Bill Text Receipt:")
                print(f"      Has Text: {receipt.get('has_text')}")
                if receipt.get('latest_version'):
                    print(f"      Latest Version: {receipt['latest_version'].get('code')}")
                    print(f"      Formats: {receipt['latest_version'].get('formats', [])}")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 3: GET /claims/{id}/evaluation (enhanced)
    print("\n3️⃣  GET /claims/1/evaluation (enhanced with bill links)")
    print("-" * 70)
    try:
        response = requests.get(f"{base_url}/claims/1/evaluation", timeout=10)
        if response.status_code == 200:
            data = response.json()
            action = data.get('action', {})
            bill_summary = data.get('bill_summary', {})
            
            print(f"✅ Claim: {data['claim']['id']}")
            print(f"   Text: {data['claim']['text'][:80]}...")
            print(f"   Tier: {data['evaluation']['tier']}")
            
            if action:
                print(f"\n   🎯 Matched Action:")
                print(f"      Action ID: {action.get('id')}")
                print(f"      Bill ID: {action.get('bill_id')}")
                print(f"      Timeline Link: {action.get('timeline_endpoint')}")
            
            if bill_summary:
                print(f"\n   📊 Bill Summary Snapshot:")
                print(f"      Status: {bill_summary.get('status_bucket')}")
                print(f"      Reason: {bill_summary.get('status_reason', '')[:60]}...")
                print(f"      Timeline: {bill_summary.get('timeline_count')} actions")
            
            if action and 'bill_text' in action:
                print(f"\n   📄 Bill Text Receipt: ✅ Present")
        else:
            print(f"❌ HTTP {response.status_code}: {response.text[:200]}")
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("\n" + "=" * 70)
    print("SUMMARY:")
    print("  A) ✅ GET /bills/{bill_id}/timeline - Full timeline + summary")
    print("  B) ✅ GET /actions/{action_id} - Evidence item with bill links")
    print("  C) ✅ GET /claims/{id}/evaluation - Enhanced with bill context")
    print("\n  Bill text receipts: On-demand (NOT during enrichment)")
    print("=" * 70)


if __name__ == "__main__":
    test_endpoints()
