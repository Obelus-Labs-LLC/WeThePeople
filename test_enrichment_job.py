"""Test enrichment job components"""
from models.database import SessionLocal, Bill, BillAction
from jobs.enrich_bills import (
    get_bills_to_enrich,
    compute_status_bucket,
    verify_enrichment_coverage
)

db = SessionLocal()

print("="*70)
print("ENRICHMENT JOB TEST")
print("="*70)

# Test 1: Input set selection
print("\n1. Input Set Selection:")
bills = get_bills_to_enrich(db, limit=10)
print(f"   Found {len(bills)} bills to enrich")
if bills:
    print(f"   First 3: {bills[:3]}")

# Test 2: Status bucket computation
print("\n2. Status Bucket Computation:")
test_bills = [
    ("s723-119", "passed_senate"),  # Actually passed senate
    ("hr7322-119", "in_committee"),    # In committee
]

for bill_id, expected_status in test_bills:
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    if bill:
        actions = db.query(BillAction).filter(
            BillAction.bill_id == bill_id
        ).order_by(BillAction.action_date.desc()).all()
        
        computed_status, status_reason = compute_status_bucket(actions)
        match = "✅" if computed_status == expected_status else "❌"
        
        print(f"   {match} {bill_id}: {computed_status} (expected: {expected_status})")
        print(f"      Reason: {status_reason[:60]}...")
    else:
        print(f"   ⚠️  {bill_id}: Bill not found")

# Test 3: Deduplication
print("\n3. Deduplication:")
all_bill_actions = db.query(BillAction).all()
all_hashes = [ba.dedupe_hash for ba in all_bill_actions]
unique_hashes = set(all_hashes)
print(f"   Total BillActions: {len(all_bill_actions)}")
print(f"   Unique dedupe_hashes: {len(unique_hashes)}")
print(f"   Duplicates prevented: {len(all_bill_actions) - len(unique_hashes)}")

# Test 4: Normalization
print("\n4. Bill ID Normalization:")
sample_bills = db.query(Bill).limit(5).all()
for bill in sample_bills:
    # Check format: {type}{number}-{congress}
    parts = bill.bill_id.split('-')
    if len(parts) == 2:
        congress = parts[1]
        type_and_number = parts[0]
        is_lowercase = bill.bill_id == bill.bill_id.lower()
        match = "✅" if is_lowercase else "❌"
        print(f"   {match} {bill.bill_id} (congress={congress})")

# Test 5: Coverage report
print("\n5. Coverage Report:")
verify_enrichment_coverage()

db.close()

print("="*70)
print("✅ All enrichment job tests complete")
print("="*70)
