"""Contract test: /ops/coverage?pilot_only=1 is deterministic and stable.

Requirements:
- No network
- Deterministic ordering
- Uses temp DB via WTP_DB_URL
- Pilot cohort comes from PILOT_PERSON_IDS when no tracked_members.pilot exists
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    posix = db_path.resolve().as_posix()
    return f"sqlite:///{posix}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_api_cov_pilot_"))
    tmp_db = tmp_dir / "tmp_cov.db"

    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from fastapi.testclient import TestClient

        from main import app
        from models.database import (
            Base,
            SessionLocal,
            engine,
            Bill,
            BillAction,
            Claim,
            ClaimEvaluation,
            GoldLedgerEntry,
            MemberBillGroundTruth,
            TrackedMember,
        )

        Base.metadata.create_all(bind=engine)

        suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
        p1 = f"pilot-a-{suffix}"
        p2 = f"pilot-b-{suffix}"
        p3 = f"pilot-c-{suffix}"
        b1 = f"O{suffix[-6:]}A"
        b2 = f"O{suffix[-6:]}B"
        b3 = f"O{suffix[-6:]}C"

        os.environ["PILOT_PERSON_IDS"] = f"{p1},{p3}"

        db = SessionLocal()
        try:
            db.add_all(
                [
                    TrackedMember(
                        person_id=p1,
                        bioguide_id=b1,
                        display_name="Pilot A",
                        chamber="house",
                        state="ZZ",
                        party="I",
                        is_active=1,
                    ),
                    TrackedMember(
                        person_id=p2,
                        bioguide_id=b2,
                        display_name="Pilot B",
                        chamber="senate",
                        state="ZZ",
                        party="I",
                        is_active=1,
                    ),
                    TrackedMember(
                        person_id=p3,
                        bioguide_id=b3,
                        display_name="Pilot C",
                        chamber="house",
                        state="ZZ",
                        party="I",
                        is_active=1,
                    ),
                ]
            )
            db.commit()

            # Global bill enrichment snapshot (affects all members equally).
            bill_id = f"hr9999-119-{suffix}"
            db.add(
                Bill(
                    bill_id=bill_id,
                    congress=119,
                    bill_type="hr",
                    bill_number=9999,
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
                    action_text="Introduced in House",
                    action_code="Intro-H",
                    chamber="House",
                    committee=None,
                    raw_json=None,
                    dedupe_hash=f"dedupe-{suffix}-1",
                )
            )
            db.commit()

            # Give p1 claims+evals; p3 has none.
            c1 = Claim(
                person_id=p1,
                text="claim 1",
                category="general",
                intent=None,
                claim_date=date(2026, 1, 1),
                claim_source_url=f"https://example.com/{suffix}/p1/1",
                bill_refs_json=None,
                claim_hash=f"hash-{suffix}-p1-1",
                needs_recompute=0,
            )
            db.add(c1)
            db.commit()

            e1 = ClaimEvaluation(
                claim_id=c1.id,
                person_id=p1,
                best_action_id=None,
                score=0.5,
                tier="moderate",
                relevance="high",
                progress=None,
                timing=None,
                matched_bill_id=None,
                evidence_json=json.dumps(["x"]),
                why_json=None,
            )
            db.add(e1)
            db.commit()

            db.add(
                GoldLedgerEntry(
                    claim_id=c1.id,
                    evaluation_id=e1.id,
                    person_id=p1,
                    claim_date=c1.claim_date,
                    source_url=c1.claim_source_url,
                    normalized_text="n1",
                    tier=e1.tier,
                    score=e1.score,
                    evidence_json=e1.evidence_json,
                    why_json=None,
                )
            )
            db.commit()

            # Ensure these tables existing doesn't break anything.
            db.add(
                MemberBillGroundTruth(
                    bioguide_id=b1,
                    bill_id=f"hr1234-119-{suffix}",
                    role="sponsor",
                    source="test",
                )
            )
            db.commit()

            client = TestClient(app)

            url = "/ops/coverage?pilot_only=1&limit=10&offset=0&order=worst"
            r1 = client.get(url)
            assert r1.status_code == 200
            payload1 = r1.json()

            r2 = client.get(url)
            assert r2.status_code == 200
            payload2 = r2.json()

            ids1 = [m["person_id"] for m in payload1["members"]]
            ids2 = [m["person_id"] for m in payload2["members"]]

            # Deterministic and stable.
            assert ids1 == ids2

            # Pilot-only filter is respected.
            assert set(ids1) == {p1, p3}

            # Worst ordering: p3 has fewer components than p1.
            assert ids1 == [p3, p1]

            print("PASS: test_api_coverage_pilot_only_contract passed")
            return 0
        finally:
            db.close()

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
