"""Deterministic People API contract (NO NETWORK, temp DB).

Contract:
- Runs with NO_NETWORK=1 and DISABLE_STARTUP_FETCH=1
- Uses a temp SQLite DB (WTP_DB_URL)
- Seeds tracked_members only
- /people returns deterministic ordering
- /people/{person_id} returns minimal stable shape
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path


def _sqlite_url_for_path(db_path: Path) -> str:
    # SQLAlchemy sqlite URLs want forward slashes on Windows.
    return f"sqlite:///{db_path.resolve().as_posix()}"


def main() -> int:
    os.environ["NO_NETWORK"] = "1"
    os.environ["DISABLE_STARTUP_FETCH"] = "1"

    tmp_dir = Path(tempfile.mkdtemp(prefix="wtp_people_contract_"))
    tmp_db = tmp_dir / "tmp_test.db"
    os.environ["WTP_DB_URL"] = _sqlite_url_for_path(tmp_db)

    try:
        # Import after WTP_DB_URL is set.
        from fastapi.testclient import TestClient

        import main as main_mod
        from models.database import SessionLocal, TrackedMember, engine

        # Create only the table we need.
        TrackedMember.__table__.create(bind=engine, checkfirst=True)

        db = SessionLocal()
        try:
            db.add_all(
                [
                    TrackedMember(
                        person_id="zeta",
                        bioguide_id="Z000001",
                        display_name="Zeta Person",
                        chamber="house",
                        state="ZZ",
                        party="Z",
                        is_active=1,
                        claim_sources_json="[]",
                    ),
                    TrackedMember(
                        person_id="alpha",
                        bioguide_id="A000001",
                        display_name="Alpha Person",
                        chamber="senate",
                        state="AA",
                        party="A",
                        is_active=1,
                        claim_sources_json="[]",
                    ),
                    TrackedMember(
                        person_id="beta",
                        bioguide_id="B000001",
                        display_name="Beta Person",
                        chamber="house",
                        state="BB",
                        party="B",
                        is_active=0,
                        claim_sources_json="[]",
                    ),
                ]
            )
            db.commit()
        finally:
            db.close()

        client = TestClient(main_mod.app)

        # active_only default=True => beta excluded, and ordering by display_name asc.
        r = client.get("/people?limit=50&offset=0")
        assert r.status_code == 200
        data = r.json()
        assert "total" in data
        assert "people" in data
        assert "limit" in data
        assert "offset" in data
        assert data["limit"] == 50
        assert data["offset"] == 0
        assert data["total"] == 2  # alpha and zeta (beta is inactive)
        assert [p["person_id"] for p in data["people"]] == ["alpha", "zeta"]

        for p in data["people"]:
            for k in ["person_id", "display_name", "chamber", "state", "party", "is_active"]:
                assert k in p

        # active_only=0 includes beta; ordering still stable.
        r2 = client.get("/people?active_only=0&limit=50&offset=0")
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["total"] == 3
        assert [p["person_id"] for p in data2["people"]] == ["alpha", "beta", "zeta"]

        # q filter should be case-insensitive.
        r3 = client.get("/people?q=ALP&active_only=0")
        assert r3.status_code == 200
        data3 = r3.json()
        assert data3["total"] == 1
        assert [p["person_id"] for p in data3["people"]] == ["alpha"]

        # /people/{person_id}
        r4 = client.get("/people/alpha")
        assert r4.status_code == 200
        one = r4.json()
        assert one["person_id"] == "alpha"
        assert one["display_name"] == "Alpha Person"
        assert one["bioguide_id"] == "A000001"

        r404 = client.get("/people/does_not_exist")
        assert r404.status_code == 404

        print("PASS: people API contract OK")
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
