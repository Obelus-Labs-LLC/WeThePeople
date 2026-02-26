"""Deterministic /ledger/person fields contract (NO NETWORK, temp DB).

Confirms /ledger/person/{person_id} includes fields needed for:
- claim card: normalized_text, claim_date
- tier badge: tier
- why breakdown: why
- source link: source_url

No network; temp DB seeding.
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

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_ledger_person_fields_"))
    tmp_db = tmp_dir / "tmp_test.db"
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        from fastapi.testclient import TestClient

        import main as main_mod
        from models.database import GoldLedgerEntry, SessionLocal, engine

        GoldLedgerEntry.__table__.create(bind=engine, checkfirst=True)

        person_id = "alpha"
        db = SessionLocal()
        try:
            db.add(
                GoldLedgerEntry(
                    claim_id=1,
                    evaluation_id=10,
                    person_id=person_id,
                    claim_date=date(2026, 2, 1),
                    source_url="https://example.test/source",
                    normalized_text="normalized claim text",
                    tier="strong",
                    score=0.9,
                    evidence_json=json.dumps(["e1"]),
                    why_json=json.dumps({"summary": "ok"}),
                )
            )
            db.commit()
        finally:
            db.close()

        client = TestClient(main_mod.app)
        r = client.get(f"/ledger/person/{person_id}?limit=10&offset=0")
        assert r.status_code == 200
        data = r.json()
        assert data["person_id"] == person_id
        assert data["total"] == 1
        assert len(data["entries"]) == 1

        entry = data["entries"][0]
        for k in ["normalized_text", "claim_date", "tier", "why", "source_url"]:
            assert k in entry, f"missing key: {k}"

        assert entry["tier"] == "strong"
        assert entry["source_url"] == "https://example.test/source"
        assert isinstance(entry["why"], dict)

        print("PASS: ledger person fields contract OK")
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
