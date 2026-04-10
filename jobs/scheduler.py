"""
WeThePeople Automated Sync Scheduler

Uses fastscheduler to run data sync jobs on a recurring schedule.
All jobs run SEQUENTIALLY via a file lock to prevent SQLite write conflicts.

Usage:
    python jobs/scheduler.py                     # Start the scheduler daemon
    python jobs/scheduler.py --list              # Show all scheduled jobs and next run times
    python jobs/scheduler.py --run-now sync_votes  # Trigger a specific job immediately
    python jobs/scheduler.py --run-now all       # Trigger ALL jobs immediately (sequential)
    python jobs/scheduler.py --dry-run           # Start scheduler without actually executing jobs

Can be run as a systemd service alongside the API (see deploy/wethepeople-scheduler.service).
"""

from __future__ import annotations

import argparse
try:
    import fcntl
except ImportError:
    # Windows stub — fcntl is Unix-only; use msvcrt as fallback
    fcntl = None  # type: ignore[assignment]
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

LOG_DIR = ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

LOCK_FILE = ROOT / ".scheduler.lock"
STATE_FILE = ROOT / "scheduler_state.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOG_DIR / "scheduler.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("scheduler")

# ---------------------------------------------------------------------------
# Job registry — defines every sync job, its script, args, and schedule tier
# ---------------------------------------------------------------------------

# Schedule tiers (hours between runs):
#   daily    = 24h
#   48h      = 48h
#   72h      = 72h
#   weekly   = 168h  (7 days)
#   monthly  = 720h  (30 days)

US_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]


class JobDef:
    """Metadata for a scheduled sync job."""

    def __init__(
        self,
        name: str,
        script: str,
        args: Optional[List[str]] = None,
        interval_hours: float = 24,
        timeout_sec: int = 3600,
        description: str = "",
    ):
        self.name = name
        self.script = script
        self.args = args or []
        self.interval_hours = interval_hours
        self.timeout_sec = timeout_sec
        self.description = description

    def __repr__(self) -> str:
        return f"JobDef({self.name!r}, every {self.interval_hours}h)"


