"""
Robust Bill Ingestion System - REFACTORED
Phase 4.1: Evidence Completeness & Authority

CRITICAL FIXES:
- PersonBill link table for sponsorship relationships (NOT Action table)
- Bill stubs with needs_enrichment flag
- Idempotent by bill_id + person_id + relationship
- NO insertion into Action table for sponsorship lists

Features:
- Full pagination (no hardcoded limits)
- Resume/checkpoint system
- Rate limiting + retries/backoff
- Structured logging
- CLI entrypoints
"""
import os
import sys
import time
import argparse
from datetime import datetime
from typing import Optional, Tuple
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import (
    SessionLocal, Bill, PersonBill, IngestCheckpoint, TrackedMember
)
from connectors.congress import robust_get, HEADERS
from utils.normalization import normalize_bill_id


# Rate limiting configuration
RATE_LIMIT_DELAY = 0.4  # seconds between requests
PAGE_SIZE = 20  # Congress.gov API page size
DEFAULT_FRESHNESS_DAYS = 90  # Only ingest bills updated in last N days


def is_bill_fresh(bill_data: dict, since_days: Optional[int]) -> bool:
    """
    Check if bill was updated recently (freshness guard).
    
    Args:
        bill_data: Bill metadata from Congress.gov API
        since_days: Only consider bills updated in last N days (None = no filter)
    
    Returns:
        True if bill passes freshness check, False otherwise
    """
    if since_days is None:
        return True  # No freshness filter
    
    # Get latest action date
    latest_action_obj = bill_data.get("latestAction")
    if not latest_action_obj:
        return True  # No action date, include it (might be very new)
    
    latest_action_date_str = latest_action_obj.get("actionDate")
    if not latest_action_date_str:
        return True  # No action date, include it
    
    try:
        latest_action_date = datetime.strptime(latest_action_date_str, "%Y-%m-%d")
        cutoff_date = datetime.utcnow() - __import__('datetime').timedelta(days=since_days)
        return latest_action_date > cutoff_date  # Strictly greater than cutoff
    except:
        return True  # Parse error, include it


def get_or_create_checkpoint(db, person_id: str, kind: str) -> IngestCheckpoint:
    """Get existing checkpoint or create new one."""
    checkpoint = db.query(IngestCheckpoint).filter(
        IngestCheckpoint.person_id == person_id,
        IngestCheckpoint.kind == kind
    ).first()
    
    if not checkpoint:
        checkpoint = IngestCheckpoint(
            person_id=person_id,
            kind=kind,
            offset=0,
            last_page=None,
            completed=0
        )
        db.add(checkpoint)
        db.commit()
    
    return checkpoint


def fetch_legislation_page(bioguide_id: str, kind: str, offset: int) -> Tuple[list, bool]:
    """
    Fetch one page of legislation.
    
    Returns:
        (items, has_more): List of items and whether more pages exist
    """
    endpoint = "sponsored-legislation" if kind == "sponsored" else "cosponsored-legislation"
    url = f"https://api.congress.gov/v3/member/{bioguide_id}/{endpoint}"
    
    params = {
        "format": "json",
        "offset": offset,
        "limit": PAGE_SIZE
    }
    
    response = robust_get(url, HEADERS, params)
    
    if response.status_code != 200:
        return [], False
    
    data = response.json()
    item_key = "sponsoredLegislation" if kind == "sponsored" else "cosponsoredLegislation"
    items = data.get(item_key, [])
    
    # Check if there are more pages
    pagination = data.get("pagination", {})
    count = pagination.get("count", 0)
    has_more = (offset + PAGE_SIZE) < count
    
    return items, has_more


