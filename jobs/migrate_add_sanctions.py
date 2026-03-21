"""
Migration: Add sanctions columns to all entity tables.
Run once on the VM. Safe to re-run (checks column existence).

Tables affected (5 entity tables):
  - tracked_members
  - tracked_institutions
  - tracked_companies
  - tracked_tech_companies
  - tracked_energy_companies

Columns added:
  - sanctions_status TEXT (sanctioned, pep, listed, clear, or NULL=unchecked)
  - sanctions_data TEXT (JSON blob with best match details)
  - sanctions_checked_at DATETIME (when last checked)
"""
import sqlite3

DB_PATH = "wethepeople.db"

ENTITY_TABLES = [
    "tracked_members",
    "tracked_institutions",
    "tracked_companies",
    "tracked_tech_companies",
    "tracked_energy_companies",
]

COLUMNS = [
    ("sanctions_status", "TEXT"),
    ("sanctions_data", "TEXT"),
    ("sanctions_checked_at", "DATETIME"),
]


def migrate():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")
    cursor = conn.cursor()

    added = 0

    for table in ENTITY_TABLES:
        for col_name, col_type in COLUMNS:
            try:
                cursor.execute(f"SELECT {col_name} FROM {table} LIMIT 1")
                print(f"  {table}.{col_name} — already exists")
            except sqlite3.OperationalError:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}")
                print(f"  {table}.{col_name} — ADDED")
                added += 1

    conn.commit()
    conn.close()
    print(f"\nDone! Added {added} new columns.")


if __name__ == "__main__":
    migrate()
