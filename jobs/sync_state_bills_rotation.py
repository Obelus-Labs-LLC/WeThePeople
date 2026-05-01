"""Phase 3 thread C follow-on: rotating state-bill sync.

OpenStates' free tier caps API requests at 250/day. A monolithic
"sync all 50 states" job blows past that, so we never had any
state_bills rows. This rotation walks N states per run and persists
the cursor so successive runs cycle through every state without
spilling the daily budget.

Cadence: daily, 3 states per run → full cycle every ~17 days. Each
state takes ~30s (10 pages × ~50 bills × polite delay), so a 3-
state run costs ~90s wall time and ~30 API calls.

Usage:
    python jobs/sync_state_bills_rotation.py            # 3 states from cursor
    python jobs/sync_state_bills_rotation.py --states 5
    python jobs/sync_state_bills_rotation.py --priority # top-pop states first cycle
    python jobs/sync_state_bills_rotation.py --dry-run

State of the rotation (next-up state, etc.) lives in
data/state_bills_rotation.json next to scheduler_state.json.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_state_bills_rotation")

ROTATION_FILE = ROOT / "data" / "state_bills_rotation.json"
ROTATION_FILE.parent.mkdir(exist_ok=True)

# Alphabetical USPS list for the steady-state rotation.
ALL_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

# Top-population states the operator probably wants seeded first
# so the per-state landing pages have content for the busiest
# user states. Falls back to alphabetical rotation after one pass.
PRIORITY_STATES = [
    "CA", "TX", "FL", "NY", "PA", "IL", "OH", "GA", "NC", "MI",
    "NJ", "VA", "WA", "AZ", "MA", "TN", "IN", "MO", "MD", "WI",
]


def _load_cursor() -> dict:
    if not ROTATION_FILE.exists():
        return {"next_index": 0, "completed_priority": False}
    try:
        return json.loads(ROTATION_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"next_index": 0, "completed_priority": False}


def _save_cursor(state: dict) -> None:
    ROTATION_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _pick_states(n: int, priority: bool) -> List[str]:
    """Return the next N states in rotation. Priority mode walks the
    top-pop list first, then falls through to alphabetical."""
    cur = _load_cursor()
    seq: List[str] = []
    if priority and not cur.get("completed_priority"):
        # Pick from priority list first
        seq = PRIORITY_STATES
        idx = cur.get("priority_idx", 0)
        out = seq[idx:idx + n]
        cur["priority_idx"] = idx + len(out)
        if cur["priority_idx"] >= len(seq):
            cur["completed_priority"] = True
            cur["priority_idx"] = 0
        _save_cursor(cur)
        return out

    # Steady state: walk alphabetical with wrap-around.
    seq = ALL_STATES
    idx = cur.get("next_index", 0) % len(seq)
    out: List[str] = []
    for i in range(n):
        out.append(seq[(idx + i) % len(seq)])
    cur["next_index"] = (idx + n) % len(seq)
    _save_cursor(cur)
    return out


def _run_for_state(state: str, dry_run: bool, max_pages: int) -> int:
    """Invoke jobs/sync_state_data.py --state X --bills-only.

    Subprocess (rather than in-process import) keeps the OpenStates
    rate-limit retry logic + circuit breakers fully isolated, and
    matches how the rest of the scheduler invokes per-state jobs.
    """
    cmd = [
        sys.executable, str(ROOT / "jobs" / "sync_state_data.py"),
        "--state", state.lower(),
        "--bills-only",
        "--max-pages", str(max_pages),
    ]
    if dry_run:
        cmd.append("--dry-run")
    log.info("→ sync %s (max_pages=%d)", state, max_pages)
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            cwd=str(ROOT),
        )
        if proc.returncode != 0:
            log.warning("  %s exited %d: %s", state, proc.returncode, proc.stderr[:200])
            return 0
        # Surface the per-state summary line.
        for line in (proc.stdout or "").splitlines():
            if "Bills:" in line or "Page" in line:
                log.info("  %s", line.strip())
        return 1
    except subprocess.TimeoutExpired:
        log.warning("  %s timed out", state)
        return 0
    except Exception as exc:
        log.warning("  %s error: %s", state, exc)
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Rotating state-bill sync (OpenStates)")
    parser.add_argument("--states", type=int, default=3,
                        help="Number of states to sync this run")
    parser.add_argument("--priority", action="store_true",
                        help="Walk top-population states first cycle")
    parser.add_argument("--max-pages", type=int, default=10,
                        help="Pages of bills per state")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true",
                        help="Reset the rotation cursor")
    args = parser.parse_args()

    if args.reset:
        if ROTATION_FILE.exists():
            ROTATION_FILE.unlink()
        log.info("rotation cursor reset")
        return 0

    states = _pick_states(args.states, args.priority)
    log.info("rotation: syncing %s", ", ".join(states))
    succeeded = 0
    for s in states:
        succeeded += _run_for_state(s, dry_run=args.dry_run, max_pages=args.max_pages)
    log.info("rotation done: %d/%d states", succeeded, len(states))
    return 0


if __name__ == "__main__":
    sys.exit(main())
