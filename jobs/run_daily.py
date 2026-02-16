"""Daily Orchestrator (L2)

Runs the daily pipeline stages in a fixed order and writes a run manifest row
into the `pipeline_runs` table.

Design goals:
- Keep existing commands working (additive only)
- Dry-run is deterministic and DB-safe (skips all mutating/network stages)
- No-network mode is enforced in-process and for subprocesses
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# Ensure repo root is importable when invoked as a script
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from sqlalchemy.exc import OperationalError

from models.database import SessionLocal
from services.ops.no_network import install_no_network_guard
from services.ops.run_manifest import finish_pipeline_run, get_git_sha, start_pipeline_run


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _iso_utc(dt: datetime) -> str:
    # RFC3339-ish, stable
    return dt.isoformat().replace("+00:00", "Z")


def _run_subprocess(args: List[str], env: Dict[str, str]) -> Dict[str, Any]:
    started_at = _utc_now()
    started = time.time()
    p = subprocess.run(
        args,
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
    )
    ended_at = _utc_now()
    duration_ms = int(max(0.0, time.time() - started) * 1000)

    # Keep manifest small/deterministic: store only exit code and a short tail.
    stdout_tail = (p.stdout or "").strip().splitlines()[-10:]
    stderr_tail = (p.stderr or "").strip().splitlines()[-10:]

    return {
        "exit_code": p.returncode,
        "started_at": _iso_utc(started_at),
        "ended_at": _iso_utc(ended_at),
        "duration_ms": duration_ms,
        "stdout_tail": stdout_tail,
        "stderr_tail": stderr_tail,
    }


def _select_policy1_people(
    *,
    weekly_floor_days: int,
    max_people: int,
) -> Dict[str, Any]:
    from sqlalchemy import or_

    from models.database import SessionLocal, TrackedMember

    now = _utc_now()
    cutoff = now - timedelta(days=int(weekly_floor_days))

    db = SessionLocal()
    try:
        q = (
            db.query(TrackedMember)
            .filter(TrackedMember.is_active == 1)
            .filter(
                or_(
                    TrackedMember.needs_ingest == 1,
                    TrackedMember.last_full_refresh_at.is_(None),
                    TrackedMember.last_full_refresh_at < cutoff,
                )
            )
            .order_by(
                TrackedMember.needs_ingest.desc(),
                (TrackedMember.last_full_refresh_at.is_(None)).desc(),
                TrackedMember.last_full_refresh_at.asc(),
                TrackedMember.person_id.asc(),
            )
            .limit(int(max_people))
        )

        rows = q.all()

        selected_person_ids: List[str] = []
        reason_by_person: Dict[str, str] = {}

        for r in rows:
            pid = r.person_id
            selected_person_ids.append(pid)
            if int(getattr(r, "needs_ingest") or 0) == 1:
                reason_by_person[pid] = "needs_ingest"
            else:
                reason_by_person[pid] = "weekly_floor"

        return {
            "selected_person_ids": selected_person_ids,
            "reason_by_person": reason_by_person,
            "cutoff": _iso_utc(cutoff),
            "now": _iso_utc(now),
        }
    finally:
        db.close()


def _run_policy1_for_people(
    *,
    base_cmd: List[str],
    person_ids: List[str],
    env: Dict[str, str],
) -> Dict[str, Any]:
    people_exit_codes: Dict[str, int] = {}
    failed_people: List[str] = []
    last_stdout_tail: List[str] = []
    last_stderr_tail: List[str] = []

    for pid in person_ids:
        cmd = list(base_cmd) + ["--person-id", pid]
        r = _run_subprocess(cmd, env=env)
        people_exit_codes[pid] = int(r.get("exit_code") or 0)

        # Keep a tail for debugging without bloating the manifest.
        last_stdout_tail = list(r.get("stdout_tail") or [])
        last_stderr_tail = list(r.get("stderr_tail") or [])

        if people_exit_codes[pid] != 0:
            failed_people.append(pid)

    overall = 0 if len(failed_people) == 0 else 1
    return {
        "exit_code": overall,
        "stdout_tail": last_stdout_tail,
        "stderr_tail": last_stderr_tail,
        "attempted_people": list(person_ids),
        "failed_people": failed_people,
        "people_exit_codes": people_exit_codes,
    }


def _recompute_in_process(*, limit: Optional[int] = None) -> Dict[str, Any]:
    """Run the recompute stage in-process.

    This avoids subprocess complexity and lets us record deterministic counts.
    """

    from models.database import Claim, ClaimEvaluation
    from jobs.recompute_evaluations import recompute_for_person

    db = SessionLocal()
    try:
        dirty_before = db.query(Claim).filter(Claim.needs_recompute == 1).count()
    finally:
        db.close()

    recompute_for_person(person_id=None, limit=limit, dirty_only=True)

    db2 = SessionLocal()
    try:
        dirty_after = db2.query(Claim).filter(Claim.needs_recompute == 1).count()
        evals_total = db2.query(ClaimEvaluation).count()
    finally:
        db2.close()

    processed = dirty_before if limit is None else min(dirty_before, int(limit))
    return {
        "dirty_claims_before": dirty_before,
        "dirty_claims_after": dirty_after,
        "claims_processed_estimate": processed,
        "evaluations_total": evals_total,
    }


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run daily pipeline with manifest logging")
    parser.add_argument("--dry-run", action="store_true", help="Skip all network/mutating stages")
    parser.add_argument(
        "--no-network",
        action="store_true",
        help="Enforce NO_NETWORK=1 (belt + suspenders)",
    )
    parser.add_argument("--congress", type=int, default=119, help="Congress number (default: 119)")
    parser.add_argument("--limit", type=int, default=None, help="Optional limit for recompute stage")

    # Policy 1: bounded weekly-floor refresh selection (daily change detection can be added later).
    parser.add_argument(
        "--policy1",
        action="store_true",
        help="Enable Policy 1 scheduling (weekly floor + needs_ingest selection)",
    )
    parser.add_argument(
        "--weekly-floor-days",
        type=int,
        default=7,
        help="Force a full refresh if last_full_refresh_at older than N days (default: 7)",
    )
    parser.add_argument(
        "--max-people",
        type=int,
        default=25,
        help="Max tracked members to fully refresh in this run (default: 25)",
    )
    parser.add_argument("--skip-ingest", action="store_true", help="Skip ingest_claims stage")
    parser.add_argument("--skip-groundtruth", action="store_true", help="Skip sync_groundtruth stage")
    parser.add_argument("--skip-enrich", action="store_true", help="Skip enrich_bills stage")
    parser.add_argument("--skip-recompute", action="store_true", help="Skip recompute_evaluations stage")

    args = parser.parse_args(argv)

    if args.no_network:
        os.environ["NO_NETWORK"] = "1"
        install_no_network_guard("--no-network passed to jobs/run_daily.py")

    # Always pass these through to subprocesses.
    base_env = dict(os.environ)
    base_env.setdefault("DISABLE_STARTUP_FETCH", os.environ.get("DISABLE_STARTUP_FETCH", "1"))
    if args.no_network:
        base_env["NO_NETWORK"] = "1"

    policy1_selection: Dict[str, Any] = {
        "enabled": bool(args.policy1),
        "weekly_floor_days": int(args.weekly_floor_days),
        "max_people": int(args.max_people),
        "selected_person_ids": [],
        "reason_by_person": {},
        "required_stages": [
            "ingest_claims",
            "sync_groundtruth",
            "enrich_bills",
            "recompute_evaluations",
        ],
        "full_refresh_completed": False,
        "marked_refreshed_person_ids": [],
    }

    if args.policy1 and not args.dry_run:
        sel = _select_policy1_people(
            weekly_floor_days=int(args.weekly_floor_days),
            max_people=int(args.max_people),
        )
        policy1_selection.update(sel)

    stages: List[Dict[str, Any]] = [
        {
            "name": "ingest_claims",
            "network": True,
            "mutates_db": True,
            "skip_flag": bool(args.skip_ingest),
            "requires_people": bool(args.policy1),
            "cmd": [sys.executable, "jobs/ingest_claims.py", "--all", "--since-days", "1", "--limit-pages", "2"],
            "policy1_cmd": [
                sys.executable,
                "jobs/ingest_claims.py",
                "--since-days",
                "1",
                "--limit-pages",
                "2",
            ],
        },
        {
            "name": "sync_groundtruth",
            "network": True,
            "mutates_db": True,
            "skip_flag": bool(args.skip_groundtruth),
            "requires_people": bool(args.policy1),
            "cmd": [
                sys.executable,
                "jobs/sync_member_groundtruth.py",
                "--all-active",
                "--congress",
                str(args.congress),
            ],
            "policy1_cmd": [
                sys.executable,
                "jobs/sync_member_groundtruth.py",
                "--congress",
                str(args.congress),
            ],
        },
        {
            "name": "enrich_bills",
            "network": True,
            "mutates_db": True,
            "skip_flag": bool(args.skip_enrich),
            "requires_people": bool(args.policy1),
            "cmd": [sys.executable, "jobs/enrich_bills.py", "--only-needs-enrichment", "--limit", "150"],
        },
        {
            "name": "recompute_evaluations",
            "network": False,
            "mutates_db": True,
            "skip_flag": bool(args.skip_recompute),
            "callable": "recompute_in_process",
        },
    ]

    manifest_counts: Dict[str, Any] = {
        "dry_run": bool(args.dry_run),
        "no_network": bool(args.no_network),
        "congress": args.congress,
        "policy1": policy1_selection,
        "skip_flags": {
            "skip_ingest": bool(args.skip_ingest),
            "skip_groundtruth": bool(args.skip_groundtruth),
            "skip_enrich": bool(args.skip_enrich),
            "skip_recompute": bool(args.skip_recompute),
        },
        "stages": {},
    }

    db = SessionLocal()
    run_id = None

    try:
        try:
            row = start_pipeline_run(
                db,
                args={
                    "dry_run": bool(args.dry_run),
                    "no_network": bool(args.no_network),
                    "congress": args.congress,
                    "limit": args.limit,
                },
                git_sha=get_git_sha(REPO_ROOT),
            )
            run_id = row.run_id
        except OperationalError as e:
            # Friendly error if migration hasn't been applied.
            msg = str(e)
            if "no such table" in msg and "pipeline_runs" in msg:
                print("❌ Missing pipeline_runs table")
                print("Apply the Alembic migration or create tables before running run_daily.")
            raise

        for stage in stages:
            name = stage["name"]

            stage_network = bool(stage.get("network"))
            stage_mutates = bool(stage.get("mutates_db"))

            # Decide skip reason.
            skip_reason = None
            if args.dry_run:
                skip_reason = "dry_run"
            elif bool(stage.get("skip_flag")):
                skip_reason = "skip_flag"
            elif bool(stage.get("requires_people")) and args.policy1 and not policy1_selection.get(
                "selected_person_ids"
            ):
                skip_reason = "no_selected_people"
            elif name == "sync_groundtruth":
                # Must auto-skip if API key missing.
                api_key = os.getenv("CONGRESS_API_KEY") or os.getenv("API_KEY_CONGRESS")
                if not api_key:
                    skip_reason = "missing_CONGRESS_API_KEY"
            elif stage_network and os.getenv("NO_NETWORK") == "1":
                skip_reason = "no_network"

            if skip_reason is not None:
                ts = _utc_now()
                manifest_counts["stages"][name] = {
                    "started_at": _iso_utc(ts),
                    "ended_at": _iso_utc(ts),
                    "duration_ms": 0,
                    "skipped": True,
                    "reason": skip_reason,
                    "network": stage_network,
                    "mutates_db": stage_mutates,
                    "counts": {},
                }
                continue

            # Execute stage.
            stage_started_at = _utc_now()
            stage_started = time.time()

            if stage.get("callable") == "recompute_in_process":
                counts = _recompute_in_process(limit=args.limit)
                stage_ended_at = _utc_now()
                duration_ms = int(max(0.0, time.time() - stage_started) * 1000)
                manifest_counts["stages"][name] = {
                    "started_at": _iso_utc(stage_started_at),
                    "ended_at": _iso_utc(stage_ended_at),
                    "duration_ms": duration_ms,
                    "skipped": False,
                    "network": stage_network,
                    "mutates_db": stage_mutates,
                    "counts": counts,
                }
                continue

            if args.policy1 and stage.get("policy1_cmd"):
                person_ids = list(policy1_selection.get("selected_person_ids") or [])
                result = _run_policy1_for_people(
                    base_cmd=list(stage["policy1_cmd"]),
                    person_ids=person_ids,
                    env=base_env,
                )
            else:
                result = _run_subprocess(stage["cmd"], env=base_env)
            stage_ended_at = _utc_now()
            duration_ms = int(max(0.0, time.time() - stage_started) * 1000)
            manifest_counts["stages"][name] = {
                "started_at": result.get("started_at") or _iso_utc(stage_started_at),
                "ended_at": result.get("ended_at") or _iso_utc(stage_ended_at),
                "duration_ms": result.get("duration_ms", duration_ms),
                "skipped": False,
                "network": stage_network,
                "mutates_db": stage_mutates,
                "counts": {
                    "exit_code": result.get("exit_code"),
                    "stdout_tail": result.get("stdout_tail"),
                    "stderr_tail": result.get("stderr_tail"),
                    "attempted_people": result.get("attempted_people"),
                    "failed_people": result.get("failed_people"),
                    "people_exit_codes": result.get("people_exit_codes"),
                },
            }

            if result.get("exit_code") != 0:
                raise RuntimeError(f"stage_failed:{name}")

        # Policy 1: only clear needs_ingest when a full refresh succeeded and no required stage was skipped.
        if args.policy1 and policy1_selection.get("selected_person_ids"):
            stages_counts = manifest_counts.get("stages") or {}
            required = list(policy1_selection.get("required_stages") or [])

            def _stage_ok(stage_name: str) -> bool:
                s = stages_counts.get(stage_name) or {}
                if s.get("skipped") is True:
                    return False
                if stage_name == "recompute_evaluations":
                    return True
                exit_code = ((s.get("counts") or {}).get("exit_code"))
                return int(exit_code or 0) == 0

            full_refresh_completed = all(_stage_ok(n) for n in required)
            policy1_selection["full_refresh_completed"] = bool(full_refresh_completed)

            if full_refresh_completed:
                from models.database import TrackedMember

                refreshed_at = _utc_now()
                person_ids = list(policy1_selection.get("selected_person_ids") or [])
                (
                    db.query(TrackedMember)
                    .filter(TrackedMember.person_id.in_(person_ids))
                    .update(
                        {
                            TrackedMember.needs_ingest: 0,
                            TrackedMember.last_full_refresh_at: refreshed_at,
                        },
                        synchronize_session=False,
                    )
                )
                policy1_selection["marked_refreshed_person_ids"] = person_ids
                manifest_counts["policy1"] = policy1_selection

        finish_pipeline_run(db, run_id=run_id, status="success", counts=manifest_counts, error=None)
        return 0

    except Exception as e:
        if run_id is not None:
            try:
                finish_pipeline_run(
                    db,
                    run_id=run_id,
                    status="failed",
                    counts=manifest_counts,
                    error=f"{type(e).__name__}: {e}",
                )
            except Exception:
                pass
        raise

    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
