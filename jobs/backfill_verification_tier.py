"""Backfill ``verification_tier`` / ``verification_score`` on legacy
published stories.

A bug-probe of the journal site flagged that 31 of 47 published stories
(66%) had ``verification_tier IS NULL`` — meaning the verification
badge ("Verified" / "Partially Verified" / "Unverified") never rendered
on the story page. The badge is a key trust signal and the only way a
visitor can see at a glance how much we vouch for the numbers in a
given story.

Cause: the verification scoring pipeline landed in early-April 2026
after these stories had already been published, and there was never a
backfill pass.

Fix: re-run ``compute_verification_score`` against every published
story missing a tier and write the result back.

Idempotent: only touches rows where ``verification_tier IS NULL``.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from models.database import SessionLocal  # noqa: E402
from models.stories_models import Story  # noqa: E402

try:
    from jobs.detect_stories import compute_verification_score  # noqa: E402
except ImportError as e:
    print(f"Cannot import compute_verification_score: {e}", file=sys.stderr)
    raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=None,
                    help="Process at most N stories (for testing).")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        q = (
            db.query(Story)
            .filter(Story.status == "published", Story.verification_tier.is_(None))
            .order_by(Story.id)
        )
        if args.limit:
            q = q.limit(args.limit)
        stories = q.all()
        print(f"Found {len(stories)} published stories with NULL verification_tier")

        scored_count = 0
        for s in stories:
            try:
                score, tier = compute_verification_score(s, db)
            except Exception as e:
                print(f"  story #{s.id}: error scoring: {e}")
                continue
            print(f"  story #{s.id:3d}  score={score:.2f}  tier={tier:20s}  {(s.title or '')[:50]}")
            if not args.dry_run:
                db.execute(
                    text(
                        "UPDATE stories SET verification_tier = :tier, "
                        "verification_score = :score, updated_at = :now "
                        "WHERE id = :id"
                    ),
                    {
                        "tier": tier,
                        "score": score,
                        "now": datetime.now(timezone.utc),
                        "id": s.id,
                    },
                )
            scored_count += 1

        if not args.dry_run:
            db.commit()
            print(f"Committed {scored_count} updates.")
        else:
            print(f"[dry-run] Would update {scored_count} stories.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
