"""Policy 1 deterministic invariant: only clear needs_ingest on full required-stage success.

This test seeds a temp DB with a minimal tracked member + a dirty claim, then runs
Policy 1 with network stages explicitly skipped via flags.

Even if recompute succeeds, skipping any required stage must prevent clearing:
- tracked_members.needs_ingest
- tracked_members.last_full_refresh_at

Additionally asserts the manifest encodes required_stages + full_refresh_completed.
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
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_policy1_full_success_"))
    tmp_db = tmp_dir / "tmp_test.db"

    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from models.database import Base, Claim, PipelineRun, SessionLocal, TrackedMember, engine

        # Use full schema to keep recompute/matching code from tripping on missing tables.
        Base.metadata.create_all(bind=engine)

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
            db.flush()

            db.add(
                Claim(
                    person_id="p1",
                    text="Test claim text",
                    category="general",
                    intent=None,
                    claim_date=None,
                    claim_source_url="https://example.test/claim",
                    bill_refs_json=None,
                    claim_hash="hash-p1-1",
                    needs_recompute=1,
                )
            )
            db.commit()
        finally:
            db.close()

        env = dict(os.environ)
        cmd = [
            sys.executable,
            "jobs/run_daily.py",
            "--policy1",
            "--max-people",
            "1",
            "--skip-ingest",
            "--skip-groundtruth",
            "--skip-enrich",
        ]

        p = subprocess.run(
            cmd,
            cwd=str(Path(__file__).resolve().parent),
            env=env,
            capture_output=True,
            text=True,
            timeout=90,
        )

        if p.returncode != 0:
            print("STDOUT:\n" + (p.stdout or ""))
            print("STDERR:\n" + (p.stderr or ""))
        assert p.returncode == 0, f"run_daily exited {p.returncode}"

        db2 = SessionLocal()
        try:
            # manifest exists
            rows = db2.query(PipelineRun).all()
            assert len(rows) == 1, f"expected 1 pipeline_runs row, got {len(rows)}"
            counts = json.loads(rows[0].counts_json or "{}")

            policy1 = counts.get("policy1") or {}
            assert policy1.get("enabled") is True
            assert policy1.get("selected_person_ids") == ["p1"], "expected deterministic selection"

            required = policy1.get("required_stages")
            assert required == [
                "ingest_claims",
                "sync_groundtruth",
                "enrich_bills",
                "recompute_evaluations",
            ]
            assert policy1.get("full_refresh_completed") is False
            assert policy1.get("marked_refreshed_person_ids") in ([], None)

            stages = counts.get("stages") or {}
            assert stages.get("ingest_claims", {}).get("skipped") is True
            assert stages.get("ingest_claims", {}).get("reason") == "skip_flag"

            assert stages.get("sync_groundtruth", {}).get("skipped") is True
            assert stages.get("sync_groundtruth", {}).get("reason") == "skip_flag"

            assert stages.get("enrich_bills", {}).get("skipped") is True
            assert stages.get("enrich_bills", {}).get("reason") == "skip_flag"

            # recompute should run (and clear Claim.needs_recompute), but must NOT clear member scheduling.
            m1 = db2.query(TrackedMember).filter(TrackedMember.person_id == "p1").one()
            assert int(m1.needs_ingest) == 1
            assert m1.last_full_refresh_at is None

            print("PASS: Policy 1 only clears needs_ingest on full success")
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
