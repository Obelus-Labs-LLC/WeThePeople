"""
Backfill bill ingestion for new Congress members.
Processes members with needs_ingest=1 in batches using the existing
ingest_member_legislation() pipeline.

Resumable: re-run picks up where it left off (only processes needs_ingest=1).

Usage:
  python scripts/backfill_new_members.py
  python scripts/backfill_new_members.py --batch-size 10
  python scripts/backfill_new_members.py --dry-run
"""
import os
import sys
import time
import argparse
from datetime import datetime
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal, TrackedMember
from connectors.congress import ingest_member_legislation
from dotenv import load_dotenv

load_dotenv()


def get_pending_members(db):
    """Get all active members that need ingestion."""
    return db.query(TrackedMember).filter(
        TrackedMember.is_active == 1,
        TrackedMember.needs_ingest == 1,
        TrackedMember.bioguide_id.isnot(None),
        TrackedMember.bioguide_id != ""
    ).order_by(TrackedMember.person_id).all()


def main():
    parser = argparse.ArgumentParser(description="Backfill bill ingestion for new members")
    parser.add_argument("--batch-size", type=int, default=25, help="Members per batch (default: 25)")
    parser.add_argument("--pause", type=int, default=30, help="Seconds between batches (default: 30)")
    parser.add_argument("--limit-pages", type=int, default=5, help="Max pages per API endpoint (default: 5)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be processed without doing it")
    args = parser.parse_args()

    db = SessionLocal()

    try:
        pending = get_pending_members(db)
        total = len(pending)

        if total == 0:
            print("No members need ingestion. All caught up!")
            return

        print("=" * 60)
        print(f"BACKFILL BILL INGESTION")
        print(f"=" * 60)
        print(f"  Members needing ingestion: {total}")
        print(f"  Batch size: {args.batch_size}")
        print(f"  Pages per endpoint: {args.limit_pages}")
        print(f"  Pause between batches: {args.pause}s")
        num_batches = (total + args.batch_size - 1) // args.batch_size
        print(f"  Estimated batches: {num_batches}")
        print(f"  Estimated time: ~{num_batches * 25} minutes")
        print()

        if args.dry_run:
            print("[DRY RUN] Would process these members:")
            for i, m in enumerate(pending):
                print(f"  {i+1:3d}. {m.person_id} ({m.bioguide_id}) - {m.display_name}")
            return

        processed = 0
        batch_num = 0

        for i in range(0, total, args.batch_size):
            batch = pending[i:i + args.batch_size]
            batch_ids = [m.person_id for m in batch]
            batch_num += 1

            print(f"\n{'=' * 60}")
            print(f"BATCH {batch_num}/{num_batches} — {len(batch_ids)} members")
            print(f"Started: {datetime.now().strftime('%H:%M:%S')}")
            print(f"{'=' * 60}")
            print(f"  Members: {', '.join(batch_ids[:5])}{'...' if len(batch_ids) > 5 else ''}")

            try:
                # Run ingestion for this batch
                ingest_member_legislation(
                    limit_pages=args.limit_pages,
                    person_ids=batch_ids
                )

                # Mark batch as completed
                for m in batch:
                    m.needs_ingest = 0
                    m.last_full_refresh_at = datetime.utcnow()
                db.commit()

                processed += len(batch_ids)
                remaining = total - processed
                print(f"\n  Batch {batch_num} complete. Processed: {processed}/{total}, Remaining: {remaining}")

            except Exception as e:
                print(f"\n  ERROR in batch {batch_num}: {e}")
                db.rollback()
                print("  Batch failed but will be retried on next run.")
                # Don't break — skip this batch and continue
                continue

            # Pause between batches (skip if last batch)
            if i + args.batch_size < total:
                print(f"  Pausing {args.pause}s before next batch...")
                time.sleep(args.pause)

        print(f"\n{'=' * 60}")
        print(f"BACKFILL COMPLETE")
        print(f"{'=' * 60}")
        print(f"  Total processed: {processed}/{total}")
        print(f"  Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
