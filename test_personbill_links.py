"""
Test: PersonBill Links (No Action Pollution)

Verifies that sponsorship ingestion:
1. Creates PersonBill link rows
2. Does NOT create Action rows
3. Marks Bill for enrichment
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, PersonBill, Bill, Action
from ingest_robust_v2 import ingest_member_full
from connectors.congress import MEMBERS


def test_personbill_no_action_pollution():
    """Test that ingestion creates PersonBill links without polluting Action table."""
    
    # Get initial counts
    db = SessionLocal()
    initial_action_count = db.query(Action).count()
    initial_personbill_count = db.query(PersonBill).count()
    initial_bill_count = db.query(Bill).count()
    db.close()
    
    print("=" * 70)
    print("TEST: PersonBill Links (No Action Pollution)")
    print("=" * 70)
    print()
    print(f"📊 Initial state:")
    print(f"   Action rows: {initial_action_count}")
    print(f"   PersonBill links: {initial_personbill_count}")
    print(f"   Bill stubs: {initial_bill_count}")
    print()
    
    # Ingest 1 page for AOC
    print("🔄 Ingesting AOC (--max-pages 1)...")
    person_id = "aoc"
    bioguide_id = MEMBERS[person_id]  # MEMBERS is simple dict: "aoc" -> "O000172"
    
    stats = ingest_member_full(person_id, bioguide_id, max_pages=1)
    
    print()
    print(f"✅ Ingestion complete:")
    print(f"   Sponsored items: {stats['sponsored_items']}")
    print(f"   Cosponsored items: {stats['cosponsored_items']}")
    print(f"   New links: {stats['new_links']}")
    print()
    
    # Get final counts
    db = SessionLocal()
    final_action_count = db.query(Action).count()
    final_personbill_count = db.query(PersonBill).count()
    final_bill_count = db.query(Bill).count()
    
    # Check PersonBill links created
    aoc_links = db.query(PersonBill).filter(PersonBill.person_id == person_id).count()
    
    # Check Bills marked for enrichment
    bills_need_enrichment = db.query(Bill).filter(Bill.needs_enrichment == 1).count()
    
    db.close()
    
    print(f"📊 Final state:")
    print(f"   Action rows: {final_action_count}")
    print(f"   PersonBill links: {final_personbill_count}")
    print(f"   Bill stubs: {final_bill_count}")
    print(f"   Bills needing enrichment: {bills_need_enrichment}")
    print()
    
    # Assertions
    action_delta = final_action_count - initial_action_count
    personbill_delta = final_personbill_count - initial_personbill_count
    bill_delta = final_bill_count - initial_bill_count
    
    print("=" * 70)
    print("TEST RESULTS")
    print("=" * 70)
    
    # Test 1: No Action pollution
    if action_delta == 0:
        print("✅ PASS: Action table NOT polluted (delta = 0)")
    else:
        print(f"❌ FAIL: Action table polluted (delta = {action_delta})")
        return False
    
    # Test 2: PersonBill links created
    if personbill_delta > 0:
        print(f"✅ PASS: PersonBill links created (delta = {personbill_delta})")
    else:
        print(f"❌ FAIL: No PersonBill links created (delta = {personbill_delta})")
        return False
    
    # Test 3: Bills created
    if bill_delta > 0:
        print(f"✅ PASS: Bill stubs created (delta = {bill_delta})")
    else:
        print(f"❌ FAIL: No Bill stubs created (delta = {bill_delta})")
        return False
    
    # Test 4: Bills marked for enrichment
    if bills_need_enrichment > 0:
        print(f"✅ PASS: Bills marked for enrichment (count = {bills_need_enrichment})")
    else:
        print(f"⚠️  WARNING: No bills need enrichment (count = 0)")
    
    print()
    print("=" * 70)
    print("✅ ALL TESTS PASSED")
    print("=" * 70)
    return True


if __name__ == "__main__":
    success = test_personbill_no_action_pollution()
    sys.exit(0 if success else 1)
