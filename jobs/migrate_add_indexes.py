"""
Add composite indexes and VACUUM the database for query performance.
Safe to re-run — uses CREATE INDEX IF NOT EXISTS.
"""

import os
import sys
import sqlite3

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db").replace("sqlite:///", "")
if not DB_PATH or DB_PATH.startswith("sqlite"):
    DB_PATH = "wethepeople.db"

indexes = [
    # Enforcement tables — composite (company_id + case_date) for sorted lookups
    "CREATE INDEX IF NOT EXISTS ix_health_enforcement_cid_date ON health_enforcements(company_id, case_date DESC)",
    "CREATE INDEX IF NOT EXISTS ix_finance_enforcement_iid_date ON finance_enforcements(institution_id, case_date DESC)",
    "CREATE INDEX IF NOT EXISTS ix_ftc_enforcement_cid_date ON ftc_enforcements(company_id, case_date DESC)",
    "CREATE INDEX IF NOT EXISTS ix_energy_enforcement_cid_date ON energy_enforcements(company_id, case_date DESC)",

    # Lobbying tables — composite (company_id + filing_year) for sorted lookups
    "CREATE INDEX IF NOT EXISTS ix_health_lobbying_cid_year ON health_lobbying_records(company_id, filing_year DESC)",
    "CREATE INDEX IF NOT EXISTS ix_finance_lobbying_iid_year ON finance_lobbying_records(institution_id, filing_year DESC)",
    "CREATE INDEX IF NOT EXISTS ix_lobbying_records_cid_year ON lobbying_records(company_id, filing_year DESC)",
    "CREATE INDEX IF NOT EXISTS ix_energy_lobbying_cid_year ON energy_lobbying_records(company_id, filing_year DESC)",

    # Contract tables — composite (company_id + award_amount) for sorted lookups
    "CREATE INDEX IF NOT EXISTS ix_health_contracts_cid_amt ON health_government_contracts(company_id, award_amount DESC)",
    "CREATE INDEX IF NOT EXISTS ix_finance_contracts_iid_amt ON finance_government_contracts(institution_id, award_amount DESC)",
    "CREATE INDEX IF NOT EXISTS ix_govt_contracts_cid_amt ON government_contracts(company_id, award_amount DESC)",
    "CREATE INDEX IF NOT EXISTS ix_energy_contracts_cid_amt ON energy_government_contracts(company_id, award_amount DESC)",

    # Donations — for closed-loop detection
    "CREATE INDEX IF NOT EXISTS ix_donations_entity ON company_donations(entity_type, entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_donations_person ON company_donations(person_id)",

    # Bills — for closed-loop detection
    "CREATE INDEX IF NOT EXISTS ix_bills_policy ON bills(policy_area)",

    # FDA adverse events — large table, needs index
    "CREATE INDEX IF NOT EXISTS ix_fda_adverse_cid ON fda_adverse_events(company_id)",
]

def main():
    print(f"Database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")

    for sql in indexes:
        name = sql.split("IF NOT EXISTS ")[1].split(" ON")[0]
        try:
            conn.execute(sql)
            print(f"  ✓ {name}")
        except Exception as e:
            print(f"  ✗ {name}: {e}")

    conn.commit()

    print("\nRunning ANALYZE for query planner...")
    conn.execute("ANALYZE")
    conn.commit()

    print("Running VACUUM to reclaim space...")
    conn.execute("VACUUM")

    conn.close()
    print("Done!")


if __name__ == "__main__":
    main()
