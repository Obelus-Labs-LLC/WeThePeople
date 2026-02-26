"""Deterministic /bills/{bill_id}/timeline contract (NO NETWORK, temp DB).

Contract:
- Uses temp SQLite DB via WTP_DB_URL
- Seeds Bill + BillAction only
- GET /bills/{bill_id}/timeline returns:
  { bill_id, actions: [ { action_date, description, chamber, source_url? } ] }
- Deterministic ordering: action_date ASC then id ASC
"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    return f"sqlite:///{db_path.resolve().as_posix()}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_bill_timeline_contract_"))
    tmp_db = tmp_dir / "tmp_test.db"
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from fastapi.testclient import TestClient

        import main as main_mod
        from models.database import Bill, BillAction, SessionLocal, engine

        Bill.__table__.create(bind=engine, checkfirst=True)
        BillAction.__table__.create(bind=engine, checkfirst=True)

        db = SessionLocal()
        try:
            db.add(
                Bill(
                    bill_id="s42-119",
                    congress=119,
                    bill_type="s",
                    bill_number=42,
                    title="Timeline Test Bill",
                    policy_area=None,
                    status_bucket=None,
                    status_reason=None,
                    latest_action_text=None,
                    latest_action_date=None,
                    needs_enrichment=0,
                    metadata_json=None,
                )
            )
            db.commit()

            # Insert out-of-order dates to verify ASC ordering, and same-date rows to verify id ASC tie-breaker.
            a1 = BillAction(
                bill_id="s42-119",
                action_date=datetime(2026, 2, 2, 10, 0, 0),
                action_text="Second chronologically",
                action_code=None,
                chamber="Senate",
                committee=None,
                raw_json=None,
                dedupe_hash="t1",
            )
            a2 = BillAction(
                bill_id="s42-119",
                action_date=datetime(2026, 1, 5, 9, 0, 0),
                action_text="First chronologically",
                action_code=None,
                chamber="Senate",
                committee=None,
                raw_json=None,
                dedupe_hash="t2",
            )
            a3 = BillAction(
                bill_id="s42-119",
                action_date=datetime(2026, 2, 2, 10, 0, 0),
                action_text="Same timestamp later id",
                action_code=None,
                chamber="Senate",
                committee=None,
                raw_json=None,
                dedupe_hash="t3",
            )

            db.add_all([a1, a2, a3])
            db.commit()

            # Refresh to ensure ids are populated for deterministic assertions.
            db.refresh(a1)
            db.refresh(a2)
            db.refresh(a3)

            expected = [
                (a2.id, a2.action_date.isoformat(), a2.action_text),
                (min(a1.id, a3.id), datetime(2026, 2, 2, 10, 0, 0).isoformat(), None),
                (max(a1.id, a3.id), datetime(2026, 2, 2, 10, 0, 0).isoformat(), None),
            ]
        finally:
            db.close()

        client = TestClient(main_mod.app)
        r = client.get("/bills/s42-119/timeline?limit=10&offset=0")
        assert r.status_code == 200
        payload = r.json()

        assert payload["bill_id"] == "s42-119"
        assert "actions" in payload
        assert isinstance(payload["actions"], list)
        assert len(payload["actions"]) == 3

        for a in payload["actions"]:
            for k in ["action_date", "description", "chamber"]:
                assert k in a, f"missing key in action: {k}"

        # Verify ordering: action_date ASC, then id ASC.
        got = [(a["id"], a["action_date"], a["description"]) for a in payload["actions"]]

        assert got[0][0] == expected[0][0]
        assert got[0][1] == expected[0][1]
        assert got[0][2] == expected[0][2]

        assert got[1][0] == expected[1][0]
        assert got[1][1] == expected[1][1]
        assert got[2][0] == expected[2][0]
        assert got[2][1] == expected[2][1]

        r404 = client.get("/bills/does-not-exist/timeline")
        assert r404.status_code == 404

        print("PASS: bill timeline API contract OK")
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