# Master job list — order matters for sequential execution within a tier
JOB_REGISTRY: List[JobDef] = [
    # ── Daily (24h) ──────────────────────────────────────────────
    JobDef(
        name="sync_votes",
        script="jobs/sync_votes.py",
        interval_hours=24,
        timeout_sec=1800,
        description="House roll-call votes from Congress.gov API",
    ),
    JobDef(
        name="sync_senate_votes",
        script="jobs/sync_senate_votes.py",
        interval_hours=24,
        timeout_sec=1800,
        description="Senate roll-call votes from senate.gov XML",
    ),
    # Quiver trade sync disabled - using House Clerk PDFs directly instead (more reliable, no API key needed)
    # JobDef(
    #     name="sync_congressional_trades",
    #     script="jobs/sync_congressional_trades.py",
    #     interval_hours=24,
    #     timeout_sec=1800,
    #     description="Congressional stock trades from Quiver Quantitative",
    # ),

    # ── Every 48 hours ───────────────────────────────────────────
    JobDef(
        name="sync_finance_political_data",
        script="jobs/sync_finance_political_data.py",
        interval_hours=48,
        timeout_sec=3600,
        description="Finance sector lobbying, contracts, donations",
    ),
    JobDef(
        name="sync_health_political_data",
        script="jobs/sync_health_political_data.py",
        interval_hours=48,
        timeout_sec=3600,
        description="Health sector lobbying, contracts, donations",
    ),
    JobDef(
        name="sync_transportation_data",
        script="jobs/sync_transportation_data.py",
        interval_hours=48,
        timeout_sec=3600,
        description="Transportation sector lobbying, contracts, donations",
    ),
    JobDef(
        name="sync_defense_data",
        script="jobs/sync_defense_data.py",
        interval_hours=48,
        timeout_sec=3600,
        description="Defense sector lobbying, contracts, SEC filings",
    ),

    # ── Every 72 hours ───────────────────────────────────────────
    JobDef(
        name="sync_finance_enforcement",
        script="jobs/sync_finance_enforcement.py",
        interval_hours=72,
        timeout_sec=3600,
        description="Finance enforcement actions from Federal Register",
    ),
    JobDef(
        name="sync_energy_enforcement",
        script="jobs/sync_energy_enforcement.py",
        interval_hours=72,
        timeout_sec=3600,
        description="Energy enforcement actions from Federal Register",
    ),
    JobDef(
        name="sync_health_enforcement",
        script="jobs/sync_health_enforcement.py",
        interval_hours=72,
        timeout_sec=3600,
        description="Health enforcement actions from Federal Register",
    ),
    JobDef(
        name="sync_transportation_enforcement",
        script="jobs/sync_transportation_enforcement.py",
        interval_hours=72,
        timeout_sec=3600,
        description="Transportation enforcement actions from Federal Register",
    ),
    JobDef(
        name="sync_defense_enforcement",
        script="jobs/sync_defense_enforcement.py",
        interval_hours=72,
        timeout_sec=3600,
        description="Defense enforcement actions from Federal Register",
    ),
    JobDef(
        name="sync_chemicals_data",
        script="jobs/sync_chemicals_data.py",
        interval_hours=168,
        timeout_sec=7200,
        description="Chemicals sector lobbying, contracts, SEC filings",
    ),
    JobDef(
        name="sync_chemicals_enforcement",
        script="jobs/sync_chemicals_enforcement.py",
        interval_hours=72,
        timeout_sec=3600,
        description="Chemicals enforcement actions from Federal Register",
    ),
    JobDef(
        name="sync_agriculture_data",
        script="jobs/sync_agriculture_data.py",
        interval_hours=168,
        timeout_sec=7200,
        description="Agriculture sector lobbying, contracts, SEC filings",
    ),
    JobDef(
        name="sync_agriculture_enforcement",
        script="jobs/sync_agriculture_enforcement.py",
        interval_hours=72,
        timeout_sec=3600,
        description="Agriculture enforcement actions from Federal Register",
    ),

    # ── Weekly (168h) ────────────────────────────────────────────
    JobDef(
        name="sync_finance_data",
        script="jobs/sync_finance_data.py",
        interval_hours=168,
        timeout_sec=7200,
        description="SEC filings, FDIC, CFPB, FRED, stock fundamentals",
    ),
    JobDef(
        name="sync_health_data",
        script="jobs/sync_health_data.py",
        interval_hours=168,
        timeout_sec=7200,
        description="OpenFDA adverse events, recalls, clinical trials, CMS",
    ),
    JobDef(
        name="sync_tech_data",
        script="jobs/sync_tech_data.py",
        interval_hours=168,
        timeout_sec=7200,
        description="Patents, tech sector data",
    ),
    JobDef(
        name="sync_energy_data",
        script="jobs/sync_energy_data.py",
        interval_hours=168,
        timeout_sec=7200,
        description="Emissions, energy sector data",
    ),
    JobDef(
        name="sync_donations",
        script="jobs/sync_donations.py",
        interval_hours=168,
        timeout_sec=3600,
        description="FEC PAC donation data",
    ),
    JobDef(
        name="sync_nhtsa_data",
        script="jobs/sync_nhtsa_data.py",
        interval_hours=168,
        timeout_sec=3600,
        description="NHTSA recalls and complaints data",
    ),
    JobDef(
        name="sync_fuel_economy",
        script="jobs/sync_fuel_economy.py",
        interval_hours=168,
        timeout_sec=3600,
        description="EPA fuel economy data",
    ),
    JobDef(
        name="sync_trades_from_disclosures",
        script="jobs/sync_trades_from_disclosures.py",
        interval_hours=24,
        timeout_sec=3600,
        description="Congressional trades from House financial disclosure PDFs (primary source)",
    ),

    JobDef(
        name="detect_anomalies",
        script="jobs/detect_anomalies.py",
        interval_hours=24,
        timeout_sec=3600,
        description="Scan for suspicious patterns: trades near votes, lobbying spikes, enforcement gaps",
    ),

    JobDef(
        name="detect_stories",
        script="jobs/detect_stories.py",
        interval_hours=24,
        timeout_sec=3600,
        description="Detect interesting data patterns and generate story drafts via Claude",
    ),

    # ── Daily story review email (Gate 5 — human approval) ────────
    JobDef(
        name="story_review_digest",
        script="jobs/story_review_digest.py",
        interval_hours=24,
        timeout_sec=300,
        description="Email pending draft stories to reviewer for approval via Resend",
    ),

    # ── Daily AI summarization (runs after syncs, Haiku for bulk) ──
    JobDef(
        name="ai_summarize_daily",
        script="jobs/ai_summarize.py",
        args=["--votes", "--enforcement", "--contracts", "--lobbying", "--limit", "50"],
        interval_hours=24,
        timeout_sec=1800,  # 30 minutes
        description="Haiku summaries for new unsummarized votes, enforcement, contracts, lobbying (50/run cap)",
    ),

    # ── Weekly digest ──────────────────────────────────────────────
    JobDef(
        name="generate_digest",
        script="jobs/generate_digest.py",
        args=["--send"],
        interval_hours=168,  # weekly
        timeout_sec=600,
        description="Weekly subscriber digest: personalized rep activity, trades, votes, anomalies",
    ),

    # ── New data source syncs ──────────────────────────────────────
    JobDef(
        name="sync_samgov",
        script="jobs/sync_samgov.py",
        interval_hours=24,
        timeout_sec=1800,
        description="SAM.gov exclusions + entity registrations (10 req/day budget)",
    ),
    JobDef(
        name="sync_regulatory_comments",
        script="jobs/sync_regulatory_comments.py",
        interval_hours=168,
        timeout_sec=7200,
        description="Corporate regulatory comments from Regulations.gov",
    ),
    JobDef(
        name="sync_it_dashboard",
        script="jobs/sync_it_dashboard.py",
        interval_hours=168,
        timeout_sec=1800,
        description="Federal IT investment CIO ratings from IT Dashboard CSV",
    ),
    JobDef(
        name="sync_site_scanning",
        script="jobs/sync_site_scanning.py",
        interval_hours=168,
        timeout_sec=1800,
        description="Government website tech footprint from GSA Site Scanning CSV",
    ),
    JobDef(
        name="sync_fara_data",
        script="jobs/sync_fara_data.py",
        interval_hours=168,
        timeout_sec=3600,
        description="FARA foreign agent registrations, principals, and agents from efile.fara.gov",
    ),

    # ── Pipeline monitoring (daily) ──────────────────────────────────
    JobDef(
        name="monitor_pipeline",
        script="jobs/monitor_pipeline.py",
        interval_hours=24,
        timeout_sec=120,
        description="Pipeline health check: overdue jobs, stuck DLQ items, disk usage",
    ),

    # NOTE: twitter_bot.py is NOT in the scheduler — it runs via cron at specific times
    # (4x/day at fixed hours for optimal engagement, not on an interval).

    # ── Twitter Monitor (every 4h) ─────────────────────────────────
    JobDef(
        name="twitter_monitor",
        script="jobs/twitter_monitor.py",
        interval_hours=4,
        timeout_sec=600,    # 10 min — API calls + DB queries + randomized post delay
        description="Scan watchdog X accounts, match entities, auto-quote 1/day max",
    ),

    # ── Compliance / Maintenance (weekly) ─────────────────────────
    JobDef(
        name="data_retention",
        script="jobs/enforce_retention.py",
        interval_hours=168,  # weekly
        timeout_sec=600,     # 10 minutes — deletion queries are fast
        description="SOC2 data retention: delete expired audit logs, rate limit records, tweet logs, pipeline runs",
    ),

    # ── Monthly (720h) ───────────────────────────────────────────
    # NOTE: OpenStates API has a 250/day rate limit on free tier. For bulk imports,
    # prefer the openstates/people YAML import (import_openstates_people.py) which
    # bypasses the API entirely. This sync job is kept for incremental updates.
    JobDef(
        name="sync_state_data",
        script="jobs/sync_state_data.py",
        # Args are set dynamically in _run_state_sync()
        interval_hours=720,
        timeout_sec=14400,  # 4 hours — 50 states
        description="State legislators and bills for all 50 states (OpenStates)",
    ),
]

