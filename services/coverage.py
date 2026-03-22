"""
DEPRECATED: V1 coverage scoring service from the Public Accountability Ledger era.
Not used by the current WeThePeople civic transparency platform.
Production coverage/completeness is tracked via /influence/data-freshness endpoint.
Kept for reference only.

TODO: If revived, score production tables instead:
  TrackedMember, TrackedInstitution, TrackedCompany, TrackedTechCompany, TrackedEnergyCompany,
  LobbyingRecord, GovernmentContract, CongressionalTrade, CompanyDonation, etc.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models.database import (
    Bill,
    BillAction,
    Claim,
    ClaimEvaluation,
    GoldLedgerEntry,
    MemberBillGroundTruth,
    TrackedMember,
)


MIN_VIABLE_ENRICHED_ACTIONS_MIN = 1
MIN_VIABLE_ENRICHED_RATE_THRESHOLD = 0.20


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _safe_div(numer: int, denom: int) -> float:
    if denom <= 0:
        return 0.0
    return float(numer) / float(denom)


def _coverage_score_raw(
    *,
    claims_total: int,
    evaluations_total: int,
    groundtruth_rows_total: int,
    bills_total: int,
    has_min_viable_enriched_bills: bool,
) -> int:
    return (
        (1 if claims_total > 0 else 0)
        + (1 if evaluations_total > 0 else 0)
        + (1 if groundtruth_rows_total > 0 else 0)
        + (1 if bills_total > 0 else 0)
        + (1 if has_min_viable_enriched_bills else 0)
    )


def _coverage_score_norm(raw: int) -> float:
    # Normalize 0..5 -> 0..1
    raw = max(0, min(5, int(raw)))
    return raw / 5.0


def compute_member_coverage(
    db: Session,
    member: TrackedMember,
    *,
    bills_total: int,
    has_min_viable_enriched_bills: bool,
) -> Dict[str, Any]:
    person_id = member.person_id
    bioguide_id = member.bioguide_id

    claims_total = int(db.query(func.count(Claim.id)).filter(Claim.person_id == person_id).scalar() or 0)
    evals_total = int(
        db.query(func.count(ClaimEvaluation.id))
        .filter(ClaimEvaluation.person_id == person_id)
        .scalar()
        or 0
    )
    gold_total = int(
        db.query(func.count(GoldLedgerEntry.id))
        .filter(GoldLedgerEntry.person_id == person_id)
        .scalar()
        or 0
    )
    groundtruth_total = int(
        db.query(func.count(MemberBillGroundTruth.id))
        .filter(MemberBillGroundTruth.bioguide_id == bioguide_id)
        .scalar()
        or 0
    )

    last_claim_date = (
        db.query(func.max(Claim.claim_date)).filter(Claim.person_id == person_id).scalar()
    )
    last_eval_at = (
        db.query(func.max(ClaimEvaluation.updated_at)).filter(ClaimEvaluation.person_id == person_id).scalar()
    )
    last_gold_at = (
        db.query(func.max(GoldLedgerEntry.updated_at)).filter(GoldLedgerEntry.person_id == person_id).scalar()
    )
    last_groundtruth_at = (
        db.query(func.max(MemberBillGroundTruth.fetched_at))
        .filter(MemberBillGroundTruth.bioguide_id == bioguide_id)
        .scalar()
    )

    eval_coverage = _safe_div(evals_total, claims_total)
    gold_coverage = _safe_div(gold_total, claims_total)

    # Coverage score (crude but stable): 4 booleans normalized to 0..1
    coverage_raw = _coverage_score_raw(
        claims_total=claims_total,
        evaluations_total=evals_total,
        groundtruth_rows_total=groundtruth_total,
        bills_total=bills_total,
        has_min_viable_enriched_bills=has_min_viable_enriched_bills,
    )
    coverage_score = _coverage_score_norm(coverage_raw)

    return {
        "person_id": person_id,
        "bioguide_id": bioguide_id,
        "display_name": member.display_name,
        "chamber": member.chamber,
        "state": member.state,
        "party": member.party,
        "is_active": bool(member.is_active),
        "claims_total": claims_total,
        "evaluations_total": evals_total,
        "gold_rows_total": gold_total,
        "groundtruth_rows_total": groundtruth_total,
        "eval_coverage": round(eval_coverage, 4),
        "gold_coverage": round(gold_coverage, 4),
        # Back-compat: keep `score`, but define it as the coverage score.
        "score": round(coverage_score, 4),
        "coverage_score": round(coverage_score, 4),
        "coverage_score_raw": coverage_raw,
        "coverage_components": {
            "has_claims": claims_total > 0,
            "has_evaluations": evals_total > 0,
            "has_groundtruth": groundtruth_total > 0,
            "has_bills": bills_total > 0,
            "has_min_viable_enriched_bills": has_min_viable_enriched_bills,
        },
        "last_claim_date": last_claim_date.isoformat() if last_claim_date else None,
        "last_evaluation_at": last_eval_at.isoformat() if last_eval_at else None,
        "last_gold_at": last_gold_at.isoformat() if last_gold_at else None,
        "last_groundtruth_at": last_groundtruth_at.isoformat() if last_groundtruth_at else None,
    }


def compute_coverage_report(
    db: Session,
    *,
    person_ids: Optional[List[str]] = None,
    limit: int = 50,
    offset: int = 0,
    active_only: bool = True,
    order: str = "worst",
) -> Dict[str, Any]:
    """Compute operational coverage report.

    `order`:
      - "worst": lowest score first
      - "best": highest score first
    """

    bills_total = int(db.query(func.count(Bill.bill_id)).scalar() or 0)
    bills_needs_enrichment = int(
        db.query(func.count(Bill.bill_id)).filter(Bill.needs_enrichment == 1).scalar() or 0
    )
    bills_enriched = max(0, bills_total - bills_needs_enrichment)

    # Minimum viable enrichment definition (timeline usability):
    # - latest_action_date present
    # - status_bucket present
    # - has >= MIN_VIABLE_ENRICHED_ACTIONS_MIN BillAction rows
    # Note: we use a correlated subquery so this stays a single SQL query.
    actions_count_sq = (
        db.query(func.count(BillAction.id))
        .filter(BillAction.bill_id == Bill.bill_id)
        .correlate(Bill)
        .scalar_subquery()
    )

    bills_min_viable = int(
        db.query(func.count(Bill.bill_id))
        .filter(Bill.latest_action_date.isnot(None))
        .filter(Bill.status_bucket.isnot(None))
        .filter(actions_count_sq >= MIN_VIABLE_ENRICHED_ACTIONS_MIN)
        .scalar()
        or 0
    )
    bills_min_viable_rate = _safe_div(bills_min_viable, bills_total)
    has_min_viable_enriched_bills = (bills_min_viable > 0) or (
        bills_min_viable_rate >= MIN_VIABLE_ENRICHED_RATE_THRESHOLD
    )

    members_q = db.query(TrackedMember)
    if active_only:
        members_q = members_q.filter(TrackedMember.is_active == 1)

    # Important: distinguish between:
    # - person_ids=None  => no filter (all members)
    # - person_ids=[]    => explicit empty filter (no members)
    if person_ids is not None:
        members_q = members_q.filter(TrackedMember.person_id.in_(person_ids))

    members: List[TrackedMember] = (
        members_q.order_by(TrackedMember.display_name.asc()).all()
    )

    rows = [
        compute_member_coverage(
            db,
            m,
            bills_total=bills_total,
            has_min_viable_enriched_bills=has_min_viable_enriched_bills,
        )
        for m in members
    ]

    # Freeze ordering contract:
    # - default/worst: coverage_score ASC, tie-breaker person_id ASC
    # - best:          coverage_score DESC, tie-breaker person_id ASC
    if order == "best":
        rows.sort(key=lambda r: (-r["coverage_score"], r["person_id"]))
    else:
        rows.sort(key=lambda r: (r["coverage_score"], r["person_id"]))

    total_members = len(rows)
    page = rows[offset : offset + limit]

    return {
        "generated_at": _utc_now_iso(),
        "summary": {
            "tracked_members_total": total_members,
            "active_only": active_only,
            "bills_total": bills_total,
            "bills_needs_enrichment": bills_needs_enrichment,
            "bills_enriched": bills_enriched,
            "bills_enrichment_rate": round(_safe_div(bills_enriched, bills_total), 4),
            "bills_min_viable": bills_min_viable,
            "bills_min_viable_rate": round(bills_min_viable_rate, 4),
            "min_viable_actions_min": MIN_VIABLE_ENRICHED_ACTIONS_MIN,
            "min_viable_rate_threshold": MIN_VIABLE_ENRICHED_RATE_THRESHOLD,
            "has_min_viable_enriched_bills": has_min_viable_enriched_bills,
        },
        "limit": limit,
        "offset": offset,
        "order": order,
        "members": page,
    }
