"""Comprehensive test of status bucket rules"""
from models.database import SessionLocal, Bill

db = SessionLocal()

print("="*70)
print("STATUS BUCKET RULES - TRANSPARENCY TEST")
print("="*70)
print("\nRule-based classification (conservative, deterministic)")
print("Each status shows the EXACT action text that triggered it")
print("="*70)

# Get all unique statuses with examples
statuses = db.query(Bill.status_bucket).distinct().all()

for (status,) in statuses:
    if not status:
        continue
    
    bills = db.query(Bill).filter(Bill.status_bucket == status).limit(3).all()
    
    print(f"\n📊 {status.upper()}")
    print("─" * 70)
    
    for bill in bills:
        print(f"\n  {bill.bill_id.upper()}")
        print(f"  {bill.title[:60]}...")
        print(f"  └─ Trigger: \"{bill.status_reason}\"")

# Show rule documentation
print("\n" + "="*70)
print("RULE DEFINITIONS")
print("="*70)

rules = [
    ("enacted", "Contains: 'Became Public Law'"),
    ("to_president", "Contains: 'Presented to President'"),
    ("failed", "Contains: 'Failed', 'Rejected', 'Cloture motion not invoked', 'Vetoed'"),
    ("passed_both", "Contains 'Passed' in both House AND Senate"),
    ("passed_senate", "Contains: 'Passed Senate' or 'agreed to in Senate'"),
    ("passed_house", "Contains: 'Passed House' or 'agreed to in House'"),
    ("in_committee", "Contains: 'Referred to' or 'Committee'"),
    ("introduced", "Contains: 'Introduced in' (and nothing beyond)"),
    ("unknown", "No clear pattern match")
]

for status, rule in rules:
    print(f"\n  {status:15} → {rule}")

print("\n" + "="*70)
print("KEY PRINCIPLES:")
print("  1. Deterministic: Same actions → Same status (always)")
print("  2. Conservative: Only triggers on explicit text matches")
print("  3. Transparent: status_reason shows exact triggering text")
print("  4. Defensible: No AI judgment, just pattern matching")
print("="*70)

db.close()
