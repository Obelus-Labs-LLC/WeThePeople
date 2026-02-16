"""
Candidate Set Analysis

Analyzes effective candidate bills after applying ground truth and claim filters.
"""

import sys
import json
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).parent.parent))

from models.database import (
    SessionLocal, Claim, TrackedMember, MemberBillGroundTruth, 
    Action, SourceDocument, Bill
)
from sqlalchemy import desc


def analyze_effective_candidates(claim_id: int) -> Dict:
    """
    Calculate effective candidates for a claim after all filters.
    
    Shows:
    - Ground truth candidates (member's bills)
    - After action availability filter (bill exists in Actions)
    - After bill_refs_json match
    - After URL hint match
    - After Act title match
    
    Returns dict with counts at each filter stage.
    """
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            return {"error": "Claim not found"}
        
        # Get member's bioguide_id and ground truth
        member = db.query(TrackedMember).filter(
            TrackedMember.person_id == claim.person_id
        ).first()
        
        if not member or not member.bioguide_id:
            return {
                "claim_id": claim_id,
                "person_id": claim.person_id,
                "ground_truth_bills": 0,
                "note": "No bioguide_id or ground truth"
            }
        
        # Count ground truth bills
        gt_count = db.query(MemberBillGroundTruth).filter(
            MemberBillGroundTruth.bioguide_id == member.bioguide_id
        ).count()
        
        # Get ground truth bill_ids
        gt_records = db.query(MemberBillGroundTruth.bill_id).filter(
            MemberBillGroundTruth.bioguide_id == member.bioguide_id
        ).all()
        gt_bill_ids = {r[0] for r in gt_records}
        
        # Count actions that match ground truth
        actions_query = (
            db.query(Action)
              .filter(Action.person_id == claim.person_id)
        )
        
        actions_with_gt = []
        for action in actions_query.all():
            if action.bill_congress and action.bill_type and action.bill_number:
                action_bill_id = f"{action.bill_type.lower()}{action.bill_number}-{action.bill_congress}"
                if action_bill_id in gt_bill_ids:
                    actions_with_gt.append(action)
        
        # Apply claim-specific filters
        has_bill_refs = False
        matched_bill_refs = 0
        if claim.bill_refs_json:
            try:
                bill_refs = json.loads(claim.bill_refs_json)
                if bill_refs and 'normalized' in bill_refs:
                    has_bill_refs = True
                    # Count how many actions match bill_refs
                    for action in actions_with_gt:
                        action_bill_norm = f"{action.bill_type.lower()}{action.bill_number}"
                        if action_bill_norm in bill_refs.get('normalized', []):
                            matched_bill_refs += 1
            except:
                pass
        
        # Check URL hints
        has_url_hint = False
        if claim.claim_source_url and 'act' in claim.claim_source_url.lower():
            has_url_hint = True
        
        return {
            "claim_id": claim_id,
            "person_id": claim.person_id,
            "bioguide_id": member.bioguide_id,
            "ground_truth_bills": gt_count,
            "actions_with_gt": len(actions_with_gt),
            "has_bill_refs": has_bill_refs,
            "matched_bill_refs": matched_bill_refs,
            "has_url_hint": has_url_hint,
            "effective_candidates": len(actions_with_gt)  # Simplified - actions that match GT
        }
    
    finally:
        db.close()


def analyze_all_claims() -> List[Dict]:
    """Analyze effective candidates for all claims."""
    db = SessionLocal()
    try:
        claims = db.query(Claim.id).all()
        results = []
        
        for (claim_id,) in claims:
            result = analyze_effective_candidates(claim_id)
            results.append(result)
        
        return results
    
    finally:
        db.close()


if __name__ == "__main__":
    import statistics
    
    results = analyze_all_claims()
    
    # Summary stats
    total = len(results)
    with_gt = [r for r in results if r.get("ground_truth_bills", 0) > 0]
    effective_counts = [r.get("effective_candidates", 0) for r in with_gt]
    
    print(f"\n=== EFFECTIVE CANDIDATES ANALYSIS ===\n")
    print(f"Total claims: {total}")
    print(f"With ground truth: {len(with_gt)}")
    
    if effective_counts:
        print(f"\nEffective candidates (actions matching GT):")
        print(f"  Median: {statistics.median(effective_counts)}")
        print(f"  Mean: {statistics.mean(effective_counts):.1f}")
        print(f"  Range: {min(effective_counts)} - {max(effective_counts)}")
        
        # Show claims with 0 candidates
        zero_candidates = [r for r in with_gt if r.get("effective_candidates", 0) == 0]
        print(f"\nClaims with 0 effective candidates: {len(zero_candidates)}")
        if zero_candidates:
            print("  (Ground truth bills exist but no Actions found)")
