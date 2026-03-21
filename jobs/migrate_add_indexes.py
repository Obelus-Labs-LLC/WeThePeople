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

    # Donations — for closed-loop detection and network graph
    "CREATE INDEX IF NOT EXISTS ix_donations_entity ON company_donations(entity_type, entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_donations_person ON company_donations(person_id)",
    "CREATE INDEX IF NOT EXISTS ix_donations_entity_person ON company_donations(entity_type, entity_id, person_id)",
    "CREATE INDEX IF NOT EXISTS ix_donations_amount ON company_donations(amount DESC)",

    # Bills — for closed-loop detection and pipeline
    "CREATE INDEX IF NOT EXISTS ix_bills_policy ON bills(policy_area)",
    "CREATE INDEX IF NOT EXISTS ix_bills_congress ON bills(congress)",
    "CREATE INDEX IF NOT EXISTS ix_bills_status ON bills(status_bucket)",
    "CREATE INDEX IF NOT EXISTS ix_bills_latest_action ON bills(latest_action_date DESC)",

    # BillAction — critical for closed-loop detection (was unindexed, causing full scans)
    "CREATE INDEX IF NOT EXISTS ix_bill_actions_bill_id ON bill_actions(bill_id)",
    "CREATE INDEX IF NOT EXISTS ix_bill_actions_committee ON bill_actions(committee)",
    "CREATE INDEX IF NOT EXISTS ix_bill_actions_action_date ON bill_actions(action_date)",
    "CREATE INDEX IF NOT EXISTS ix_bill_actions_bill_committee ON bill_actions(bill_id, committee)",

    # FDA adverse events — large table (582K rows), needs index
    "CREATE INDEX IF NOT EXISTS ix_fda_adverse_cid ON fda_adverse_events(company_id)",
    "CREATE INDEX IF NOT EXISTS ix_fda_adverse_cid_date ON fda_adverse_events(company_id, receive_date DESC)",

    # Clinical trials — 60K rows
    "CREATE INDEX IF NOT EXISTS ix_clinical_trials_cid ON clinical_trials(company_id)",

    # CFPB complaints — 104K rows
    "CREATE INDEX IF NOT EXISTS ix_cfpb_complaints_iid ON cfpb_complaints(institution_id)",

    # FRED observations — 64K rows
    "CREATE INDEX IF NOT EXISTS ix_fred_observations_iid ON fred_observations(institution_id)",

    # SEC filings — large tables across sectors
    "CREATE INDEX IF NOT EXISTS ix_sec_filings_iid ON sec_filings(institution_id)",
    "CREATE INDEX IF NOT EXISTS ix_sec_health_filings_cid ON sec_health_filings(company_id)",
    "CREATE INDEX IF NOT EXISTS ix_sec_tech_filings_cid ON sec_tech_filings(company_id)",
    "CREATE INDEX IF NOT EXISTS ix_sec_energy_filings_cid ON sec_energy_filings(company_id)",

    # Congressional trades — for timeline and filtering
    "CREATE INDEX IF NOT EXISTS ix_congress_trades_person ON congressional_trades(person_id)",
    "CREATE INDEX IF NOT EXISTS ix_congress_trades_ticker ON congressional_trades(ticker)",
    "CREATE INDEX IF NOT EXISTS ix_congress_trades_ticker_date ON congressional_trades(ticker, transaction_date)",
    "CREATE INDEX IF NOT EXISTS ix_congress_trades_date ON congressional_trades(transaction_date DESC)",

    # Member votes — 222K rows
    "CREATE INDEX IF NOT EXISTS ix_member_votes_vote_id ON member_votes(vote_id)",
    "CREATE INDEX IF NOT EXISTS ix_member_votes_bioguide ON member_votes(bioguide_id)",

    # Member bill ground truth — for person activity queries
    "CREATE INDEX IF NOT EXISTS ix_member_bills_bioguide ON member_bill_ground_truth(bioguide_id)",
    "CREATE INDEX IF NOT EXISTS ix_member_bills_bill_id ON member_bill_ground_truth(bill_id)",

    # Committee memberships — for closed-loop detection
    "CREATE INDEX IF NOT EXISTS ix_committee_membership_bioguide ON committee_memberships(bioguide_id)",
    "CREATE INDEX IF NOT EXISTS ix_committee_membership_thomas ON committee_memberships(committee_thomas_id)",

    # FDA recalls
    "CREATE INDEX IF NOT EXISTS ix_fda_recalls_cid ON fda_recalls(company_id)",

    # CMS payments
    "CREATE INDEX IF NOT EXISTS ix_cms_payments_cid ON cms_payments(company_id)",

    # Tech patents — 4K rows
    "CREATE INDEX IF NOT EXISTS ix_tech_patents_cid ON tech_patents(company_id)",

    # Energy emissions
    "CREATE INDEX IF NOT EXISTS ix_energy_emissions_cid ON energy_emissions(company_id)",

    # Insider trades
    "CREATE INDEX IF NOT EXISTS ix_insider_trades_iid ON sec_insider_trades(institution_id)",

    # Contract start_date for trend queries
    "CREATE INDEX IF NOT EXISTS ix_govt_contracts_cid_start ON government_contracts(company_id, start_date)",
    "CREATE INDEX IF NOT EXISTS ix_health_contracts_cid_start ON health_government_contracts(company_id, start_date)",
    "CREATE INDEX IF NOT EXISTS ix_energy_contracts_cid_start ON energy_government_contracts(company_id, start_date)",
    "CREATE INDEX IF NOT EXISTS ix_finance_contracts_iid_start ON finance_government_contracts(institution_id, start_date)",

    # Stock fundamentals — for profile pages
    "CREATE INDEX IF NOT EXISTS ix_stock_fundamentals_entity ON stock_fundamentals(entity_type, entity_id, snapshot_date DESC)",
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
