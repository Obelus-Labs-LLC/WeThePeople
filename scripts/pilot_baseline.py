"""
Pilot Baseline Snapshot
Captures known-good state after initial matching system validation.

Usage:
    python scripts/pilot_baseline.py > pilot_baseline_2026-02-05.txt
"""

import sys
import os
from pathlib import Path
from datetime import datetime
import json
import re

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.database import SessionLocal, Claim, ClaimEvaluation, Action, Bill, MemberBillGroundTruth, TrackedMember
from sqlalchemy import func


def calculate_matchability(claims):
    """Calculate matchability metrics for a list of claims.
    
    Uses same logic as claim_matchability.py for consistency.
    """
    if not claims:
        return {'total': 0, 'bill_id_pct': 0, 'act_title_pct': 0, 'url_act_pct': 0, 'bill_refs_pct': 0, 'matchable_pct': 0}
    
    total = len(claims)
    bill_id_count = 0
    act_title_count = 0
    url_act_count = 0
    bill_refs_count = 0
    matchable_indices = set()
    
    bill_id_pattern = r'\b(?:H\.?R\.?|S\.?)\s?\d{1,4}\b'
    act_title_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\s+Act\b'
    
    for i, claim in enumerate(claims):
        # Check text for bill IDs
        if re.search(bill_id_pattern, claim.text, re.IGNORECASE):
            bill_id_count += 1
            matchable_indices.add(i)
        
        # Check text for Act titles
        if re.search(act_title_pattern, claim.text):
            act_title_count += 1
            matchable_indices.add(i)
        
        # Check URL for act slugs using improved logic
        if claim.claim_source_url and 'act' in claim.claim_source_url.lower():
            url_lower = claim.claim_source_url.lower()
            path = url_lower.split('?')[0].split('#')[0]
            segments = path.split('/')
            act_segments = [s for s in segments if 'act' in s and len(s) > 10]
            
            has_valid_act = False
            for segment in act_segments:
                normalized = re.sub(r'[-_]', ' ', segment)
                # Match phrases with at least 2 words before "act"
                matches = re.findall(r'\b(\w+\s+\w+\s+\w*act)\b', normalized)
                
                for match in matches:
                    words = match.split()
                    if len(words) >= 2:
                        # Filter out generic verb-to-act patterns
                        generic_connectors = {'to', 'must', 'can', 'will', 'should', 'would', 'could'}
                        if words[-2] in generic_connectors:
                            continue
                        
                        # Require substantive tokens
                        substantive_tokens = [w for w in words[:-1] if len(w) > 3 and w not in {'that', 'this', 'with', 'from', 'into', 'upon', 'about'}]
                        if len(substantive_tokens) >= 2:
                            has_valid_act = True
                            break
            
            if has_valid_act:
                url_act_count += 1
                matchable_indices.add(i)
        
        # Check bill_refs_json for extracted bill references
        if claim.bill_refs_json:
            try:
                refs = json.loads(claim.bill_refs_json)
                if refs.get('display'):
                    bill_refs_count += 1
                    matchable_indices.add(i)
            except:
                pass
    
    matchable_count = len(matchable_indices)
    
    return {
        'total': total,
        'bill_id_count': bill_id_count,
        'bill_id_pct': (bill_id_count / total * 100) if total > 0 else 0,
        'act_title_count': act_title_count,
        'act_title_pct': (act_title_count / total * 100) if total > 0 else 0,
        'url_act_count': url_act_count,
        'url_act_pct': (url_act_count / total * 100) if total > 0 else 0,
        'bill_refs_count': bill_refs_count,
        'bill_refs_pct': (bill_refs_count / total * 100) if total > 0 else 0,
        'matchable_count': matchable_count,
        'matchable_pct': (matchable_count / total * 100) if total > 0 else 0
    }


db = SessionLocal()

print("=" * 80)
print("PILOT BASELINE SNAPSHOT")
print(f"Generated: {datetime.now().isoformat()}")
print("=" * 80)
print()

# Database counts
total_claims = db.query(func.count(Claim.id)).scalar()
total_evaluations = db.query(func.count(ClaimEvaluation.id)).scalar()
total_actions = db.query(func.count(Action.id)).scalar()
total_bills = db.query(func.count(Bill.bill_id)).scalar()

