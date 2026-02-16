"""Deterministic contract test for scripts/check_pilot_coverage_threshold.py.

Requirements:
- Temp DB via WTP_DB_URL
- NO_NETWORK=1 (no Congress.gov)
- Seeded pilot members
- Script must:
  - fail when a pilot member is below threshold
  - pass once that member has enough components
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    posix = db_path.resolve().as_posix()
    return f"sqlite:///{posix}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_pilot_cov_thresh_"))
    tmp_db = tmp_dir / "tmp_thresh.db"

    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        # IMPORTANT: import models after setting WTP_DB_URL
        from models.database import (
            Base,
            SessionLocal,
            engine,
            Bill,
            BillAction,
            Claim,
            ClaimEvaluation,
            GoldLedgerEntry,
            TrackedMember,
        )

        Base.metadata.create_all(bind=engine)

        # Case 0: Missing pilot selector (no tracked_members.pilot column; PILOT_PERSON_IDS unset) => exit 2.
        env_missing = dict(os.environ)
        env_missing.pop("PILOT_PERSON_IDS", None)

        cmd = [sys.executable, "scripts/check_pilot_coverage_threshold.py", "--threshold", "0.75"]
        p0 = subprocess.run(
            cmd,
            cwd=str(Path(__file__).resolve().parent),
            env=env_missing,
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert p0.returncode == 2, f"expected exit 2, got {p0.returncode}"
        assert (
            "PILOT_PERSON_IDS not set and tracked_members.pilot not available" in (p0.stdout or "")
        ), "expected missing-selector message"

        p_pass = "pilot-pass"
        p_fail = "pilot-fail"

        os.environ["PILOT_PERSON_IDS"] = f"{p_pass},{p_fail}"

        db = SessionLocal()
        try:
            db.add_all(
                [
                    TrackedMember(
                        person_id=p_pass,
                        bioguide_id="O000001",
                        display_name="Pilot Pass",
                        chamber="house",
                        state="ZZ",
                        party="I",
                        is_active=1,
                    ),
                    TrackedMember(
                        person_id=p_fail,
                        bioguide_id="O000002",
                        display_name="Pilot Fail",
                        chamber="senate",
                        state="ZZ",
                        party="I",
                        is_active=1,
                    ),
                ]
            )
            db.commit()

            # Global bill + action so bills + min_viable_enrichment are true.
            bill_id = "hr1-119"
            db.add(
                Bill(
                    bill_id=bill_id,
                    congress=119,
                    bill_type="hr",
                    bill_number=1,
                    title="t",
                    policy_area=None,
                    status_bucket="introduced",
                    status_reason=None,
                    latest_action_text=None,
                    latest_action_date=datetime(2026, 1, 3, 0, 0, 0),
                    needs_enrichment=0,
                    metadata_json=None,
                )
            )
            db.commit()

            db.add(
                BillAction(
                    bill_id=bill_id,
                    action_date=datetime(2026, 1, 3, 0, 0, 0),
                    action_text="Introduced",
                    action_code="Intro-H",
                    chamber="House",
                    committee=None,
                    raw_json=None,
                    dedupe_hash="dedupe-1",
                )
            )
            db.commit()

            # p_pass: has claims+evals
            c1 = Claim(
                person_id=p_pass,
                text="claim",
                category="general",
                intent=None,
                claim_date=date(2026, 1, 1),
                claim_source_url="https://example.com/1",
                bill_refs_json=None,
                claim_hash="hash-1",
                needs_recompute=0,
            )
            db.add(c1)
            db.commit()

            e1 = ClaimEvaluation(
                claim_id=c1.id,
                person_id=p_pass,
                best_action_id=None,
                score=0.9,
                tier="strong",
                relevance="high",
                progress=None,
                timing=None,
                matched_bill_id=None,
                evidence_json='["x"]',
                why_json=None,
            )
            db.add(e1)
            db.commit()

            db.add(
                GoldLedgerEntry(
                    claim_id=c1.id,
                    evaluation_id=e1.id,
                    person_id=p_pass,
                    claim_date=c1.claim_date,
                    source_url=c1.claim_source_url,
                    normalized_text="n",
                    tier=e1.tier,
                    score=e1.score,
                    evidence_json=e1.evidence_json,
                    why_json=None,
                )
            )
            db.commit()

        finally:
            db.close()

        env = dict(os.environ)

        # First run: p_fail has no claims/evals, should fail.
        p = subprocess.run(
            cmd,
            cwd=str(Path(__file__).resolve().parent),
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert p.returncode != 0, "expected threshold check to fail"
        assert "pilot-fail" in (p.stdout or ""), "expected failing person_id in output"

        # Add a claim for p_fail; with groundtruth optional this should be enough to pass the 0.75 threshold.
        db2 = SessionLocal()
        try:
            c2 = Claim(
                person_id=p_fail,
                text="claim",
                category="general",
                intent=None,
                claim_date=date(2026, 1, 2),
                claim_source_url="https://example.com/2",
                bill_refs_json=None,
                claim_hash="hash-2",
                needs_recompute=0,
            )
            db2.add(c2)
            db2.commit()
        finally:
            db2.close()

        p2 = subprocess.run(
            cmd,
            cwd=str(Path(__file__).resolve().parent),
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if p2.returncode != 0:
            print("STDOUT:\n" + (p2.stdout or ""))
            print("STDERR:\n" + (p2.stderr or ""))
        assert p2.returncode == 0, "expected threshold check to pass after seeding"

        print("PASS: test_check_pilot_coverage_threshold passed")
        return 0

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
