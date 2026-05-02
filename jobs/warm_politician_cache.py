"""Pre-warm the /people/{id}/full LRU.

The composed endpoint runs 12 sub-handlers per politician. With the
parallel ThreadPoolExecutor on the API side cold cost is now ~1-2s
instead of ~8s, but a non-warmed politician still costs every first
visitor that latency. This job hits every tracked politician on a
schedule so the cache stays warm for everyone, not just the top 100.

Cadence: every 30 minutes (LRU TTL on the API side is 60 min). With
the API's parallel sub-handler fanout, warming all 537 active members
takes about 2-3 minutes per cycle (parallel inside, mostly-warm
already, and we cap concurrent warming at 4 in-flight to avoid
saturating the SQLite writer).

Usage:
    python jobs/warm_politician_cache.py            # all active members
    python jobs/warm_politician_cache.py --limit 50 # top 50 only
    python jobs/warm_politician_cache.py --dry-run
    python jobs/warm_politician_cache.py --concurrency 8
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import requests

from models.database import SessionLocal, TrackedMember

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("warm_politician_cache")

API_BASE = os.getenv("WTP_API_BASE", "http://127.0.0.1:8006")
TIMEOUT = 60  # cold composed cost is now <2s but allow headroom


def _warm_one(person_id: str, dry_run: bool) -> tuple[str, float, str]:
    """Hit the /full endpoint for one person. Returns (person_id, dur, cache)."""
    url = f"{API_BASE}/people/{person_id}/full"
    if dry_run:
        return (person_id, 0.0, "DRY")
    t0 = time.time()
    try:
        resp = requests.get(url, timeout=TIMEOUT)
        dur = time.time() - t0
        cache = resp.headers.get("X-WTP-Cache", "?")
        if resp.status_code != 200:
            return (person_id, dur, f"HTTP{resp.status_code}")
        return (person_id, dur, cache)
    except Exception as exc:
        return (person_id, time.time() - t0, f"ERR:{type(exc).__name__}")


def run(limit: int = 0, dry_run: bool = False, concurrency: int = 4) -> int:
    db = SessionLocal()
    try:
        q = db.query(TrackedMember).filter(TrackedMember.is_active == 1)
        rows: List[TrackedMember] = q.all()
        if limit > 0:
            rows = rows[:limit]
        log.info("warming %d politician /full payloads (concurrency=%d)", len(rows), concurrency)
        warmed = 0
        cold_misses = 0
        errors = 0
        t_start = time.time()
        with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="warmer") as pool:
            futures = {
                pool.submit(_warm_one, m.person_id, dry_run): m.person_id
                for m in rows
            }
            for f in as_completed(futures):
                person_id, dur, cache = f.result()
                if cache.startswith("ERR") or cache.startswith("HTTP"):
                    errors += 1
                    log.warning("  %s %.1fs %s", person_id, dur, cache)
                    continue
                warmed += 1
                if cache == "MISS":
                    cold_misses += 1
                # Only log slow ones (>1.5s) at INFO; skip the warm fast-path
                # noise.
                if dur >= 1.5 or cache == "MISS":
                    log.info("  %s %.1fs cache=%s", person_id, dur, cache)
        log.info(
            "done. warmed=%d cold_misses=%d errors=%d in %.1fs",
            warmed, cold_misses, errors, time.time() - t_start,
        )
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Warm /people/{id}/full LRU")
    parser.add_argument("--limit", type=int, default=0, help="Cap N politicians (0 = all active)")
    parser.add_argument("--concurrency", type=int, default=4, help="Parallel warm requests (default 4)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return run(limit=args.limit, dry_run=args.dry_run, concurrency=args.concurrency)


if __name__ == "__main__":
    sys.exit(main())
