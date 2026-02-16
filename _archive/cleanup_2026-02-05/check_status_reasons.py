"""Check status reasons for different bill statuses"""
from models.database import SessionLocal, Bill

db = SessionLocal()

# Get bills with different statuses
statuses = ["enacted", "passed_senate", "passed_house", "in_committee"]

print("="*70)
print("STATUS BUCKET VALIDATION")
print("="*70)

for status in statuses:
    bills = db.query(Bill).filter(Bill.status_bucket == status).limit(2).all()
    
    if bills:
        print(f"\n📊 {status.upper()}:")
        for bill in bills:
            print(f"\n  Bill: {bill.bill_id}")
            print(f"  Title: {bill.title[:60]}...")
            print(f"  Status Reason: {bill.status_reason}")
    else:
        print(f"\n📊 {status.upper()}: No bills found")

db.close()