print("DATABASE COUNTS:")
print(f"  Claims: {total_claims}")
print(f"  Evaluations: {total_evaluations}")
print(f"  Actions: {total_actions}")
print(f"  Bills: {total_bills}")
print()

# Claim breakdown
print("CLAIMS BY MEMBER:")
print("-" * 80)

member_counts = db.query(
    Claim.person_id, 
    func.count(Claim.id)
).group_by(Claim.person_id).all()

for person_id, count in member_counts:
    print(f"  {person_id}: {count} claims")

print()

# Evaluation tier breakdown
print("EVALUATION TIER DISTRIBUTION:")
print("-" * 80)

tier_counts = db.query(
    ClaimEvaluation.tier,
    func.count(ClaimEvaluation.id)
).group_by(ClaimEvaluation.tier).all()

for tier, count in tier_counts:
    print(f"  {tier}: {count}")

match_rate = sum(count for tier, count in tier_counts if tier != 'none') / total_evaluations * 100 if total_evaluations > 0 else 0
print(f"\n  Match rate: {match_rate:.1f}% ({sum(count for tier, count in tier_counts if tier != 'none')}/{total_evaluations})")
print()

# Matchability metrics (NEW)
print("MATCHABILITY METRICS:")
print("-" * 80)

all_claims = db.query(Claim).all()
overall_matchability = calculate_matchability(all_claims)

print(f"  Bill ID mentions (H.R./S. ####): {overall_matchability['bill_id_pct']:.1f}%")
print(f"  Act title mentions: {overall_matchability['act_title_pct']:.1f}%")
print(f"  URL act slugs: {overall_matchability['url_act_pct']:.1f}%")
print(f"  Bill refs extracted (bill_refs_json): {overall_matchability['bill_refs_pct']:.1f}%")
print(f"  Overall matchability: {overall_matchability['matchable_pct']:.1f}%")

# Per-member matchability
print("\n  Per-member matchability:")
for person_id, _ in member_counts:
    member_claims = db.query(Claim).filter(Claim.person_id == person_id).all()
    member_matchability = calculate_matchability(member_claims)
    print(f"    {person_id}: {member_matchability['matchable_pct']:.1f}%")

print()

# GROUND TRUTH CANDIDATE SET METRICS (NEW)
print("GROUND TRUTH CANDIDATE SETS:")
print("-" * 80)

candidate_set_sizes = []
has_ground_truth_count = 0
for person_id, claim_count in member_counts:
    # Get member's bioguide_id
    member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
    if member and member.bioguide_id:
        # Get ground truth count
        gt_count = db.query(func.count(MemberBillGroundTruth.id)).filter(
            MemberBillGroundTruth.bioguide_id == member.bioguide_id
        ).scalar()
        if gt_count > 0:
            candidate_set_sizes.append(gt_count)
            has_ground_truth_count += 1
            print(f"  {person_id}: {gt_count} candidate bills (bioguide {member.bioguide_id})")
        else:
            print(f"  {person_id}: 0 bills in ground truth (no sponsored/cosponsored bills)")
    else:
        print(f"  {person_id}: No ground truth (missing bioguide_id)")

if candidate_set_sizes:
    import statistics
    median_size = statistics.median(candidate_set_sizes)
    min_size = min(candidate_set_sizes)
    max_size = max(candidate_set_sizes)
    total_bills_in_db = db.query(func.count(Bill.bill_id)).scalar()
    
    print(f"\n  Candidate set size range: {min_size} - {max_size} bills per member")
    print(f"  Median: {int(median_size)} bills per member")
    print(f"  \u2139\ufe0f Ground truth provides member-specific bill lists from Congress.gov API")
    print(f"  \u2139\ufe0f Matching constrained to each member's actual sponsored/cosponsored bills")
    print(f"  \u2139\ufe0f Prevents false positives from bills member didn't touch")
    print(f"  Members with ground truth: {has_ground_truth_count}/{len(member_counts)}")
# EFFECTIVE CANDIDATES ANALYSIS (NEW)
print("\nEFFECTIVE CANDIDATES (After Action Availability):")
print("-" * 80)

from models.database import Action
effective_counts = []
zero_effective = []

