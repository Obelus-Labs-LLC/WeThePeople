from models.database import SessionLocal, Bill, BillAction

db = SessionLocal()

# Check the passed_senate bill
bill = db.query(Bill).filter(Bill.bill_id == 's723-119').first()

print(f"Bill: {bill.bill_id}")
print(f"Title: {bill.title[:80]}...")
print(f"Status: {bill.status_bucket}")
print(f"Policy Area: {bill.policy_area}")
print(f"Latest: {bill.latest_action_text[:80]}...")

# Get actions
actions = db.query(BillAction).filter(
    BillAction.bill_id == 's723-119'
).order_by(BillAction.action_date.desc()).all()

print(f"\nActions ({len(actions)}):")
for action in actions:
    print(f"  {action.action_date.strftime('%Y-%m-%d')}: {action.action_text[:70]}...")
    print(f"    chamber={action.chamber}, code={action.action_code}")

db.close()
