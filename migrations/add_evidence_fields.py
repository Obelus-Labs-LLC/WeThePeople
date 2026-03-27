"""
Add explainable evidence fields to claim_evaluations table.

This migration adds fields to make matching decisions transparent:
- matched_bill_id: The bill that was matched (if any)
- evidence_json: Structured reasons for the match (JSON array)

Run: python migrations/add_evidence_fields.py
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_compat import is_sqlite
from models.database import DATABASE_URL

def migrate():
    if not is_sqlite():
        print("Skipping — use Alembic for schema migrations on non-SQLite databases.")
        return

    import sqlite3

    # Extract database path from URL
    db_path = DATABASE_URL.replace("sqlite:///", "").replace("./", "")

    print(f"Connecting to: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check existing columns
    cursor.execute("PRAGMA table_info(claim_evaluations)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    print(f"Existing columns: {existing_columns}")

    # Add matched_bill_id if not exists
    if "matched_bill_id" not in existing_columns:
        print("Adding matched_bill_id column...")
        cursor.execute("""
            ALTER TABLE claim_evaluations
            ADD COLUMN matched_bill_id TEXT
        """)
        print("matched_bill_id column added")
    else:
        print("matched_bill_id column already exists")

    # Add evidence_json if not exists
    if "evidence_json" not in existing_columns:
        print("Adding evidence_json column...")
        cursor.execute("""
            ALTER TABLE claim_evaluations
            ADD COLUMN evidence_json TEXT
        """)
        print("evidence_json column added")
    else:
        print("evidence_json column already exists")

    # Create index on matched_bill_id for efficient queries
    cursor.execute("""
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='ix_claim_evaluations_matched_bill_id'
    """)

    if not cursor.fetchone():
        print("Creating index on matched_bill_id...")
        cursor.execute("""
            CREATE INDEX ix_claim_evaluations_matched_bill_id
            ON claim_evaluations(matched_bill_id)
        """)
        print("Index created")
    else:
        print("Index already exists")

    conn.commit()
    conn.close()

    print("\nMigration complete")

if __name__ == "__main__":
    migrate()
