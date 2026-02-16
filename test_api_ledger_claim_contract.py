"""Deterministic /ledger/claim contract (NO NETWORK, temp DB).

Contract:
- Uses temp SQLite DB via WTP_DB_URL
- Seeds Claim, ClaimEvaluation, GoldLedgerEntry
- GET /ledger/claim/{claim_id} returns the serialized gold row
- Must include fields sufficient for claim card + tier badge + why + source
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import date
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    return f"sqlite:///{db_path.resolve().as_posix()}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_ledger_claim_contract_"))
    tmp_db = tmp_dir / "tmp_test.db"
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from fastapi.testclient import TestClient

        import main as main_mod
        from models.database import Claim, ClaimEvaluation, GoldLedgerEntry, SessionLocal, engine

        # Minimal schema for this endpoint.
        Claim.__table__.create(bind=engine, checkfirst=True)
        ClaimEvaluation.__table__.create(bind=engine, checkfirst=True)
        GoldLedgerEntry.__table__.create(bind=engine, checkfirst=True)

        db = SessionLocal()
        claim_id: int
        try:
            c = Claim(
                person_id="alpha",
                text="Original claim text",
                category="general",
                intent=None,
                claim_date=None,
                claim_source_url="https://example.test/source",
                bill_refs_json=None,
                claim_hash="hash-alpha-1",
                needs_recompute=0,
            )
            db.add(c)
            db.commit()
            db.refresh(c)
            claim_id = int(c.id)

            e = ClaimEvaluation(
                claim_id=c.id,
                person_id=c.person_id,
                best_action_id=None,
                score=0.42,
                tier="moderate",
                relevance="medium",
                progress=None,
                timing=None,
                matched_bill_id="hr123-119",
                evidence_json=json.dumps(["url_match:https://example.test/source"]),
                why_json=json.dumps({"summary": "ok"}),
            )
            db.add(e)
            db.commit()
            db.refresh(e)

            g = GoldLedgerEntry(
                claim_id=c.id,
                evaluation_id=e.id,
                person_id=c.person_id,
                claim_date=date(2026, 2, 1),
                source_url=c.claim_source_url,
                normalized_text="normalized claim text",
                intent_type=None,
                policy_area=None,
                matched_bill_id="hr123-119",
                best_action_id=None,
                score=0.42,
                tier="moderate",
                relevance="medium",
                progress=None,
                timing=None,
                evidence_json=json.dumps(["url_match:https://example.test/source"]),
                why_json=json.dumps({"summary": "ok"}),
            )
            db.add(g)
            db.commit()
        finally:
            db.close()

        client = TestClient(main_mod.app)
        r = client.get(f"/ledger/claim/{claim_id}")
        assert r.status_code == 200
        row = r.json()

        for k in [
            "id",
            "claim_id",
            "evaluation_id",
            "person_id",
            "claim_date",
            "normalized_text",
            "matched_bill_id",
            "tier",
            "why",
            "source_url",
        ]:
            assert k in row, f"missing key: {k}"

        assert row["claim_id"] == claim_id
        assert row["tier"] == "moderate"
        assert isinstance(row["why"], dict)
        assert row["matched_bill_id"] == "hr123-119"
        assert row["source_url"] == "https://example.test/source"

        r404 = client.get("/ledger/claim/999999")
        assert r404.status_code == 404

        print("PASS: ledger claim API contract OK")
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
