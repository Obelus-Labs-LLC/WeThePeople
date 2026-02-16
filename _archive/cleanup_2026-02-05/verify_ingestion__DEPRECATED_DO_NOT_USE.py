"""
Verification Script: Member Bill Counts
Prints ingestion statistics for a specific member.
"""
import sys
import os
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Action, Bill, IngestCheckpoint
from connectors.congress import MEMBERS


def verify_member_counts(person_id: str):
    """Print detailed counts for a member's ingested bills."""
    db = SessionLocal()
    
    print("="*70)
    print(f"MEMBER VERIFICATION: {person_id.upper()}")
    print("="*70)
    
    # Total actions
    total_actions = db.query(Action).filter(Action.person_id == person_id).count()
    
    # Actions with bills
    actions_with_bills = db.query(Action).filter(
        Action.person_id == person_id,
        Action.bill_congress.isnot(None)
    ).count()
    
    # Sponsored vs cosponsored (from metadata_json)
    sponsored_count = db.query(Action).filter(
        Action.person_id == person_id,
        Action.metadata_json.like('%"relationship": "Sponsored"%')
    ).count()
    
    cosponsored_count = db.query(Action).filter(
        Action.person_id == person_id,
        Action.metadata_json.like('%"relationship": "Cosponsored"%')
    ).count()
    
    # Unique bills
    unique_bills = db.query(
        Action.bill_congress,
        Action.bill_type,
        Action.bill_number
    ).filter(
        Action.person_id == person_id,
        Action.bill_congress.isnot(None)
    ).distinct().count()
    
    # Most recent bill date
    most_recent = db.query(Action).filter(
        Action.person_id == person_id,
        Action.bill_congress.isnot(None)
    ).order_by(Action.date.desc()).first()
    
    most_recent_date = most_recent.date.strftime("%Y-%m-%d") if most_recent and most_recent.date else "N/A"
    
    # Checkpoints
    checkpoints = db.query(IngestCheckpoint).filter(
        IngestCheckpoint.person_id == person_id
    ).all()
    
    print(f"\n📊 ACTION COUNTS:")
    print(f"   Total actions: {total_actions}")
    print(f"   Actions with bills: {actions_with_bills}")
    print(f"   Sponsored: {sponsored_count}")
    print(f"   Cosponsored: {cosponsored_count}")
    
    print(f"\n📋 BILL COUNTS:")
    print(f"   Unique bills referenced: {unique_bills}")
    print(f"   Most recent bill date: {most_recent_date}")
    
    if checkpoints:
        print(f"\n🔄 CHECKPOINTS:")
        for cp in checkpoints:
            status = "✅ Complete" if cp.completed else f"⏸️  In progress (offset: {cp.offset})"
            last_success = cp.last_success_at.strftime("%Y-%m-%d %H:%M:%S") if cp.last_success_at else "Never"
            print(f"   {cp.kind.title()}: {status}")
            print(f"      Last success: {last_success}")
            if cp.last_error:
                print(f"      Last error: {cp.last_error}")
    else:
        print(f"\n🔄 CHECKPOINTS: None found (not yet ingested)")
    
    print("="*70)
    
    db.close()


def verify_db_coverage():
    """Print overall database coverage statistics."""
    db = SessionLocal()
    
    print("="*70)
    print("DATABASE COVERAGE STATISTICS")
    print("="*70)
    
    # Total actions
    total_actions = db.query(Action).count()
    actions_with_bills = db.query(Action).filter(Action.bill_congress.isnot(None)).count()
    
    # Unique bills in Actions
    unique_bills_in_actions = db.query(
        Action.bill_congress,
        Action.bill_type,
        Action.bill_number
    ).filter(
        Action.bill_congress.isnot(None)
    ).distinct().count()
    
    # Bills enriched (in Bill table)
    enriched_bills = db.query(Bill).count()
    
    # Coverage percentage
    coverage_pct = (enriched_bills / unique_bills_in_actions * 100) if unique_bills_in_actions else 0
    
    print(f"\n📊 ACTIONS:")
    print(f"   Total actions: {total_actions}")
    print(f"   Actions with bills: {actions_with_bills}")
    
    print(f"\n📋 BILLS:")
    print(f"   Unique bills in Actions: {unique_bills_in_actions}")
    print(f"   Bills enriched (Bill table): {enriched_bills}")
    print(f"   Coverage: {enriched_bills}/{unique_bills_in_actions} ({coverage_pct:.1f}%)")
    
    # Per-member breakdown
    print(f"\n👥 PER-MEMBER BREAKDOWN:")
    for person_id in MEMBERS.keys():
        member_bills = db.query(
            Action.bill_congress,
            Action.bill_type,
            Action.bill_number
        ).filter(
            Action.person_id == person_id,
            Action.bill_congress.isnot(None)
        ).distinct().count()
        
        if member_bills > 0:
            print(f"   {person_id}: {member_bills} unique bills")
    
    print("="*70)
    
    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify bill ingestion counts")
    parser.add_argument("--person-id", help="Verify specific member")
    parser.add_argument("--all", action="store_true", help="Show overall coverage stats")
    
    args = parser.parse_args()
    
    if args.all:
        verify_db_coverage()
    elif args.person_id:
        if args.person_id not in MEMBERS:
            print(f"❌ Unknown person_id: {args.person_id}")
            print(f"   Available: {', '.join(MEMBERS.keys())}")
            sys.exit(1)
        verify_member_counts(args.person_id)
    else:
        # Default: show overall coverage
        verify_db_coverage()
