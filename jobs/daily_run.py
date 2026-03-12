"""Daily orchestrator (Phase L2).

Runs the backend "live loop" in a strict order and writes an audit manifest.

Constraints:
- Additive: does not change existing jobs.
- Writes a manifest even on failure (partial status allowed).
- Supports dry-run mode for deterministic gate tests (no network).

Usage:
  python jobs/daily_run.py --dry-run
  python jobs/daily_run.py --since-days 90 --limit-pages 25 --congress 119
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class DailyRunConfig:
    since_days: int
    limit_pages: int
    congress: int
    dry_run: bool


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _run_cmd(cmd: List[str], timeout_sec: Optional[int] = None) -> Dict[str, Any]:
    started = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_sec)
    duration = time.time() - started
    return {
        "cmd": cmd,
        "returncode": p.returncode,
        "duration_sec": round(duration, 3),
        "stdout": p.stdout[-20000:],  # cap to keep manifests small
        "stderr": p.stderr[-20000:],
    }


def _manifest_dir() -> Path:
    # Allow tests/operators to redirect manifests.
    override = os.getenv("DAILY_RUN_MANIFEST_DIR")
    base = Path(override) if override else Path("audit") / "daily_runs"
    base.mkdir(parents=True, exist_ok=True)
    return base


def run_daily_pipeline(config: DailyRunConfig) -> Dict[str, Any]:
    """Run daily pipeline and return manifest dict.

    Always returns a manifest dict; errors are recorded in-step.
    """

    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    manifest_path = _manifest_dir() / f"daily_run_{run_id}.json"

    manifest: Dict[str, Any] = {
        "run_id": run_id,
        "manifest_path": str(manifest_path),
        "started_at": _utc_now_iso(),
        "finished_at": None,
        "config": {
            "since_days": config.since_days,
            "limit_pages": config.limit_pages,
            "congress": config.congress,
            "dry_run": config.dry_run,
        },
        "steps": [],
        "status": "running",
    }

    def flush() -> None:
        # Best-effort: never crash because manifest can't be written.
        try:
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
        except Exception:
            pass

    flush()

    def add_step(name: str, cmd: List[str], enabled: bool = True) -> None:
        step: Dict[str, Any] = {
            "name": name,
            "started_at": _utc_now_iso(),
            "finished_at": None,
            "status": "skipped" if not enabled else "running",
            "result": None,
            "error": None,
        }
        manifest["steps"].append(step)
        flush()

        if not enabled:
            step["finished_at"] = _utc_now_iso()
            flush()
            return

        try:
            result = _run_cmd(cmd)
            step["result"] = result
            step["status"] = "success" if result["returncode"] == 0 else "failed"
        except Exception as e:
            step["status"] = "failed"
            step["error"] = str(e)
        finally:
            step["finished_at"] = _utc_now_iso()
            flush()

    try:
        # Step 1: ingest claims (bounded)
        add_step(
            name="ingest_claims",
            cmd=[
                sys.executable,
                "jobs/ingest_claims.py",
                "--all",
                "--since-days",
                str(config.since_days),
                "--limit-pages",
                str(config.limit_pages),
            ],
            enabled=not config.dry_run,
        )

        # Step 2: enrich bills (resume-safe)
        add_step(
            name="enrich_bills",
            cmd=[
                sys.executable,
                "jobs/enrich_bills.py",
                "--only-needs-enrichment",
                "--limit",
                "150",
                "--rate-limit",
                "0.4",
            ],
            enabled=not config.dry_run,
        )

        # Step 3: sync ground truth (cached/rail)
        add_step(
            name="sync_member_groundtruth",
            cmd=[
                sys.executable,
                "jobs/sync_member_groundtruth.py",
                "--all-active",
                "--congress",
                str(config.congress),
            ],
            enabled=not config.dry_run,
        )

        # Step 4: recompute evaluations (dirty-only default)
        add_step(
            name="recompute_evaluations",
            cmd=[
                sys.executable,
                "jobs/recompute_evaluations.py",
                "--limit",
                "500",
            ],
            enabled=not config.dry_run,
        )

        # Step 5: build gold ledger (materialize)
        add_step(
            name="build_gold_ledger",
            cmd=[
                sys.executable,
                "jobs/build_gold_ledger.py",
                "--limit",
                "2000",
            ],
            enabled=not config.dry_run,
        )

        # Step 6: change detection (post-sync snapshot + diff)
        if not config.dry_run:
            try:
                from models.database import SessionLocal
                from services.change_detection import run_change_detection
                db = SessionLocal()
                diff = run_change_detection(db)
                db.close()
                manifest["change_detection"] = {
                    "status": "ok",
                    "alerts": diff.get("alerts", []),
                    "changes_summary": {k: v.get("delta", 0) for k, v in diff.get("changes", {}).items()},
                }
            except Exception as e:
                manifest["change_detection"] = {"status": "error", "error": str(e)}

        any_failed = any(s.get("status") == "failed" for s in manifest["steps"])
        manifest["status"] = "failed" if any_failed else "success"
        return manifest

    finally:
        manifest["finished_at"] = _utc_now_iso()
        flush()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Run the daily backend pipeline and write a manifest")
    parser.add_argument("--since-days", type=int, default=90, help="How far back to ingest claims")
    parser.add_argument("--limit-pages", type=int, default=25, help="Max pages per member to ingest")
    parser.add_argument("--congress", type=int, default=119, help="Congress number for ground truth sync")
    parser.add_argument("--dry-run", action="store_true", help="Do not execute jobs; only write a manifest")

    args = parser.parse_args(argv)

    manifest = run_daily_pipeline(
        DailyRunConfig(
            since_days=args.since_days,
            limit_pages=args.limit_pages,
            congress=args.congress,
            dry_run=args.dry_run,
        )
    )

    # Dry-run should still succeed (status=success).
    if args.dry_run:
        print(f"✓ daily_run dry-run wrote manifest (status={manifest['status']})")
        return 0

    return 0 if manifest.get("status") == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
