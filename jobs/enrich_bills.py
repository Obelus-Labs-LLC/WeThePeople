"""
Bill Enrichment Job - Core Loop
Fetches full bill details + timeline from Congress.gov API
Populates Bill and BillAction tables with proper deduplication
"""

import os
import sys
import time
import json
from datetime import datetime
from typing import List, Tuple, Optional
from sqlalchemy import distinct, or_, func
import requests
from requests.exceptions import Timeout, ConnectionError, RequestException

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Action, Bill, BillAction, ClaimEvaluation
from jobs.enrich_actions import (
    fetch_bill_details,
    upsert_bill,
    ingest_bill_actions
)
from utils.normalization import normalize_bill_id


STATE_FILE = os.path.join(os.path.dirname(__file__), "enrich_bills_state.json")


def load_state() -> dict:
    """Load resume state from state file."""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {
        "last_run_started_at": None,
        "last_run_finished_at": None,
        "last_processed_bill_id": None,
        "successes": 0,
        "failures": 0
    }


def save_state(state: dict):
    """Save resume state to state file."""
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        print(f"Warning: Failed to save state: {e}")


def retry_with_backoff(func, max_retries=5, max_backoff=20):
    """Retry function with exponential backoff.
    
    Retries on: timeouts, connection errors, HTTP 429, 500, 502, 503, 504.
    Backoff: 1s, 2s, 4s, 8s, 16s (cap at 20s).
    
    Args:
        func: Function to call (should return dict with 'success' key)
        max_retries: Maximum retry attempts
        max_backoff: Maximum backoff time in seconds
    
    Returns:
        Result dict from func or error dict
    """
    last_error = None
    
    for attempt in range(max_retries):
        try:
            result = func()
            # If we got a result, return it
            if result is not None:
                return result
            # If None, treat as transient error
            last_error = "Function returned None"
        except (Timeout, ConnectionError) as e:
            last_error = f"Network error: {type(e).__name__}: {str(e)}"
        except RequestException as e:
            # Check if it's a retryable HTTP error
            if hasattr(e, 'response') and e.response is not None:
                status_code = e.response.status_code
                if status_code in [429, 500, 502, 503, 504]:
                    last_error = f"HTTP {status_code}: {str(e)}"
                else:
                    # Non-retryable HTTP error
                    return {"success": False, "error": f"HTTP {status_code}: {str(e)}"}
            else:
                last_error = f"Request error: {str(e)}"
        except Exception as e:
            # Non-retryable exception
            return {"success": False, "error": f"Unexpected error: {str(e)}"}
        
        # Calculate backoff (1s, 2s, 4s, 8s, 16s, capped at max_backoff)
        if attempt < max_retries - 1:
            backoff = min(2 ** attempt, max_backoff)
            print(f"  Retry {attempt + 1}/{max_retries} after {backoff}s (error: {last_error})")
            time.sleep(backoff)
    
    # All retries exhausted
    return {"success": False, "error": f"Max retries exceeded: {last_error}"}


def compute_status_bucket(bill_actions: List[BillAction]) -> tuple[str, str]:
    from services.enrichment.bill_timeline import compute_status_bucket as _compute

    return _compute(bill_actions)


def get_bills_to_enrich(db, limit: int = None, only_needs_enrichment: bool = True) -> List[Tuple[int, str, int]]:
    """
    Get list of bills that need enrichment.
    
    NEW BEHAVIOR (PersonBill system):
    - Query Bill.needs_enrichment == 1 (set by ingest_robust_v2.py)
    - Optionally include bills missing key fields (policy_area, status_bucket)
    
    Args:
        db: Database session
        limit: Maximum number of bills to return
        only_needs_enrichment: If True, only process bills with needs_enrichment=1
    
    Returns:
        List of (congress, bill_type, bill_number) tuples
    """
    # Base query: bills needing enrichment
    query = db.query(
        Bill.congress,
        Bill.bill_type,
        Bill.bill_number
    )
    
    if only_needs_enrichment:
        # Primary filter: needs_enrichment flag
        query = query.filter(Bill.needs_enrichment == 1)
    else:
        # Fallback: bills missing key enrichment fields
        query = query.filter(
            or_(
                Bill.needs_enrichment == 1,
                Bill.status_bucket.is_(None),
                Bill.policy_area.is_(None)
            )
        )
    
    # Sort by congress (newest first)
    query = query.order_by(Bill.congress.desc())
    
    # Apply limit
    if limit:
        query = query.limit(limit)
    
    # Execute query
    bills = query.all()
    
    return [(congress, bill_type, bill_number) for congress, bill_type, bill_number in bills]


