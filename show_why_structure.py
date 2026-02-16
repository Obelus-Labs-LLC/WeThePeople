"""
Show the exact structure of the enriched "why" object from the API.
"""
import requests
import json
from utils.env import get_api_base_url


def show_why_structure(claim_id=1):
    """Display the complete 'why' object structure from API response."""
    base_url = get_api_base_url()
    url = f"{base_url}/claims/{claim_id}/evaluation"
    
    response = requests.get(url, timeout=10)
    
    if response.status_code != 200:
        print(f"❌ HTTP {response.status_code}")
        return
    
    data = response.json()
    why = data.get("evaluation", {}).get("why", {})
    
    print("=" * 70)
    print("ENRICHED 'WHY' OBJECT STRUCTURE")
    print("=" * 70)
    print("\nFull structure:")
    print(json.dumps(why, indent=2, default=str))
    
    print("\n" + "=" * 70)
    print("FIELD SUMMARY:")
    print("=" * 70)
    
    # Categorize fields
    legacy_fields = ['claim_tokens', 'overlap_basic', 'overlap_enriched', 'phrase_hits']
    enriched_fields = [
        'latest_action_text',
        'latest_action_date', 
        'progress_bucket',
        'status_reason',
        'timeline_count',
        'recent_actions'
    ]
    
    print("\n📊 LEGACY FIELDS (evidence matching):")
    for field in legacy_fields:
        if field in why:
            value = why[field]
            if isinstance(value, list):
                print(f"   ✅ {field}: list with {len(value)} items")
            else:
                print(f"   ✅ {field}: {type(value).__name__}")
        else:
            print(f"   ❌ {field}: MISSING")
    
    print("\n✨ ENRICHED FIELDS (Bill/BillAction tables):")
    for field in enriched_fields:
        if field in why:
            value = why[field]
            if isinstance(value, str):
                display = value[:60] + "..." if len(value) > 60 else value
                print(f"   ✅ {field}: \"{display}\"")
            elif isinstance(value, list):
                print(f"   ✅ {field}: list with {len(value)} items")
                if value:  # Show first item structure
                    first = value[0]
                    if isinstance(first, dict):
                        keys = list(first.keys())
                        print(f"      First item keys: {keys}")
            else:
                print(f"   ✅ {field}: {value} ({type(value).__name__})")
        else:
            print(f"   ❌ {field}: MISSING")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    show_why_structure()
