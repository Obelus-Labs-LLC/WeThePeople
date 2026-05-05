"""
Backfill simplified Haiku summaries for published stories.

Why
---
`/stories/{slug}/simplified` lazily generates a 60-second simplified
summary on first read via services/story_simplified_summary and caches
it on `stories.summary_simplified`. The lazy generation costs 5-6
seconds per cold story, paid by the first user landing on each story
page. The May 2026 walkthrough caught every untouched published story
at 5-6s cold, with the second visitor getting a free response.

This job walks every published / retracted story missing a cached
simplified summary and pre-generates one. Run nightly so freshly
detected stories are warm before the first reader arrives.

Selection strategy
------------------
- Order: `created_at DESC` (newest first — those are most likely to
  be linked from the daily story feed and hit first)
- Skip if `summary_simplified` is already populated
- Skip drafts (only `published` and `retracted` stories render the
  simplified toggle in the UI)
- Skip stories whose body is too short to summarize meaningfully
  (the underlying generator returns None for those anyway)

Usage
-----
    python jobs/backfill_story_simplified.py --dry-run
    python jobs/backfill_story_simplified.py --limit 25
    python jobs/backfill_story_simplified.py --limit 100

Env
---
ANTHROPIC_API_KEY must be set or the job no-ops gracefully.
"""

import argparse
import logging
import os
import sys
import time
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.stories_models import Story  # noqa: E402
from services.story_simplified_summary import generate_and_cache  # noqa: E402

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_story_simplified")

DB_URL = os.getenv("DATABASE_URL") or os.getenv("WTP_DB_URL") or "sqlite:///./wethepeople.db"


def _select_targets(session, limit: int) -> list[Story]:
    """Select published / retracted stories missing a simplified summary."""
    return (
        session.query(Story)
        .filter(
            Story.status.in_(("published", "retracted")),
            (Story.summary_simplified.is_(None) | (Story.summary_simplified == "")),
        )
        .order_by(desc(Story.created_at))
        .limit(limit)
        .all()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=25,
                        help="Max stories to backfill in this run (default: 25)")
    parser.add_argument("--dry-run", action="store_true",
                        help="List targets without generating")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        log.warning("ANTHROPIC_API_KEY not set — backfill is a no-op.")
        return 0

    engine = create_engine(DB_URL, echo=False)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        targets = _select_targets(session, args.limit)
        log.info("Stories needing simplified summary: %d", len(targets))
        if not targets:
            return 0

        if args.dry_run:
            for s in targets:
                log.info("[dry-run] %d  %s", s.id, s.slug)
            return 0

        ok = 0
        skipped = 0
        failed = 0
        for s in targets:
            t0 = time.monotonic()
            try:
                text = generate_and_cache(s, session)
            except Exception as e:
                log.warning("[fail] %s: %s", s.slug, e)
                failed += 1
                continue
            elapsed = time.monotonic() - t0
            if text:
                ok += 1
                log.info("[ok]   %s  (%.1fs, %d chars)", s.slug, elapsed, len(text))
            else:
                skipped += 1
                log.info("[skip] %s  (generator returned empty)", s.slug)

        log.info("Done. ok=%d skipped=%d failed=%d", ok, skipped, failed)
        return 0 if failed == 0 else 1
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