def enrich_bill(congress: int, bill_type: str, bill_number: int, db) -> dict:
    """
    Enrich a single bill with full details and timeline.
    
    Execution steps:
    1. Fetch bill detail from API
    2. Upsert Bill summary
    3. Ingest BillAction timeline
    4. Compute status bucket
    5. Update derived fields
    
    Args:
        congress: Congress number
        bill_type: Bill type (HR, S, etc.)
        bill_number: Bill number
        db: Database session
    
    Returns:
        Dict with enrichment results {success, actions_inserted, status}
    """
    result = {
        "success": False,
        "actions_inserted": 0,
        "status_bucket": None,
        "error": None
    }
    
    try:
        # 1. Fetch bill details from API with retry
        def fetch_fn():
            return fetch_bill_details(congress, bill_type, bill_number)
        
        bill_data = retry_with_backoff(fetch_fn)
        
        # Handle retry failure
        if isinstance(bill_data, dict) and not bill_data.get("success", True):
            result["error"] = bill_data.get("error", "Unknown fetch error")
            return result
        
        if not bill_data:
            result["error"] = "Failed to fetch bill data from API"
            return result
        
        # 2. Upsert Bill summary
        bill = upsert_bill(congress, bill_type, bill_number, bill_data, db)
        
        # 3. Ingest BillAction timeline (with retry)
        actions_inserted = retry_with_backoff(
            lambda: ingest_bill_actions(
                bill.bill_id,
                congress,
                bill_type,
                bill_number,
                db
            )
        )
        result["actions_inserted"] = actions_inserted
        
        # 4. Fetch all actions for status computation
        bill_actions = db.query(BillAction).filter(
            BillAction.bill_id == bill.bill_id
        ).order_by(BillAction.action_date.desc()).all()
        
        # 5. Compute status bucket
        status_bucket, status_reason = compute_status_bucket(bill_actions)
        bill.status_bucket = status_bucket
        bill.status_reason = status_reason
        result["status_bucket"] = status_bucket
        
        # 6. Compute latest action (max by date, if tie use last)
        if bill_actions:
            latest = bill_actions[0]  # Already sorted desc
            bill.latest_action_text = latest.action_text
            bill.latest_action_date = latest.action_date
        
        # 7. Clear needs_enrichment flag (bill is now enriched)
        bill.needs_enrichment = 0
        
        # 8. Mark updated
        bill.updated_at = datetime.utcnow()
        
        db.commit()
        result["success"] = True
        
        # 8. Invalidate affected claims (mark for recomputation)
        # This ensures evaluation cache is refreshed when bill lifecycle changes
        try:
            from utils.invalidation import invalidate_claims_for_bill
            invalidated_count = invalidate_claims_for_bill(congress, bill_type, bill_number, db)
            result["claims_invalidated"] = invalidated_count
        except Exception as e:
            # Don't fail enrichment if invalidation fails
            result["invalidation_error"] = str(e)
        
    except Exception as e:
        db.rollback()
        result["error"] = str(e)
    
    return result


