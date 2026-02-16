"""Build Gold ledger entries from ClaimEvaluation.

Gold layer is additive: it does not replace ClaimEvaluation; it materializes the
current evaluation state into a canonical, query-friendly table.

Usage:
    python jobs/build_gold_ledger.py --limit 500
    python jobs/build_gold_ledger.py --person-id chuck_schumer
    python jobs/build_gold_ledger.py --dry-run

Notes:
- This job is safe to re-run.
- It performs an idempotent upsert keyed by claim_id.
"""

import argparse
import os
import re
import sys
from datetime import datetime
from typing import Optional

# Add repo root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.orm import Session

from models.database import (
    SessionLocal,
    engine,
    Claim,
    ClaimEvaluation,
    Action,
    Bill,
    SilverClaim,
    GoldLedgerEntry,
)

from services.matching.core import detect_intent


def _ensure_tables_exist() -> None:
    GoldLedgerEntry.__table__.create(bind=engine, checkfirst=True)

    # checkfirst=True doesn't retrofit constraints for already-existing SQLite tables.
    # Ensure the unique claim_id guardrail is actually enforced.
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_gold_ledger_claim_id
                ON gold_ledger (claim_id)
                """
            )
        )


def _normalize_claim_text(text_value: str) -> str:
    t = (text_value or "").lower()
    t = re.sub(r"[^\w\s]", "", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _infer_policy_area_from_evaluation(db: Session, ev: ClaimEvaluation) -> Optional[str]:
    if not ev.best_action_id:
        return None

    action = db.query(Action).filter(Action.id == ev.best_action_id).first()
    if action and action.policy_area:
        return action.policy_area

    if action and action.bill_congress and action.bill_type and action.bill_number:
        bill_id = f"{str(action.bill_type).lower()}{action.bill_number}-{action.bill_congress}"
        bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
        if bill and bill.policy_area:
            return bill.policy_area

    return None


def build_gold_ledger(
    person_id: Optional[str] = None,
    limit: Optional[int] = None,
    dry_run: bool = False,
) -> dict:
    _ensure_tables_exist()

    db: Session = SessionLocal()
    created = 0
    updated = 0

    try:
        q = db.query(ClaimEvaluation)
        if person_id:
            q = q.filter(ClaimEvaluation.person_id == person_id)
        q = q.order_by(ClaimEvaluation.id.asc())
        if limit:
            q = q.limit(limit)

        for ev in q.all():
            claim = db.query(Claim).filter(Claim.id == ev.claim_id).first()
            if not claim:
                continue

            normalized_text = _normalize_claim_text(claim.text)

            sc = (
                db.query(SilverClaim)
                .filter(
                    SilverClaim.person_id == claim.person_id,
                    SilverClaim.source_url == claim.claim_source_url,
                    SilverClaim.normalized_text == normalized_text,
                )
                .first()
            )

            intent_type = None
            policy_area = None
            if sc:
                intent_type = sc.intent_type
                policy_area = sc.policy_area

            if not intent_type:
                intent_type = claim.intent or detect_intent(claim.text)

            if not policy_area:
                policy_area = _infer_policy_area_from_evaluation(db, ev)

            existing = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim.id).first()

            if existing:
                updated += 1
                if dry_run:
                    continue

                existing.evaluation_id = ev.id
                existing.person_id = ev.person_id
                existing.claim_date = claim.claim_date
                existing.source_url = claim.claim_source_url
                existing.normalized_text = normalized_text
                existing.intent_type = intent_type
                existing.policy_area = policy_area
                existing.matched_bill_id = ev.matched_bill_id
                existing.best_action_id = ev.best_action_id
                existing.score = ev.score
                existing.tier = ev.tier
                existing.relevance = ev.relevance
                existing.progress = ev.progress
                existing.timing = ev.timing
                existing.evidence_json = ev.evidence_json
                existing.why_json = ev.why_json
            else:
                created += 1
                if dry_run:
                    continue

                row = GoldLedgerEntry(
                    claim_id=claim.id,
                    evaluation_id=ev.id,
                    person_id=ev.person_id,
                    claim_date=claim.claim_date,
                    source_url=claim.claim_source_url,
                    normalized_text=normalized_text,
                    intent_type=intent_type,
                    policy_area=policy_area,
                    matched_bill_id=ev.matched_bill_id,
                    best_action_id=ev.best_action_id,
                    score=ev.score,
                    tier=ev.tier,
                    relevance=ev.relevance,
                    progress=ev.progress,
                    timing=ev.timing,
                    evidence_json=ev.evidence_json,
                    why_json=ev.why_json,
                    created_at=datetime.utcnow(),
                )
                db.add(row)

        if not dry_run:
            db.commit()

        return {"created": created, "updated": updated}

    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build gold_ledger from claim_evaluations")
    parser.add_argument("--person-id", dest="person_id", default=None)
    parser.add_argument("--limit", dest="limit", type=int, default=None)
    parser.add_argument("--dry-run", dest="dry_run", action="store_true")
    args = parser.parse_args()

    result = build_gold_ledger(person_id=args.person_id, limit=args.limit, dry_run=args.dry_run)
    print("OK: Gold ledger build complete")
    print(f"  created: {result['created']}")
    print(f"  updated: {result['updated']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