def process_bill_link(db, person_id: str, bill_data: dict, relationship_type: str, since_days: Optional[int] = None) -> tuple[bool, str]:
    """
    Process sponsorship link: create Bill stub + PersonBill link.
    
    GUARDRAIL: This function MUST NOT write to Action table.
    
    Args:
        db: Database session
        person_id: Person identifier (e.g., 'aoc')
        bill_data: Bill metadata from Congress.gov API
        relationship_type: 'Sponsored' or 'Cosponsored'
        since_days: Only process bills updated in last N days (None = no filter)
    
    Returns:
        Tuple of (success, reason): success=True if new link created, reason=skip reason
    """
    # Extract identifiers
    congress = bill_data.get("congress")
    bill_type = bill_data.get("type")
    bill_number = bill_data.get("number")
    
    if not (congress and bill_type and bill_number):
        return False, "missing_identifiers"
    
    # Freshness guard: skip stale bills (unless no filter)
    if not is_bill_fresh(bill_data, since_days):
        return False, "stale"
    
    # Normalize bill_id
    bill_id = normalize_bill_id(congress, bill_type, bill_number)
    
    # Check if PersonBill link already exists (idempotency)
    existing_link = db.query(PersonBill).filter(
        PersonBill.person_id == person_id,
        PersonBill.bill_id == bill_id,
        PersonBill.relationship_type == relationship_type
    ).first()
    
    if existing_link:
        return False, "already_exists"  # Skip, already linked
    
    # Build source URL
    bill_type_lower = bill_type.lower() if bill_type else ""
    source_url = f"https://www.congress.gov/bill/{congress}th-congress/{bill_type_lower}-bill/{bill_number}"
    
    # Upsert Bill record (create stub if doesn't exist)
    existing_bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    
    if not existing_bill:
        title = bill_data.get("title", "")[:500] or f"{bill_type.upper()} {bill_number}"
        
        # Extract policy area
        policy_area = None
        policy_area_obj = bill_data.get("policyArea")
        if policy_area_obj and isinstance(policy_area_obj, dict):
            policy_area = policy_area_obj.get("name")
        
        # Extract latest action
        latest_action_text = None
        latest_action_date_dt = None
        latest_action_obj = bill_data.get("latestAction")
        if latest_action_obj and isinstance(latest_action_obj, dict):
            latest_action_text = latest_action_obj.get("text")
            latest_action_date_str = latest_action_obj.get("actionDate")
            if latest_action_date_str:
                try:
                    latest_action_date_dt = datetime.strptime(latest_action_date_str, "%Y-%m-%d")
                except:
                    pass
        
        bill_record = Bill(
            bill_id=bill_id,
            congress=congress,
            bill_type=bill_type.lower(),
            bill_number=bill_number,
            title=title,
            policy_area=policy_area,
            latest_action_text=latest_action_text,
            latest_action_date=latest_action_date_dt,
            needs_enrichment=1,  # Mark for full enrichment
            metadata_json=bill_data
        )
        db.add(bill_record)
        db.flush()  # Ensure bill_id is available
    
    # Create PersonBill link
    person_bill_link = PersonBill(
        person_id=person_id,
        bill_id=bill_id,
        relationship_type=relationship_type,
        source_url=source_url
    )
    db.add(person_bill_link)
    
    try:
        db.commit()
        return True, "new_link"
    except Exception as e:
        db.rollback()
        print(f"  ⚠️  Failed to link {bill_id}: {e}")
        return False, "db_error"


