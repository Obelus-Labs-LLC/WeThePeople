import os
import json
from datetime import date
from datetime import datetime, timezone

os.environ["DISABLE_STARTUP_FETCH"] = "1"

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


def _ensure_tables() -> None:
    Base.metadata.create_all(bind=engine)


def test_ops_coverage_contract_deterministic() -> None:
    _ensure_tables()

    suffix = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    p1 = f"cov-person-a-{suffix}"
    p2 = f"cov-person-b-{suffix}"
    b1 = f"O{suffix[-6:]}A"
    b2 = f"O{suffix[-6:]}B"

    def cleanup() -> None:
        # Ensure we never leave seeded rows behind, even if assertions fail.
        db2 = SessionLocal()
        try:
            db2.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id.in_([p1, p2])).delete(
                synchronize_session=False
            )
            db2.query(ClaimEvaluation).filter(ClaimEvaluation.person_id.in_([p1, p2])).delete(
                synchronize_session=False
            )
            db2.query(Claim).filter(Claim.person_id.in_([p1, p2])).delete(
                synchronize_session=False
            )
            db2.query(MemberBillGroundTruth).filter(
                MemberBillGroundTruth.bioguide_id.in_([b1, b2])
            ).delete(synchronize_session=False)
            db2.query(BillAction).filter(BillAction.bill_id.like(f"%{suffix}%")).delete(
                synchronize_session=False
            )
            db2.query(Bill).filter(Bill.bill_id.like(f"%{suffix}%")).delete(synchronize_session=False)
            db2.query(TrackedMember).filter(TrackedMember.person_id.in_([p1, p2])).delete(
                synchronize_session=False
            )
            db2.commit()
        finally:
            db2.close()

    db = SessionLocal()
    try:
        # Seed 2 tracked members
        db.add_all(
            [
                TrackedMember(
                    person_id=p1,
                    bioguide_id=b1,
                    display_name="Coverage A",
                    chamber="house",
                    state="ZZ",
                    party="I",
                    is_active=1,
                ),
                TrackedMember(
                    person_id=p2,
                    bioguide_id=b2,
                    display_name="Coverage B",
                    chamber="senate",
                    state="ZZ",
                    party="I",
                    is_active=1,
                ),
            ]
        )
        db.commit()

        # Seed claims: p1 has 2 claims; p2 has 2 claims
        c1 = Claim(
            person_id=p1,
            text="claim 1",
            category="general",
            intent=None,
            claim_date=date(2026, 1, 1),
            claim_source_url=f"https://example.com/{suffix}/a/1",
            bill_refs_json=None,
            claim_hash=f"hash-{suffix}-a-1",
            needs_recompute=0,
        )
        c2 = Claim(
            person_id=p1,
            text="claim 2",
            category="general",
            intent=None,
            claim_date=date(2026, 1, 2),
            claim_source_url=f"https://example.com/{suffix}/a/2",
            bill_refs_json=None,
            claim_hash=f"hash-{suffix}-a-2",
            needs_recompute=0,
        )
        c3 = Claim(
            person_id=p2,
            text="claim 3",
            category="general",
            intent=None,
            claim_date=date(2026, 1, 1),
            claim_source_url=f"https://example.com/{suffix}/b/1",
            bill_refs_json=None,
            claim_hash=f"hash-{suffix}-b-1",
            needs_recompute=0,
        )
        c4 = Claim(
            person_id=p2,
            text="claim 4",
            category="general",
            intent=None,
            claim_date=date(2026, 1, 2),
            claim_source_url=f"https://example.com/{suffix}/b/2",
            bill_refs_json=None,
            claim_hash=f"hash-{suffix}-b-2",
            needs_recompute=0,
        )
        db.add_all([c1, c2, c3, c4])
        db.commit()

        # p1 has 2 evals; p2 has 0 evals
        e1 = ClaimEvaluation(
            claim_id=c1.id,
            person_id=p1,
            best_action_id=None,
            score=0.9,
            tier="strong",
            relevance="high",
            progress=None,
            timing=None,
            matched_bill_id=None,
            evidence_json=json.dumps(["x"]),
            why_json=None,
        )
        e2 = ClaimEvaluation(
            claim_id=c2.id,
            person_id=p1,
            best_action_id=None,
            score=0.8,
            tier="moderate",
            relevance="high",
            progress=None,
            timing=None,
            matched_bill_id=None,
            evidence_json=json.dumps(["y"]),
            why_json=None,
        )
        db.add_all([e1, e2])
        db.commit()

        # p1 has gold rows for both claims; p2 has none
        db.add_all(
            [
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
                ),
                GoldLedgerEntry(
                    claim_id=c2.id,
                    evaluation_id=e2.id,
                    person_id=p1,
                    claim_date=c2.claim_date,
                    source_url=c2.claim_source_url,
                    normalized_text="n2",
                    tier=e2.tier,
                    score=e2.score,
                    evidence_json=e2.evidence_json,
                    why_json=None,
                ),
            ]
        )
        db.commit()

        # ground truth: p1 has 1 row, p2 has 0
        db.add(
            MemberBillGroundTruth(
                bioguide_id=b1,
                bill_id=f"hr1234-119-{suffix}",
                role="sponsor",
                source="test",
            )
        )

        # Bills enrichment global snapshot
        db.add_all(
            [
                Bill(
                    bill_id=f"hr9999-119-{suffix}-1",
                    congress=119,
                    bill_type="hr",
                    bill_number=9999,
                    title="t1",
                    policy_area=None,
                    status_bucket="introduced",
                    status_reason=None,
                    latest_action_text=None,
                    latest_action_date=datetime(2026, 1, 3, 0, 0, 0),
                    needs_enrichment=0,
                    metadata_json=None,
                ),
                Bill(
                    bill_id=f"hr9999-119-{suffix}-2",
                    congress=119,
                    bill_type="hr",
                    bill_number=9998,
                    title="t2",
                    policy_area=None,
                    status_bucket=None,
                    status_reason=None,
                    latest_action_text=None,
                    latest_action_date=None,
                    needs_enrichment=1,
                    metadata_json=None,
                ),
            ]
        )
        db.commit()

        # Minimum-viable timeline quality: at least one BillAction row.
        db.add(
            BillAction(
                bill_id=f"hr9999-119-{suffix}-1",
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

        client = TestClient(app)
        url = f"/ops/coverage?person_id={p1},{p2}&limit=10&offset=0&order=worst"

        r1 = client.get(url)
        assert r1.status_code == 200
        payload1 = r1.json()

        r2 = client.get(url)
        assert r2.status_code == 200
        payload2 = r2.json()

        assert payload1["limit"] == 10
        assert payload1["offset"] == 0
        assert payload1["order"] == "worst"

        members1 = payload1["members"]
        members2 = payload2["members"]
        assert isinstance(members1, list)
        assert isinstance(members2, list)

        # Ordering is frozen and stable.
        ids1 = [m["person_id"] for m in members1]
        ids2 = [m["person_id"] for m in members2]
        assert ids1 == ids2

        # Worst ordering: lowest coverage_score first, tie-breaker person_id.
        assert ids1 == [p2, p1]

        # Score exists and matches the crude coverage definition.
        m_by_id = {m["person_id"]: m for m in members1}
        assert m_by_id[p2]["coverage_score_raw"] == 3
        assert m_by_id[p1]["coverage_score_raw"] == 5
        assert m_by_id[p2]["coverage_score"] == 0.6
        assert m_by_id[p1]["coverage_score"] == 1.0
    finally:
        db.close()
        cleanup()


def main() -> None:
    test_ops_coverage_contract_deterministic()
    print("PASS: test_api_coverage_contract passed")


if __name__ == "__main__":
    main()
