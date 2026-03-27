"""
Migration: Add ai_summary columns to all relevant tables.
Run once on the VM to add the columns. Safe to re-run (checks IF NOT EXISTS).

Tables affected (13 total):
  - votes (vote descriptions)
  - lobbying_records, finance_lobbying_records, health_lobbying_records, energy_lobbying_records
  - government_contracts, finance_government_contracts, health_government_contracts, energy_government_contracts
  - ftc_enforcement_actions, finance_enforcement_actions, health_enforcement_actions, energy_enforcement_actions

Also adds ai_profile_summary to entity tables (5):
  - tracked_members, tracked_institutions, tracked_companies, tracked_tech_companies, tracked_energy_companies
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_compat import is_sqlite

DB_PATH = "wethepeople.db"

TABLES_WITH_SUMMARY = [
    # Votes
    "votes",
    # Lobbying (4 sectors)
    "lobbying_records",
    "finance_lobbying_records",
    "health_lobbying_records",
    "energy_lobbying_records",
    # Contracts (4 sectors)
    "government_contracts",
    "finance_government_contracts",
    "health_government_contracts",
    "energy_government_contracts",
    # Enforcement (4 sectors)
    "ftc_enforcement_actions",
    "finance_enforcement_actions",
    "health_enforcement_actions",
    "energy_enforcement_actions",
]

ENTITY_TABLES = [
    "tracked_members",
    "tracked_institutions",
    "tracked_companies",
    "tracked_tech_companies",
    "tracked_energy_companies",
]


def migrate():
    if not is_sqlite():
        print("Skipping — use Alembic for schema migrations on non-SQLite databases.")
        return

    import sqlite3

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")
    cursor = conn.cursor()

    added = 0

    # Add ai_summary to data tables
    for table in TABLES_WITH_SUMMARY:
        try:
            cursor.execute(f"SELECT ai_summary FROM {table} LIMIT 1")
            print(f"  {table}.ai_summary — already exists")
        except sqlite3.OperationalError:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN ai_summary TEXT")
            print(f"  {table}.ai_summary — ADDED")
            added += 1

    # Add ai_profile_summary to entity tables
    for table in ENTITY_TABLES:
        try:
            cursor.execute(f"SELECT ai_profile_summary FROM {table} LIMIT 1")
            print(f"  {table}.ai_profile_summary — already exists")
        except sqlite3.OperationalError:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN ai_profile_summary TEXT")
            print(f"  {table}.ai_profile_summary — ADDED")
            added += 1

    conn.commit()
    conn.close()
    print(f"\nDone! Added {added} new columns.")


if __name__ == "__main__":
    migrate()
