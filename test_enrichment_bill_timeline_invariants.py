"""L1 enrichment stability: bill timeline invariants (NO NETWORK, temp DB).

Invariants:
- For any bill with actions, Bill.latest_action_date == max(BillAction.action_date)
- For enriched bills (needs_enrichment=0) with actions, Bill.status_bucket is non-null
- Timeline dedupe guarantees uniqueness by (bill_id, action_date, normalized action_text)
  via the stored BillAction.dedupe_hash.

This test seeds a minimal timeline out-of-order (and with a duplicate), runs the
canonical normalization helper, and asserts the derived fields + dedupe.
"""

from __future__ import annotations

import os
import tempfile
from datetime import datetime
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    posix = db_path.resolve().as_posix()
    return f"sqlite:///{posix}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_enrichment_invariants_"))
    tmp_db = tmp_dir / "tmp_enrichment.db"

    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from sqlalchemy import func

        from models.database import Bill, BillAction, SessionLocal, engine
        from services.enrichment.bill_timeline import normalize_bill_timeline

        # Only tables required for this invariant.
        Bill.__table__.create(bind=engine, checkfirst=True)
        BillAction.__table__.create(bind=engine, checkfirst=True)

        bill_id = "hr1-119"

        db = SessionLocal()
        try:
            bill = Bill(
                bill_id=bill_id,
                congress=119,
                bill_type="hr",
                bill_number=1,
                title="Test Bill",
                needs_enrichment=0,
            )
            db.add(bill)
            db.flush()

            # Insert 2 actions out of order, plus a duplicate of the "introduced" action.
            a1 = BillAction(
                bill_id=bill_id,
                action_date=datetime(2026, 1, 3, 0, 0, 0),
                action_text="Referred to the House Committee on Energy and Commerce.",
                action_code=None,
                chamber=None,
                committee=None,
                raw_json=None,
                dedupe_hash=None,
            )
            a2 = BillAction(
                bill_id=bill_id,
                action_date=datetime(2026, 1, 1, 0, 0, 0),
                action_text="Introduced in House",
                action_code=None,
                chamber=None,
                committee=None,
                raw_json=None,
                dedupe_hash=None,
            )
            a2_dup = BillAction(
                bill_id=bill_id,
                action_date=datetime(2026, 1, 1, 0, 0, 0),
                action_text="Introduced in House",
                action_code=None,
                chamber=None,
                committee=None,
                raw_json=None,
                dedupe_hash=None,
            )
            db.add_all([a1, a2, a2_dup])
            db.commit()

            stats = normalize_bill_timeline(db, bill_id=bill_id)
            assert stats["duplicates_deleted"] == 1, f"expected 1 duplicate deleted, got {stats}"

            # Reload bill and assert derived fields.
            bill2 = db.query(Bill).filter(Bill.bill_id == bill_id).one()
            max_action_date = (
                db.query(func.max(BillAction.action_date))
                .filter(BillAction.bill_id == bill_id)
                .scalar()
            )

            assert max_action_date is not None
            assert bill2.latest_action_date == max_action_date, (
                f"latest_action_date mismatch: bill={bill2.latest_action_date} max={max_action_date}"
            )

            assert bill2.status_bucket is not None, "status_bucket should be non-null for enriched bill with actions"
            assert bill2.status_bucket == "in_committee", f"expected in_committee, got {bill2.status_bucket}"

            # Dedupe invariant: dedupe_hash must be present and unique for this bill.
            actions = db.query(BillAction).filter(BillAction.bill_id == bill_id).all()
            hashes = [a.dedupe_hash for a in actions]
            assert all(hashes), f"expected all dedupe_hash populated, got {hashes}"
            assert len(set(hashes)) == len(hashes), "dedupe_hash values must be unique per action"

            print("PASS: enrichment bill timeline invariants OK")
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
