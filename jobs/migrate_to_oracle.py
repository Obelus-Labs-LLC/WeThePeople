"""
Migrate data from SQLite to Oracle Autonomous Database (WTPDB).

Reads from the local SQLite DB and inserts into Oracle in batches.
Tables are processed in dependency order (parent tables first).

Usage:
    python jobs/migrate_to_oracle.py                    # Migrate all tables
    python jobs/migrate_to_oracle.py --table votes      # Migrate one table
    python jobs/migrate_to_oracle.py --dry-run           # Show counts only
    python jobs/migrate_to_oracle.py --batch-size 500    # Custom batch size
"""

import os
import sys
import time
import argparse
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine, text, inspect
from datetime import datetime, date


def _try_parse_datetime(val):
    """Try to parse a string as a datetime/date. Returns original string if not a date."""
    if not val or not isinstance(val, str):
        return val
    # Quick check: must start with 4-digit year
    if len(val) < 10 or not val[:4].isdigit():
        return val
    # Try common datetime formats
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f+00:00",
        "%Y-%m-%dT%H:%M:%S+00:00",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(val[:len(val)], fmt)
        except ValueError:
            continue
    # Try fromisoformat (Python 3.7+, handles timezone)
    try:
        return datetime.fromisoformat(val.replace("+00:00", "+00:00").rstrip("Z"))
    except (ValueError, AttributeError):
        pass
    return val


def get_sqlite_engine():
    """Connect to the local SQLite database."""
    db_path = os.getenv("WTP_SQLITE_PATH", "sqlite:///./wethepeople.db")
    return create_engine(db_path, connect_args={"check_same_thread": False})


def get_oracle_engine():
    """Connect to Oracle WTPDB."""
    from utils.db_compat import get_oracle_connection_url
    url = get_oracle_connection_url()
    return create_engine(url, pool_size=5, max_overflow=10, pool_pre_ping=True)


# Column rename map: SQLite column name -> Oracle column name
COLUMN_RENAMES = {
    "votes": {"session": "vote_session"},
    "state_bills": {"session": "legislative_session"},
}


def migrate_table(sqlite_engine, oracle_engine, table_name, batch_size=200, dry_run=False):
    """Migrate a single table from SQLite to Oracle."""
    start = time.time()

    # Get row count from SQLite
    with sqlite_engine.connect() as conn:
        count = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar()

    if count == 0:
        print(f"  {table_name}: 0 rows (skip)")
        return 0

    if dry_run:
        print(f"  {table_name}: {count:,} rows (dry run)")
        return count

    # Check if Oracle table already has data
    try:
        with oracle_engine.connect() as conn:
            oracle_count = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name.upper()}"')).scalar()
            if oracle_count >= count:
                print(f"  {table_name}: {count:,} rows (already migrated, Oracle has {oracle_count:,})")
                return 0
            elif oracle_count > 0:
                print(f"  {table_name}: Oracle has {oracle_count:,} of {count:,} — resuming")
    except Exception:
        pass

    # Get column info from SQLite
    with sqlite_engine.connect() as conn:
        result = conn.execute(text(f"PRAGMA table_info('{table_name}')"))
        sqlite_columns = [row[1] for row in result]

    # Get column info from Oracle
    with oracle_engine.connect() as conn:
        result = conn.execute(text(
            f"SELECT column_name FROM all_tab_columns WHERE table_name = '{table_name.upper()}' ORDER BY column_id"
        ))
        oracle_columns = {row[0].lower() for row in result}

    # Map SQLite columns to Oracle columns (handle renames)
    renames = COLUMN_RENAMES.get(table_name, {})
    col_map = {}
    for col in sqlite_columns:
        oracle_name = renames.get(col, col)
        if oracle_name.lower() in oracle_columns:
            col_map[col] = oracle_name

    if not col_map:
        print(f"  {table_name}: no matching columns (skip)")
        return 0

    select_cols = ", ".join(f'"{c}"' for c in col_map.keys())
    insert_cols = ", ".join(f'"{c.upper()}"' for c in col_map.values())
    placeholders = ", ".join(f":{c}" for c in col_map.values())

    # Read and insert in batches
    migrated = 0
    offset = 0
    errors = 0

    while offset < count:
        # Read batch from SQLite
        with sqlite_engine.connect() as conn:
            rows = conn.execute(text(
                f'SELECT {select_cols} FROM "{table_name}" LIMIT {batch_size} OFFSET {offset}'
            )).fetchall()

        if not rows:
            break

        # Convert to dicts with Oracle column names
        batch = []
        for row in rows:
            d = {}
            for i, (sqlite_col, oracle_col) in enumerate(col_map.items()):
                val = row[i]
                # Oracle doesn't accept Python dicts/lists in CLOB — serialize to JSON string
                if isinstance(val, (dict, list)):
                    val = json.dumps(val)
                # Oracle DATE/TIMESTAMP columns need Python datetime objects, not ISO strings
                elif isinstance(val, str) and len(val) >= 10:
                    val = _try_parse_datetime(val)
                d[oracle_col] = val
            batch.append(d)

        # Insert into Oracle
        try:
            with oracle_engine.connect() as conn:
                conn.execute(
                    text(f'INSERT INTO "{table_name.upper()}" ({insert_cols}) VALUES ({placeholders})'),
                    batch
                )
                conn.commit()
            migrated += len(batch)
        except Exception as e:
            err = str(e)[:200]
            errors += 1
            if errors <= 3:
                print(f"    ERROR at offset {offset}: {err}")
            if errors > 10:
                print(f"    Too many errors ({errors}), stopping {table_name}")
                break
            # Try inserting one by one to find the bad row
            for row_dict in batch:
                try:
                    with oracle_engine.connect() as conn:
                        conn.execute(
                            text(f'INSERT INTO "{table_name.upper()}" ({insert_cols}) VALUES ({placeholders})'),
                            [row_dict]
                        )
                        conn.commit()
                    migrated += 1
                except Exception:
                    pass  # Skip bad row

        offset += batch_size
        if offset % (batch_size * 10) == 0:
            elapsed = time.time() - start
            rate = migrated / elapsed if elapsed > 0 else 0
            print(f"    {table_name}: {migrated:,}/{count:,} ({rate:.0f} rows/s)")

    elapsed = time.time() - start
    rate = migrated / elapsed if elapsed > 0 else 0
    print(f"  {table_name}: {migrated:,}/{count:,} migrated in {elapsed:.1f}s ({rate:.0f} rows/s, {errors} errors)")
    return migrated