JOB_MAP: Dict[str, JobDef] = {j.name: j for j in JOB_REGISTRY}

# ---------------------------------------------------------------------------
# File-lock based sequential execution
# ---------------------------------------------------------------------------


class SchedulerLock:
    """Simple file lock to prevent overlapping job execution.

    Uses fcntl.flock (Unix) so the lock is automatically released if the
    process crashes.
    """

    def __init__(self, lock_path: Path = LOCK_FILE):
        self.lock_path = lock_path
        self._fd: Optional[int] = None

    def acquire(self, blocking: bool = True) -> bool:
        self._fd = os.open(str(self.lock_path), os.O_CREAT | os.O_RDWR)
        try:
            if fcntl is not None:
                if blocking:
                    fcntl.flock(self._fd, fcntl.LOCK_EX)
                else:
                    fcntl.flock(self._fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                # Windows fallback using msvcrt — lock the entire file
                import msvcrt
                lock_size = max(os.fstat(self._fd).st_size, 1)
                if blocking:
                    msvcrt.locking(self._fd, msvcrt.LK_LOCK, lock_size)
                else:
                    msvcrt.locking(self._fd, msvcrt.LK_NBLCK, lock_size)
            return True
        except (OSError, BlockingIOError):
            os.close(self._fd)
            self._fd = None
            return False

    def release(self) -> None:
        if self._fd is not None:
            if fcntl is not None:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
            else:
                import msvcrt
                try:
                    lock_size = max(os.fstat(self._fd).st_size, 1)
                    msvcrt.locking(self._fd, msvcrt.LK_UNLCK, lock_size)
                except OSError:
                    pass
            os.close(self._fd)
            self._fd = None

    def __enter__(self) -> "SchedulerLock":
        self.acquire(blocking=True)
        return self

    def __exit__(self, *args: Any) -> None:
        self.release()


_lock = SchedulerLock()

# ---------------------------------------------------------------------------
# Job execution
# ---------------------------------------------------------------------------


def _run_job(job: JobDef, dry_run: bool = False) -> Dict[str, Any]:
    """Execute a single sync job under the global lock.

    Returns a result dict with status, duration, stdout/stderr excerpts.

    TODO: Add retry logic (e.g., 1 automatic retry with backoff) for transient
    failures like network timeouts or temporary API errors.
    """
    result: Dict[str, Any] = {
        "job": job.name,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "finished_at": None,
        "status": "pending",
        "duration_sec": 0,
        "error": None,
    }

    if dry_run:
        log.info("[DRY-RUN] Would run: %s (%s %s)", job.name, job.script, " ".join(job.args))
        result["status"] = "dry-run"
        result["finished_at"] = result["started_at"]
        return result

    log.info("╔══ Starting job: %s", job.name)
    log.info("║  Script: %s %s", job.script, " ".join(job.args))

    _lock.acquire(blocking=True)
    started = time.monotonic()
    try:
        cmd = [sys.executable, str(ROOT / job.script)] + job.args

        # Special handling for state sync — iterate all 50 states
        if job.name == "sync_state_data":
            _run_state_sync(job, result, dry_run)
        else:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=job.timeout_sec,
                cwd=str(ROOT),
            )
            if proc.returncode == 0:
                result["status"] = "success"
            else:
                result["status"] = "failed"
                result["error"] = proc.stderr[-2000:] if proc.stderr else f"exit code {proc.returncode}"
                log.error("║  FAILED: %s (exit %d)", job.name, proc.returncode)
                if proc.stderr:
                    log.error("║  stderr: %s", proc.stderr[-500:])

    except subprocess.TimeoutExpired:
        result["status"] = "timeout"
        result["error"] = f"Exceeded {job.timeout_sec}s timeout"
        log.error("║  TIMEOUT: %s after %ds", job.name, job.timeout_sec)
    except Exception as exc:
        result["status"] = "error"
        result["error"] = str(exc)
        log.exception("║  EXCEPTION in %s", job.name)
    finally:
        elapsed = time.monotonic() - started
        result["duration_sec"] = round(elapsed, 2)
        result["finished_at"] = datetime.now(timezone.utc).isoformat()
        _lock.release()

    status_icon = "OK" if result["status"] == "success" else "FAIL"
    log.info("╚══ Finished %s [%s] in %.1fs", job.name, status_icon, result["duration_sec"])
    return result


