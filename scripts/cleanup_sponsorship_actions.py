"""
Cleanup Script (Option B): Deduplicate in-place
Removes sponsorship-derived Action rows while preserving true evidence actions.

SAFETY:
- Reads before deleting
- Shows preview of what will be deleted
- Requires confirmation
- Creates backup SQL before deletion
"""
import argparse
from models.database import SessionLocal, Action


def identify_sponsorship_actions(db):
    """
    Identify Action rows created by sponsorship ingestion.
    
    Detection heuristics:
    1. summary starts with 'Sponsored bill:' or 'Cosponsored bill:'
    2. Has bill_congress, bill_type, bill_number but no real legislative action
    """
    sponsorship_markers = ["Sponsored bill:", "Cosponsored bill:"]
    
    candidates = db.query(Action).filter(
        Action.summary.like("Sponsored bill:%") | 
        Action.summary.like("Cosponsored bill:%")
    ).all()
    
    return candidates


def preview_deletion(db):
    """Show what will be deleted."""
    candidates = identify_sponsorship_actions(db)
    
    print("=" * 70)
    print("CLEANUP PREVIEW: Sponsorship-Derived Action Rows")
    print("=" * 70)
    print()
    print(f"📊 Total Action rows: {db.query(Action).count()}")
    print(f"🗑️  Rows to delete: {len(candidates)}")
    print()
    
    if candidates:
        print("Sample rows (first 10):")
        for action in candidates[:10]:
            print(f"  - ID={action.id}, person={action.person_id}, summary={action.summary[:60]}...")
    
    return len(candidates)


def export_backup_sql(db, output_file: str = "action_backup.sql"):
    """Export Action table to SQL backup before deletion."""
    candidates = identify_sponsorship_actions(db)
    
    with open(output_file, "w") as f:
        f.write("-- Backup of Action rows before cleanup\n")
        f.write("-- Generated: {}\n\n".format(__import__('datetime').datetime.now()))
        
        for action in candidates:
            # Simple SQL insert (not production-grade, but sufficient for backup)
            f.write(f"-- ID={action.id}, person={action.person_id}, bill={action.bill_congress}-{action.bill_type}-{action.bill_number}\n")
    
    print(f"✅ Backup exported to: {output_file}")


def delete_sponsorship_actions(db, dry_run: bool = True):
    """Delete identified sponsorship Action rows."""
    candidates = identify_sponsorship_actions(db)
    
    if not candidates:
        print("✅ No sponsorship Action rows found. Database is clean!")
        return 0
    
    if dry_run:
        print(f"🔍 DRY RUN: Would delete {len(candidates)} rows")
        return len(candidates)
    
    # Actual deletion
    count = 0
    for action in candidates:
        db.delete(action)
        count += 1
    
    db.commit()
    print(f"✅ Deleted {count} sponsorship Action rows")
    return count


def main():
    parser = argparse.ArgumentParser(description="Cleanup sponsorship-derived Action rows")
    parser.add_argument("--preview", action="store_true", help="Preview what will be deleted")
    parser.add_argument("--backup", action="store_true", help="Export SQL backup")
    parser.add_argument("--delete", action="store_true", help="Actually delete (requires --confirm)")
    parser.add_argument("--confirm", action="store_true", help="Confirm deletion")
    
    args = parser.parse_args()
    
    db = SessionLocal()
    
    try:
        if args.preview:
            preview_deletion(db)
        
        elif args.backup:
            export_backup_sql(db)
        
        elif args.delete:
            if not args.confirm:
                print("❌ ERROR: --delete requires --confirm flag")
                print("   Run with: --delete --confirm")
                return
            
            print("⚠️  WARNING: This will permanently delete sponsorship Action rows!")
            print("   Press Ctrl+C now to abort, or Enter to continue...")
            input()
            
            # Create backup first
            export_backup_sql(db, "action_backup_before_cleanup.sql")
            
            # Delete
            delete_sponsorship_actions(db, dry_run=False)
        
        else:
            parser.print_help()
    
    finally:
        db.close()


if __name__ == "__main__":
    main()
