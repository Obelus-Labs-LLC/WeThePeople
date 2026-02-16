"""Deterministic contract test for jobs/run_daily.py (NO NETWORK).

Requirements:
- Must run with NO_NETWORK=1 and must not require API keys
- Must be deterministic
- Only allowed DB mutation: pipeline_runs row (in a temp DB)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    # SQLAlchemy sqlite URLs want forward slashes on Windows.
    posix = db_path.resolve().as_posix()
    return f"sqlite:///{posix}"


def main() -> int:
    # Contract: enforce no network inside the test process.
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_run_daily_contract_"))
    tmp_db = tmp_dir / "tmp_test.db"

    # IMPORTANT: Set DB URL before importing models.database so engine binds to temp DB.
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from models.database import PipelineRun, SessionLocal, engine

        # Create just the manifest table (avoid touching unrelated schema).
        PipelineRun.__table__.create(bind=engine, checkfirst=True)

        env = dict(os.environ)
        cmd = [sys.executable, "jobs/run_daily.py", "--dry-run", "--no-network"]
        p = subprocess.run(
            cmd,
            cwd=str(Path(__file__).resolve().parent),
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )

        if p.returncode != 0:
            print("STDOUT:\n" + (p.stdout or ""))
            print("STDERR:\n" + (p.stderr or ""))
        assert p.returncode == 0, f"run_daily exited {p.returncode}"

        db = SessionLocal()
        try:
            rows = db.query(PipelineRun).all()
            assert len(rows) == 1, f"expected 1 pipeline_runs row, got {len(rows)}"
            row = rows[0]

            assert row.status == "success", f"expected status=success, got {row.status}"
            assert row.started_at is not None
            assert row.finished_at is not None

            counts = json.loads(row.counts_json or "{}")
            stages = counts.get("stages") or {}

            # Must include all stages.
            for stage_name in [
                "ingest_claims",
                "sync_groundtruth",
                "enrich_bills",
                "recompute_evaluations",
            ]:
                assert stage_name in stages, f"missing stage in counts_json: {stage_name}"

            # In dry-run, all stages are skipped and deterministic.
            for stage_name, stage_counts in stages.items():
                assert stage_counts.get("skipped") is True, f"stage {stage_name} not skipped in dry-run"
                assert stage_counts.get("reason") == "dry_run"

            print("PASS: run_daily dry-run contract OK")
            return 0
        finally:
            db.close()

    finally:
        # Cleanup temp DB artifacts.
        try:
            if tmp_db.exists():
                tmp_db.unlink()
        except Exception:
            pass
        try:
            if tmp_dir.exists():
                tmp_dir.rmdir()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
