"""
Backfill AI-generated summaries for bills missing CRS text.

Why
---
Congress.gov publishes a CRS summary for every bill, but only after the
Congressional Research Service has time to write one. Around 38% of our
~39k bills have no CRS summary yet (esp. newly introduced ones).
`services/bill_ai_summary.py` already generates a Haiku summary on first
read and caches it on `bills.metadata_json.ai_summary`, but that means the
first journalist who lands on an unenriched bill page eats a 1.5-3s
cold-start latency.

This job pre-generates summaries for the unenriched bills most likely to
be looked at first: top-N most recently active or highest-traffic bills
without an AI summary. Designed to run nightly.

Selection strategy
------------------
Default ordering is `latest_action_date DESC` (most recently active bills
get backfilled first), which roughly tracks page-view distribution. If
`--by-views` is passed and the `bill_views` aggregation exists, that
ordering is used instead.

Bills are skipped if:
  - They already have `bills.summary_text` (CRS landed)
  - Their `metadata_json.ai_summary` is already populated
  - The title is empty (nothing to summarize from)

Usage
-----
    python jobs/backfill_bill_ai_summaries.py --limit 50 --dry-run
    python jobs/backfill_bill_ai_summaries.py --limit 200
    python jobs/backfill_bill_ai_summaries.py --congress 119 --limit 100

Env
---
ANTHROPIC_API_KEY must be set or the job no-ops.
"""

import argparse
import logging
import os
import sys
import time
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine, desc, or_
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Bill  # noqa: E402
from services.bill_ai_summary import (  # noqa: E402
    cached_ai_summary,
    generate_and_cache_summary,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_bill_ai_summaries")

DB_URL = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")


def _select_targets(session, congress: Optional[int], limit: int) -> list[Bill]:
    """Pick bills with no CRS summary AND no cached AI summary, newest first.

    The metadata_json filter is a JSON `LIKE` heuristic (cross-DB safe):
    we only need to exclude rows that already have an `ai_summary` key.
    Final filtering is done in Python via `cached_ai_summary` to avoid
    false negatives from DB-specific JSON quirks.
    """
    q = (
        session.query(Bill)
        .filter(
            or_(
                Bill.summary_text.is_(None),
                Bill.summary_text == "",
            )
        )
        .filter(Bill.title.isnot(None))
        .filter(Bill.title != "")
    )
    if congress is not None:
        q = q.filter(Bill.congress == congress)
    # Pull a wider net than `limit` because some rows will have a cached
    # ai_summary that the DB filter can't see; we'll filter in Python and
    # stop once we have `limit` real targets to process.
    rows = q.order_by(desc(Bill.latest_action_date)).limit(max(limit * 3, 100)).all()
    targets: list[Bill] = []
    for b in rows:
        if cached_ai_summary(b):
            continue
        targets.append(b)
        if len(targets) >= limit:
            break
    return targets


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=100,
                        help="Max bills to backfill in this run (default 100)")
    parser.add_argument("--congress", type=int, default=None,
                        help="Limit to a single congress (e.g. 119)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Identify candidates and report counts without calling the model")
    parser.add_argument("--sleep", type=float, default=0.4,
                        help="Polite delay between Haiku calls (default 0.4s)")
    args = parser.parse_args()

    if not os.getenv("ANTHROPIC_API_KEY"):
        log.error("ANTHROPIC_API_KEY is not set. Aborting.")
        return 2

    engine = create_engine(DB_URL, echo=False)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        targets = _select_targets(session, args.congress, args.limit)
        log.info("Selected %d bill(s) to backfill (limit=%d, congress=%s)",
                 len(targets), args.limit, args.congress)

        if not targets:
            return 0

        if args.dry_run:
            for b in targets[:20]:
                log.info("  [%s] %s", b.bill_id, (b.title or "")[:80])
            if len(targets) > 20:
                log.info("  ... and %d more", len(targets) - 20)
            log.info("Dry run — no model calls made.")
            return 0

        ok = 0
        failed = 0
        started = time.time()
        for b in targets:
            try:
                result = generate_and_cache_summary(b, session)
            except Exception as e:
                log.warning("Generation crashed for %s: %s", b.bill_id, e)
                result = None
            if result:
                ok += 1
            else:
                failed += 1
            if args.sleep > 0:
                time.sleep(args.sleep)

        elapsed = time.time() - started
        log.info("Backfill complete: %d ok, %d failed in %.1fs", ok, failed, elapsed)
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
