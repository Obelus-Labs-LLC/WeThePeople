"""
Test Ground Truth Rail with AOC

Fetches AOC's sponsored/cosponsored bills and prints counts.
AOC bioguide: O000172

Usage:
    python test_aoc_groundtruth.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from models.database import SessionLocal, MemberBillGroundTruth
from sqlalchemy import func
import subprocess

print("=" * 80)
print("TEST GROUND TRUTH RAIL - AOC")
print("=" * 80)
print()

# AOC's bioguide ID
AOC_BIOGUIDE = "O000172"
CONGRESS_119 = 119

print(f"1. Syncing ground truth for AOC ({AOC_BIOGUIDE}) in Congress {CONGRESS_119}...")
print()

# Run sync job
result = subprocess.run([
    "python", "jobs/sync_member_groundtruth.py",
    "--bioguide", AOC_BIOGUIDE,
    "--congress", str(CONGRESS_119),
    "--role", "both",
    "--rate-limit", "1.0"
], capture_output=False)

if result.returncode != 0:
    print(f"\n❌ Sync failed with exit code {result.returncode}")
    sys.exit(1)

print()
print("=" * 80)
print("2. Checking database counts...")
print("=" * 80)
print()

db = SessionLocal()

try:
    # Total count for AOC
    total = db.query(func.count(MemberBillGroundTruth.id)).filter(
        MemberBillGroundTruth.bioguide_id == AOC_BIOGUIDE
    ).scalar()
    
    print(f"Total ground truth bills for AOC: {total}")
    
    # By role
    by_role = db.query(
        MemberBillGroundTruth.role,
        func.count(MemberBillGroundTruth.id)
    ).filter(
        MemberBillGroundTruth.bioguide_id == AOC_BIOGUIDE
    ).group_by(MemberBillGroundTruth.role).all()
    
    print("\nBy role:")
    for role, count in by_role:
        print(f"  {role}: {count}")
    
    # Sample bills
    print("\nSample bills:")
    samples = db.query(MemberBillGroundTruth).filter(
        MemberBillGroundTruth.bioguide_id == AOC_BIOGUIDE
    ).limit(10).all()
    
    for s in samples:
        print(f"  {s.bill_id} ({s.role}) - fetched {s.fetched_at}")
    
    if total > 10:
        print(f"  ... and {total - 10} more")
    
    print()
    print("=" * 80)
    print("PASS: Ground truth rail test complete")
    print("=" * 80)
    
finally:
    db.close()
