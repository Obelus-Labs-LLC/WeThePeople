"""Local-mode pipeline test for jobs/run_daily.py (NO NETWORK).

Goals:
- Uses temp DB via WTP_DB_URL (never touches wethepeople.db)
- Creates only required tables
- Seeds a minimal deterministic dataset
- Runs run_daily in non-dry-run local mode while skipping network stages
- Asserts recompute runs (not skipped) and produces ClaimEvaluation rows

NOTE:
- This does NOT run any network stages.
- It is safe to run under NO_NETWORK=1.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    posix = db_path.resolve().as_posix()
    return f"sqlite:///{posix}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_run_daily_local_"))
    tmp_db = tmp_dir / "tmp_local.db"

    # Set DB URL before importing models.database so engine binds correctly.
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from models.database import (
            Action,
            Claim,
            ClaimEvaluation,
            Person,
            PipelineRun,
            SessionLocal,
            SourceDocument,
            TrackedMember,
            engine,
        )

        # Create only the tables we need for: manifest + matching + recompute.
        for table in [
            Person.__table__,
            SourceDocument.__table__,
            Action.__table__,
            TrackedMember.__table__,
            Claim.__table__,
            ClaimEvaluation.__table__,
            PipelineRun.__table__,
        ]:
            table.create(bind=engine, checkfirst=True)

        # Seed minimal rows.
        db = SessionLocal()
        try:
            person_id = "local_test_person"
            url = "https://example.com/press-releases/calling-pass-defiance-act"

            db.add(Person(id=person_id, name="Local Test", role="rep", party="D", photo_url=None))
            db.flush()

            src = SourceDocument(url=url, publisher="example", retrieved_at=None, content_hash=None)
            db.add(src)
            db.flush()

            # Action with same person_id and source_id, so matching can join SourceDocument.
            action = Action(
                person_id=person_id,
                source_id=src.id,
                title="DEFIANCE Act of 2025",
                summary="Calling to pass the DEFIANCE Act.",
                date=datetime(2026, 2, 5, 0, 0, 0, tzinfo=timezone.utc),
                metadata_json={},
            )
            db.add(action)
            db.flush()

            claim = Claim(
                person_id=person_id,
                text="I urge Congress to pass the DEFIANCE Act.",
                category="general",
                intent=None,
                claim_date=datetime(2026, 2, 5, 0, 0, 0, tzinfo=timezone.utc).date(),
                claim_source_url=url,
                bill_refs_json=None,
                claim_hash="local-test-hash-0001",
                needs_recompute=1,
            )
            db.add(claim)
            db.commit()
        finally:
            db.close()

        cmd = [
            sys.executable,
            "jobs/run_daily.py",
            "--no-network",
            "--skip-ingest",
            "--skip-groundtruth",
        ]
        p = subprocess.run(
            cmd,
            cwd=str(Path(__file__).resolve().parent),
            env=dict(os.environ),
            capture_output=True,
            text=True,
            timeout=60,
        )
        if p.returncode != 0:
            print("STDOUT:\n" + (p.stdout or ""))
            print("STDERR:\n" + (p.stderr or ""))
        assert p.returncode == 0, f"run_daily exited {p.returncode}"

        # Assert recompute ran and produced an evaluation.
        db2 = SessionLocal()
        try:
            eval_count = db2.query(ClaimEvaluation).count()
            assert eval_count >= 1, f"expected >=1 ClaimEvaluation, got {eval_count}"

            runs = db2.query(PipelineRun).all()
            assert len(runs) == 1, f"expected 1 PipelineRun row, got {len(runs)}"
            run = runs[0]
            counts = json.loads(run.counts_json or "{}")
            stages = counts.get("stages") or {}

            assert "recompute_evaluations" in stages, "missing recompute_evaluations stage"
            recompute_stage = stages["recompute_evaluations"]
            assert recompute_stage.get("skipped") is False, "recompute stage unexpectedly skipped"

            for required in ["started_at", "ended_at", "duration_ms", "skipped", "counts"]:
                assert required in recompute_stage, f"missing {required} in recompute stage"

            print("PASS: run_daily local-mode test OK")
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
