import sqlite3

db_name = 'wethepeople.db'
conn = sqlite3.connect(db_name)
tables = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]

print(f"\nAll tables in {db_name}:")
for table in sorted(tables):
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table}: {count} rows")

# Check for ledger-related data
if 'claim_evaluations' in tables:
    with_bills = conn.execute(
        "SELECT COUNT(*) FROM claim_evaluations WHERE matched_bill_id IS NOT NULL"
    ).fetchone()[0]
    print(f"\nclaim_evaluations with matched_bill_id: {with_bills}")

conn.close()
