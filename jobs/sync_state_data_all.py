"""
Sync state legislators + bills for ALL 50 states from OpenStates.

`jobs/sync_state_data.py` handles a single state per invocation. This wrapper
walks every state, calling the per-state path with stagger delays so we don't
hammer the OpenStates rate limit. Designed to run as a daily scheduled job.

Usage
-----
    python jobs/sync_state_data_all.py --legislators-only
    python jobs/sync_state_data_all.py --bills-only
    python jobs/sync_state_data_all.py --states ny,ca,tx,fl
    python jobs/sync_state_data_all.py --max-pages 5 --bills-only

Operational notes
-----------------
- OpenStates rate-limits aggressively without an API key. Set
  OPENSTATES_API_KEY in the env to lift the cap; otherwise the per-state
  job already retries with exponential backoff on 429.
- Bills sync is the expensive part. Default is `--max-pages 3` (~150 bills
  per state × 50 states = 7,500 bills/run, manageable inside a 2-hour
  scheduler timeout).
- The job is idempotent. Re-running upserts existing rows without
  generating duplicates.
"""

import argparse
import logging
import os
import subprocess
import sys
import time
from typing import List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_state_data_all")

# All 50 states + DC. Territories not covered by OpenStates.
ALL_STATES: List[str] = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
]


def _run_one(state: str, *, mode_flags: list[str], max_pages: int) -> bool:
    """Invoke sync_state_data.py for a single state. Returns True on exit 0."""
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync_state_data.py")
    cmd = [sys.executable, script, "--state", state, "--max-pages", str(max_pages), *mode_flags]
    log.info("[%s] running: %s", state, " ".join(cmd[1:]))
    try:
        result = subprocess.run(
            cmd,
            check=False,
            capture_output=True,
            text=True,
            # Per-state cap: OpenStates can hang for minutes on a bad day.
            # 15 minutes per state caps the worst case at ~12 hours total
            # which the scheduler timeout safely covers.
            timeout=900,
        )
    except subprocess.TimeoutExpired:
        log.error("[%s] timed out after 15 min", state)
        return False
    except Exception as e:
        log.error("[%s] subprocess error: %s", state, e)
        return False

    if result.stdout:
        for line in result.stdout.splitlines()[-10:]:
            log.info("[%s] %s", state, line)
    if result.returncode != 0:
        log.error("[%s] exit %d", state, result.returncode)
        if result.stderr:
            log.error("[%s] stderr: %s", state, result.stderr.splitlines()[-5:])
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--states", type=str, default="",
                        help="Comma-separated state codes; empty = all 50")
    parser.add_argument("--legislators-only", action="store_true")
    parser.add_argument("--bills-only", action="store_true")
    parser.add_argument("--max-pages", type=int, default=3,
                        help="Max bill pages per state (default 3 = up to 150 bills)")
    parser.add_argument("--stagger-sec", type=float, default=2.0,
                        help="Sleep between states (default 2s)")
    args = parser.parse_args()

    if args.legislators_only and args.bills_only:
        log.error("--legislators-only and --bills-only are mutually exclusive")
        return 2

    states = (
        [s.strip().upper() for s in args.states.split(",") if s.strip()]
        if args.states else list(ALL_STATES)
    )
    log.info("Syncing %d state(s)", len(states))

    mode_flags: list[str] = []
    if args.legislators_only:
        mode_flags.append("--legislators-only")
    if args.bills_only:
        mode_flags.append("--bills-only")

    ok = 0
    failed: list[str] = []
    started = time.time()
    for st in states:
        success = _run_one(st, mode_flags=mode_flags, max_pages=args.max_pages)
        if success:
            ok += 1
        else:
            failed.append(st)
        time.sleep(args.stagger_sec)

    elapsed = time.time() - started
    log.info("Done: %d ok, %d failed in %.1fs", ok, len(failed), elapsed)
    if failed:
        log.warning("Failed states: %s", ",".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
