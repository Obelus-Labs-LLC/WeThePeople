"""
Person ID Integrity Check
Scans all person_id references across tables and validates against tracked_members.
Flags any person_ids that exist in data tables but not in tracked_members.
"""
import sqlite3
from collections import defaultdict

def check_person_id_integrity():
    conn = sqlite3.connect("wethepeople.db")
    cursor = conn.cursor()
    
    # Get canonical person_ids from tracked_members
    cursor.execute("SELECT person_id FROM tracked_members")
    canonical_ids = set(row[0] for row in cursor.fetchall())
    
    print("=" * 80)
    print("PERSON ID INTEGRITY CHECK")
    print("=" * 80)
    print(f"\nCanonical person_ids (from tracked_members): {len(canonical_ids)}")
    print(f"  {sorted(canonical_ids)}\n")
    
    # Tables with person_id columns to check
    tables_to_check = [
        "claims",
        "actions",
        "person_bills",
        "claim_evaluations"  # Via join with claims
    ]
    
    issues_found = defaultdict(list)
    
    # Check each table
    for table in tables_to_check:
        print(f"Checking {table}...")
        
        if table == "claim_evaluations":
            # Check via join since evaluations reference claims
            query = """
                SELECT DISTINCT c.person_id 
                FROM claim_evaluations ce 
                JOIN claims c ON ce.claim_id = c.id
            """
        else:
            query = f"SELECT DISTINCT person_id FROM {table}"
        
        cursor.execute(query)
        table_ids = set(row[0] for row in cursor.fetchall())
        
        # Find person_ids in table but not in tracked_members
        unknown_ids = table_ids - canonical_ids
        
        if unknown_ids:
            issues_found[table] = sorted(unknown_ids)
            print(f"  ❌ ISSUE: {len(unknown_ids)} unknown person_ids: {sorted(unknown_ids)}")
            
            # Get counts for each unknown ID
            if table == "claim_evaluations":
                for pid in sorted(unknown_ids):
                    cursor.execute("""
                        SELECT COUNT(*) 
                        FROM claim_evaluations ce 
                        JOIN claims c ON ce.claim_id = c.id 
                        WHERE c.person_id = ?
                    """, (pid,))
                    count = cursor.fetchone()[0]
                    print(f"    {pid}: {count} evaluations")
            else:
                for pid in sorted(unknown_ids):
                    cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE person_id = ?", (pid,))
                    count = cursor.fetchone()[0]
                    print(f"    {pid}: {count} rows")
        else:
            print(f"  ✅ OK: All person_ids are canonical")
        
        # Show summary
        print(f"  Person IDs in {table}: {len(table_ids)}")
        print()
    
    conn.close()
    
    # Final summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    if issues_found:
        print(f"\n❌ INTEGRITY CHECK FAILED")
        print(f"\nFound {len(issues_found)} tables with unknown person_ids:")
        for table, unknown_ids in issues_found.items():
            print(f"  {table}: {unknown_ids}")
        print("\nAction required:")
        print("  1. Add missing person_ids to tracked_members, OR")
        print("  2. Run migration script to fix person_id references")
        return False
    else:
        print(f"\n✅ INTEGRITY CHECK PASSED")
        print(f"All person_id references are valid across {len(tables_to_check)} tables")
        return True

if __name__ == "__main__":
    success = check_person_id_integrity()
    exit(0 if success else 1)