def run_enrichment_batch(
    batch_size: int = 100,
    rate_limit_delay: float = 0.3,
    only_needs_enrichment: bool = True,
    max_seconds: Optional[int] = None
):
    """
    Run enrichment job on a batch of bills.
    
    Batch strategy:
    - Query bills with needs_enrichment=1 (set by ingest_robust_v2.py)
    - Chunk bills (configurable batch size)
    - Sleep/backoff for rate limits
    - Detailed logging per bill
    - Track success/failure counts
    - Clear needs_enrichment flag after successful enrichment
    - Graceful stop on max_seconds
    - Resume state tracking
    
    Args:
        batch_size: Number of bills to enrich in this run
        rate_limit_delay: Seconds to wait between API calls
        only_needs_enrichment: If True, only process bills with needs_enrichment=1
        max_seconds: Optional time limit in seconds (graceful stop)
    """
    db = SessionLocal()
    state = load_state()
    start_time = time.time()
    state["last_run_started_at"] = datetime.utcnow().isoformat()
    
    try:
        # Get bills to enrich
        print("="*70)
        print("BILL ENRICHMENT JOB")
        print("="*70)
        print(f"Batch size: {batch_size}")
        print(f"Rate limit delay: {rate_limit_delay}s")
        print(f"Only needs_enrichment: {only_needs_enrichment}")
        print()
        
        bills = get_bills_to_enrich(db, limit=batch_size, only_needs_enrichment=only_needs_enrichment)
        
        if not bills:
            print("✅ No bills need enrichment!")
            return
        
        print(f"📋 Found {len(bills)} bills to enrich\n")
        
        # Track stats
        stats = {
            "success": 0,
            "failed": 0,
            "skipped": 0,
            "total_actions_inserted": 0,
            "status_buckets": {}
        }
        
        # Process each bill with per-bill exception handling
        for i, (congress, bill_type, bill_number) in enumerate(bills, 1):
            bill_id = normalize_bill_id(congress, bill_type, bill_number)
            
            # Check time limit
            if max_seconds and (time.time() - start_time) > max_seconds:
                print(f"\nGraceful stop: max-seconds reached")
                break
            
            remaining = len(bills) - i
            print(f"[{i}/{len(bills)}] {bill_id.upper()} (remaining: {remaining})")
            print(f"  └─ Fetching from Congress.gov...")
            
            try:
                # Enrich bill (with internal retry logic)
                result = enrich_bill(congress, bill_type, bill_number, db)
                
                if result["success"]:
                    stats["success"] += 1
                    state["successes"] = state.get("successes", 0) + 1
                    stats["total_actions_inserted"] += result["actions_inserted"]
                    
                    status = result["status_bucket"]
                    stats["status_buckets"][status] = stats["status_buckets"].get(status, 0) + 1
                    
                    print(f"  └─ Success")
                    print(f"     ├─ Actions inserted: {result['actions_inserted']}")
                    print(f"     └─ Status: {status}")
                else:
                    stats["failed"] += 1
                    state["failures"] = state.get("failures", 0) + 1
                    print(f"  └─ Failed: {result['error']}")
                    # Keep needs_enrichment=1 for failed bills so they retry next run
                    
            except Exception as e:
                # Catch-all: never crash the batch
                stats["skipped"] += 1
                state["failures"] = state.get("failures", 0) + 1
                print(f"  └─ Exception (skipped): {str(e)}")
                db.rollback()
            
            # Update state after each bill
            state["last_processed_bill_id"] = bill_id
            save_state(state)
            
            # Rate limiting
            if i < len(bills):  # Don't sleep after last bill
                time.sleep(rate_limit_delay)
            
            # Extra pause every 10 bills
            if i % 10 == 0 and i < len(bills):
                print(f"\n  Pausing 2s after {i} bills...\n")
                time.sleep(2)
        
        # Print summary
        print("\n" + "="*70)
        print("ENRICHMENT SUMMARY")
        print("="*70)
        print(f"Total bills attempted: {i}")
        print(f"  Success: {stats['success']}")
        print(f"  Failed: {stats['failed']}")
        print(f"  Skipped (exception): {stats['skipped']}")
        print(f"  Total actions inserted: {stats['total_actions_inserted']}")
        print()
        print("Status Distribution:")
        for status, count in sorted(stats["status_buckets"].items()):
            print(f"  - {status}: {count}")
        
        # Check remaining needs_enrichment count
        remaining_needs_enrichment = db.query(Bill).filter(Bill.needs_enrichment == 1).count()
        print()
        print(f"[!] REMAINING NEEDS ENRICHMENT: {remaining_needs_enrichment}")
        if remaining_needs_enrichment > 0:
            print(f"[ACTION] Run again with: python jobs/enrich_bills.py --limit {remaining_needs_enrichment}")
        else:
            print("[OK] All bills enriched!")
        
        print("="*70)
        
        # Update final state
        state["last_run_finished_at"] = datetime.utcnow().isoformat()
        save_state(state)
        
    finally:
        db.close()


