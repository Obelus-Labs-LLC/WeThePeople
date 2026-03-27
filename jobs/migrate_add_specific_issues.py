"""Add specific_issues column to all lobbying tables."""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_compat import is_sqlite

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db").replace("sqlite:///", "")

def main():
    if not is_sqlite():
        print("Skipping — use Alembic for schema migrations on non-SQLite databases.")
        return

    import sqlite3

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")

    tables = ["lobbying_records", "finance_lobbying_records", "health_lobbying_records", "energy_lobbying_records"]
    for table in tables:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN specific_issues TEXT")
            print(f"Added specific_issues to {table}")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                print(f"Column already exists in {table}")
            else:
                print(f"Error on {table}: {e}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    main()
