"""
Robust Bill Ingestion System
Phase 4.1: Evidence Completeness & Authority

Features:
- Full pagination (no hardcoded limits)
- Resume/checkpoint system
- Rate limiting + retries/backoff
- Idempotent (dedupe by source_url + bill identifiers)
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
    SessionLocal, Action, SourceDocument, Bill, BillAction, IngestCheckpoint
)
from connectors.congress import (
    MEMBERS, robust_get, find_or_create_source,
    write_raw_log, HEADERS
)
from utils.normalization import (
    normalize_bill_id, compute_action_dedupe_hash,
    extract_chamber_from_action, extract_committee_from_action
)
from utils.invalidation import invalidate_claims_for_bill


# Rate limiting configuration
RATE_LIMIT_DELAY = 0.4  # seconds between requests
PAGE_SIZE = 20  # Congress.gov API page size


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


def process_bill_item_robust(db, person_id: str, bill_data: dict, action_type: str) -> bool:
    """
    Process bill item with proper idempotency.
    
    Returns:
        True if new action was created, False if skipped (already exists)
    """
    # Extract identifiers
    congress = bill_data.get("congress")
    bill_type = bill_data.get("type")
    bill_number = bill_data.get("number")
    
    if not (congress and bill_type and bill_number):
        return False
    
    # Normalize bill_id
    bill_id = normalize_bill_id(congress, bill_type, bill_number)
    
    # Check if Action already exists (idempotency check)
    exists_action = db.query(Action).filter(
        Action.person_id == person_id,
        Action.bill_congress == congress,
        Action.bill_type == bill_type,
        Action.bill_number == bill_number
    ).first()
    
    if exists_action:
        return False  # Skip, already ingested
    
    # Build source URL
    title = bill_data.get("title", "")[:250] or f"{bill_type.upper()} {bill_number}"
    bill_type_lower = bill_type.lower() if bill_type else ""
    source_url = f"https://www.congress.gov/bill/{congress}th-congress/{bill_type_lower}-bill/{bill_number}"
    
    # Find or create SourceDocument
    source = find_or_create_source(db, source_url)
    
    # Get date
    date_str = bill_data.get("introducedDate") or bill_data.get("latestAction", {}).get("actionDate")
    if date_str:
        try:
            action_date = datetime.strptime(date_str, "%Y-%m-%d")
        except:
            action_date = datetime.utcnow()
    else:
        action_date = datetime.utcnow()
    
    # Extract enrichment fields
    policy_area = None
    policy_area_obj = bill_data.get("policyArea")
    if policy_area_obj and isinstance(policy_area_obj, dict):
        policy_area = policy_area_obj.get("name")
    
    latest_action_text = None
    latest_action_date_str = None
    latest_action_obj = bill_data.get("latestAction")
    if latest_action_obj and isinstance(latest_action_obj, dict):
        latest_action_text = latest_action_obj.get("text")
        latest_action_date_str = latest_action_obj.get("actionDate")
    
    # Build metadata
    metadata = {
        "congress": congress,
        "type": bill_type,
        "number": bill_number,
        "introducedDate": bill_data.get("introducedDate"),
        "latestAction": bill_data.get("latestAction"),
        "relationship": action_type,  # 'Sponsored' or 'Cosponsored'
        "policyArea": bill_data.get("policyArea"),
    }
    
    # Create Action record
    action = Action(
        person_id=person_id,
        title=title,
        summary=f"{action_type} bill: {bill_type.upper()} {bill_number}",
        date=action_date,
        source_id=source.id,
        metadata_json=metadata,
        bill_congress=congress,
        bill_type=bill_type,
        bill_number=bill_number,
        policy_area=policy_area,
        latest_action_text=latest_action_text,
        latest_action_date=latest_action_date_str,
    )
    db.add(action)
    
    # Upsert Bill record (idempotent)
    existing_bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    
    if not existing_bill:
        latest_action_date_dt = None
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
            metadata_json=bill_data
        )
        db.add(bill_record)
        
        # Add latest action to BillAction timeline (if available)
        if latest_action_text and latest_action_date_str:
            dedupe_hash = compute_action_dedupe_hash(bill_id, latest_action_date_str, latest_action_text)
            
            existing_bill_action = db.query(BillAction).filter(
                BillAction.dedupe_hash == dedupe_hash
            ).first()
            
            if not existing_bill_action:
                action_code = latest_action_obj.get("actionCode") if latest_action_obj else None
                chamber = extract_chamber_from_action(action_code, latest_action_text)
                committee = extract_committee_from_action(latest_action_text, latest_action_obj)
                
                bill_action = BillAction(
                    bill_id=bill_id,
                    action_date=latest_action_date_dt or action_date,
                    action_text=latest_action_text,
                    action_code=action_code,
                    chamber=chamber,
                    committee=committee,
                    raw_json=latest_action_obj,
                    dedupe_hash=dedupe_hash
                )
                db.add(bill_action)
    
    try:
        db.commit()
        write_raw_log(person_id, action_type, bill_data, source_url, "added")
        return True
    except Exception as e:
        db.rollback()
        print(f"  ⚠️  Failed to save {bill_type} {bill_number}: {e}")
        return False


def ingest_member_full(
    person_id: str,
    bioguide_id: str,
    max_pages: Optional[int] = None,
    since_date: Optional[str] = None
) -> dict:
    """
    Ingest all legislation for one member with full pagination and checkpointing.
    
    Args:
        person_id: Member identifier (e.g., 'aoc')
        bioguide_id: Congress.gov bioguide ID
        max_pages: Optional page limit for testing
        since_date: Optional date filter (YYYY-MM-DD) - not yet implemented
        
    Returns:
        Dict with stats: sponsored_count, cosponsored_count, new_actions
    """
    db = SessionLocal()
    stats = {
        "sponsored_count": 0,
        "cosponsored_count": 0,
        "new_actions": 0
    }
    
    print(f"\n{'='*70}")
    print(f"INGESTING: {person_id.upper()} ({bioguide_id})")
    print(f"{'='*70}")
    
    # Process sponsored legislation
    kind = "sponsored"
    checkpoint = get_or_create_checkpoint(db, person_id, kind)
    
    if checkpoint.completed and not max_pages:
        print(f"  ✅ {kind.title()} already complete (offset: {checkpoint.offset})")
    else:
        print(f"  📥 Fetching {kind} legislation (resuming from offset {checkpoint.offset})...")
        
        offset = checkpoint.offset
        page_num = (offset // PAGE_SIZE) + 1
        
        while True:
            if max_pages and page_num > max_pages:
                print(f"  ⚠️  Reached max_pages limit ({max_pages})")
                break
            
            items, has_more = fetch_legislation_page(bioguide_id, kind, offset)
            
            if not items:
                # No more items - mark complete
                checkpoint.completed = 1
                checkpoint.last_success_at = datetime.utcnow()
                db.commit()
                print(f"  ✅ {kind.title()} complete (total offset: {offset})")
                break
            
            # Process items
            new_count = 0
            for bill in items:
                if process_bill_item_robust(db, person_id, bill, "Sponsored"):
                    new_count += 1
                    stats["new_actions"] += 1
            
            stats["sponsored_count"] += len(items)
            
            print(f"  📄 Page {page_num}: {len(items)} items ({new_count} new)")
            
            # Update checkpoint
            offset += PAGE_SIZE
            checkpoint.offset = offset
            checkpoint.last_page = page_num
            checkpoint.last_success_at = datetime.utcnow()
            db.commit()
            
            # Check if more pages exist
            if not has_more:
                checkpoint.completed = 1
                db.commit()
                print(f"  ✅ {kind.title()} complete (total: {stats['sponsored_count']} items)")
                break
            
            # Rate limiting
            time.sleep(RATE_LIMIT_DELAY)
            page_num += 1
    
    # Process cosponsored legislation
    kind = "cosponsored"
    checkpoint = get_or_create_checkpoint(db, person_id, kind)
    
    if checkpoint.completed and not max_pages:
        print(f"  ✅ {kind.title()} already complete (offset: {checkpoint.offset})")
    else:
        print(f"  📥 Fetching {kind} legislation (resuming from offset {checkpoint.offset})...")
        
        offset = checkpoint.offset
        page_num = (offset // PAGE_SIZE) + 1
        
        while True:
            if max_pages and page_num > max_pages:
                print(f"  ⚠️  Reached max_pages limit ({max_pages})")
                break
            
            items, has_more = fetch_legislation_page(bioguide_id, kind, offset)
            
            if not items:
                checkpoint.completed = 1
                checkpoint.last_success_at = datetime.utcnow()
                db.commit()
                print(f"  ✅ {kind.title()} complete (total offset: {offset})")
                break
            
            # Process items
            new_count = 0
            for bill in items:
                if process_bill_item_robust(db, person_id, bill, "Cosponsored"):
                    new_count += 1
                    stats["new_actions"] += 1
            
            stats["cosponsored_count"] += len(items)
            
            print(f"  📄 Page {page_num}: {len(items)} items ({new_count} new)")
            
            # Update checkpoint
            offset += PAGE_SIZE
            checkpoint.offset = offset
            checkpoint.last_page = page_num
            checkpoint.last_success_at = datetime.utcnow()
            db.commit()
            
            if not has_more:
                checkpoint.completed = 1
                db.commit()
                print(f"  ✅ {kind.title()} complete (total: {stats['cosponsored_count']} items)")
                break
            
            time.sleep(RATE_LIMIT_DELAY)
            page_num += 1
    
    db.close()
    
    print(f"\n  📊 Summary:")
    print(f"     Sponsored: {stats['sponsored_count']} items")
    print(f"     Cosponsored: {stats['cosponsored_count']} items")
    print(f"     New actions: {stats['new_actions']}")
    
    return stats


def ingest_all_members(max_pages: Optional[int] = None):
    """Ingest all tracked members."""
    print("="*70)
    print("INGEST ALL TRACKED MEMBERS")
    print("="*70)
    
    total_stats = {
        "sponsored_count": 0,
        "cosponsored_count": 0,
        "new_actions": 0
    }
    
    for person_id, bioguide_id in MEMBERS.items():
        stats = ingest_member_full(person_id, bioguide_id, max_pages=max_pages)
        total_stats["sponsored_count"] += stats["sponsored_count"]
        total_stats["cosponsored_count"] += stats["cosponsored_count"]
        total_stats["new_actions"] += stats["new_actions"]
    
    print(f"\n{'='*70}")
    print("TOTAL SUMMARY:")
    print(f"  Sponsored: {total_stats['sponsored_count']}")
    print(f"  Cosponsored: {total_stats['cosponsored_count']}")
    print(f"  New actions: {total_stats['new_actions']}")
    print("="*70)


def reset_checkpoint(person_id: str, kind: Optional[str] = None):
    """Reset checkpoint for a member (for re-ingestion)."""
    db = SessionLocal()
    
    if kind:
        db.query(IngestCheckpoint).filter(
            IngestCheckpoint.person_id == person_id,
            IngestCheckpoint.kind == kind
        ).delete()
        print(f"✅ Reset checkpoint: {person_id} / {kind}")
    else:
        db.query(IngestCheckpoint).filter(
            IngestCheckpoint.person_id == person_id
        ).delete()
        print(f"✅ Reset all checkpoints for {person_id}")
    
    db.commit()
    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Robust Bill Ingestion")
    parser.add_argument("--person-id", help="Ingest specific member (e.g., 'aoc')")
    parser.add_argument("--all", action="store_true", help="Ingest all tracked members")
    parser.add_argument("--max-pages", type=int, help="Limit pages for testing")
    parser.add_argument("--reset", action="store_true", help="Reset checkpoint before ingesting")
    parser.add_argument("--kind", choices=["sponsored", "cosponsored"], help="Reset specific kind")
    
    args = parser.parse_args()
    
    if args.reset and args.person_id:
        reset_checkpoint(args.person_id, args.kind)
    
    if args.all:
        ingest_all_members(max_pages=args.max_pages)
    elif args.person_id:
        if args.person_id not in MEMBERS:
            print(f"❌ Unknown person_id: {args.person_id}")
            print(f"   Available: {', '.join(MEMBERS.keys())}")
            sys.exit(1)
        
        bioguide_id = MEMBERS[args.person_id]
        ingest_member_full(args.person_id, bioguide_id, max_pages=args.max_pages)
    else:
        parser.print_help()