def verify_enrichment_coverage():
    """Print statistics on enrichment coverage."""
    db = SessionLocal()
    
    try:
        # Bill table stats
        total_bills = db.query(Bill).count()
        bills_with_status = db.query(Bill).filter(Bill.status_bucket.isnot(None)).count()
        bills_with_policy = db.query(Bill).filter(Bill.policy_area.isnot(None)).count()
        
        # BillAction stats
        total_actions = db.query(BillAction).count()
        bills_with_actions = db.query(
            distinct(BillAction.bill_id)
        ).count()
        
        # Action table stats (old evidence table)
        total_evidence = db.query(Action).filter(
            Action.bill_congress.isnot(None)
        ).count()
        
        print("\n" + "="*70)
        print("ENRICHMENT COVERAGE REPORT")
        print("="*70)
        print(f"\n📋 Bill Table:")
        print(f"  Total bills: {total_bills}")
        print(f"  With status_bucket: {bills_with_status} ({bills_with_status/total_bills*100 if total_bills else 0:.1f}%)")
        print(f"  With policy_area: {bills_with_policy} ({bills_with_policy/total_bills*100 if total_bills else 0:.1f}%)")
        
        print(f"\n📅 BillAction Table:")
        print(f"  Total actions: {total_actions}")
        print(f"  Bills with actions: {bills_with_actions}")
        print(f"  Avg actions/bill: {total_actions/bills_with_actions if bills_with_actions else 0:.1f}")
        
        print(f"\n🎯 Action Table (Evidence):")
        print(f"  Total actions with bills: {total_evidence}")
        
        # Status distribution
        status_counts = db.query(
            Bill.status_bucket,
            func.count(Bill.bill_id)
        ).group_by(Bill.status_bucket).all()
        
        if status_counts:
            print(f"\n📊 Status Distribution:")
            for status, count in sorted(status_counts, key=lambda x: x[1], reverse=True):
                print(f"  - {status or 'NULL'}: {count}")
        
        # Show remaining needs_enrichment count
        remaining_needs_enrichment = db.query(Bill).filter(Bill.needs_enrichment == 1).count()
        print(f"\n[!] REMAINING NEEDS ENRICHMENT: {remaining_needs_enrichment}")
        if remaining_needs_enrichment > 0:
            print(f"[ACTION] Run again with: python jobs/enrich_bills.py --limit {remaining_needs_enrichment}")
        else:
            print("[OK] All bills enriched!")
        
        print("="*70 + "\n")
        
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Bill Enrichment Job (PersonBill system)")
    parser.add_argument("--limit", type=int, help="Max bills to process (default: 25 if --only-needs-enrichment, else 50)")
    parser.add_argument("--only-needs-enrichment", action="store_true", default=True, help="Only process bills with needs_enrichment=1 (default: True)")
    parser.add_argument("--all", action="store_true", help="Process all bills missing enrichment fields (ignores needs_enrichment flag)")
    parser.add_argument("--rate-limit", type=float, default=0.3, help="Delay between API calls in seconds (default: 0.3)")
    parser.add_argument("--max-seconds", type=int, help="Gracefully stop after this many seconds")
    
    args = parser.parse_args()
    
    # --all overrides --only-needs-enrichment
    only_needs_enrichment = not args.all
    
    # Set default limit based on mode
    limit = args.limit
    if limit is None:
        limit = 25 if only_needs_enrichment else 50
    
    # Run enrichment
    run_enrichment_batch(
        batch_size=limit,
        rate_limit_delay=args.rate_limit,
        only_needs_enrichment=only_needs_enrichment,
        max_seconds=args.max_seconds
    )
    
    # Show coverage report
    verify_enrichment_coverage()
