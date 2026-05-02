"""Refresh the per-member legislative `Action` rows.

This was the missing schedule entry that left the Actions table stuck
at 2026-02-25 — the `connectors.congress.ingest_member_legislation`
function existed but nobody was calling it on a cron, so the
"Last Active Feb 25" badge on every politician profile and the stale
`Recent activity` feed on /politics both reflected a 9-week gap.

What it does:
  - Iterates every active TrackedMember
  - For each: fetches their sponsored + cosponsored bills from
    Congress.gov via the Congress connector
  - Upserts Action + SourceDocument rows (the connector handles
    dedupe via the bill_congress / bill_type / bill_number /
    action_type natural key)

Cadence: daily at 03:00 UTC. The Congress.gov API is generous on
limits but each member can take 5-10s to refresh, so 537 * 7s ≈ 1h
worst case. We keep `limit_pages=2` (default) to bound runtime.

Usage:
    python jobs/sync_member_actions.py
    python jobs/sync_member_actions.py --limit-pages 5      # deeper history
    python jobs/sync_member_actions.py --members rashida_tlaib elissa_slotkin
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_member_actions")


def run(limit_pages: int = 2, person_ids: list[str] | None = None) -> int:
    """Run the member-legislation sync. Returns 0 on success, 1 on hard fail."""
    from connectors.congress import ingest_member_legislation, API_KEY

    if not API_KEY:
        log.error("No Congress.gov API key configured (set CONGRESS_API_KEY env). Exiting.")
        return 1

    t0 = time.time()
    try:
        ingest_member_legislation(limit_pages=limit_pages, person_ids=person_ids)
    except Exception as exc:
        log.exception("ingest_member_legislation raised: %s", exc)
        return 1
    log.info("sync_member_actions finished in %.1fs", time.time() - t0)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit-pages", type=int, default=int(os.getenv("WTP_CONGRESS_LIMIT_PAGES", "2")),
        help="Pages of bill results to fetch per member per category (default 2).",
    )
    parser.add_argument(
        "--members", nargs="*", default=None,
        help="Restrict to these person_ids (e.g. for a one-off backfill).",
    )
    args = parser.parse_args()
    return run(limit_pages=args.limit_pages, person_ids=args.members)


if __name__ == "__main__":
    raise SystemExit(main())
