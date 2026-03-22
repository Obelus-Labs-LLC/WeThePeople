import os
import sys
from sqlalchemy import create_engine, text, inspect

# Get DB connection
db_url = os.getenv("DATABASE_URL", "sqlite:///./wethepeople.db")
engine = create_engine(db_url)

inspector = inspect(engine)
tables = inspector.get_table_names()
print(f"Available tables: {tables}\n")

with engine.connect() as conn:
    # Check if we have ledger data
    if 'ledger_entries' in tables:
        result = conn.execute(text("SELECT COUNT(*) as cnt FROM ledger_entries")).fetchone()
        print(f"Ledger entries: {result[0]}")
        
        result = conn.execute(text(
            "SELECT COUNT(*) as cnt FROM ledger_entries WHERE matched_bill_id IS NOT NULL"
        )).fetchone()
        print(f"Ledger entries with matched_bill_id: {result[0]}")
        
        # Get a sample
        result = conn.execute(text(
            "SELECT claim_id, person_id, matched_bill_id FROM ledger_entries WHERE matched_bill_id IS NOT NULL LIMIT 1"
        )).fetchone()
        
        if result:
            print(f"\nSample ledger entry with matched bill:")
            print(f"  claim_id: {result[0]}")
            print(f"  person_id: {result[1]}")
            print(f"  matched_bill_id: {result[2]}")
        else:
            print("\nNo ledger entries with matched bills")
