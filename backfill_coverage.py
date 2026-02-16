"""
Backfill Coverage Strategy - Enrich all bills referenced in Actions

Phase 4: Make "none" become "matched when real"
Currently: 88/1384 bills enriched (6.4%)
Goal: 100% coverage of bills referenced in politician actions

Strategy:
1. Run enrichment in batches (respecting Congress.gov rate limits)
2. Prioritize recent bills (119th Congress first)
3. Track progress and handle failures gracefully
4. Invalidate affected claims after each batch

Conservative approach:
- Won't invent matches that don't exist
- Will find real matches when bills are enriched
- All matching still uses three-layer defense
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.enrich_bills import run_enrichment_batch, verify_enrichment_coverage


def backfill_all_action_bills(batch_size: int = 100, max_batches: int = None):
    """
    Backfill all bills referenced in Actions table.
    
    Args:
        batch_size: Bills per batch (default 100)
        max_batches: Max batches to run (None = unlimited)
    """
    batch_num = 1
    
    print("=" * 70)
    print("BACKFILL COVERAGE - ENRICH ALL ACTION BILLS")
    print("=" * 70)
    print(f"Batch size: {batch_size}")
    print(f"Max batches: {max_batches or 'unlimited'}")
    print()
    
    while True:
        if max_batches and batch_num > max_batches:
            print(f"\n✅ Reached max batches ({max_batches})")
            break
        
        print(f"\n{'='*70}")
        print(f"BATCH {batch_num}")
        print(f"{'='*70}\n")
        
        # Run one batch
        run_enrichment_batch(batch_size=batch_size)
        
        # Check if we're done
        from models.database import SessionLocal, Action, Bill
        db = SessionLocal()
        unique_bills = db.query(
            Action.bill_congress, Action.bill_type, Action.bill_number
        ).filter(
            Action.bill_congress.isnot(None)
        ).distinct().count()
        enriched = db.query(Bill).count()
        db.close()
        
        remaining = unique_bills - enriched
        
        if remaining == 0:
            print(f"\n✅ COMPLETE: All {enriched} bills enriched!")
            break
        
        print(f"\n📊 Progress: {enriched}/{unique_bills} ({enriched/unique_bills*100:.1f}%)")
        print(f"   Remaining: {remaining} bills")
        
        batch_num += 1
    
    # Final report
    print(f"\n{'='*70}")
    verify_enrichment_coverage()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Backfill all bills referenced in Actions")
    parser.add_argument("--batch-size", type=int, default=100, help="Bills per batch")
    parser.add_argument("--max-batches", type=int, default=None, help="Max batches to run")
    
    args = parser.parse_args()
    
    backfill_all_action_bills(
        batch_size=args.batch_size,
        max_batches=args.max_batches
    )
