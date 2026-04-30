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

IMPORTANT: warming via direct function call would populate the CLI
process's in-memory cache, not the API's. Disk persistence helps but
is asymmetric: the API only re-reads disk on module import. So this
script hits the actual HTTP endpoint, which warms the API process's
in-memory cache directly. Disk cache fills as a side-effect of the
endpoint's existing persistence layer.

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
    python -m jobs.warm_closed_loop_cache --base-url http://127.0.0.1:8006
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests

# Allow running as `python -m jobs.warm_closed_loop_cache`.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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


def _warm_one(base_url: str, sector: Optional[str], mpc: int,
              year_from: int, year_to: int, limit: int,
              timeout_s: int) -> tuple[bool, float, int, bool]:
    """Hit the live API endpoint to populate the API process's
    in-memory cache. Returns (ok, elapsed, loops, is_partial)."""
    params = {
        "max_per_company": mpc,
        "limit": limit,
        "offset": 0,
        "year_from": year_from,
        "year_to": year_to,
    }
    if sector is not None:
        params["entity_type"] = sector
    t0 = time.monotonic()
    try:
        r = requests.get(
            f"{base_url.rstrip('/')}/influence/closed-loops",
            params=params,
            timeout=timeout_s,
        )
    except requests.RequestException as e:
        elapsed = time.monotonic() - t0
        logger.error("  HTTP error: %s (after %.2fs)", e, elapsed)
        return (False, elapsed, 0, False)
    elapsed = time.monotonic() - t0
    if r.status_code >= 400:
        logger.error("  HTTP %d after %.2fs: %s", r.status_code, elapsed, r.text[:120])
        return (False, elapsed, 0, False)
    try:
        body = r.json()
    except ValueError:
        logger.error("  non-JSON response after %.2fs", elapsed)
        return (False, elapsed, 0, False)
    loops = len(body.get("closed_loops") or [])
    is_partial = bool((body.get("stats") or {}).get("partial"))
    return (True, elapsed, loops, is_partial)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pre-warm the closed-loops endpoint cache for default filter combos."
    )
    parser.add_argument("--quiet", action="store_true", help="Reduce log volume")
    parser.add_argument("--year-from", type=int, default=2020)
    parser.add_argument("--year-to", type=int, default=datetime.now().year)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument(
        "--base-url",
        default=os.getenv("WTP_API_BASE_URL", "http://127.0.0.1:8006"),
        help="API base URL (default loopback)",
    )
    parser.add_argument("--timeout", type=int, default=45)
    args = parser.parse_args()

    if args.quiet:
        logger.setLevel(logging.WARNING)

    total = len(SECTORS_TO_WARM) * len(MAX_PER_COMPANY_VARIANTS)
    logger.info(
        "Pre-warming %d cache entries via %s (sectors=%d × max_per_company=%d)",
        total, args.base_url, len(SECTORS_TO_WARM), len(MAX_PER_COMPANY_VARIANTS),
    )

    failures = 0
    elapsed_total = 0.0
    n = 0
    for sector in SECTORS_TO_WARM:
        for mpc in MAX_PER_COMPANY_VARIANTS:
            n += 1
            ok, elapsed, loops, is_partial = _warm_one(
                args.base_url, sector, mpc,
                args.year_from, args.year_to, args.limit, args.timeout,
            )
            elapsed_total += elapsed
            if not ok:
                failures += 1
                continue
            logger.info(
                "[%d/%d] sector=%s mpc=%d loops=%d partial=%s elapsed=%.2fs",
                n, total, sector or "ALL", mpc, loops, is_partial, elapsed,
            )

    logger.info(
        "Done. total_elapsed=%.2fs failures=%d/%d",
        elapsed_total, failures, total,
    )
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