def _run_state_sync(job: JobDef, result: Dict[str, Any], dry_run: bool = False) -> None:
    """Run sync_state_data.py for all 50 states sequentially."""
    failures: List[str] = []
    for state in US_STATES:
        log.info("║  State sync: %s", state)
        cmd = [sys.executable, str(ROOT / job.script), "--state", state.lower()]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 min per state
                cwd=str(ROOT),
            )
            if proc.returncode != 0:
                failures.append(state)
                log.warning("║  State %s failed (exit %d)", state, proc.returncode)
        except subprocess.TimeoutExpired:
            failures.append(state)
            log.warning("║  State %s timed out", state)
        except Exception as exc:
            failures.append(state)
            log.warning("║  State %s error: %s", state, exc)

    if len(failures) == len(US_STATES):
        # All 50 states failed — this is a full failure, not partial
        result["status"] = "failed"
        result["error"] = f"All {len(US_STATES)} states failed"
    elif failures:
        result["status"] = "partial"
        result["error"] = f"Failed states ({len(failures)}/{len(US_STATES)}): {', '.join(failures)}"
    else:
        result["status"] = "success"


# ---------------------------------------------------------------------------
# fastscheduler integration
# ---------------------------------------------------------------------------


def _build_scheduler(dry_run: bool = False) -> Any:
    """Create a FastScheduler instance with all jobs registered."""
    from fastscheduler import FastScheduler

    scheduler = FastScheduler(
        state_file=str(STATE_FILE),
        quiet=False,
        max_workers=1,  # Sequential — only 1 worker thread
    )

    def _make_handler(job_def: JobDef) -> Callable[[], None]:
        """Create a closure that runs the given job."""
        def handler() -> None:
            _run_job(job_def, dry_run=dry_run)
        handler.__name__ = job_def.name
        handler.__doc__ = job_def.description
        return handler

    # Register each job with the appropriate interval using decorators.
    # fastscheduler's .hours / .days are decorator-style attributes,
    # so we apply them as decorators to our handler functions.
    for job in JOB_REGISTRY:
        handler = _make_handler(job)
        hours = job.interval_hours

        # NOTE: hours == 168 falls into the weekly branch (7 days).
        # Anything < 168 uses raw hours; > 168 uses 30-day monthly.
        if hours < 168:
            # Use hours for daily / 48h / 72h intervals
            decorator = scheduler.every(int(hours)).hours
        elif hours == 168:
            # Weekly
            decorator = scheduler.every(7).days
        else:
            # Monthly — every 30 days
            decorator = scheduler.every(30).days

        # Apply the decorator to register the handler
        decorator(handler)

    return scheduler


