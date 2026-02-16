"""Test API returns bill status information"""
import requests
import json

# Test: Get a bill's status via the evaluation endpoint
print("="*70)
print("API TEST: Bill Status Information")
print("="*70)

# Get a claim evaluation (which includes action/bill info)
response = requests.get("http://127.0.0.1:8000/claims/1/evaluation")
data = response.json()

if "action" in data:
    action = data["action"]
    print(f"\nAction (Evidence):")
    print(f"  Bill: {action.get('bill_type', 'N/A')} {action.get('bill_number', 'N/A')}")
    print(f"  Policy Area: {action.get('policy_area', 'N/A')}")
    print(f"  Latest Action: {action.get('latest_action_text', 'N/A')[:60]}...")
    
    # Check if bill_text includes status info
    if "bill_text" in action:
        bill_text = action["bill_text"]
        print(f"\nBill Text Info:")
        print(f"  Congress.gov URL: {bill_text.get('congress_gov_text_url', 'N/A')}")
        print(f"  Has Text: {bill_text.get('has_text', False)}")

print("\n" + "="*70)
print("Note: Bill status (status_bucket, status_reason) not exposed yet")
print("Need to add GET /bills/{bill_id} endpoint")
print("="*70)