def ingest_member_full(
    person_id: str,
    bioguide_id: str,
    max_pages: Optional[int] = None,
    since_days: Optional[int] = DEFAULT_FRESHNESS_DAYS
) -> dict:
    """
    Ingest all legislation for one member with full pagination and checkpointing.
    
    Args:
        person_id: Person identifier (e.g., 'aoc')
        bioguide_id: Bioguide ID from Congress.gov
        max_pages: Max pages per kind (for testing)
        since_days: Only ingest bills updated in last N days (None = no filter)
    
    Returns:
        Stats dict with counts (new_links, stale_skipped, already_exists)
    """
    db = SessionLocal()
    stats = {
        "sponsored_items": 0,
        "cosponsored_items": 0,
        "new_links": 0,
        "stale_skipped": 0,
        "already_exists": 0
    }
    
    try:
        # Process sponsored legislation
        print(f"  📥 Fetching sponsored legislation...", end="")
        sponsored_checkpoint = get_or_create_checkpoint(db, person_id, "sponsored")
        
        if sponsored_checkpoint.completed:
            print(f" (resuming from offset {sponsored_checkpoint.offset})...")
        else:
            print()
        
        page_num = (sponsored_checkpoint.offset // PAGE_SIZE) + 1
        offset = sponsored_checkpoint.offset
        
        while True:
            if max_pages and page_num > max_pages:
                print(f"  🛑 Reached max_pages limit ({max_pages})")
                break
            
            items, has_more = fetch_legislation_page(bioguide_id, "sponsored", offset)
            
            if not items:
                break
            
            new_count = 0
            stale_count = 0
            for item in items:
                success, reason = process_bill_link(db, person_id, item, "Sponsored", since_days)
                if success:
                    new_count += 1
                    stats["new_links"] += 1
                elif reason == "stale":
                    stale_count += 1
                    stats["stale_skipped"] += 1
                elif reason == "already_exists":
                    stats["already_exists"] += 1
            
            stats["sponsored_items"] += len(items)
            if stale_count > 0:
                print(f"  📄 Page {page_num}: {len(items)} items ({new_count} new, {stale_count} stale)")
            else:
                print(f"  📄 Page {page_num}: {len(items)} items ({new_count} new)")
            
            # Update checkpoint
            sponsored_checkpoint.offset = offset + PAGE_SIZE
            sponsored_checkpoint.last_page = page_num
            sponsored_checkpoint.last_success_at = datetime.utcnow()
            db.commit()
            
            if not has_more:
                sponsored_checkpoint.completed = 1
                db.commit()
                break
            
            offset += PAGE_SIZE
            page_num += 1
            time.sleep(RATE_LIMIT_DELAY)
        
        print(f"  ✅ Sponsored complete (total: {stats['sponsored_items']} items)")
        
        # Process cosponsored legislation
        print(f"  📥 Fetching cosponsored legislation...", end="")
        cosponsored_checkpoint = get_or_create_checkpoint(db, person_id, "cosponsored")
        
        if cosponsored_checkpoint.completed:
            print(f" (resuming from offset {cosponsored_checkpoint.offset})...")
        else:
            print()
        
        page_num = (cosponsored_checkpoint.offset // PAGE_SIZE) + 1
        offset = cosponsored_checkpoint.offset
        
        while True:
            if max_pages and page_num > max_pages:
                print(f"  🛑 Reached max_pages limit ({max_pages})")
                break
            
            items, has_more = fetch_legislation_page(bioguide_id, "cosponsored", offset)
            
            if not items:
                break
            
            new_count = 0
            stale_count = 0
            for item in items:
                success, reason = process_bill_link(db, person_id, item, "Cosponsored", since_days)
                if success:
                    new_count += 1
                    stats["new_links"] += 1
                elif reason == "stale":
                    stale_count += 1
                    stats["stale_skipped"] += 1
                elif reason == "already_exists":
                    stats["already_exists"] += 1
            
            stats["cosponsored_items"] += len(items)
            if stale_count > 0:
                print(f"  📄 Page {page_num}: {len(items)} items ({new_count} new, {stale_count} stale)")
            else:
                print(f"  📄 Page {page_num}: {len(items)} items ({new_count} new)")
            
            # Update checkpoint
            cosponsored_checkpoint.offset = offset + PAGE_SIZE
            cosponsored_checkpoint.last_page = page_num
            cosponsored_checkpoint.last_success_at = datetime.utcnow()
            db.commit()
            
            if not has_more:
                cosponsored_checkpoint.completed = 1
                db.commit()
                break
            
            offset += PAGE_SIZE
            page_num += 1
            time.sleep(RATE_LIMIT_DELAY)
        
        print(f"  ✅ Cosponsored complete (total: {stats['cosponsored_items']} items)")
        
    finally:
        db.close()
    
    return stats


def ingest_all_members(max_pages: Optional[int] = None, since_days: Optional[int] = DEFAULT_FRESHNESS_DAYS):
    """Ingest all tracked members."""
    print("=" * 70)
    print("INGEST ALL TRACKED MEMBERS")
    print("=" * 70)
    if since_days:
        print(f"Freshness filter: Last {since_days} days")
    else:
        print("Freshness filter: DISABLED (all bills)")
    print()
    
    # Query active tracked members from database
    db = SessionLocal()
    try:
        tracked_members = db.query(TrackedMember).filter(TrackedMember.is_active == 1).all()
        
        if not tracked_members:
            print("⚠️  No active tracked members found in database.")
            print("   Run: python manage_members.py bulk-load --preset high_impact_50")
            return
        
        print(f"📋 Found {len(tracked_members)} active tracked members")
        print()
        
        for member in tracked_members:
            person_id = member.person_id
            bioguide_id = member.bioguide_id
            
            print("=" * 70)
            print(f"INGESTING: {person_id.upper()} ({bioguide_id})")
            print("=" * 70)
            
            stats = ingest_member_full(person_id, bioguide_id, max_pages=max_pages, since_days=since_days)
            
            print()
            print(f"  📊 Summary:")
            print(f"     Sponsored: {stats['sponsored_items']} items")
            print(f"     Cosponsored: {stats['cosponsored_items']} items")
            print(f"     New links: {stats['new_links']}")
            print(f"     Already exists: {stats['already_exists']}")
            print(f"     Stale (skipped): {stats['stale_skipped']}")
            print()
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Robust Bill Ingestion v2 (PersonBill links + Freshness)")
    parser.add_argument("--person-id", help="Ingest single member (e.g., 'aoc')")
    parser.add_argument("--all", action="store_true", help="Ingest all tracked members")
    parser.add_argument("--max-pages", type=int, help="Max pages per kind (for testing)")
    parser.add_argument("--since-days", type=int, default=DEFAULT_FRESHNESS_DAYS, help=f"Only ingest bills updated in last N days (default: {DEFAULT_FRESHNESS_DAYS}, use 0 for all)")
    parser.add_argument("--no-freshness", action="store_true", help="Disable freshness filter (ingest all bills regardless of age)")
    parser.add_argument("--force-old", action="store_true", help="Allow --since-days > 180 (required for old data ingestion)")
    
    args = parser.parse_args()
    
    # Safety check: --since-days > 180 requires explicit --force-old flag
    if args.since_days and args.since_days > 180 and not args.force_old:
        print("[!] WARNING: --since-days > 180 can ingest very old bills")
        print("[!] This may bloat the database with stale legislation.")
        print("[!] If you're sure, add --force-old flag.")
        print(f"[!] Current value: --since-days {args.since_days}")
        print("[!] Recommended: --since-days 90 (default) or --since-days 180")
        sys.exit(1)
    
    # Handle freshness parameter
    since_days = None if args.no_freshness else (args.since_days if args.since_days > 0 else None)
    
    if args.person_id:
        # Query TrackedMember table for single member
        db = SessionLocal()
        try:
            member = db.query(TrackedMember).filter(TrackedMember.person_id == args.person_id).first()
            
            if not member:
                print(f"[ERROR] Unknown person_id: {args.person_id}")
                print(f"[INFO] Run: python manage_members.py list")
                sys.exit(1)
            
            if member.is_active == 0:
                print(f"[ERROR] Member is inactive: {member.display_name}")
                print(f"[INFO] Activate with: python manage_members.py activate --person-id {args.person_id}")
                sys.exit(1)
            
            bioguide_id = member.bioguide_id
        finally:
            db.close()
        
        print("=" * 70)
        print(f"INGESTING: {args.person_id.upper()} ({bioguide_id})")
        print("=" * 70)
        if since_days:
            print(f"Freshness filter: Last {since_days} days")
        else:
            print("Freshness filter: DISABLED (all bills)")
        print()
        
        stats = ingest_member_full(args.person_id, bioguide_id, max_pages=args.max_pages, since_days=since_days)
        
        print()
        print(f"  Summary:")
        print(f"     Sponsored: {stats['sponsored_items']} items")
        print(f"     Cosponsored: {stats['cosponsored_items']} items")
        print(f"     New links: {stats['new_links']}")
        print(f"     Already exists: {stats['already_exists']}")
        print(f"     Stale (skipped): {stats['stale_skipped']}")
        
    elif args.all:
        ingest_all_members(max_pages=args.max_pages, since_days=since_days)
    
    else:
        parser.print_help()