# ---------------------------------------------------------------------------
# CLI commands
# ---------------------------------------------------------------------------


def cmd_list() -> None:
    """Print all registered jobs and their schedules."""
    print(f"\n{'Job Name':<35} {'Interval':<12} {'Timeout':<10} {'Description'}")
    print("─" * 100)
    for job in JOB_REGISTRY:
        if job.interval_hours <= 24:
            interval = f"{int(job.interval_hours)}h"
        elif job.interval_hours <= 72:
            interval = f"{int(job.interval_hours)}h"
        elif job.interval_hours <= 168:
            interval = "weekly"
        else:
            interval = "monthly"

        timeout = f"{job.timeout_sec // 60}m"
        print(f"  {job.name:<33} {interval:<12} {timeout:<10} {job.description}")

    print(f"\nTotal: {len(JOB_REGISTRY)} jobs")
    print(f"Lock file: {LOCK_FILE}")
    print(f"State file: {STATE_FILE}")
    print(f"Log dir: {LOG_DIR}\n")


def cmd_run_now(job_name: str, dry_run: bool = False) -> int:
    """Run a specific job (or 'all') immediately."""
    # Non-blocking check: if the scheduler daemon holds the lock, bail early.
    # NOTE: This is a TOCTOU race — the lock could be acquired between the probe
    # and the actual job run. Acceptable because _run_job acquires its own lock.
    probe = SchedulerLock()
    if not probe.acquire(blocking=False):
        print("Scheduler daemon is currently running a job. Try again later.")
        return 1
    probe.release()

    if job_name == "all":
        log.info("Running ALL jobs immediately (sequential)...")
        failed = 0
        for job in JOB_REGISTRY:
            result = _run_job(job, dry_run=dry_run)
            if result["status"] not in ("success", "partial", "dry-run"):
                failed += 1
        if failed:
            log.warning("%d/%d jobs failed", failed, len(JOB_REGISTRY))
            return 1
        log.info("All %d jobs completed", len(JOB_REGISTRY))
        return 0

    if job_name not in JOB_MAP:
        print(f"Unknown job: {job_name!r}")
        print(f"Available jobs: {', '.join(JOB_MAP.keys())}")
        return 1

    result = _run_job(JOB_MAP[job_name], dry_run=dry_run)
    return 0 if result["status"] in ("success", "partial", "dry-run") else 1


