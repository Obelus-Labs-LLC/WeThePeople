"""Manually test the timeline endpoint logic."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from models.database import SessionLocal, Bill, BillAction, Action
import re

bill_id = "hconres68-119"
db = SessionLocal()

try:
    # Step 1: Lookup bill
    bill = db.query(Bill).filter(Bill.bill_id == bill_id.lower()).first()
    print(f"1. Bill found: {bill is not None}")
    
    # Step 2: Fetch timeline
    timeline = (
        db.query(BillAction)
        .filter(BillAction.bill_id == bill_id.lower())
        .order_by(BillAction.action_date.desc())
        .all()
    )
    print(f"2. Timeline actions: {len(timeline)}")
    
    # Step 3: Parse bill_id
    match = re.match(r'^([a-z]+)(\d+)-(\d+)$', bill_id.lower())
    if match:
        bill_type, bill_number, congress = match.groups()
        print(f"3. Parsed: type={bill_type}, number={bill_number}, congress={congress}")
        
        # Step 4: Query related actions
        related_actions = (
            db.query(Action)
            .filter(
                Action.bill_congress == int(congress),
                Action.bill_type.ilike(bill_type),
                Action.bill_number == str(bill_number)
            )
            .all()
        )
        print(f"4. Related actions: {len(related_actions)}")
        
        # Step 5: Build response
        response = {
            "bill": {
                "bill_id": bill.bill_id,
                "congress": bill.congress,
                "bill_type": bill.bill_type,
                "bill_number": bill.bill_number,
                "title": bill.title,
                "status_bucket": bill.status_bucket,
            },
            "timeline_count": len(timeline),
            "related_actions_count": len(related_actions),
        }
        print(f"\n5. Response keys: {list(response.keys())}")
        print(f"   ✅ All logic works!")
    else:
        print("❌ Regex match failed")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

finally:
    db.close()
