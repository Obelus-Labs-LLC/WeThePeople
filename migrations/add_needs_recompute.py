"""
Add needs_recompute column to claims table.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from models.database import engine

def add_needs_recompute_column():
    """Add needs_recompute dirty flag to claims table."""
    with engine.connect() as conn:
        # Check if column exists
        result = conn.execute(text("PRAGMA table_info(claims)")).fetchall()
        columns = [row[1] for row in result]
        
        if "needs_recompute" in columns:
            print("✅ needs_recompute column already exists")
            return
        
        # Add column with default 0 (False)
        conn.execute(text("ALTER TABLE claims ADD COLUMN needs_recompute INTEGER NOT NULL DEFAULT 0"))
        conn.commit()
        
        print("✅ Added needs_recompute column to claims table")
        print("   Default: 0 (False)")
        print("   Set to 1 when matched bill lifecycle data changes")
        print("   Cleared to 0 when recompute job runs")


if __name__ == "__main__":
    add_needs_recompute_column()
