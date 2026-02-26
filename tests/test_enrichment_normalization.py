"""Test enrichment with normalization"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Action, Bill, BillAction
from jobs.enrich_actions import enrich_action

db = SessionLocal()

# Get one action to test enrichment
action = db.query(Action).filter(
    Action.bill_congress.isnot(None),
    Action.bill_type.isnot(None),
    Action.bill_number.isnot(None)
).first()

if not action:
    print("❌ No actions found with bill identifiers")
    exit(1)

print("="*60)
print(f"Testing enrichment for:")
print(f"  Person: {action.person_id}")
print(f"  Bill: {action.bill_type.upper()} {action.bill_number} ({action.bill_congress}th)")
print(f"  Title: {action.title[:60]}...")
print("="*60)

# Check initial state
initial_bills = db.query(Bill).count()
initial_actions = db.query(BillAction).count()
print(f"\nBefore enrichment:")
print(f"  Bills: {initial_bills}")
print(f"  BillActions: {initial_actions}")

# Run enrichment
print(f"\nEnriching action {action.id}...")
success = enrich_action(action, db)

if success:
    print("✅ Enrichment succeeded")
    
    # Check final state
    final_bills = db.query(Bill).count()
    final_actions = db.query(BillAction).count()
    
    print(f"\nAfter enrichment:")
    print(f"  Bills: {final_bills} (+{final_bills - initial_bills})")
    print(f"  BillActions: {final_actions} (+{final_actions - initial_actions})")
    
    # Show the Bill record
    from utils.normalization import normalize_bill_id
    bill_id = normalize_bill_id(action.bill_congress, action.bill_type, action.bill_number)
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    
    if bill:
        print(f"\n📋 Bill Record:")
        print(f"  bill_id: {bill.bill_id}")
        print(f"  title: {bill.title[:60]}...")
        print(f"  policy_area: {bill.policy_area}")
        print(f"  latest_action: {bill.latest_action_text[:80] if bill.latest_action_text else None}...")
        
        # Show some BillAction records
        actions = db.query(BillAction).filter(BillAction.bill_id == bill_id).order_by(BillAction.action_date.desc()).limit(5).all()
        print(f"\n📅 Bill Actions ({len(actions)} total):")
        for ba in actions[:5]:
            print(f"  {ba.action_date.strftime('%Y-%m-%d')}: {ba.action_text[:60]}...")
            print(f"    chamber={ba.chamber}, committee={ba.committee}")
else:
    print("❌ Enrichment failed")

db.close()
