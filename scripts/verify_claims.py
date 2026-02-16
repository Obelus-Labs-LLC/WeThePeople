"""
Claim Verification Script
Displays statistics about ingested claims.

Usage:
    python scripts/verify_claims.py --all
    python scripts/verify_claims.py --person-id aoc
"""

import argparse
import os
import sys
from collections import defaultdict
from datetime import date

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Claim, TrackedMember


def verify_claims(person_id: str = None, show_all: bool = False):
    """Display claim statistics."""
    
    db = SessionLocal()
    
    # Header
    print("=" * 70)
    print("CLAIM VERIFICATION")
    print("=" * 70)
    print()
    
    # Build query
    query = db.query(Claim)
    if person_id:
        query = query.filter(Claim.person_id == person_id)
    
    claims = query.all()
    
    if not claims:
        print("[!] No claims found")
        if person_id:
            print(f"    Person ID: {person_id}")
        db.close()
        return
    
    # Total claims
    print(f"Total claims: {len(claims)}\n")
    
    # Per-member breakdown
    member_stats = defaultdict(lambda: {
        'count': 0,
        'newest_date': None,
        'oldest_date': None,
        'categories': defaultdict(int)
    })
    
    for claim in claims:
        stats = member_stats[claim.person_id]
        stats['count'] += 1
        
        if claim.claim_date:
            if stats['newest_date'] is None or claim.claim_date > stats['newest_date']:
                stats['newest_date'] = claim.claim_date
            if stats['oldest_date'] is None or claim.claim_date < stats['oldest_date']:
                stats['oldest_date'] = claim.claim_date
        
        stats['categories'][claim.category] += 1
    
    # Display per-member stats
    print("Per-member breakdown:")
    print("-" * 70)
    
    for pid in sorted(member_stats.keys()):
        stats = member_stats[pid]
        
        # Get display name
        member = db.query(TrackedMember).filter(TrackedMember.person_id == pid).first()
        display_name = member.display_name if member else pid
        
        print(f"\n[{pid}] {display_name}")
        print(f"  Claims: {stats['count']}")
        if stats['newest_date']:
            print(f"  Newest: {stats['newest_date']}")
        if stats['oldest_date']:
            print(f"  Oldest: {stats['oldest_date']}")
        
        if stats['categories']:
            print(f"  Categories:")
            for cat, count in stats['categories'].items():
                print(f"    {cat}: {count}")
    
    print()
    
    # Check for duplicate hashes (should be 0 if constraints work)
    hash_counts = defaultdict(int)
    for claim in claims:
        hash_counts[claim.claim_hash] += 1
    
    duplicates = sum(1 for count in hash_counts.values() if count > 1)
    if duplicates > 0:
        print(f"[!] WARNING: {duplicates} duplicate hashes found (constraint may be broken)")
    else:
        print(f"[OK] No duplicate hashes (deduplication working)")
    
    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify ingested claims")
    parser.add_argument('--person-id', type=str, help='Show claims for specific person')
    parser.add_argument('--all', action='store_true', help='Show all claims')
    
    args = parser.parse_args()
    
    if not args.person_id and not args.all:
        print("[!] Error: Must specify --person-id or --all")
    else:
        verify_claims(person_id=args.person_id, show_all=args.all)
