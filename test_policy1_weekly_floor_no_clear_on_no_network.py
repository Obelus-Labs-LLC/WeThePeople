"""Policy 1 deterministic invariant: never clear needs_ingest on partial refresh.

This test runs jobs/run_daily.py in Policy 1 mode with NO_NETWORK=1.
Network stages must be skipped, and therefore we must NOT clear:
- tracked_members.needs_ingest
- tracked_members.last_full_refresh_at

The run itself should still succeed and write a pipeline_runs manifest row.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    posix = db_path.resolve().as_posix()
    return f"sqlite:///{posix}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_policy1_weekly_floor_"))
    tmp_db = tmp_dir / "tmp_test.db"

    # IMPORTANT: Set DB URL before importing models.database so engine binds to temp DB.
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from models.database import PipelineRun, SessionLocal, TrackedMember, engine

        PipelineRun.__table__.create(bind=engine, checkfirst=True)
        TrackedMember.__table__.create(bind=engine, checkfirst=True)

        db = SessionLocal()
        try:
            db.add(
                TrackedMember(
                    person_id="p1",
                    bioguide_id="B000001",
                    display_name="Person One",
                    chamber="house",
                    state="NA",
                    party="N",
                    is_active=1,
                    claim_sources_json="[]",
                    needs_ingest=1,
                    last_full_refresh_at=None,
                )
            )
            db.add(
                TrackedMember(
                    person_id="p2",
                    bioguide_id="B000002",
                    display_name="Person Two",
                    chamber="senate",
                    state="NA",
                    party="N",
                    is_active=1,
                    claim_sources_json="[]",
                    needs_ingest=1,
                    last_full_refresh_at=None,
                )
            )
            db.commit()
        finally:
            db.close()

        env = dict(os.environ)
        cmd = [
            sys.executable,
            "jobs/run_daily.py",
            "--no-network",
            "--policy1",
            "--max-people",
            "2",
            "--weekly-floor-days",
            "7",
            "--skip-recompute",
        ]
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

        db2 = SessionLocal()
        try:
            rows = db2.query(PipelineRun).all()
            assert len(rows) == 1, f"expected 1 pipeline_runs row, got {len(rows)}"
            counts = json.loads(rows[0].counts_json or "{}")

            policy1 = counts.get("policy1") or {}
            assert policy1.get("enabled") is True
            assert policy1.get("selected_person_ids") == ["p1", "p2"], "expected deterministic selection"

            stages = counts.get("stages") or {}
            assert stages.get("ingest_claims", {}).get("skipped") is True
            assert stages.get("ingest_claims", {}).get("reason") == "no_network"

            assert stages.get("enrich_bills", {}).get("skipped") is True
            assert stages.get("enrich_bills", {}).get("reason") == "no_network"

            # The key invariant: no full refresh occurred, so do NOT clear flags.
            m1 = db2.query(TrackedMember).filter(TrackedMember.person_id == "p1").one()
            m2 = db2.query(TrackedMember).filter(TrackedMember.person_id == "p2").one()

            assert int(m1.needs_ingest) == 1
            assert int(m2.needs_ingest) == 1
            assert m1.last_full_refresh_at is None
            assert m2.last_full_refresh_at is None

            print("PASS: Policy 1 no-network does not clear needs_ingest")
            return 0
        finally:
            db2.close()

    finally:
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
