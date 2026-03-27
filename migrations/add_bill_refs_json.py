"""
Add bill_refs_json column to claims table.

This migration adds a nullable TEXT column to store extracted bill references
from source articles as JSON arrays (e.g., ["H.R. 1234", "S. 5678"]).

Idempotent: Safe to run multiple times.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.db_compat import is_sqlite

def migrate():
    """Add bill_refs_json column to claims table."""
    if not is_sqlite():
        print("Skipping — use Alembic for schema migrations on non-SQLite databases.")
        return True

    import sqlite3

    conn = sqlite3.connect('wethepeople.db')
    cursor = conn.cursor()

    print("=" * 80)
    print("MIGRATION: Add bill_refs_json to claims")
    print("=" * 80)

    # Check if column already exists
    cursor.execute("PRAGMA table_info(claims)")
    columns = [row[1] for row in cursor.fetchall()]

    if 'bill_refs_json' in columns:
        print("\nColumn bill_refs_json already exists - migration already applied")
        conn.close()
        return True

    print("\nAdding bill_refs_json column...")

    try:
        cursor.execute("""
            ALTER TABLE claims
            ADD COLUMN bill_refs_json TEXT NULL
        """)
        conn.commit()
        print("Column added successfully")

        # Verify
        cursor.execute("PRAGMA table_info(claims)")
        columns_after = [row[1] for row in cursor.fetchall()]

        if 'bill_refs_json' not in columns_after:
            print("Verification failed - column not found after migration")
            conn.close()
            return False

        # Show stats
        cursor.execute("SELECT COUNT(*) FROM claims")
        total_claims = cursor.fetchone()[0]
        print(f"\nTotal claims in database: {total_claims}")
        print("All existing claims have bill_refs_json = NULL (will be populated on next ingest)")

        print("\n" + "=" * 80)
        print("MIGRATION SUCCESSFUL")
        print("=" * 80)

        conn.close()
        return True

    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        conn.close()
        return False

if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
