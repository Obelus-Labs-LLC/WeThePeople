"""
Sync Member Bill Ground Truth

Fetches member sponsored/cosponsored bills from Congress.gov API v3
and stores in member_bills_groundtruth table.

This creates the "ground truth rail" - an authoritative list of bills
each member actually sponsored/cosponsored, used to constrain matching.

Uses bioguide_id as canonical identity (not person_id).

Usage:
    python jobs/sync_member_groundtruth.py --bioguide O000172 --congress 119
    python jobs/sync_member_groundtruth.py --bioguide S000148 --congress 119 --role sponsored
"""

import argparse
import sys
import time
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment variables from .env
load_dotenv()

from models.database import SessionLocal, MemberBillGroundTruth, TrackedMember
import requests
from sqlalchemy.exc import IntegrityError


# Congress.gov API v3 base URL
CONGRESS_API_BASE = "https://api.congress.gov/v3"


def fetch_member_bills(bioguide_id: str, congress: int, role: str = "both", api_key: str = None, rate_limit: float = 1.0):
    """
    Fetch bills for a member from Congress.gov API v3.
    
    Args:
        bioguide_id: Member bioguide ID (e.g., "O000172" for AOC)
        congress: Congress number (e.g., 119)
        role: "sponsored", "cosponsored", or "both"
        api_key: Congress.gov API key (optional - has rate limits without)
        rate_limit: Delay between requests in seconds
    
    Returns:
        List of (bill_id, role) tuples
    """
    bills = []
    
    roles_to_fetch = []
    if role in ["sponsored", "both"]:
        roles_to_fetch.append("sponsored")
    if role in ["cosponsored", "both"]:
        roles_to_fetch.append("cosponsored")
    
    for fetch_role in roles_to_fetch:
        print(f"\nFetching {fetch_role} bills for {bioguide_id} in Congress {congress}...")
        
        offset = 0
        limit = 250  # API max
        total_fetched = 0
        
        while True:
            # Build API URL
            # Example: https://api.congress.gov/v3/member/O000172/sponsored-legislation?congress=119&limit=250&offset=0
            endpoint = f"/member/{bioguide_id}/{fetch_role}-legislation"
            url = f"{CONGRESS_API_BASE}{endpoint}"
            
            params = {
                "congress": congress,
                "limit": limit,
                "offset": offset,
                "format": "json"
            }
            
            if api_key:
                params["api_key"] = api_key
            
            print(f"  Fetching offset {offset}...", end=" ")
            
            try:
                response = requests.get(url, params=params, timeout=30)
                
                # Check for missing API key
                if response.status_code == 403:
                    print(f"\n❌ 403 Forbidden - API key required")
                    print(f"\nCongress.gov API v3 requires an API key.")
                    print(f"Get your free API key at: https://api.congress.gov/sign-up/")
                    print(f"\nUsage: python jobs/sync_member_groundtruth.py --bioguide {bioguide_id} --congress {congress} --api-key YOUR_KEY")
                    raise Exception("Congress.gov API key required")
                
                # Check rate limiting
                if response.status_code == 429:
                    print(f"Rate limited, waiting 60s...")
                    time.sleep(60)
                    continue
                
                response.raise_for_status()
                data = response.json()
                
                # Extract bills from response
                legislation = data.get("sponsoredLegislation" if fetch_role == "sponsored" else "cosponsoredLegislation", [])
                
                if not legislation:
                    print(f"No more bills")
                    break
                
                for item in legislation:
                    # Extract bill info
                    bill_type = item.get("type")
                    bill_number = item.get("number")
                    bill_congress = item.get("congress")
                    
                    if bill_type and bill_number and bill_congress:
                        bill_id = f"{bill_type.lower()}{bill_number}-{bill_congress}"
                        bills.append((bill_id, fetch_role))
                
                fetched_count = len(legislation)
                total_fetched += fetched_count
                print(f"Got {fetched_count} bills (total: {total_fetched})")
                
                # Check if we've fetched all
                pagination = data.get("pagination", {})
                total_count = pagination.get("count", 0)
                
                if total_fetched >= total_count or fetched_count < limit:
                    print(f"  ✓ Fetched all {total_fetched} {fetch_role} bills")
                    break
                
                offset += limit
                time.sleep(rate_limit)
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 404:
                    print(f"No {fetch_role} bills found (404)")
                    break
                else:
                    print(f"HTTP error: {e}")
                    raise
            except Exception as e:
                print(f"Error: {e}")
                raise
    
    return bills


