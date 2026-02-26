import os
import json
from datetime import date
from datetime import datetime, timezone

os.environ["DISABLE_STARTUP_FETCH"] = "1"

from fastapi.testclient import TestClient

from main import app
from models.database import engine, SessionLocal, GoldLedgerEntry


def _ensure_table() -> None:
    # Ensure table exists even if Alembic hasn't been run.
    GoldLedgerEntry.__table__.create(bind=engine, checkfirst=True)


def _seed_gold(person_id: str, suffix: str) -> None:
    db = SessionLocal()
    try:
        db.add(
            GoldLedgerEntry(
                claim_id=f"claim-{suffix}-1",
                evaluation_id=1001,
                person_id=person_id,
                claim_date=None,
                normalized_text="test claim",
                tier="strong",
                score=0.9,
                evidence_json="{\"sources\": []}",
                why_json="{\"summary\": \"ok\"}",
            )
        )
        db.add(
            GoldLedgerEntry(
                claim_id=f"claim-{suffix}-2",
                evaluation_id=1002,
                person_id=person_id,
                claim_date=None,
                normalized_text="test claim 2",
                tier="weak",
                score=0.1,
                evidence_json=None,
                why_json=None,
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_gold_for_ordering(person_id: str, suffix: str) -> None:
    """Seed 3 rows with deterministic ordering keys.

    Ordering contract:
      claim_date DESC (nulls last), then claim_id DESC
    """
    db = SessionLocal()
    try:
        # Two entries share the same claim_date; claim_id ordering should break ties.
        db.add_all(
            [
                GoldLedgerEntry(
                    claim_id=2001,
                    evaluation_id=11001,
                    person_id=person_id,
                    claim_date=date(2026, 1, 2),
                    normalized_text=f"ordering a {suffix}",
                    tier="moderate",
                    score=0.6,
                    evidence_json=json.dumps({"sources": []}),
                    why_json=None,
                ),
                GoldLedgerEntry(
                    claim_id=2002,
                    evaluation_id=11002,
                    person_id=person_id,
                    claim_date=date(2026, 1, 2),
                    normalized_text=f"ordering b {suffix}",
                    tier="strong",
                    score=0.9,
                    evidence_json=None,
                    why_json=None,
                ),
                GoldLedgerEntry(
                    claim_id=2000,
                    evaluation_id=11000,
                    person_id=person_id,
                    claim_date=date(2026, 1, 1),
                    normalized_text=f"ordering c {suffix}",
                    tier="weak",
                    score=0.1,
                    evidence_json=None,
                    why_json=None,
                ),
            ]
        )
        db.commit()
    finally:
        db.close()


def test_api_gold_ledger_person_contract():
    _ensure_table()
    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    person_id = f"person-123-{suffix}"
    _seed_gold(person_id, suffix)

    client = TestClient(app)
    try:
        r = client.get(f"/ledger/person/{person_id}?limit=10&offset=0")
        assert r.status_code == 200
        data = r.json()

        assert data["person_id"] == person_id
        assert data["total"] == 2
        assert data["limit"] == 10
        assert data["offset"] == 0
        assert isinstance(data["entries"], list)
        assert len(data["entries"]) == 2

        entry = data["entries"][0]
        for key in [
            "id",
            "claim_id",
            "evaluation_id",
            "person_id",
            "claim_date",
            "normalized_text",
            "tier",
            "score",
            "evidence",
            "why",
            "created_at",
        ]:
            assert key in entry

        assert entry["person_id"] == person_id
    finally:
        db = SessionLocal()
        try:
            db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()


def test_api_gold_ledger_person_filter_tier():
    _ensure_table()
    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    person_id = f"person-123-{suffix}"
    _seed_gold(person_id, suffix)

    client = TestClient(app)
    try:
        r = client.get(f"/ledger/person/{person_id}?tier=strong")
        assert r.status_code == 200
        data = r.json()

        assert data["total"] == 1
        assert len(data["entries"]) == 1
        assert data["entries"][0]["tier"] == "strong"
    finally:
        db = SessionLocal()
        try:
            db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()


def test_api_gold_ledger_summary_contract():
    _ensure_table()
    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    person_id = f"person-123-{suffix}"
    _seed_gold(person_id, suffix)

    client = TestClient(app)
    try:
        r = client.get(f"/ledger/summary?person_id={person_id}")
        assert r.status_code == 200
        data = r.json()

        assert data["total"] == 2
        assert isinstance(data["by_tier"], dict)
        assert data["by_tier"].get("strong") == 1
        assert data["by_tier"].get("weak") == 1
    finally:
        db = SessionLocal()
        try:
            db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()


def test_api_gold_ledger_ordering_stable():
    _ensure_table()
    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    person_id = f"person-order-{suffix}"
    _seed_gold_for_ordering(person_id, suffix)

    client = TestClient(app)
    try:
        r1 = client.get(f"/ledger/person/{person_id}?limit=50&offset=0")
        assert r1.status_code == 200
        entries1 = r1.json()["entries"]
        assert [e["claim_id"] for e in entries1] == [2002, 2001, 2000]

        # Same call twice should produce identical ordering.
        r2 = client.get(f"/ledger/person/{person_id}?limit=50&offset=0")
        assert r2.status_code == 200
        entries2 = r2.json()["entries"]
        assert [e["claim_id"] for e in entries2] == [2002, 2001, 2000]
    finally:
        db = SessionLocal()
        try:
            db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()


def test_api_gold_ledger_pagination_invariants():
    _ensure_table()
    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    person_id = f"person-page-{suffix}"
    _seed_gold_for_ordering(person_id, suffix)

    client = TestClient(app)
    try:
        r0 = client.get(f"/ledger/person/{person_id}?limit=1&offset=0")
        assert r0.status_code == 200
        d0 = r0.json()
        assert d0["total"] == 3
        assert d0["limit"] == 1
        assert d0["offset"] == 0
        assert [e["claim_id"] for e in d0["entries"]] == [2002]

        r1 = client.get(f"/ledger/person/{person_id}?limit=1&offset=1")
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["total"] == 3
        assert [e["claim_id"] for e in d1["entries"]] == [2001]

        r2 = client.get(f"/ledger/person/{person_id}?limit=1&offset=2")
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["total"] == 3
        assert [e["claim_id"] for e in d2["entries"]] == [2000]

        r3 = client.get(f"/ledger/person/{person_id}?limit=1&offset=3")
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["total"] == 3
        assert d3["entries"] == []
    finally:
        db = SessionLocal()
        try:
            db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()


def test_api_gold_ledger_person_filter_tier_moderate_only():
    _ensure_table()
    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    person_id = f"person-tier-{suffix}"
    _seed_gold_for_ordering(person_id, suffix)

    client = TestClient(app)
    try:
        r = client.get(f"/ledger/person/{person_id}?tier=moderate")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert len(data["entries"]) == 1
        assert data["entries"][0]["tier"] == "moderate"
        assert data["entries"][0]["claim_id"] == 2001
    finally:
        db = SessionLocal()
        try:
            db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()


def test_api_gold_ledger_invalid_tier_returns_422():
    _ensure_table()
    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    person_id = f"person-invalid-tier-{suffix}"
    _seed_gold_for_ordering(person_id, suffix)

    client = TestClient(app)
    try:
        r = client.get(f"/ledger/person/{person_id}?tier=not-a-tier")
        assert r.status_code == 422
        payload = r.json()
        assert "detail" in payload
        assert isinstance(payload["detail"], dict)
        assert payload["detail"].get("error") == "invalid tier"
        assert "allowed" in payload["detail"]
    finally:
        db = SessionLocal()
        try:
            db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()


if __name__ == "__main__":
    # Mirror existing repo style: run as a script in the gate.
    test_api_gold_ledger_person_contract()
    test_api_gold_ledger_person_filter_tier()
    test_api_gold_ledger_summary_contract()
    test_api_gold_ledger_ordering_stable()
    test_api_gold_ledger_pagination_invariants()
    test_api_gold_ledger_person_filter_tier_moderate_only()
    test_api_gold_ledger_invalid_tier_returns_422()
    print("PASS: Gold ledger API contract tests: ALL PASSED")
