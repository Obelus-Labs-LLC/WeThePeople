"""Backfill status_reason for existing bills"""
from models.database import SessionLocal, Bill, BillAction
from jobs.enrich_bills import compute_status_bucket

db = SessionLocal()

# Get bills missing status_reason
bills = db.query(Bill).filter(
    Bill.status_reason.is_(None),
    Bill.status_bucket.isnot(None)
).all()

print(f"Backfilling status_reason for {len(bills)} bills...")

for bill in bills:
    # Get actions for this bill
    actions = db.query(BillAction).filter(
        BillAction.bill_id == bill.bill_id
    ).order_by(BillAction.action_date.desc()).all()
    
    if actions:
        # Recompute status with reason
        status_bucket, status_reason = compute_status_bucket(actions)
        bill.status_reason = status_reason
        
        print(f"✅ {bill.bill_id}: {status_bucket[:20]} | {status_reason[:50]}...")

db.commit()
print(f"\n✅ Backfilled {len(bills)} status reasons")
db.close()
