"""
Action Enrichment Job
Populates policy_area, latest_action_text, latest_action_date from Congress.gov API.

This replaces reliance on metadata_json with fresh API data.
"""

import os
import sys
import requests
import time
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import or_

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Action, Bill, BillAction
from utils.normalization import (
    normalize_bill_id,
    compute_action_dedupe_hash,
    extract_chamber_from_action,
    extract_committee_from_action
)

load_dotenv()
API_KEY = os.getenv("API_KEY_CONGRESS")
BASE_URL = "https://api.congress.gov/v3"


def fetch_bill_details(congress: int, bill_type: str, bill_number: int, retries: int = 3) -> dict:
    """
    Fetch full bill details from Congress.gov API.
    
    Args:
        congress: Congress number (118, 119, etc.)
        bill_type: Bill type (HR, S, HJRES, SJRES, etc.)
        bill_number: Bill number
        retries: Number of retry attempts for rate limits
        
    Returns:
        Bill detail dictionary or None if failed
    """
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}"
    params = {
        "api_key": API_KEY,
        "format": "json",
    }
    
    for attempt in range(retries):
        try:
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                return data.get("bill")
            
            # Rate limit or server error - retry with backoff
            if response.status_code in [429, 500, 503]:
                wait_time = (2 ** attempt) * 0.5
                print(f"  ⚠️  Status {response.status_code}, retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            
            # Other errors - return None
            if response.status_code == 404:
                print(f"  ❌ Bill not found: {congress}/{bill_type}/{bill_number}")
                return None
            
            print(f"  ❌ Error {response.status_code} fetching {congress}/{bill_type}/{bill_number}")
            return None
            
        except Exception as e:
            print(f"  ❌ Exception fetching bill: {e}")
            return None
    
    return None


def fetch_bill_text_versions(congress: int, bill_type: str, bill_number: int, retries: int = 3) -> list:
    """
    Fetch available text versions for a bill (ENR, IH, RH, etc.).
    
    Args:
        congress: Congress number
        bill_type: Bill type
        bill_number: Bill number
        retries: Number of retry attempts
        
    Returns:
        List of text version dictionaries with type, date, and URLs
    """
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/text"
    params = {
        "api_key": API_KEY,
        "format": "json",
    }
    
    for attempt in range(retries):
        try:
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                versions = data.get("textVersions", [])
                
                # Extract key info from each version
                text_versions = []
                for version in versions:
                    text_versions.append({
                        "type": version.get("type"),  # ENR, IH, RH, etc.
                        "date": version.get("date"),
                        "formats": version.get("formats", []),  # PDF, XML, HTML
                    })
                
                return text_versions
            
            # Rate limit or server error - retry with backoff
            if response.status_code in [429, 500, 503]:
                wait_time = (2 ** attempt) * 0.5
                time.sleep(wait_time)
                continue
            
            # 404 likely means no text versions available yet
            if response.status_code == 404:
                return []
            
            return []
            
        except Exception as e:
            print(f"  ⚠️  Exception fetching text versions: {e}")
            return []
    
    return []


def upsert_bill(congress: int, bill_type: str, bill_number: int, bill_data: dict, db) -> Bill:
    """
    Create or update Bill record with normalized bill_id.
    
    Args:
        congress: Congress number
        bill_type: Bill type (HR, S, etc.)
        bill_number: Bill number
        bill_data: Full bill data from Congress.gov API
        db: Database session
        
    Returns:
        Bill object (created or updated)
    """
    # Normalize bill_id (deterministic format)
    bill_id = normalize_bill_id(congress, bill_type, bill_number)
    
    # Check if bill exists
    bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
    
    if not bill:
        # Create new bill
        bill = Bill(
            bill_id=bill_id,
            congress=congress,
            bill_type=bill_type.lower(),
            bill_number=bill_number
        )
        db.add(bill)
    
    # Update metadata from API
    if "title" in bill_data:
        bill.title = bill_data["title"]
    
    policy_area_obj = bill_data.get("policyArea")
    if policy_area_obj and isinstance(policy_area_obj, dict):
        bill.policy_area = policy_area_obj.get("name")
    
    latest_action_obj = bill_data.get("latestAction")
    if latest_action_obj and isinstance(latest_action_obj, dict):
        bill.latest_action_text = latest_action_obj.get("text")
        action_date_str = latest_action_obj.get("actionDate")
        if action_date_str:
            try:
                bill.latest_action_date = datetime.strptime(action_date_str, "%Y-%m-%d")
            except ValueError:
                pass
    
    # Store full metadata
    bill.metadata_json = bill_data
    
    db.commit()
    return bill


def ingest_bill_actions(bill_id: str, congress: int, bill_type: str, bill_number: int, db) -> int:
    """
    Fetch and ingest all actions for a bill.
    Uses deduplication to prevent duplicate actions.
    
    Args:
        bill_id: Normalized bill identifier
        congress: Congress number
        bill_type: Bill type
        bill_number: Bill number
        db: Database session
        
    Returns:
        Number of new actions ingested
    """
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/actions"
    params = {
        "api_key": API_KEY,
        "format": "json",
    }
    
    try:
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            return 0
        
        data = response.json()
        actions_list = data.get("actions", [])
        
        new_count = 0
        seen_hashes = set()  # Track hashes within this batch
        
        for action_item in actions_list:
            # Extract action details
            action_date_str = action_item.get("actionDate")
            action_text = action_item.get("text", "")
            action_code = action_item.get("actionCode")
            
            if not action_date_str or not action_text:
                continue
            
            # Compute dedupe hash
            dedupe_hash = compute_action_dedupe_hash(bill_id, action_date_str, action_text)
            
            # Skip if we've already seen this hash in this batch
            if dedupe_hash in seen_hashes:
                continue
            
            # Check if action already exists in database
            existing = db.query(BillAction).filter(BillAction.dedupe_hash == dedupe_hash).first()
            if existing:
                continue
            
            # Parse action_date
            try:
                action_date = datetime.strptime(action_date_str, "%Y-%m-%d")
            except ValueError:
                continue
            
            # Extract chamber/committee (conservative - only if explicit)
            chamber = extract_chamber_from_action(action_code, action_text)
            committee = extract_committee_from_action(action_text, action_item)
            
            # Create BillAction
            bill_action = BillAction(
                bill_id=bill_id,
                action_date=action_date,
                action_text=action_text,
                action_code=action_code,
                chamber=chamber,
                committee=committee,
                raw_json=action_item,
                dedupe_hash=dedupe_hash
            )
            
            db.add(bill_action)
            seen_hashes.add(dedupe_hash)
            new_count += 1
        
        # Commit all new actions at once
        try:
            db.commit()
        except Exception as commit_error:
            # Handle unique constraint violations gracefully
            db.rollback()
            print(f"  ⚠️  Some actions already existed (dedupe working): {commit_error}")
            new_count = 0
        
        return new_count
        
    except Exception as e:
        print(f"  ⚠️  Exception fetching bill actions: {e}")
        db.rollback()
        return 0


def enrich_action(action: Action, db) -> bool:
    """
    Enrich a single action with policy_area and latest_action data.
    
    Args:
        action: Action object to enrich
        db: Database session
        
    Returns:
        True if enrichment succeeded, False otherwise
    """
    if not (action.bill_congress and action.bill_type and action.bill_number):
        print(f"  ⚠️  Action {action.id} missing bill identifiers, skipping")
        return False
    
    # Fetch bill details from API
    bill_data = fetch_bill_details(action.bill_congress, action.bill_type, action.bill_number)
    
    if not bill_data:
        return False
    
    # Extract policy area (still populate Action table for backwards compatibility)
    policy_area_obj = bill_data.get("policyArea")
    if policy_area_obj and isinstance(policy_area_obj, dict):
        action.policy_area = policy_area_obj.get("name")
    
    # Extract latest action (still populate Action table for backwards compatibility)
    latest_action_obj = bill_data.get("latestAction")
    if latest_action_obj and isinstance(latest_action_obj, dict):
        action.latest_action_text = latest_action_obj.get("text")
        action_date_str = latest_action_obj.get("actionDate")
        if action_date_str:
            action.latest_action_date = action_date_str
    
    # Upsert Bill record
    bill = upsert_bill(
        action.bill_congress,
        action.bill_type,
        action.bill_number,
        bill_data,
        db
    )
    
    # Ingest BillAction timeline
    new_actions = ingest_bill_actions(
        bill.bill_id,
        action.bill_congress,
        action.bill_type,
        action.bill_number,
        db
    )
    
    if new_actions > 0:
        print(f"    ➕ Ingested {new_actions} bill actions")
    
    # Don't commit again - ingest_bill_actions already committed
    return True


def enrich_missing_actions(batch_size: int = 100, max_actions: int = None):
    """
    Enrich all actions missing policy_area or latest_action_text.
    
    Args:
        batch_size: Number of actions to enrich before committing
        max_actions: Maximum number of actions to enrich (None = all)
    """
    db = SessionLocal()
    
    try:
        # Query actions missing enrichment data
        query = db.query(Action).filter(
            or_(
                Action.policy_area.is_(None),
                Action.latest_action_text.is_(None)
            )
        )
        
        if max_actions:
            query = query.limit(max_actions)
        
        actions = query.all()
        
        print(f"🔍 Found {len(actions)} actions needing enrichment")
        
        if not actions:
            print("✅ All actions already enriched!")
            return
        
        enriched_count = 0
        failed_count = 0
        
        for i, action in enumerate(actions, 1):
            print(f"\n[{i}/{len(actions)}] Enriching action {action.id}: {action.bill_type} {action.bill_number} ({action.bill_congress}th)")
            
            success = enrich_action(action, db)
            
            if success:
                enriched_count += 1
                print(f"  ✅ Enriched: policy_area={action.policy_area}, latest_action_date={action.latest_action_date}")
            else:
                failed_count += 1
            
            # Rate limiting: small delay between requests
            if i % 10 == 0:
                print(f"  ⏸️  Pausing briefly to respect rate limits...")
                time.sleep(1)
        
        print(f"\n{'='*60}")
        print(f"✅ Enrichment complete!")
        print(f"  - Enriched: {enriched_count}")
        print(f"  - Failed: {failed_count}")
        print(f"  - Total processed: {len(actions)}")
        print(f"{'='*60}")
        
    finally:
        db.close()


def verify_enrichment():
    """Print statistics on enrichment coverage."""
    db = SessionLocal()
    
    try:
        total_actions = db.query(Action).count()
        
        with_policy_area = db.query(Action).filter(Action.policy_area.isnot(None)).count()
        with_latest_action = db.query(Action).filter(Action.latest_action_text.isnot(None)).count()
        with_latest_date = db.query(Action).filter(Action.latest_action_date.isnot(None)).count()
        
        print(f"\n{'='*60}")
        print(f"ENRICHMENT COVERAGE")
        print(f"{'='*60}")
        print(f"Total actions: {total_actions}")
        print(f"  - With policy_area: {with_policy_area} ({with_policy_area/total_actions*100:.1f}%)")
        print(f"  - With latest_action_text: {with_latest_action} ({with_latest_action/total_actions*100:.1f}%)")
        print(f"  - With latest_action_date: {with_latest_date} ({with_latest_date/total_actions*100:.1f}%)")
        print(f"{'='*60}\n")
        
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Enrich actions with Congress.gov API data")
    parser.add_argument("--verify", action="store_true", help="Show enrichment statistics only")
    parser.add_argument("--limit", type=int, help="Limit number of actions to enrich")
    parser.add_argument("--batch-size", type=int, default=100, help="Batch size for commits")
    
    args = parser.parse_args()
    
    if args.verify:
        verify_enrichment()
    else:
        enrich_missing_actions(batch_size=args.batch_size, max_actions=args.limit)
        verify_enrichment()
