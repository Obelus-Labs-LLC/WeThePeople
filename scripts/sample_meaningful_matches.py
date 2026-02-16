"""
Sample Meaningful Matches
Audit claim evaluation quality by showing claims with tier != 'none'
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Claim, ClaimEvaluation, Bill, Action
from sqlalchemy import and_


def sample_meaningful_matches(limit=10):
    """Sample claims with meaningful matches (tier != 'none')."""
    db = SessionLocal()
    
    try:
        print("\n" + "="*70)
        print("MEANINGFUL MATCHES SAMPLE")
        print("="*70)
        
        # Query claims with evaluations where tier != 'none'
        results = db.query(Claim, ClaimEvaluation).join(
            ClaimEvaluation,
            Claim.id == ClaimEvaluation.claim_id
        ).filter(
            and_(
                ClaimEvaluation.tier != "none",
                ClaimEvaluation.tier.isnot(None)
            )
        ).limit(limit).all()
        
        if not results:
            print("\n[!] No meaningful matches found (all claims have tier='none')")
            print("This means:")
            print("  - Either matching rules are too strict")
            print("  - Or bills don't have enrichment data yet")
            print("  - Or claims don't align with recent legislative activity")
            return
        
        print(f"\nFound {len(results)} claims with tier != 'none'\n")
        
        for i, (claim, evaluation) in enumerate(results, 1):
            print("="*70)
            print(f"CLAIM #{claim.id}")
            print("="*70)
            print(f"Text: {claim.text}")
            print(f"Category: {claim.category}")
            print()
            
            print("EVALUATION:")
            print(f"  Tier: {evaluation.tier}")
            print(f"  Progress: {evaluation.progress}")
            print(f"  Timing: {evaluation.timing}")
            print()
            
            # Get matched action/bill from best_action_id
            if evaluation.best_action_id:
                action = db.query(Action).filter(
                    Action.id == evaluation.best_action_id
                ).first()
                
                if action:
                    print("MATCHED ACTION:")
                    print(f"  Title: {action.title or 'N/A'}")
                    print(f"  Date: {action.date}")
                    
                    # Construct bill_id from action components
                    if action.bill_congress and action.bill_type and action.bill_number:
                        bill_id = f"{action.bill_type}{action.bill_number}-{action.bill_congress}"
                        print(f"  Bill ID: {bill_id}")
                        
                        # Find bill in database
                        bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
                        if bill:
                            print(f"  Bill Title: {bill.title or 'N/A'}")
                            print(f"  Policy Area: {bill.policy_area or 'N/A'}")
                            print(f"  Status: {bill.status_bucket or 'N/A'}")
            else:
                print("MATCHED ACTION: None")
            
            print()
        
        print("="*70)
        print(f"SUMMARY: Showing {len(results)} of potentially more matches")
        print("="*70)
        
        # Overall stats
        total_claims = db.query(Claim).count()
        total_evaluations = db.query(ClaimEvaluation).count()
        meaningful_count = db.query(ClaimEvaluation).filter(
            and_(
                ClaimEvaluation.tier != "none",
                ClaimEvaluation.tier.isnot(None)
            )
        ).count()
        
        print(f"\nOverall Statistics:")
        print(f"  Total claims: {total_claims}")
        print(f"  Total evaluations (cached): {total_evaluations}")
        print(f"  Meaningful matches (tier != 'none'): {meaningful_count}")
        if total_evaluations > 0:
            pct = (meaningful_count / total_evaluations) * 100
            print(f"  Match rate: {pct:.1f}%")
        
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Sample meaningful claim matches")
    parser.add_argument("--limit", type=int, default=10, help="Number of matches to show (default: 10)")
    
    args = parser.parse_args()
    
    sample_meaningful_matches(limit=args.limit)