def cmd_start(dry_run: bool = False) -> None:
    """Start the scheduler daemon (blocks forever)."""
    log.info("Starting WeThePeople sync scheduler...")
    log.info("Registered %d jobs, max_workers=1 (sequential)", len(JOB_REGISTRY))

    scheduler = _build_scheduler(dry_run=dry_run)

    try:
        scheduler.start()
        log.info("Scheduler running. Press Ctrl+C to stop.")
        # fastscheduler.start() blocks, but if it doesn't, keep alive
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        log.info("Scheduler stopped by user.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="WeThePeople sync scheduler — automated data ingestion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python jobs/scheduler.py                        # Start scheduler daemon
  python jobs/scheduler.py --list                 # Show all jobs
  python jobs/scheduler.py --run-now sync_votes   # Run one job now
  python jobs/scheduler.py --run-now all          # Run all jobs now
  python jobs/scheduler.py --dry-run              # Start without executing
        """,
    )
    parser.add_argument("--list", action="store_true", help="List all scheduled jobs")
    parser.add_argument("--run-now", type=str, metavar="JOB", help="Run a specific job immediately (or 'all')")
    parser.add_argument("--dry-run", action="store_true", help="Log what would run without executing")

    args = parser.parse_args()

    if args.list:
        cmd_list()
        return 0

    if args.run_now:
        return cmd_run_now(args.run_now, dry_run=args.dry_run)

    cmd_start(dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