for person_id, _ in member_counts:
    member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
    if member and member.bioguide_id:
        # Get ground truth bill_ids
        gt_records = db.query(MemberBillGroundTruth.bill_id).filter(
            MemberBillGroundTruth.bioguide_id == member.bioguide_id
        ).all()
        gt_bill_ids = {r[0] for r in gt_records}
        
        # Count actions that match ground truth
        actions = db.query(Action).filter(Action.person_id == person_id).all()
        effective = 0
        for action in actions:
            if action.bill_congress and action.bill_type and action.bill_number:
                action_bill_id = f"{action.bill_type.lower()}{action.bill_number}-{action.bill_congress}"
                if action_bill_id in gt_bill_ids:
                    effective += 1
        
        effective_counts.append(effective)
        if effective == 0:
            zero_effective.append(person_id)
        
        print(f"  {person_id}: {effective} actions (from {len(gt_bill_ids)} GT bills)")

if effective_counts:
    import statistics
    print(f"\n  Median effective candidates: {int(statistics.median(effective_counts))} actions")
    print(f"  Mean: {statistics.mean(effective_counts):.1f} actions")
    print(f"  ⚠️ Members with 0 effective: {len(zero_effective)}")
    if zero_effective:
        print(f"     {', '.join(zero_effective)}")
        print(f"     (Ground truth exists but no Actions for those bills)")
print()

# Detailed matches
print("MEANINGFUL MATCHES (tier != 'none'):")
print("=" * 80)

matches = db.query(ClaimEvaluation, Claim, Action, Bill).join(
    Claim, ClaimEvaluation.claim_id == Claim.id
).outerjoin(
    Action, ClaimEvaluation.best_action_id == Action.id
).outerjoin(
    Bill, ClaimEvaluation.matched_bill_id == Bill.bill_id
).filter(
    ClaimEvaluation.tier != 'none'
).all()

for eval, claim, action, bill in matches:
    print()
    print(f"Claim #{claim.id} ({claim.person_id}):")
    print(f"  Text: {claim.text[:100]}{'...' if len(claim.text) > 100 else ''}")
    print(f"  Source: {claim.claim_source_url}")
    print(f"  Date: {claim.claim_date}")
    print()
    print(f"  MATCHED: {bill.title if bill else 'Unknown'} ({eval.matched_bill_id})")
    print(f"  Score: {eval.score}")
    print(f"  Tier: {eval.tier}")
    print(f"  Progress: {eval.progress}")
    print(f"  Timing: {eval.timing}")
    
    if eval.evidence_json:
        evidence = json.loads(eval.evidence_json)
        print(f"  Evidence ({len(evidence)} signals):")
        for ev in evidence:
            print(f"    - {ev}")
    
    print("-" * 80)

print()

# Hash deduplication check
print("HASH DEDUPLICATION CHECK:")
print("-" * 80)

hash_counts = db.query(
    Claim.claim_hash,
    func.count(Claim.id)
).group_by(Claim.claim_hash).having(func.count(Claim.id) > 1).all()

if hash_counts:
    print(f"  [!] Found {len(hash_counts)} duplicate hashes:")
    for hash_val, count in hash_counts:
        print(f"    {hash_val}: {count} claims")
else:
    print("  ✓ No duplicate hashes (deduplication working)")

print()

# URL evidence usage
print("URL EVIDENCE USAGE:")
print("-" * 80)

url_matches = db.query(ClaimEvaluation).filter(
    ClaimEvaluation.evidence_json.like('%url_match:%')
).all()

print(f"  Claims with URL-based evidence: {len(url_matches)}")
print(f"  Percentage: {len(url_matches) / total_evaluations * 100:.1f}%")

print()

# Unmatched claims
print("UNMATCHED CLAIMS (tier = 'none'):")
print("-" * 80)

unmatched = db.query(ClaimEvaluation, Claim).join(
    Claim, ClaimEvaluation.claim_id == Claim.id
).filter(
    ClaimEvaluation.tier == 'none'
).all()

print(f"  Total unmatched: {len(unmatched)}")
print()

for eval, claim in unmatched[:3]:  # Show first 3
    print(f"  Claim #{claim.id}: {claim.text[:80]}...")
    print(f"    Score: {eval.score}")
    print()

if len(unmatched) > 3:
    print(f"  ... and {len(unmatched) - 3} more")

print()
print("=" * 80)
print("END PILOT BASELINE")
print("=" * 80)

db.close()
