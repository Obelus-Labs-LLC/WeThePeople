"""
Test: Freshness Filter
Verifies that --since-days parameter correctly filters stale bills.
"""
import sys
import os
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ingest_robust_v2 import is_bill_fresh


def test_freshness_filter():
    """Test freshness filter with various dates."""
    
    print("=" * 70)
    print("TEST: Freshness Filter")
    print("=" * 70)
    print()
    
    # Test 1: Recent bill (20 days ago) - should pass 90-day and 30-day filters
    recent_date = (datetime.utcnow() - timedelta(days=20)).strftime("%Y-%m-%d")
    bill_recent = {
        "latestAction": {
            "actionDate": recent_date,
            "text": "Referred to Committee"
        }
    }
    
    result_90 = is_bill_fresh(bill_recent, 90)
    result_30 = is_bill_fresh(bill_recent, 30)
    result_15 = is_bill_fresh(bill_recent, 15)
    
    print(f"Test 1: Bill from 20 days ago")
    print(f"   90-day filter: {result_90} (expected: True) {'✅' if result_90 else '❌'}")
    print(f"   30-day filter: {result_30} (expected: True) {'✅' if result_30 else '❌'}")
    print(f"   15-day filter: {result_15} (expected: False) {'✅' if not result_15 else '❌'}")
    print()
    
    # Test 2: Old bill (180 days ago) - should fail 90-day filter
    old_date = (datetime.utcnow() - timedelta(days=180)).strftime("%Y-%m-%d")
    bill_old = {
        "latestAction": {
            "actionDate": old_date,
            "text": "Introduced in House"
        }
    }
    
    result_90_old = is_bill_fresh(bill_old, 90)
    result_200_old = is_bill_fresh(bill_old, 200)
    
    print(f"Test 2: Bill from 180 days ago")
    print(f"   90-day filter: {result_90_old} (expected: False) {'✅' if not result_90_old else '❌'}")
    print(f"   200-day filter: {result_200_old} (expected: True) {'✅' if result_200_old else '❌'}")
    print()
    
    # Test 3: No filter (None) - should always pass
    result_none = is_bill_fresh(bill_old, None)
    
    print(f"Test 3: No filter (since_days=None)")
    print(f"   Old bill passes: {result_none} (expected: True) {'✅' if result_none else '❌'}")
    print()
    
    # Test 4: Bill with no latestAction - should pass (include it)
    bill_no_action = {
        "title": "New Bill",
        "congress": 119
    }
    
    result_no_action = is_bill_fresh(bill_no_action, 90)
    
    print(f"Test 4: Bill with no latestAction")
    print(f"   90-day filter: {result_no_action} (expected: True) {'✅' if result_no_action else '❌'}")
    print()
    
    # All tests
    all_pass = (
        result_90 and result_30 and not result_15 and
        not result_90_old and result_200_old and
        result_none and result_no_action
    )
    
    print("=" * 70)
    if all_pass:
        print("✅ ALL TESTS PASSED")
    else:
        print("❌ SOME TESTS FAILED")
    print("=" * 70)
    
    return all_pass


if __name__ == "__main__":
    success = test_freshness_filter()
    sys.exit(0 if success else 1)
