"""Debug the /bills/{bill_id}/timeline endpoint."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from models.database import SessionLocal, Bill, BillAction

db = SessionLocal()

# Check if bill exists
bill = db.query(Bill).filter(Bill.bill_id == "hconres68-119").first()

if bill:
    print(f"✅ Bill found: {bill.bill_id}")
    print(f"   Title: {bill.title}")
    print(f"   Status: {bill.status_bucket}")
    
    # Check timeline
    timeline = db.query(BillAction).filter(BillAction.bill_id == "hconres68-119").all()
    print(f"   Timeline: {len(timeline)} actions")
    
    # Try the endpoint logic
    try:
        import re
        match = re.match(r'^([a-z]+)(\d+)-(\d+)$', "hconres68-119")
        if match:
            bill_type, bill_number, congress = match.groups()
            print(f"\n✅ Parsed: {bill_type} {bill_number} Congress {congress}")
        else:
            print("\n❌ Regex failed to match")
    except Exception as e:
        print(f"\n❌ Error: {e}")
else:
    print(f"❌ Bill not found: hconres68-119")

db.close()
