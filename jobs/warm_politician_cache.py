"""Pre-warm the /people/{id}/full LRU.

The composed endpoint takes 5-50s for cold politicians (12 serial
sub-handlers). With the LRU added in routers/politics_people.py
repeat hits land in microseconds, but the first user pays the
full cold cost. This job hits each tracked politician on a schedule
so the cache stays warm for everyone.

Cadence: every 4 minutes, since the LRU TTL is 5 minutes. That
keeps every politician permanently hot during normal hours.

Usage:
    python jobs/warm_politician_cache.py            # all active members
    python jobs/warm_politician_cache.py --limit 50 # top 50 only
    python jobs/warm_politician_cache.py --dry-run
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import requests

from models.database import SessionLocal, TrackedMember

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("warm_politician_cache")

API_BASE = os.getenv("WTP_API_BASE", "http://127.0.0.1:8006")
TIMEOUT = 60  # cold sub-handlers can take up to 50s


def run(limit: int = 0, dry_run: bool = False) -> int:
    db = SessionLocal()
    try:
        q = db.query(TrackedMember).filter(TrackedMember.is_active == 1)
        rows: List[TrackedMember] = q.all()
        if limit > 0:
            rows = rows[:limit]
        log.info("warming %d politician /full payloads", len(rows))
        warmed = 0
        for m in rows:
            url = f"{API_BASE}/people/{m.person_id}/full"
            if dry_run:
                log.info("DRY %s", url)
                continue
            try:
                t0 = time.time()
                resp = requests.get(url, timeout=TIMEOUT)
                dur = time.time() - t0
                cache = resp.headers.get("X-WTP-Cache", "?")
                log.info("  %s %.1fs cache=%s", m.person_id, dur, cache)
                warmed += 1
            except Exception as exc:
                log.warning("  %s failed: %s", m.person_id, exc)
        log.info("done. warmed %d", warmed)
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Warm /people/{id}/full LRU")
    parser.add_argument("--limit", type=int, default=0, help="Cap N politicians")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    return run(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
