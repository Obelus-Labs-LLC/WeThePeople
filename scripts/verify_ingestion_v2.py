"""
Ingestion Verification Script - REFACTORED
Verifies PersonBill links and Bill enrichment coverage.
Shows data freshness statistics.
Displays tracked member coverage.
"""
import argparse
import sys
from datetime import datetime, timedelta
from models.database import SessionLocal, PersonBill, Bill, BillAction, TrackedMember


def verify_member_counts(person_id: str):
    """Verify ingestion counts for a specific member using PersonBill links."""
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print(f"MEMBER VERIFICATION: {person_id.upper()}")
        print("=" * 70)
        print()
        
        # PersonBill link counts
        total_links = db.query(PersonBill).filter(PersonBill.person_id == person_id).count()
        sponsored = db.query(PersonBill).filter(
            PersonBill.person_id == person_id,
            PersonBill.relationship_type == "Sponsored"
        ).count()
        cosponsored = db.query(PersonBill).filter(
            PersonBill.person_id == person_id,
            PersonBill.relationship_type == "Cosponsored"
        ).count()
        
        print(f"📊 PERSON-BILL LINKS:")
        print(f"   Total links: {total_links}")
        print(f"   Sponsored: {sponsored}")
        print(f"   Cosponsored: {cosponsored}")
        print()
        
        # Unique bills linked
        unique_bills_query = db.query(PersonBill.bill_id).filter(
            PersonBill.person_id == person_id
        ).distinct()
        unique_bills = unique_bills_query.count()
        
        print(f"📋 BILL COUNTS:")
        print(f"   Unique bills linked: {unique_bills}")
        
        # Sample recent bill
        recent_link = db.query(PersonBill).filter(
            PersonBill.person_id == person_id
        ).order_by(PersonBill.created_at.desc()).first()
        
        if recent_link:
            print(f"   Most recent link: {recent_link.bill_id} ({recent_link.relationship_type})")
        
        # Freshness statistics
        cutoff_30 = datetime.utcnow() - timedelta(days=30)
        cutoff_90 = datetime.utcnow() - timedelta(days=90)
        
        bills_fresh_30 = db.query(Bill).join(PersonBill).filter(
            PersonBill.person_id == person_id,
            Bill.latest_action_date >= cutoff_30
        ).count()
        
        bills_fresh_90 = db.query(Bill).join(PersonBill).filter(
            PersonBill.person_id == person_id,
            Bill.latest_action_date >= cutoff_90
        ).count()
        
        print()
        print(f"📅 FRESHNESS (by latest_action_date):")
        print(f"   Last 30 days: {bills_fresh_30}")
        print(f"   Last 90 days: {bills_fresh_90}")
        print()
        
    finally:
        db.close()
    
    print("=" * 70)


def verify_db_coverage():
    """Verify overall database coverage."""
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print("DATABASE COVERAGE STATISTICS")
        print("=" * 70)
        print()
        
        # Tracked Members
        total_tracked = db.query(TrackedMember).count()
        active_tracked = db.query(TrackedMember).filter(TrackedMember.is_active == 1).count()
        inactive_tracked = db.query(TrackedMember).filter(TrackedMember.is_active == 0).count()
        
        # Members with actual data
        members_with_links = db.query(PersonBill.person_id).distinct().count()
        
        print(f"👥 TRACKED MEMBERS:")
        print(f"   Total tracked: {total_tracked}")
        print(f"   Active: {active_tracked}")
        print(f"   Inactive: {inactive_tracked}")
        print(f"   With ingested data: {members_with_links}/{active_tracked}")
        print()
        
        # PersonBill links
        total_links = db.query(PersonBill).count()
        unique_bills_linked = db.query(PersonBill.bill_id).distinct().count()
        
        print(f"📊 PERSON-BILL LINKS:")
        print(f"   Total links: {total_links}")
        print(f"   Unique bills linked: {unique_bills_linked}")
        print()
        
        # Bills table
        total_bills = db.query(Bill).count()
        enriched_bills = db.query(Bill).filter(Bill.needs_enrichment == 0).count()
        needs_enrichment = db.query(Bill).filter(Bill.needs_enrichment == 1).count()
        
        coverage_pct = (enriched_bills / total_bills * 100) if total_bills > 0 else 0
        
        print(f"📋 BILLS:")
        print(f"   Total bills: {total_bills}")
        print(f"   Enriched: {enriched_bills}")
        print(f"   [!] NEEDS ENRICHMENT: {needs_enrichment}")
        print(f"   Enrichment coverage: {enriched_bills}/{total_bills} ({coverage_pct:.1f}%)")
        if needs_enrichment > 0:
            print(f"   [ACTION REQUIRED] Run: python jobs/enrich_bills.py --limit {needs_enrichment}")
        print()
        
        # BillAction timeline
        total_actions = db.query(BillAction).count()
        bills_with_actions = db.query(BillAction.bill_id).distinct().count()
        
        print(f"📅 BILL ACTIONS (timeline):")
        print(f"   Total timeline actions: {total_actions}")
        print(f"   Bills with timeline: {bills_with_actions}")
        print()
        
        # Per-member breakdown
        print(f"👥 PER-MEMBER BREAKDOWN:")
        members = db.query(PersonBill.person_id).distinct().all()
        for (person_id,) in members:
            links = db.query(PersonBill).filter(PersonBill.person_id == person_id).count()
            sponsored = db.query(PersonBill).filter(
                PersonBill.person_id == person_id,
                PersonBill.relationship_type == "Sponsored"
            ).count()
            cosponsored = db.query(PersonBill).filter(
                PersonBill.person_id == person_id,
                PersonBill.relationship_type == "Cosponsored"
            ).count()
            print(f"   {person_id}: {links} links ({sponsored} sponsored, {cosponsored} cosponsored)")
        print()
        
        # Overall freshness
        cutoff_30 = datetime.utcnow() - timedelta(days=30)
        cutoff_90 = datetime.utcnow() - timedelta(days=90)
        
        bills_fresh_30 = db.query(Bill).filter(
            Bill.latest_action_date >= cutoff_30
        ).count()
        
        bills_fresh_90 = db.query(Bill).filter(
            Bill.latest_action_date >= cutoff_90
        ).count()
        
        print(f"📅 OVERALL FRESHNESS (by latest_action_date):")
        print(f"   Last 30 days: {bills_fresh_30}/{total_bills}")
        print(f"   Last 90 days: {bills_fresh_90}/{total_bills}")
        print()
        
    finally:
        db.close()
    
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify PersonBill ingestion")
    parser.add_argument("--person-id", help="Verify single member")
    parser.add_argument("--all", action="store_true", help="Show overall database stats")
    
    args = parser.parse_args()
    
    if args.person_id:
        verify_member_counts(args.person_id)
    elif args.all:
        verify_db_coverage()
    else:
        parser.print_help()
