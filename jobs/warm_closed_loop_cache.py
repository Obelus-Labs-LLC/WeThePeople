"""Cache pre-warm for the closed-loops endpoint.

The /influence/closed-loops endpoint runs a non-trivial multi-table
join + Python-side assembly that takes 5-15 seconds cold even after
all the perf optimizations (compound indexes, smaller donation pool,
cached committee-name matching). The endpoint maintains an in-memory
+ disk-backed cache keyed by filter combination, so cold paths only
hit users whose filter combo hasn't been computed yet.

This script pre-computes the cache for the filter combinations the
frontend uses by default, so users hitting the page after a deploy
or a cache eviction get fast responses instead of timeouts.

Designed to run:
  - After every deploy, before the API takes traffic
  - Hourly via cron, to keep the cache hot before TTL eviction

Filter matrix:
  - All 11 sector buckets (None + 10 specific sectors)
  - Default year window 2020..current
  - max_per_company in {0, 1} (raw + diverse mode)

That's 22 cache entries per pre-warm pass.

Usage:
    python -m jobs.warm_closed_loop_cache
    python -m jobs.warm_closed_loop_cache --quiet
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# Allow running as `python -m jobs.warm_closed_loop_cache`.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from models.database import SessionLocal  # noqa: E402
from services.closed_loop_detection import find_closed_loops  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("warm_closed_loop_cache")

SECTORS_TO_WARM: list[Optional[str]] = [
    None,  # All
    "finance",
    "health",
    "tech",
    "energy",
    "transportation",
    "defense",
    "chemicals",
    "agriculture",
    "telecom",
    "education",
]

MAX_PER_COMPANY_VARIANTS = [0, 1]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pre-warm the closed-loops endpoint cache for default filter combos."
    )
    parser.add_argument("--quiet", action="store_true", help="Reduce log volume")
    parser.add_argument("--year-from", type=int, default=2020)
    parser.add_argument("--year-to", type=int, default=datetime.now().year)
    parser.add_argument("--limit", type=int, default=25)
    args = parser.parse_args()

    if args.quiet:
        logger.setLevel(logging.WARNING)

    total = len(SECTORS_TO_WARM) * len(MAX_PER_COMPANY_VARIANTS)
    logger.info(
        "Pre-warming %d cache entries (sectors=%d × max_per_company=%d)",
        total, len(SECTORS_TO_WARM), len(MAX_PER_COMPANY_VARIANTS),
    )

    failures = 0
    elapsed_total = 0.0
    db = SessionLocal()
    try:
        n = 0
        for sector in SECTORS_TO_WARM:
            for mpc in MAX_PER_COMPANY_VARIANTS:
                n += 1
                t0 = time.monotonic()
                try:
                    result = find_closed_loops(
                        db=db,
                        entity_type=sector,
                        year_from=args.year_from,
                        year_to=args.year_to,
                        limit=args.limit,
                        offset=0,
                        max_per_company=mpc,
                    )
                    elapsed = time.monotonic() - t0
                    elapsed_total += elapsed
                    loops = len(result.get("closed_loops", []))
                    is_partial = (result.get("stats") or {}).get("partial", False)
                    logger.info(
                        "[%d/%d] sector=%s mpc=%d loops=%d partial=%s elapsed=%.2fs",
                        n, total, sector or "ALL", mpc, loops, is_partial, elapsed,
                    )
                except Exception as e:
                    failures += 1
                    elapsed = time.monotonic() - t0
                    logger.error(
                        "[%d/%d] sector=%s mpc=%d FAILED after %.2fs: %s",
                        n, total, sector or "ALL", mpc, elapsed, e,
                    )
    finally:
        db.close()

    logger.info(
        "Done. total_elapsed=%.2fs failures=%d/%d",
        elapsed_total, failures, total,
    )
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
