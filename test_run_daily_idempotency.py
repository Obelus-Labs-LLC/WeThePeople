"""Idempotency smoke test for jobs/run_daily.py (temp DB, NO NETWORK).

Goal:
- Run run_daily twice against the same temp DB.
- Assert domain tables do not grow / duplicate (evaluations + gold ledger).

Why this matters:
- run_daily is intended to be schedulable.
- Repeated runs should not silently create duplicate state.

Scope:
- NO_NETWORK=1 (enrich/groundtruth/ingest skipped)
- recompute runs in-process and must be safe to rerun
- build_gold_ledger is run explicitly (it is commonly the next step after recompute)

Usage:
  python test_run_daily_idempotency.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func


def _sqlite_url_for_path(db_path: Path) -> str:
    posix = db_path.resolve().as_posix()
    return f"sqlite:///{posix}"


def _run(cmd: list[str], *, env: dict[str, str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(Path(__file__).resolve().parent),
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _stage_counts_from_pipeline_run(pipeline_run_row) -> dict:
    counts = json.loads(getattr(pipeline_run_row, "counts_json", None) or "{}")
    return counts.get("stages") or {}


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_run_daily_idem_"))
    tmp_db = tmp_dir / "tmp_idem.db"

    # Set DB URL before importing models.database so engine binds correctly.
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from models.database import (
            Action,
            Bill,
            BillAction,
            Claim,
            ClaimEvaluation,
            GoldLedgerEntry,
            Person,
            PipelineRun,
            SessionLocal,
            SilverClaim,
            SourceDocument,
            TrackedMember,
            engine,
        )

        # Create only the tables needed for: recompute + gold ledger + manifest.
        for table in [
            Person.__table__,
            TrackedMember.__table__,
            SourceDocument.__table__,
            Action.__table__,
            Claim.__table__,
            ClaimEvaluation.__table__,
            Bill.__table__,
            BillAction.__table__,
            SilverClaim.__table__,
            GoldLedgerEntry.__table__,
            PipelineRun.__table__,
        ]:
            table.create(bind=engine, checkfirst=True)

        # Seed minimal deterministic rows.
        db = SessionLocal()
        try:
            person_id = "idem_test_person"
            url = "https://example.com/press-releases/calling-pass-defiance-act"

            db.add(Person(id=person_id, name="Idem Test", role="rep", party="D", photo_url=None))
            db.flush()

            src = SourceDocument(url=url, publisher="example", retrieved_at=None, content_hash=None)
            db.add(src)
            db.flush()

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
                claim_hash="idem-test-hash-0001",
                needs_recompute=1,
            )
            db.add(claim)
            db.commit()
        finally:
            db.close()

        base_env = dict(os.environ)

        # Run run_daily twice (same DB).
        cmd_run_daily = [
            sys.executable,
            "jobs/run_daily.py",
            "--no-network",
            "--skip-ingest",
            "--skip-groundtruth",
            "--skip-enrich",
        ]

        p1 = _run(cmd_run_daily, env=base_env)
        if p1.returncode != 0:
            print("STDOUT (run 1):\n" + (p1.stdout or ""))
            print("STDERR (run 1):\n" + (p1.stderr or ""))
        assert p1.returncode == 0, f"run_daily (1) exited {p1.returncode}"

        p2 = _run(cmd_run_daily, env=base_env)
        if p2.returncode != 0:
            print("STDOUT (run 2):\n" + (p2.stdout or ""))
            print("STDERR (run 2):\n" + (p2.stderr or ""))
        assert p2.returncode == 0, f"run_daily (2) exited {p2.returncode}"

        # Build gold ledger twice.
        cmd_gold = [sys.executable, "jobs/build_gold_ledger.py", "--limit", "2000"]

        g1 = _run(cmd_gold, env=base_env)
        if g1.returncode != 0:
            print("STDOUT (gold 1):\n" + (g1.stdout or ""))
            print("STDERR (gold 1):\n" + (g1.stderr or ""))
        assert g1.returncode == 0, f"build_gold_ledger (1) exited {g1.returncode}"

        g2 = _run(cmd_gold, env=base_env)
        if g2.returncode != 0:
            print("STDOUT (gold 2):\n" + (g2.stdout or ""))
            print("STDERR (gold 2):\n" + (g2.stderr or ""))
        assert g2.returncode == 0, f"build_gold_ledger (2) exited {g2.returncode}"

        # Assert stable counts / no duplicates.
        db2 = SessionLocal()
        try:
            eval_count = db2.query(ClaimEvaluation).count()
            assert eval_count == 1, f"expected 1 ClaimEvaluation, got {eval_count}"

            # Unique key invariant: evaluations should be 1:1 with claim_id.
            eval_dups = (
                db2.query(ClaimEvaluation.claim_id)
                .group_by(ClaimEvaluation.claim_id)
                .having(func.count(ClaimEvaluation.id) > 1)
                .all()
            )
            assert not eval_dups, f"duplicate ClaimEvaluation claim_id rows: {eval_dups}"

            # Referential invariant: every ClaimEvaluation.claim_id must exist in Claim.id.
            missing_claim_refs = (
                db2.query(ClaimEvaluation)
                .outerjoin(Claim, Claim.id == ClaimEvaluation.claim_id)
                .filter(Claim.id.is_(None))
                .count()
            )
            assert missing_claim_refs == 0, f"ClaimEvaluation rows with missing Claim reference: {missing_claim_refs}"

            # Referential invariant: if matched_bill_id is present, it must exist in Bill.bill_id.
            # (In this NO_NETWORK smoke test, matched_bill_id is typically null; this is still a safety net.)
            missing_bill_refs = (
                db2.query(ClaimEvaluation)
                .filter(ClaimEvaluation.matched_bill_id.is_not(None))
                .filter(ClaimEvaluation.matched_bill_id != "")
                .outerjoin(Bill, Bill.bill_id == ClaimEvaluation.matched_bill_id)
                .filter(Bill.bill_id.is_(None))
                .count()
            )
            assert missing_bill_refs == 0, f"ClaimEvaluation rows with missing Bill reference: {missing_bill_refs}"

            # Unique key invariant: claim_hash must be unique.
            claim_hash_dups = (
                db2.query(Claim.claim_hash)
                .group_by(Claim.claim_hash)
                .having(func.count(Claim.id) > 1)
                .all()
            )
            assert not claim_hash_dups, f"duplicate Claim claim_hash rows: {claim_hash_dups}"

            gold_count = db2.query(GoldLedgerEntry).count()
            assert gold_count == 1, f"expected 1 GoldLedgerEntry, got {gold_count}"

            # Unique key: claim_id must be 1:1.
            claim_id_dups = (
                db2.query(GoldLedgerEntry.claim_id)
                .group_by(GoldLedgerEntry.claim_id)
                .having(func.count(GoldLedgerEntry.id) > 1)
                .all()
            )
            assert not claim_id_dups, f"duplicate gold_ledger claim_id rows: {claim_id_dups}"

            # Unique key invariant: bill action dedupe_hash should be present + unique.
            # (In this NO_NETWORK smoke test we typically have 0 bill_actions, which is fine.)
            bill_action_count = db2.query(BillAction).count()
            if bill_action_count:
                missing_hash = db2.query(BillAction).filter(BillAction.dedupe_hash.is_(None)).count()
                assert missing_hash == 0, f"bill_actions rows missing dedupe_hash: {missing_hash}"

                bill_action_dups = (
                    db2.query(BillAction.dedupe_hash)
                    .group_by(BillAction.dedupe_hash)
                    .having(func.count(BillAction.id) > 1)
                    .all()
                )
                assert not bill_action_dups, f"duplicate BillAction dedupe_hash rows: {bill_action_dups}"

            # Pipeline runs: should record both invocations.
            runs = db2.query(PipelineRun).order_by(PipelineRun.started_at.asc(), PipelineRun.run_id.asc()).all()
            assert len(runs) == 2, f"expected 2 PipelineRun rows, got {len(runs)}"

            s1 = _stage_counts_from_pipeline_run(runs[0])
            s2 = _stage_counts_from_pipeline_run(runs[1])
            assert "recompute_evaluations" in s1, "missing recompute stage (run 1)"
            assert "recompute_evaluations" in s2, "missing recompute stage (run 2)"
            assert s1["recompute_evaluations"].get("skipped") is False
            assert s2["recompute_evaluations"].get("skipped") is False

            print("OK: run_daily idempotency smoke test")
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
