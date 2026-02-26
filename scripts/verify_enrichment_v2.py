"""
Enrichment Verification Script v2
Verifies Bill enrichment coverage and BillAction timeline completeness.
Works with PersonBill system (needs_enrichment flag).
"""
from models.database import SessionLocal, Bill, BillAction, PersonBill
from sqlalchemy import func


def verify_enrichment():
    """Print comprehensive enrichment statistics."""
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print("ENRICHMENT COVERAGE REPORT")
        print("=" * 70)
        print()
        
        # Bill statistics
        total_bills = db.query(Bill).count()
        enriched_bills = db.query(Bill).filter(Bill.needs_enrichment == 0).count()
        needs_enrichment = db.query(Bill).filter(Bill.needs_enrichment == 1).count()
        
        enrichment_pct = (enriched_bills / total_bills * 100) if total_bills > 0 else 0
        
        print(f"📋 BILLS:")
        print(f"   Total bills: {total_bills}")
        print(f"   Enriched (needs_enrichment=0): {enriched_bills}")
        print(f"   Needs enrichment (needs_enrichment=1): {needs_enrichment}")
        print(f"   Enrichment coverage: {enriched_bills}/{total_bills} ({enrichment_pct:.1f}%)")
        print()
        
        # BillAction timeline statistics
        total_actions = db.query(BillAction).count()
        bills_with_actions = db.query(BillAction.bill_id).distinct().count()
        
        avg_actions = (total_actions / bills_with_actions) if bills_with_actions > 0 else 0
        
        print(f"📅 BILL ACTIONS (timeline):")
        print(f"   Total timeline actions: {total_actions}")
        print(f"   Bills with timeline: {bills_with_actions}")
        print(f"   Avg actions/bill: {avg_actions:.1f}")
        print()
        
        # Enrichment field completeness
        bills_with_status = db.query(Bill).filter(Bill.status_bucket.isnot(None)).count()
        bills_with_policy = db.query(Bill).filter(Bill.policy_area.isnot(None)).count()
        bills_with_latest_action = db.query(Bill).filter(Bill.latest_action_text.isnot(None)).count()
        
        print(f"🔍 ENRICHMENT FIELD COMPLETENESS:")
        print(f"   Bills with status_bucket: {bills_with_status}/{total_bills} ({bills_with_status/total_bills*100 if total_bills else 0:.1f}%)")
        print(f"   Bills with policy_area: {bills_with_policy}/{total_bills} ({bills_with_policy/total_bills*100 if total_bills else 0:.1f}%)")
        print(f"   Bills with latest_action_text: {bills_with_latest_action}/{total_bills} ({bills_with_latest_action/total_bills*100 if total_bills else 0:.1f}%)")
        print()
        
        # Status distribution (only for enriched bills)
        status_counts = db.query(
            Bill.status_bucket,
            func.count(Bill.bill_id)
        ).filter(
            Bill.needs_enrichment == 0
        ).group_by(Bill.status_bucket).all()
        
        if status_counts:
            print(f"📊 STATUS DISTRIBUTION (enriched bills only):")
            for status, count in sorted(status_counts, key=lambda x: x[1], reverse=True):
                print(f"   - {status or 'NULL'}: {count}")
            print()
        
        # PersonBill link statistics (context)
        total_links = db.query(PersonBill).count()
        unique_bills_linked = db.query(PersonBill.bill_id).distinct().count()
        
        print(f"🔗 PERSON-BILL LINKS (context):")
        print(f"   Total links: {total_links}")
        print(f"   Unique bills linked: {unique_bills_linked}")
        print()
        
        # Sample unenriched bills (for debugging)
        if needs_enrichment > 0:
            print(f"📝 SAMPLE UNENRICHED BILLS (first 5):")
            unenriched_sample = db.query(Bill).filter(
                Bill.needs_enrichment == 1
            ).limit(5).all()
            
            for bill in unenriched_sample:
                print(f"   - {bill.bill_id}: {bill.title[:60]}...")
            print()
        
    finally:
        db.close()
    
    print("=" * 70)


if __name__ == "__main__":
    verify_enrichment()