# Tables in dependency order (parent tables first)
TABLE_ORDER = [
    # Foundation tables (no FKs)
    "people", "source_documents", "tracked_members", "tracked_institutions",
    "tracked_companies", "tracked_tech_companies", "tracked_energy_companies",
    "tracked_transportation_companies", "tracked_defense_companies",
    "committees", "users",
    # Tables with FKs to foundation
    "actions", "bills", "votes", "state_legislators", "state_bills",
    "person_bills", "member_bills_groundtruth", "bill_actions", "member_votes",
    "claims", "claim_evaluations", "gold_ledger",
    "committee_memberships", "anomalies", "stories",
    "company_donations", "congressional_trades",
    "api_key_records", "audit_logs", "digest_subscribers",
    # Sector data tables
    "lobbying_records", "government_contracts", "ftc_enforcement_actions", "tech_patents",
    "sec_tech_filings",
    "finance_lobbying_records", "finance_government_contracts", "finance_enforcement_actions",
    "sec_filings", "sec_insider_trades", "fdic_financials", "stock_fundamentals",
    "cfpb_complaints", "fred_observations", "fed_press_releases",
    "health_lobbying_records", "health_government_contracts", "health_enforcement_actions",
    "sec_health_filings", "fda_adverse_events", "fda_recalls",
    "clinical_trials", "cms_payments",
    "energy_lobbying_records", "energy_government_contracts", "energy_enforcement_actions",
    "sec_energy_filings", "energy_emissions",
    "transportation_lobbying_records", "transportation_government_contracts",
    "transportation_enforcement_actions", "sec_transportation_filings",
    "nhtsa_recalls", "nhtsa_complaints", "nhtsa_safety_ratings", "fuel_economy_vehicles",
    "defense_lobbying_records", "defense_government_contracts", "defense_enforcement_actions",
    "sec_defense_filings",
    # Cross-cutting
    "pipeline_runs", "tweet_log", "action_tags",
    "data_quality_checks", "failed_records", "processed_records",
    "regulatory_dockets", "regulatory_comments",
    "sam_entities", "sam_exclusions",
    "it_investments", "government_website_scans",
]


def main():
    parser = argparse.ArgumentParser(description="Migrate SQLite to Oracle WTPDB")
    parser.add_argument("--table", help="Migrate a single table")
    parser.add_argument("--batch-size", type=int, default=200, help="Rows per batch")
    parser.add_argument("--dry-run", action="store_true", help="Show counts only")
    args = parser.parse_args()

    print("Connecting to SQLite...")
    sqlite_engine = get_sqlite_engine()

    print("Connecting to Oracle WTPDB...")
    oracle_engine = get_oracle_engine()

    # Verify connections
    with sqlite_engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    with oracle_engine.connect() as conn:
        conn.execute(text("SELECT 1 FROM DUAL"))
    print("Both connections OK\n")

    # Get actual table list from SQLite
    with sqlite_engine.connect() as conn:
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"))
        sqlite_tables = {row[0] for row in result}

    if args.table:
        tables = [args.table]
    else:
        # Use dependency order, but only tables that exist in SQLite
        tables = [t for t in TABLE_ORDER if t in sqlite_tables]
        # Add any SQLite tables not in our order list
        for t in sorted(sqlite_tables):
            if t not in tables and not t.startswith("sqlite_") and t != "alembic_version":
                tables.append(t)

    total_migrated = 0
    total_start = time.time()

    for table in tables:
        if table not in sqlite_tables:
            continue
        migrated = migrate_table(sqlite_engine, oracle_engine, table, args.batch_size, args.dry_run)
        total_migrated += migrated

    total_elapsed = time.time() - total_start
    print(f"\n{'DRY RUN: ' if args.dry_run else ''}Total: {total_migrated:,} rows in {total_elapsed:.1f}s")


if __name__ == "__main__":
    main()
