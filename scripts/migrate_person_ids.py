"""
Person ID Migration: Short Handles → first_last Convention

RATIONALE:
- Scales better for surname collisions (johnson, smith, lee)
- Unambiguous canonical keys for DB integrity
- Migrating now while we have only 18 claims and 3 members

MIGRATION:
- aoc → alexandria_ocasio_cortez
- bernie_sanders → bernie_sanders (unchanged)
- elizabeth_warren → elizabeth_warren (unchanged)

AFFECTED TABLES:
- claims.person_id
- claim_evaluations (no direct FK, but references via claim_id)
- tracked_members (if exists)
- person_bills (if exists)

SAFETY:
- Run in transaction
- Verify counts before/after
- No data loss (only renaming)
"""

import sqlite3
from contextlib import contextmanager

@contextmanager
def db_connection():
    conn = sqlite3.connect('wethepeople.db')
    try:
        yield conn
    finally:
        conn.close()

def verify_current_state(conn):
    """Check current person_id distribution"""
    cursor = conn.cursor()
    
    # Check claims table
    cursor.execute("SELECT person_id, COUNT(*) FROM claims GROUP BY person_id")
    claims_by_person = dict(cursor.fetchall())
    
    print("=== CURRENT STATE ===")
    print(f"Claims by person_id:")
    for person_id, count in claims_by_person.items():
        print(f"  {person_id}: {count}")
    
    # Check if tracked_members exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_members'")
    if cursor.fetchone():
        cursor.execute("SELECT person_id FROM tracked_members")
        tracked = [row[0] for row in cursor.fetchall()]
        print(f"\nTracked members: {tracked}")
    else:
        print("\nNo tracked_members table found")
    
    # Check if person_bills exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='person_bills'")
    if cursor.fetchone():
        cursor.execute("SELECT DISTINCT person_id FROM person_bills")
        person_bills = [row[0] for row in cursor.fetchall()]
        print(f"Person bills: {person_bills}")
    else:
        print("No person_bills table found")
    
    return claims_by_person

def migrate_person_ids(conn):
    """Execute migration: normalize all person_ids to first_last convention"""
    cursor = conn.cursor()
    
    print("\n=== EXECUTING MIGRATION ===")
    
    # Migration mapping
    migrations = {
        'aoc': 'alexandria_ocasio_cortez',
        'sanders': 'bernie_sanders',
        'schumer': 'chuck_schumer',
        'thune': 'john_thune'
        # kathy_castor, richard_hudson, walkinshaw: keep as-is, add to tracked_members
    }
    
    for old_id, new_id in migrations.items():
        # Update claims table
        cursor.execute("UPDATE claims SET person_id = ? WHERE person_id = ?", (new_id, old_id))
        claims_updated = cursor.rowcount
        print(f"Updated {claims_updated} claims: {old_id} → {new_id}")
        
        # Update actions table
        cursor.execute("UPDATE actions SET person_id = ? WHERE person_id = ?", (new_id, old_id))
        actions_updated = cursor.rowcount
        print(f"Updated {actions_updated} actions: {old_id} → {new_id}")
        
        # Update tracked_members if exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_members'")
        if cursor.fetchone():
            cursor.execute("UPDATE tracked_members SET person_id = ? WHERE person_id = ?", (new_id, old_id))
            tracked_updated = cursor.rowcount
            print(f"Updated {tracked_updated} tracked_members: {old_id} → {new_id}")
        
        # Update person_bills if exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='person_bills'")
        if cursor.fetchone():
            cursor.execute("UPDATE person_bills SET person_id = ? WHERE person_id = ?", (new_id, old_id))
            bills_updated = cursor.rowcount
            print(f"Updated {bills_updated} person_bills: {old_id} → {new_id}")
    
    conn.commit()
    print("\nMigration committed successfully")

def verify_migration(conn, original_counts):
    """Verify migration preserved data integrity"""
    cursor = conn.cursor()
    
    print("\n=== VERIFICATION ===")
    
    # Check claims counts
    cursor.execute("SELECT person_id, COUNT(*) FROM claims GROUP BY person_id")
    new_claims_by_person = dict(cursor.fetchall())
    
    print("New claims by person_id:")
    for person_id, count in sorted(new_claims_by_person.items()):
        print(f"  {person_id}: {count}")
    
    # Verify total count unchanged
    original_total = sum(original_counts.values())
    new_total = sum(new_claims_by_person.values())
    
    print(f"\nTotal claims before: {original_total}")
    print(f"Total claims after: {new_total}")
    
    if original_total == new_total:
        print("✅ VERIFICATION PASSED: Total claims unchanged")
    else:
        print("❌ VERIFICATION FAILED: Claim count mismatch!")
        return False
    
    # Verify specific migrations
    expected_aoc_count = original_counts.get('aoc', 0)
    actual_new_count = new_claims_by_person.get('alexandria_ocasio_cortez', 0)
    
    if expected_aoc_count == actual_new_count:
        print(f"✅ AOC migration verified: {expected_aoc_count} claims → alexandria_ocasio_cortez")
    else:
        print(f"❌ AOC migration failed: expected {expected_aoc_count}, got {actual_new_count}")
        return False
    
    # Verify old person_ids removed
    if 'aoc' in new_claims_by_person:
        print("❌ Old person_id 'aoc' still exists!")
        return False
    else:
        print("✅ Old person_id 'aoc' removed")
    
    return True

def main():
    print("Person ID Migration: aoc → alexandria_ocasio_cortez\n")
    
    with db_connection() as conn:
        # Phase 1: Verify current state
        original_counts = verify_current_state(conn)
        
        # Phase 2: Execute migration
        migrate_person_ids(conn)
        
        # Phase 3: Verify migration
        success = verify_migration(conn, original_counts)
        
        if success:
            print("\n✅ MIGRATION COMPLETED SUCCESSFULLY")
            print("\nNext steps:")
            print("1. Update manage_members.py with alias support")
            print("2. Update documentation references")
            print("3. Test with: python scripts/pilot_baseline.py")
        else:
            print("\n❌ MIGRATION VERIFICATION FAILED")
            print("Database may be in inconsistent state - manual review required")

if __name__ == "__main__":
    main()
