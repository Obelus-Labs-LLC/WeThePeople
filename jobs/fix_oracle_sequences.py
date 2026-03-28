"""Create Oracle sequences and triggers for auto-increment ID columns.

Oracle doesn't auto-generate IDs like SQLite AUTOINCREMENT.
This script creates a SEQUENCE + BEFORE INSERT TRIGGER for each table
so that INSERT without explicit ID works.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

os.environ["WTP_DB_URL"] = "oracle"

from utils.db_compat import get_oracle_connection_url
from sqlalchemy import create_engine, text

engine = create_engine(get_oracle_connection_url(), pool_size=3)

# All tables that may need INSERT with auto-generated IDs
TABLES = [
    "TWEET_LOG", "STORIES", "ANOMALIES", "CLAIMS", "CLAIM_EVALUATIONS",
    "GOLD_LEDGER", "AUDIT_LOGS", "API_KEY_RECORDS", "USERS",
    "DIGEST_SUBSCRIBERS", "DATA_QUALITY_CHECKS", "FAILED_RECORDS",
    "PROCESSED_RECORDS", "RATE_LIMIT_RECORDS",
    "VOTES", "MEMBER_VOTES", "BILLS", "BILL_ACTIONS", "ACTIONS",
    "CONGRESSIONAL_TRADES", "COMPANY_DONATIONS", "COMMITTEE_MEMBERSHIPS",
    "LOBBYING_RECORDS", "GOVERNMENT_CONTRACTS", "FTC_ENFORCEMENT_ACTIONS",
    "TECH_PATENTS", "FINANCE_LOBBYING_RECORDS", "FINANCE_GOVERNMENT_CONTRACTS",
    "FINANCE_ENFORCEMENT_ACTIONS", "HEALTH_LOBBYING_RECORDS",
    "HEALTH_GOVERNMENT_CONTRACTS", "HEALTH_ENFORCEMENT_ACTIONS",
    "ENERGY_LOBBYING_RECORDS", "ENERGY_GOVERNMENT_CONTRACTS",
    "ENERGY_ENFORCEMENT_ACTIONS", "DEFENSE_LOBBYING_RECORDS",
    "DEFENSE_GOVERNMENT_CONTRACTS", "DEFENSE_ENFORCEMENT_ACTIONS",
    "TRANSPORTATION_LOBBYING_RECORDS", "TRANSPORTATION_GOVERNMENT_CONTRACTS",
    "TRANSPORTATION_ENFORCEMENT_ACTIONS", "SEC_FILINGS", "SEC_TECH_FILINGS",
    "SEC_HEALTH_FILINGS", "SEC_ENERGY_FILINGS", "SEC_DEFENSE_FILINGS",
    "SEC_TRANSPORTATION_FILINGS", "SEC_INSIDER_TRADES",
    "NHTSA_RECALLS", "NHTSA_COMPLAINTS", "NHTSA_SAFETY_RATINGS",
    "FUEL_ECONOMY_VEHICLES", "ENERGY_EMISSIONS", "CLINICAL_TRIALS",
    "CMS_PAYMENTS", "FDA_ADVERSE_EVENTS", "FDA_RECALLS",
    "CFPB_COMPLAINTS", "FRED_OBSERVATIONS", "FDIC_FINANCIALS",
    "STATE_LEGISLATORS", "STATE_BILLS", "SOURCE_DOCUMENTS",
    "TRACKED_MEMBERS", "TRACKED_INSTITUTIONS", "TRACKED_COMPANIES",
    "TRACKED_TECH_COMPANIES", "TRACKED_ENERGY_COMPANIES",
    "TRACKED_TRANSPORTATION_COMPANIES", "TRACKED_DEFENSE_COMPANIES",
    "COMMITTEES", "STOCK_FUNDAMENTALS", "FED_PRESS_RELEASES",
    "PERSON_BILLS", "MEMBER_BILLS_GROUNDTRUTH",
    "SAM_ENTITIES", "SAM_EXCLUSIONS", "REGULATORY_DOCKETS",
    "REGULATORY_COMMENTS", "IT_INVESTMENTS", "GOVERNMENT_WEBSITE_SCANS",
]

created_seqs = 0
created_trigs = 0
skipped = 0

with engine.connect() as conn:
    for table in TABLES:
        seq_name = f"SEQ_{table}"
        trig_name = f"TRG_{table}_ID"

        # Get current max ID
        try:
            max_id = conn.execute(text(f'SELECT NVL(MAX("ID"), 0) FROM "{table}"')).scalar()
        except Exception:
            print(f"  {table}: no ID column, skip")
            skipped += 1
            continue

        start_val = max(max_id + 1, 1)

        # Create sequence
        try:
            conn.execute(text(f"CREATE SEQUENCE {seq_name} START WITH {start_val} INCREMENT BY 1 NOCACHE"))
            conn.commit()
            created_seqs += 1
            print(f"  {table}: sequence created (start={start_val})")
        except Exception as e:
            err = str(e)
            if "ORA-00955" in err:
                print(f"  {table}: sequence exists")
            else:
                print(f"  {table}: seq error: {err[:80]}")
                continue

        # Create trigger
        trigger_sql = f"""
            CREATE OR REPLACE TRIGGER {trig_name}
            BEFORE INSERT ON "{table}"
            FOR EACH ROW
            WHEN (NEW."ID" IS NULL)
            BEGIN
                SELECT {seq_name}.NEXTVAL INTO :NEW."ID" FROM DUAL;
            END;
        """
        try:
            conn.execute(text(trigger_sql))
            conn.commit()
            created_trigs += 1
            print(f"  {table}: trigger created")
        except Exception as e:
            print(f"  {table}: trigger error: {str(e)[:80]}")

print(f"\nDone: {created_seqs} sequences, {created_trigs} triggers, {skipped} skipped")