def sync_groundtruth(bioguide_id: str, congress: int, role: str = "both", api_key: str = None, rate_limit: float = 1.0, dry_run: bool = False):
    """
    Sync member bill ground truth from Congress.gov API.
    
    Fetches bills and stores in member_bills_groundtruth table.
    """
    print("=" * 80)
    print("SYNC MEMBER BILL GROUND TRUTH")
    print("=" * 80)
    print(f"Bioguide ID: {bioguide_id}")
    print(f"Congress: {congress}")
    print(f"Role: {role}")
    print(f"Dry run: {dry_run}")
    print()
    
    # Fetch bills from API
    bills = fetch_member_bills(bioguide_id, congress, role, api_key, rate_limit)
    
    if not bills:
        print("\n❌ No bills found")
        return
    
    print(f"\n✓ Fetched {len(bills)} bill relationships")
    
    # Group by role
    by_role = {}
    for bill_id, bill_role in bills:
        by_role.setdefault(bill_role, []).append(bill_id)
    
    for bill_role, bill_ids in by_role.items():
        print(f"  {bill_role}: {len(bill_ids)} bills")
    
    if dry_run:
        print("\n[DRY RUN] Would insert into database:")
        for bill_id, bill_role in bills[:5]:
            print(f"  {bioguide_id} + {bill_id} ({bill_role})")
        if len(bills) > 5:
            print(f"  ... and {len(bills) - 5} more")
        return
    
    # Insert into database
    print("\nInserting into member_bills_groundtruth...")
    db = SessionLocal()
    
    try:
        inserted = 0
        duplicates = 0
        
        for bill_id, bill_role in bills:
            # Check if already exists
            existing = db.query(MemberBillGroundTruth).filter(
                MemberBillGroundTruth.bioguide_id == bioguide_id,
                MemberBillGroundTruth.bill_id == bill_id,
                MemberBillGroundTruth.role == bill_role
            ).first()
            
            if existing:
                # Update fetched_at
                existing.fetched_at = datetime.now()
                duplicates += 1
            else:
                # Insert new
                record = MemberBillGroundTruth(
                    bioguide_id=bioguide_id,
                    bill_id=bill_id,
                    role=bill_role,
                    source="congress.gov.api.v3"
                )
                db.add(record)
                inserted += 1
        
        db.commit()
        
        print(f"\n✓ Inserted: {inserted}")
        print(f"  Updated: {duplicates}")
        print(f"  Total: {inserted + duplicates}")
        
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description='Sync member bill ground truth from Congress.gov API')
    
    # Identity options (mutually exclusive)
    identity_group = parser.add_mutually_exclusive_group(required=True)
    identity_group.add_argument('--bioguide', help='Member bioguide ID (e.g., O000172 for AOC)')
    identity_group.add_argument('--person-id', help='Member person_id (e.g., alexandria_ocasio_cortez)')
    identity_group.add_argument('--all-active', action='store_true',
                               help='Sync all active tracked members')
    
    parser.add_argument('--congress', type=int, required=True, help='Congress number (e.g., 119)')
    parser.add_argument('--role', default='both', choices=['sponsored', 'cosponsored', 'both'],
                       help='Which bills to fetch')
    parser.add_argument('--rate-limit', type=float, default=1.0,
                       help='Delay between API requests in seconds')
    parser.add_argument('--dry-run', action='store_true',
                       help='Fetch but do not insert into database')
    
    args = parser.parse_args()
    
    # Get API key from env var (CONGRESS_API_KEY or API_KEY_CONGRESS)
    api_key = os.getenv('CONGRESS_API_KEY') or os.getenv('API_KEY_CONGRESS')
    if not api_key:
        print("❌ Missing API key")
        print("Set CONGRESS_API_KEY in .env file or environment")
        return 1
    
    # Determine which members to sync
    members_to_sync = []
    
    if args.bioguide:
        members_to_sync = [(args.bioguide, args.bioguide)]
    elif args.person_id:
        # Look up bioguide_id from person_id
        db = SessionLocal()
        try:
            member = db.query(TrackedMember).filter(
                TrackedMember.person_id == args.person_id
            ).first()
            if not member:
                print(f"❌ Unknown person_id: {args.person_id}")
                return 1
            if not member.bioguide_id:
                print(f"❌ Member {args.person_id} has no bioguide_id")
                return 1
            members_to_sync = [(member.bioguide_id, args.person_id)]
        finally:
            db.close()
    elif args.all_active:
        # Sync only pilot members (those with claims)
        # These are our 5 active tracked members: AOC, Sanders, Schumer, Warren, Wyden
        db = SessionLocal()
        try:
            from models.database import Claim
            # Get distinct person_ids from claims
            person_ids_with_claims = db.query(Claim.person_id).distinct().all()
            person_ids_with_claims = [p[0] for p in person_ids_with_claims]
            
            # Get members with bioguide_id who have claims
            members = db.query(TrackedMember).filter(
                TrackedMember.bioguide_id.isnot(None),
                TrackedMember.person_id.in_(person_ids_with_claims)
            ).all()
            members_to_sync = [(m.bioguide_id, m.person_id) for m in members]
            print(f"Found {len(members_to_sync)} pilot members with claims to sync\n")
        finally:
            db.close()
    
    # Sync each member
    for bioguide_id, person_id in members_to_sync:
        if len(members_to_sync) > 1:
            print("=" * 80)
            print(f"SYNCING: {person_id} ({bioguide_id})")
            print("=" * 80)
        
        sync_groundtruth(
            bioguide_id=bioguide_id,
            congress=args.congress,
            role=args.role,
            api_key=api_key,
            rate_limit=args.rate_limit,
            dry_run=args.dry_run
        )
        
        if len(members_to_sync) > 1:
            print()
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
