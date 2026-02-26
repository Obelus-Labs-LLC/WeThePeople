"""Deterministic /bills/{bill_id} contract (NO NETWORK, temp DB).

Contract:
- Uses temp SQLite DB via WTP_DB_URL
- Seeds Bill, BillAction, PersonBill only
- GET /bills/{bill_id} returns a stable, minimal shape:
  { bill_id, title, status_bucket, latest_action_date, introduced_date,
    sponsor_person_id?, policy_area?, source_urls? }

Notes:
- No network calls; DB only.
- introduced_date is computed from the earliest BillAction.action_date.
- latest_action_date uses Bill.latest_action_date when present, else max(action_date).
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

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_bill_contract_"))
    tmp_db = tmp_dir / "tmp_test.db"
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from fastapi.testclient import TestClient

        import main as main_mod
        from models.database import Bill, BillAction, PersonBill, SessionLocal, engine

        Bill.__table__.create(bind=engine, checkfirst=True)
        BillAction.__table__.create(bind=engine, checkfirst=True)
        PersonBill.__table__.create(bind=engine, checkfirst=True)

        db = SessionLocal()
        try:
            b = Bill(
                bill_id="hr123-119",
                congress=119,
                bill_type="hr",
                bill_number=123,
                title="A Bill For Testing",
                policy_area="Testing",
                status_bucket="introduced",
                status_reason=None,
                latest_action_text="Introduced in House",
                latest_action_date=datetime(2026, 2, 3, 9, 0, 0),
                needs_enrichment=0,
                metadata_json=None,
            )
            db.add(b)
            db.commit()

            # Earliest action defines introduced_date.
            db.add_all(
                [
                    BillAction(
                        bill_id="hr123-119",
                        action_date=datetime(2026, 1, 1, 12, 0, 0),
                        action_text="Introduced in House",
                        action_code="Intro-H",
                        chamber="House",
                        committee=None,
                        raw_json=None,
                        dedupe_hash="h1",
                    ),
                    BillAction(
                        bill_id="hr123-119",
                        action_date=datetime(2026, 2, 3, 9, 0, 0),
                        action_text="Referred to committee",
                        action_code=None,
                        chamber="House",
                        committee="Committee on Testing",
                        raw_json=None,
                        dedupe_hash="h2",
                    ),
                ]
            )

            # Sponsor link + a couple source URLs (including a duplicate) to test deterministic sorting/uniqueness.
            db.add_all(
                [
                    PersonBill(
                        person_id="zeta",
                        bill_id="hr123-119",
                        relationship_type="Sponsored",
                        source_url="https://example.test/sponsor",
                    ),
                    PersonBill(
                        person_id="alpha",
                        bill_id="hr123-119",
                        relationship_type="Sponsored",
                        source_url="https://example.test/sponsor",
                    ),
                    PersonBill(
                        person_id="beta",
                        bill_id="hr123-119",
                        relationship_type="Cosponsored",
                        source_url="https://example.test/cosponsor",
                    ),
                ]
            )

            db.commit()
        finally:
            db.close()

        client = TestClient(main_mod.app)
        r = client.get("/bills/hr123-119")
        assert r.status_code == 200
        payload = r.json()

        for k in [
            "bill_id",
            "title",
            "status_bucket",
            "latest_action_date",
            "introduced_date",
            "sponsor_person_id",
            "policy_area",
            "source_urls",
        ]:
            assert k in payload, f"missing key: {k}"

        assert payload["bill_id"] == "hr123-119"
        assert payload["title"] == "A Bill For Testing"
        assert payload["status_bucket"] == "introduced"
        assert payload["introduced_date"] == "2026-01-01"
        assert payload["latest_action_date"] == "2026-02-03"

        # Sponsor is deterministic: smallest person_id among Sponsored.
        assert payload["sponsor_person_id"] == "alpha"

        assert payload["policy_area"] == "Testing"
        assert payload["source_urls"] == ["https://example.test/cosponsor", "https://example.test/sponsor"]

        r404 = client.get("/bills/does-not-exist")
        assert r404.status_code == 404

        print("PASS: bill API contract OK")
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
