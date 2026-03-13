"""
Politics sector routes — Members, ledger, claims, votes, bills, actions.
"""

from fastapi import APIRouter, Query, HTTPException, Request
from sqlalchemy import func, desc, case
from typing import Optional, Dict, Any
from datetime import date
from functools import lru_cache

from models.database import (
    SessionLocal,
    Person,
    Action,
    SourceDocument,
    Claim,
    ClaimEvaluation,
    Vote,
    MemberVote,
    Bill,
    BillAction,
    PersonBill,
    GoldLedgerEntry,
    TrackedMember,
    MemberBillGroundTruth,
)
from services.coverage import compute_coverage_report
from services.ops.pilot_cohort import get_pilot_person_ids
from services.matching import (
    compute_matches_for_claim,
    auto_classify_claim,
    detect_intent,
    score_action_against_claim,
    get_profile,
    contains_gate_signal,
    contains_claim_signal,
    CATEGORY_PROFILES,
    STOPWORDS_BASE,
)
from connectors.wikipedia import build_politician_profile
from connectors.fec import build_finance_profile
from services.power_map import build_person_power_map
from utils.normalization import normalize_bill_id
from services.bill_text import format_text_receipt

import os
import json
import re

router = APIRouter(tags=["politics"])

LEDGER_TIER_VALUES = ("strong", "moderate", "weak", "none")


# ── Helpers ──

def _safe_json_loads(value):
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return None


def _serialize_gold_row(row: GoldLedgerEntry) -> Dict[str, Any]:
    return {
        "id": row.id,
        "claim_id": row.claim_id,
        "evaluation_id": row.evaluation_id,
        "person_id": row.person_id,
        "claim_date": row.claim_date.isoformat() if row.claim_date else None,
        "source_url": row.source_url,
        "normalized_text": row.normalized_text,
        "intent_type": row.intent_type,
        "policy_area": row.policy_area,
        "matched_bill_id": row.matched_bill_id,
        "best_action_id": row.best_action_id,
        "score": row.score,
        "tier": row.tier,
        "relevance": row.relevance,
        "progress": row.progress,
        "timing": row.timing,
        "evidence": _safe_json_loads(row.evidence_json),
        "why": _safe_json_loads(row.why_json),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _bill_type_label(bill_type: str) -> str:
    labels = {
        "hr": "house-bill",
        "s": "senate-bill",
        "hjres": "house-joint-resolution",
        "sjres": "senate-joint-resolution",
        "hconres": "house-concurrent-resolution",
        "sconres": "senate-concurrent-resolution",
        "hres": "house-resolution",
        "sres": "senate-resolution",
    }
    return labels.get(bill_type, bill_type)


# ── Cached external lookups ──

@lru_cache(maxsize=128)
def _cached_wikipedia_profile(display_name: str, state: str = "", chamber: str = ""):
    try:
        return build_politician_profile(
            display_name,
            state=state or None,
            chamber=chamber or None,
        )
    except Exception:
        return None


@lru_cache(maxsize=128)
def _cached_fec_profile(display_name: str):
    try:
        return build_finance_profile(display_name)
    except Exception:
        return None


# ── Ledger Endpoints ──

@router.get("/ledger/person/{person_id}")
def get_person_ledger(
    person_id: str,
    tier: Optional[str] = Query(None, description="Filter by tier (strong/moderate/weak/none)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Gold-backed ledger entries for a person."""
    db = SessionLocal()
    try:
        q = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.person_id == person_id)
        if tier is not None:
            if tier not in LEDGER_TIER_VALUES:
                raise HTTPException(
                    status_code=422,
                    detail={"error": "invalid tier", "allowed": list(LEDGER_TIER_VALUES)},
                )
            q = q.filter(GoldLedgerEntry.tier == tier)

        total = q.with_entities(func.count(GoldLedgerEntry.id)).scalar() or 0

        rows = (
            q.order_by(
                desc(GoldLedgerEntry.claim_date).nullslast(),
                desc(GoldLedgerEntry.claim_id),
                desc(GoldLedgerEntry.id),
            )
            .offset(offset)
            .limit(limit)
            .all()
        )

        return {
            "person_id": person_id,
            "total": total,
            "limit": limit,
            "offset": offset,
            "entries": [_serialize_gold_row(r) for r in rows],
        }
    finally:
        db.close()


@router.get("/ledger/summary")
def get_ledger_summary(
    person_id: Optional[str] = Query(None, description="Optional filter by person_id"),
):
    """Aggregate summary over Gold ledger entries."""
    db = SessionLocal()
    try:
        q = db.query(GoldLedgerEntry)
        if person_id:
            q = q.filter(GoldLedgerEntry.person_id == person_id)

        total = q.with_entities(func.count(GoldLedgerEntry.id)).scalar() or 0
        by_tier = dict(
            q.with_entities(GoldLedgerEntry.tier, func.count(GoldLedgerEntry.id))
             .group_by(GoldLedgerEntry.tier)
             .all()
        )
        return {"total": total, "by_tier": by_tier}
    finally:
        db.close()


@router.get("/ledger/claim/{claim_id}")
def get_ledger_claim(claim_id: int):
    """Single claim view from the Gold ledger."""
    db = SessionLocal()
    try:
        row = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim_id).one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "ledger claim not found", "claim_id": claim_id})
        return _serialize_gold_row(row)
    finally:
        db.close()


# ── Coverage ──

@router.get("/ops/coverage")
def get_ops_coverage(
    person_id: Optional[str] = Query(None, description="Optional person_id filter. Comma-separated for multiple."),
    pilot_only: bool = Query(False, description="If true, filters to the canonical pilot cohort."),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    active_only: bool = Query(True),
    order: str = Query("worst", description="Ordering: worst|best"),
):
    """Operational coverage snapshot (Phase L3)."""
    db = SessionLocal()
    try:
        person_ids = None
        if person_id is not None:
            person_ids = [p.strip() for p in person_id.split(",") if p.strip()]

        if pilot_only:
            pilot_ids = get_pilot_person_ids(db)
            if person_ids is None:
                person_ids = pilot_ids
            else:
                pilot_set = set(pilot_ids)
                person_ids = [p for p in person_ids if p in pilot_set]
        return compute_coverage_report(
            db,
            person_ids=person_ids,
            limit=limit,
            offset=offset,
            active_only=active_only,
            order=order,
        )
    finally:
        db.close()


# ── People Directory ──

@router.get("/people")
def get_people(
    active_only: bool = Query(True),
    has_ledger: bool = Query(False, description="If true, returns only people with gold_ledger entries."),
    party: Optional[str] = Query(None, description="Filter by party: D, R, or I"),
    chamber: Optional[str] = Query(None, description="Filter by chamber: house or senate"),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Case-insensitive search"),
):
    """People directory for frontend."""
    db = SessionLocal()
    try:
        query = db.query(TrackedMember)
        if active_only:
            query = query.filter(TrackedMember.is_active == 1)
        if has_ledger:
            query = query.filter(
                db.query(GoldLedgerEntry.id)
                .filter(GoldLedgerEntry.person_id == TrackedMember.person_id)
                .exists()
            )
        if party:
            query = query.filter(TrackedMember.party.like(f"{party}%"))
        if chamber:
            query = query.filter(func.lower(TrackedMember.chamber) == chamber.lower())
        if q:
            like = f"%{q.strip().lower()}%"
            query = query.filter(
                func.lower(TrackedMember.person_id).like(like)
                | func.lower(TrackedMember.display_name).like(like)
                | func.lower(TrackedMember.bioguide_id).like(like)
                | func.lower(TrackedMember.state).like(like)
            )

        total = query.count()
        rows = (
            query.order_by(TrackedMember.display_name.asc(), TrackedMember.person_id.asc())
            .offset(offset).limit(limit).all()
        )

        return {
            "total": total,
            "people": [
                {
                    "person_id": r.person_id,
                    "display_name": r.display_name,
                    "chamber": r.chamber,
                    "state": r.state,
                    "party": r.party,
                    "is_active": bool(r.is_active),
                    "photo_url": r.photo_url,
                }
                for r in rows
            ],
            "limit": limit,
            "offset": offset,
        }
    finally:
        db.close()


@router.get("/people/{person_id}")
def get_person_directory_entry(person_id: str):
    """Single person directory entry."""
    db = SessionLocal()
    try:
        row = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "person not found", "person_id": person_id})
        return {
            "person_id": row.person_id,
            "display_name": row.display_name,
            "bioguide_id": row.bioguide_id,
            "chamber": row.chamber,
            "state": row.state,
            "party": row.party,
            "is_active": bool(row.is_active),
        }
    finally:
        db.close()


@router.get("/people/{person_id}/actions")
def get_actions(
    person_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        rows = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
              .filter(Action.person_id == person_id)
              .order_by(desc(Action.date))
              .offset(offset).limit(limit).all()
        )
        return [{
            "id": a.id,
            "person_id": a.person_id,
            "title": a.title,
            "summary": a.summary,
            "date": a.date.isoformat() if a.date else None,
            "source_url": url,
            "bill_congress": a.bill_congress,
            "bill_type": a.bill_type,
            "bill_number": a.bill_number,
            "metadata_json": a.metadata_json,
        } for a, url in rows]
    finally:
        db.close()


@router.get("/people/{person_id}/activity")
def get_person_activity(
    person_id: str,
    role: Optional[str] = Query(None, description="Filter by role: sponsored or cosponsored"),
    congress: Optional[int] = Query(None, description="Filter by congress number"),
    policy_area: Optional[str] = Query(None, description="Filter by policy area"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Real legislative activity — bills they sponsored/cosponsored."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        if not member:
            raise HTTPException(status_code=404, detail=f"Unknown person_id: {person_id}")
        if not member.bioguide_id:
            raise HTTPException(status_code=404, detail=f"Member {person_id} has no bioguide_id")

        q = (
            db.query(MemberBillGroundTruth, Bill)
            .outerjoin(Bill, MemberBillGroundTruth.bill_id == Bill.bill_id)
            .filter(MemberBillGroundTruth.bioguide_id == member.bioguide_id)
        )

        if role is not None:
            if role not in ("sponsored", "cosponsored", "sponsor", "cosponsor"):
                raise HTTPException(status_code=422, detail="role must be 'sponsored' or 'cosponsored'")
            if role in ("sponsored", "sponsor"):
                q = q.filter(MemberBillGroundTruth.role.in_(["sponsored", "sponsor"]))
            else:
                q = q.filter(MemberBillGroundTruth.role.in_(["cosponsored", "cosponsor"]))

        if congress is not None:
            q = q.filter(Bill.congress == congress)
        if policy_area is not None:
            q = q.filter(func.lower(Bill.policy_area) == func.lower(policy_area))

        total = q.with_entities(func.count(MemberBillGroundTruth.id)).scalar() or 0

        rows = (
            q.order_by(
                case(
                    (MemberBillGroundTruth.role.in_(["sponsored", "sponsor"]), 0),
                    else_=1,
                ),
                desc(Bill.latest_action_date).nullslast(),
                desc(MemberBillGroundTruth.id),
            )
            .offset(offset).limit(limit).all()
        )

        sponsored_count = (
            db.query(func.count(MemberBillGroundTruth.id))
            .filter(
                MemberBillGroundTruth.bioguide_id == member.bioguide_id,
                MemberBillGroundTruth.role.in_(["sponsored", "sponsor"]),
            ).scalar() or 0
        )
        cosponsored_count = (
            db.query(func.count(MemberBillGroundTruth.id))
            .filter(
                MemberBillGroundTruth.bioguide_id == member.bioguide_id,
                MemberBillGroundTruth.role.in_(["cosponsored", "cosponsor"]),
            ).scalar() or 0
        )

        policy_areas = dict(
            db.query(Bill.policy_area, func.count(MemberBillGroundTruth.id))
            .outerjoin(Bill, MemberBillGroundTruth.bill_id == Bill.bill_id)
            .filter(
                MemberBillGroundTruth.bioguide_id == member.bioguide_id,
                Bill.policy_area.isnot(None),
            )
            .group_by(Bill.policy_area).all()
        )

        entries = []
        for gt, bill in rows:
            entries.append({
                "bill_id": gt.bill_id,
                "role": gt.role,
                "congress": bill.congress if bill else None,
                "bill_type": bill.bill_type if bill else None,
                "bill_number": bill.bill_number if bill else None,
                "title": bill.title if bill else gt.bill_id,
                "policy_area": bill.policy_area if bill else None,
                "status": bill.status_bucket if bill else None,
                "latest_action": bill.latest_action_text if bill else None,
                "latest_action_date": bill.latest_action_date.isoformat() if bill and bill.latest_action_date else None,
                "summary": bill.summary_text[:300] if bill and bill.summary_text else None,
                "congress_url": f"https://www.congress.gov/bill/{bill.congress}th-congress/{_bill_type_label(bill.bill_type)}/{bill.bill_number}" if bill else None,
            })

        return {
            "person_id": person_id,
            "display_name": member.display_name,
            "total": total,
            "sponsored_count": sponsored_count,
            "cosponsored_count": cosponsored_count,
            "policy_areas": policy_areas,
            "limit": limit,
            "offset": offset,
            "entries": entries,
        }
    finally:
        db.close()


@router.get("/people/{person_id}/stats")
def get_person_stats(person_id: str):
    """Summary metrics for a person."""
    db = SessionLocal()
    try:
        actions = db.query(Action).filter(Action.person_id == person_id).all()
        actions_count = len(actions)
        last_action_date = None
        if actions_count > 0:
            last_action = max(actions, key=lambda a: a.date if a.date else "")
            last_action_date = last_action.date.isoformat() if last_action.date else None
        return {"id": person_id, "actions_count": actions_count, "last_action_date": last_action_date, "top_tags": []}
    finally:
        db.close()


@router.get("/people/{person_id}/performance")
def person_performance(person_id: str, top: int = Query(10, ge=1, le=50)):
    """Evidence-backed performance summary for a person."""
    db = SessionLocal()
    try:
        total_claims = db.query(func.count(Claim.id)).filter(Claim.person_id == person_id).scalar() or 0
        total_scored = db.query(func.count(ClaimEvaluation.id)).filter(ClaimEvaluation.person_id == person_id).scalar() or 0

        by_tier = dict(
            db.query(ClaimEvaluation.tier, func.count(ClaimEvaluation.id))
              .filter(ClaimEvaluation.person_id == person_id)
              .group_by(ClaimEvaluation.tier).all()
        )
        by_category = dict(
            db.query(Claim.category, func.count(Claim.id))
              .filter(Claim.person_id == person_id)
              .group_by(Claim.category).all()
        )
        by_timing = dict(
            db.query(ClaimEvaluation.timing, func.count(ClaimEvaluation.id))
              .filter(ClaimEvaluation.person_id == person_id)
              .group_by(ClaimEvaluation.timing).all()
        )
        by_progress = dict(
            db.query(ClaimEvaluation.progress, func.count(ClaimEvaluation.id))
              .filter(ClaimEvaluation.person_id == person_id)
              .group_by(ClaimEvaluation.progress).all()
        )

        top_rows = (
            db.query(ClaimEvaluation, Claim, Action, SourceDocument.url)
              .join(Claim, Claim.id == ClaimEvaluation.claim_id)
              .outerjoin(Action, Action.id == ClaimEvaluation.best_action_id)
              .outerjoin(SourceDocument, SourceDocument.id == Action.source_id)
              .filter(ClaimEvaluation.person_id == person_id)
              .order_by(ClaimEvaluation.score.desc().nullslast(), ClaimEvaluation.updated_at.desc())
              .limit(top).all()
        )

        receipts = []
        for ev, cl, act, source_url in top_rows:
            receipts.append({
                "claim_id": cl.id,
                "claim_text": cl.text,
                "category": cl.category,
                "tier": ev.tier,
                "relevance": ev.relevance,
                "progress": ev.progress,
                "timing": ev.timing,
                "score": ev.score,
                "action": None if not act else {
                    "id": act.id,
                    "title": act.title,
                    "date": act.date.isoformat() if act.date else None,
                    "source_url": source_url,
                    "bill_congress": act.bill_congress,
                    "bill_type": act.bill_type,
                    "bill_number": act.bill_number,
                    "policy_area": act.policy_area,
                    "latest_action_text": act.latest_action_text,
                    "latest_action_date": act.latest_action_date,
                },
            })

        return {
            "person_id": person_id,
            "total_claims": total_claims,
            "total_scored": total_scored,
            "by_tier": by_tier,
            "by_category": by_category,
            "by_timing": by_timing,
            "by_progress": by_progress,
            "top_receipts": receipts,
        }
    finally:
        db.close()


@router.get("/people/{person_id}/profile")
def get_person_profile(person_id: str):
    """Wikipedia profile for a person. Cached in-memory."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).one_or_none()
        if member is None:
            raise HTTPException(status_code=404, detail={"error": "person not found", "person_id": person_id})
        display_name = member.display_name
        state = member.state or ""
        chamber = member.chamber or ""
    finally:
        db.close()

    profile = _cached_wikipedia_profile(display_name, state, chamber)
    if profile is None:
        return {"person_id": person_id, "display_name": display_name, "summary": None, "thumbnail": None,
                "wikidata_id": None, "infobox": {}, "sections": {}, "url": None}
    profile["person_id"] = person_id
    profile["display_name"] = display_name
    return profile


@router.get("/people/{person_id}/finance")
def get_person_finance(person_id: str):
    """FEC finance profile for a person. Cached in-memory."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).one_or_none()
        if member is None:
            raise HTTPException(status_code=404, detail={"error": "person not found", "person_id": person_id})
        display_name = member.display_name
    finally:
        db.close()

    profile = _cached_fec_profile(display_name)
    if profile is None:
        return {"person_id": person_id, "display_name": display_name,
                "candidate_id": None, "totals": None, "committees": [], "top_donors": []}
    profile["person_id"] = person_id
    profile["display_name"] = display_name
    return profile


# ── Actions ──

@router.get("/actions/recent")
def recent_actions(limit: int = Query(10, ge=1, le=200)):
    """Unified feed of all actions, ordered by date DESC."""
    db = SessionLocal()
    try:
        rows = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
              .order_by(desc(Action.date))
              .limit(limit).all()
        )
        return [{
            "id": a.id,
            "person_id": a.person_id,
            "title": a.title,
            "summary": a.summary,
            "date": a.date.isoformat() if a.date else None,
            "source_url": url,
            "bill_congress": a.bill_congress,
            "bill_type": a.bill_type,
            "bill_number": a.bill_number,
        } for a, url in rows]
    finally:
        db.close()


@router.get("/actions/search")
def search_actions(
    person_id: Optional[str] = Query(None),
    bill_congress: Optional[int] = Query(None),
    bill_type: Optional[str] = Query(None),
    bill_number: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Keyword search in title/summary"),
    has_enriched: Optional[bool] = Query(None),
    simple: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Search endpoint for actions."""
    db = SessionLocal()
    try:
        base = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
        )
        if person_id:
            base = base.filter(Action.person_id == person_id)
        if bill_congress is not None:
            base = base.filter(Action.bill_congress == bill_congress)
        if bill_type:
            base = base.filter(func.upper(Action.bill_type) == bill_type.upper())
        if bill_number:
            base = base.filter(Action.bill_number == str(bill_number))
        if q:
            like = f"%{q}%"
            base = base.filter((Action.title.ilike(like)) | (Action.summary.ilike(like)))
        if has_enriched is True:
            base = base.filter(Action.metadata_json.isnot(None))
        elif has_enriched is False:
            base = base.filter(Action.metadata_json.is_(None))

        total = base.with_entities(func.count()).scalar()
        rows = base.order_by(desc(Action.date)).offset(offset).limit(limit).all()

        actions = []
        for a, url in rows:
            action_data = {
                "id": a.id, "person_id": a.person_id, "title": a.title, "summary": a.summary,
                "date": a.date.isoformat() if a.date else None, "source_url": url,
                "bill_congress": a.bill_congress, "bill_type": a.bill_type, "bill_number": a.bill_number,
            }
            if simple:
                enriched = (a.metadata_json or {}).get("enriched", {}) if isinstance(a.metadata_json, dict) else {}
                latest_action = enriched.get("latest_action", {}) if isinstance(enriched.get("latest_action"), dict) else {}
                action_data["policy_area"] = enriched.get("policy_area")
                action_data["latest_action_text"] = latest_action.get("text")
                action_data["introduced_date"] = enriched.get("introduced_date")
            else:
                action_data["metadata_json"] = a.metadata_json
            actions.append(action_data)

        return {"total": total, "limit": limit, "offset": offset, "actions": actions}
    finally:
        db.close()


@router.get("/actions/{action_id}")
def get_action_detail(action_id: int):
    """Full detail for a single action, including enriched fields and bill text receipt."""
    db = SessionLocal()
    try:
        row = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
              .filter(Action.id == action_id)
              .first()
        )
        if not row:
            raise HTTPException(status_code=404, detail="Action not found")

        a, url = row
        meta = a.metadata_json if isinstance(a.metadata_json, dict) else {}
        enriched = meta.get("enriched", {}) if isinstance(meta, dict) else {}
        latest = enriched.get("latest_action", {}) if isinstance(enriched.get("latest_action"), dict) else {}

        response = {
            "id": a.id,
            "person_id": a.person_id,
            "title": a.title,
            "summary": a.summary,
            "date": a.date.isoformat() if a.date else None,
            "source_url": url,
            "bill_congress": a.bill_congress,
            "bill_type": a.bill_type,
            "bill_number": a.bill_number,
            "enriched": {
                "title": enriched.get("title"),
                "policy_area": enriched.get("policy_area"),
                "subjects": enriched.get("subjects", []),
                "introduced_date": enriched.get("introduced_date"),
                "sponsors": enriched.get("sponsors", []),
                "cosponsors_count": enriched.get("cosponsors_count"),
                "latest_action_text": latest.get("text"),
                "latest_action_date": latest.get("actionDate"),
                "summary_text": enriched.get("summary_text"),
            } if enriched else None,
        }

        # Add bill text receipt
        if a.bill_congress and a.bill_type and a.bill_number:
            bill_id = normalize_bill_id(a.bill_congress, a.bill_type, a.bill_number)
            try:
                response["receipts"] = format_text_receipt(db, bill_id)
            except Exception as e:
                response["receipts"] = {"error": str(e)}

        return response
    finally:
        db.close()


# ── Claims ──

@router.post("/claims")
def create_claim(
    request: Request,
    person_id: str,
    text: str,
    category: Optional[str] = None,
    claim_date: Optional[str] = None,
    claim_source_url: Optional[str] = None,
):
    """Create a new claim with conservative auto-classification."""
    db = SessionLocal()
    try:
        parsed_date = None
        if claim_date:
            try:
                parsed_date = date.fromisoformat(claim_date)
            except ValueError:
                return {"error": "claim_date must be YYYY-MM-DD"}

        suggestions = auto_classify_claim(text)
        intent = detect_intent(text)

        final_category = category
        category_source = "user"

        if category:
            final_category = category.strip().lower()
        else:
            top_suggestion = suggestions[0] if suggestions else ("general", 0.0)
            top_category, top_confidence = top_suggestion
            if top_confidence >= 0.7:
                final_category = top_category
                category_source = "auto_high_confidence"
            else:
                final_category = "general"
                category_source = "auto_low_confidence"

        c = Claim(
            person_id=person_id, text=text, category=final_category, intent=intent,
            claim_date=parsed_date, claim_source_url=claim_source_url,
        )
        db.add(c)
        db.commit()
        db.refresh(c)

        return {
            "id": c.id, "person_id": c.person_id, "text": c.text,
            "category": c.category, "category_source": category_source,
            "claim_date": c.claim_date, "claim_source_url": c.claim_source_url,
            "created_at": c.created_at.isoformat(), "intent": intent,
            "suggested_categories": suggestions,
        }
    finally:
        db.close()


@router.get("/claims/{claim_id}")
def get_claim(claim_id: int):
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        return {
            "id": claim.id, "person_id": claim.person_id, "text": claim.text,
            "category": claim.category, "intent": claim.intent,
            "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
            "claim_source_url": claim.claim_source_url, "claim_hash": claim.claim_hash,
            "created_at": claim.created_at.isoformat() if claim.created_at else None,
            "updated_at": claim.updated_at.isoformat() if claim.updated_at else None,
        }
    finally:
        db.close()


@router.get("/claims")
def list_claims(
    person_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        q = db.query(Claim)
        if person_id:
            q = q.filter(Claim.person_id == person_id)
        total = q.with_entities(func.count()).scalar()
        rows = q.order_by(desc(Claim.id)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "claims": [{
                "id": c.id, "person_id": c.person_id, "text": c.text,
                "claim_date": c.claim_date.isoformat() if c.claim_date else None,
                "claim_source_url": c.claim_source_url,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            } for c in rows],
        }
    finally:
        db.close()


@router.get("/claims/{claim_id}/matches")
def match_claim_to_actions(claim_id: int, limit: int = Query(25, ge=1, le=100)):
    """Deterministic matcher using shared matching service."""
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")
        return compute_matches_for_claim(claim, db, limit=limit)
    finally:
        db.close()


@router.get("/claims/{claim_id}/matches_multi")
def match_claim_multi_category(
    claim_id: int,
    limit: int = Query(25, ge=1, le=100),
    min_confidence: float = Query(0.1, ge=0.0, le=1.0),
):
    """Multi-category matcher."""
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            return {"error": "Claim not found"}

        all_categories = auto_classify_claim(claim.text)
        categories = [(cat, conf) for cat, conf in all_categories if conf >= min_confidence]
        if not categories:
            categories = [("general", 1.0)]

        rows = (
            db.query(Action, SourceDocument.url)
              .join(SourceDocument, Action.source_id == SourceDocument.id)
              .filter(Action.person_id == claim.person_id)
              .order_by(desc(Action.date)).limit(2000).all()
        )

        all_matches = []
        category_results = {}

        for category, confidence in categories:
            profile = get_profile(category)
            stopwords = STOPWORDS_BASE.union(profile["stopwords_extra"])

            claim_gate_terms = profile.get("claim_gate_terms")
            if claim_gate_terms is not None:
                if not contains_claim_signal(claim.text, claim_gate_terms, stopwords):
                    category_results[category] = {"confidence": confidence, "matches": 0, "note": "Claim missing category signal terms"}
                    continue

            scored = []
            for a, url in rows:
                meta = a.metadata_json if isinstance(a.metadata_json, dict) else {}
                enriched = (meta.get("enriched") or {}) if isinstance(meta, dict) else {}
                latest = (enriched.get("latest_action") or {}) if isinstance(enriched.get("latest_action"), dict) else {}
                combined_text = f"{a.title or ''} {a.summary or ''} {enriched.get('title') or ''} {enriched.get('policy_area') or ''} {latest.get('text') or ''}"

                if profile["gate_terms"] is not None:
                    if not contains_gate_signal(combined_text, profile["gate_terms"], stopwords):
                        continue

                s = score_action_against_claim(claim.text, a.title, a.summary, meta, profile)
                if s["score"] < profile["min_score"]:
                    continue

                match_data = {
                    "action_id": a.id, "score": s["score"], "category": category,
                    "category_confidence": confidence, "combined_score": s["score"] * confidence,
                    "title": a.title, "date": a.date.isoformat() if a.date else None, "source_url": url,
                    "why": {
                        "claim_tokens": s["claim_tokens"], "overlap_basic": s["overlap_basic"],
                        "overlap_enriched": s["overlap_enriched"], "phrase_hits": s.get("phrase_hits", []),
                    },
                }
                scored.append(match_data)
                all_matches.append(match_data)

            category_results[category] = {"confidence": confidence, "matches": len(scored), "min_score": profile["min_score"]}

        seen_actions = {}
        for match in all_matches:
            aid = match["action_id"]
            if aid not in seen_actions or match["combined_score"] > seen_actions[aid]["combined_score"]:
                seen_actions[aid] = match

        final_matches = sorted(seen_actions.values(), key=lambda x: x["combined_score"], reverse=True)

        return {
            "claim": {"id": claim.id, "person_id": claim.person_id, "text": claim.text, "intent": claim.intent},
            "categories_analyzed": category_results,
            "total_unique_matches": len(final_matches),
            "matches": final_matches[:limit],
        }
    finally:
        db.close()


@router.get("/claims/{claim_id}/evaluation")
def get_claim_evaluation(claim_id: int):
    """Drill-down: full evaluation receipt for a single claim."""
    db = SessionLocal()
    try:
        claim = db.query(Claim).filter(Claim.id == claim_id).first()
        if not claim:
            raise HTTPException(status_code=404, detail="Claim not found")

        eval_row = (
            db.query(ClaimEvaluation, Action, SourceDocument.url)
              .outerjoin(Action, Action.id == ClaimEvaluation.best_action_id)
              .outerjoin(SourceDocument, SourceDocument.id == Action.source_id)
              .filter(ClaimEvaluation.claim_id == claim_id)
              .first()
        )

        if not eval_row:
            return {
                "claim": {"id": claim.id, "text": claim.text, "person_id": claim.person_id,
                          "category": claim.category, "intent": claim.intent},
                "evaluation": None,
            }

        ev, act, source_url = eval_row
        return {
            "claim": {"id": claim.id, "text": claim.text, "person_id": claim.person_id,
                      "category": claim.category, "intent": claim.intent,
                      "claim_date": claim.claim_date.isoformat() if claim.claim_date else None,
                      "claim_source_url": claim.claim_source_url},
            "evaluation": {
                "id": ev.id, "tier": ev.tier, "score": ev.score,
                "relevance": ev.relevance, "progress": ev.progress, "timing": ev.timing,
                "matched_bill_id": ev.matched_bill_id,
                "evidence_json": _safe_json_loads(ev.evidence_json) if hasattr(ev, 'evidence_json') else None,
                "why_json": _safe_json_loads(ev.why_json) if hasattr(ev, 'why_json') else None,
                "action": None if not act else {
                    "id": act.id, "title": act.title,
                    "date": act.date.isoformat() if act.date else None,
                    "source_url": source_url,
                    "bill_congress": act.bill_congress, "bill_type": act.bill_type, "bill_number": act.bill_number,
                },
            },
        }
    finally:
        db.close()


# ── Compare ──

@router.get("/compare")
def get_comparison(
    ids: str = Query(..., description="Comma-separated person_ids (2-10)"),
):
    """Cross-member comparison."""
    db = SessionLocal()
    try:
        person_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]
        if not person_ids or len(person_ids) > 10:
            raise HTTPException(status_code=400, detail="Provide 2-10 person IDs")

        results = []
        for pid in person_ids:
            member = db.query(TrackedMember).filter(TrackedMember.person_id == pid).first()
            if not member:
                continue

            total_claims = db.query(func.count(Claim.id)).filter(Claim.person_id == pid).scalar() or 0
            total_scored = db.query(func.count(ClaimEvaluation.id)).filter(ClaimEvaluation.person_id == pid).scalar() or 0
            by_tier = dict(
                db.query(ClaimEvaluation.tier, func.count(ClaimEvaluation.id))
                  .filter(ClaimEvaluation.person_id == pid)
                  .group_by(ClaimEvaluation.tier).all()
            )
            total_actions = db.query(func.count(Action.id)).filter(Action.person_id == pid).scalar() or 0

            results.append({
                "person_id": pid,
                "display_name": member.display_name,
                "party": member.party,
                "chamber": member.chamber,
                "state": member.state,
                "total_claims": total_claims,
                "total_scored": total_scored,
                "by_tier": by_tier,
                "total_actions": total_actions,
            })

        return {"people": results}
    finally:
        db.close()


# ── Graph / Power Map ──

@router.get("/graph/person/{person_id}")
def get_person_graph(person_id: str, limit: int = Query(50, ge=1, le=200)):
    """Graph-style co-sponsorship data for a person."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        if not member:
            raise HTTPException(status_code=404, detail=f"Unknown person_id: {person_id}")
        if not member.bioguide_id:
            return {"person_id": person_id, "display_name": member.display_name, "connections": []}

        # Get bills this member sponsors
        member_bills = (
            db.query(MemberBillGroundTruth.bill_id)
            .filter(
                MemberBillGroundTruth.bioguide_id == member.bioguide_id,
                MemberBillGroundTruth.role.in_(["sponsored", "sponsor"]),
            ).all()
        )
        bill_ids = [b[0] for b in member_bills]
        if not bill_ids:
            return {"person_id": person_id, "display_name": member.display_name, "connections": []}

        # Find co-sponsors on those bills
        co_sponsors = (
            db.query(
                MemberBillGroundTruth.bioguide_id,
                func.count(MemberBillGroundTruth.id).label("shared_bills"),
            )
            .filter(
                MemberBillGroundTruth.bill_id.in_(bill_ids),
                MemberBillGroundTruth.bioguide_id != member.bioguide_id,
                MemberBillGroundTruth.role.in_(["cosponsored", "cosponsor"]),
            )
            .group_by(MemberBillGroundTruth.bioguide_id)
            .order_by(desc("shared_bills"))
            .limit(limit)
            .all()
        )

        connections = []
        for bioguide_id, shared in co_sponsors:
            co_member = db.query(TrackedMember).filter(TrackedMember.bioguide_id == bioguide_id).first()
            if co_member:
                connections.append({
                    "person_id": co_member.person_id,
                    "display_name": co_member.display_name,
                    "party": co_member.party,
                    "chamber": co_member.chamber,
                    "state": co_member.state,
                    "shared_bills": shared,
                })

        return {"person_id": person_id, "display_name": member.display_name, "connections": connections}
    finally:
        db.close()


@router.get("/powermap/person/{person_id}")
def get_person_powermap(person_id: str, limit: int = Query(25)):
    """Power map for a person."""
    db = SessionLocal()
    try:
        return build_person_power_map(db, person_id=person_id, limit=limit)
    finally:
        db.close()


# ── Votes ──

@router.post("/votes/ingest")
def ingest_votes(request: Request, congress: int = Query(119), limit: int = Query(50)):
    """Trigger vote ingestion from Congress.gov."""
    from connectors.congress_votes import ingest_recent_house_votes
    from models.database import SessionLocal, TrackedMember

    # Build bioguide -> person_id mapping
    db = SessionLocal()
    try:
        members = db.query(TrackedMember).filter(
            TrackedMember.is_active == 1,
            TrackedMember.bioguide_id.isnot(None),
        ).all()
        person_id_map = {m.bioguide_id: m.person_id for m in members}
    finally:
        db.close()

    count = ingest_recent_house_votes(congress=congress, limit=limit, person_id_map=person_id_map)
    return {"ingested": count, "congress": congress, "limit": limit}


@router.get("/votes")
def list_votes(
    congress: Optional[int] = Query(None),
    chamber: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List roll-call votes."""
    db = SessionLocal()
    try:
        q = db.query(Vote)
        if congress:
            q = q.filter(Vote.congress == congress)
        if chamber:
            q = q.filter(func.lower(Vote.chamber) == chamber.lower())

        total = q.count()
        rows = q.order_by(desc(Vote.vote_date)).offset(offset).limit(limit).all()

        return {
            "total": total, "limit": limit, "offset": offset,
            "votes": [{
                "id": v.id, "congress": v.congress, "chamber": v.chamber,
                "session": v.session, "roll_number": v.roll_number,
                "vote_date": v.vote_date.isoformat() if v.vote_date else None,
                "question": v.question, "result": v.result,
                "related_bill_congress": v.related_bill_congress,
                "related_bill_type": v.related_bill_type,
                "related_bill_number": v.related_bill_number,
                "yea_count": v.yea_count, "nay_count": v.nay_count,
                "not_voting_count": v.not_voting_count, "present_count": v.present_count,
            } for v in rows],
        }
    finally:
        db.close()


@router.get("/votes/{vote_id}")
def get_vote(vote_id: int):
    """Single vote detail with member positions."""
    db = SessionLocal()
    try:
        v = db.query(Vote).filter(Vote.id == vote_id).first()
        if not v:
            raise HTTPException(status_code=404, detail="Vote not found")

        member_votes = db.query(MemberVote).filter(MemberVote.vote_id == vote_id).all()

        return {
            "id": v.id, "congress": v.congress, "chamber": v.chamber,
            "session": v.session, "roll_number": v.roll_number,
            "vote_date": v.vote_date.isoformat() if v.vote_date else None,
            "question": v.question, "result": v.result,
            "related_bill_congress": v.related_bill_congress,
            "related_bill_type": v.related_bill_type,
            "related_bill_number": v.related_bill_number,
            "yea_count": v.yea_count, "nay_count": v.nay_count,
            "not_voting_count": v.not_voting_count, "present_count": v.present_count,
            "source_url": v.source_url,
            "member_votes": [{
                "bioguide_id": mv.bioguide_id,
                "member_name": mv.member_name,
                "position": mv.position,
                "party": mv.party,
                "state": mv.state,
            } for mv in member_votes],
        }
    finally:
        db.close()


@router.get("/people/{person_id}/votes")
def get_person_votes(
    person_id: str,
    position: Optional[str] = Query(None, description="Filter by position: Yea, Nay, etc."),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """How a member voted — roll call vote positions."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        if not member:
            raise HTTPException(status_code=404, detail=f"Unknown person_id: {person_id}")
        if not member.bioguide_id:
            return {"person_id": person_id, "total": 0, "votes": []}

        q = (
            db.query(MemberVote, Vote)
            .join(Vote, Vote.id == MemberVote.vote_id)
            .filter(MemberVote.bioguide_id == member.bioguide_id)
        )
        if position:
            q = q.filter(MemberVote.position == position)

        total = q.count()
        rows = q.order_by(desc(Vote.vote_date)).offset(offset).limit(limit).all()

        # Position breakdown
        position_counts = dict(
            db.query(MemberVote.position, func.count(MemberVote.id))
            .filter(MemberVote.bioguide_id == member.bioguide_id)
            .group_by(MemberVote.position).all()
        )

        return {
            "person_id": person_id,
            "display_name": member.display_name,
            "total": total,
            "position_summary": position_counts,
            "limit": limit,
            "offset": offset,
            "votes": [{
                "vote_id": v.id,
                "congress": v.congress,
                "chamber": v.chamber,
                "roll_number": v.roll_number,
                "vote_date": v.vote_date.isoformat() if v.vote_date else None,
                "question": v.question,
                "result": v.result,
                "position": mv.position,
                "related_bill_congress": v.related_bill_congress,
                "related_bill_type": v.related_bill_type,
                "related_bill_number": v.related_bill_number,
            } for mv, v in rows],
        }
    finally:
        db.close()


# ── Bills ──

@router.get("/bills/enrichment/stats")
def get_bill_enrichment_stats():
    """Bill enrichment coverage stats."""
    db = SessionLocal()
    try:
        total = db.query(func.count(Bill.bill_id)).scalar() or 0
        with_title = db.query(func.count(Bill.bill_id)).filter(Bill.title.isnot(None)).scalar() or 0
        with_summary = db.query(func.count(Bill.bill_id)).filter(Bill.summary_text.isnot(None)).scalar() or 0
        with_status = db.query(func.count(Bill.bill_id)).filter(Bill.status_bucket.isnot(None)).scalar() or 0

        return {
            "total_bills": total,
            "with_title": with_title,
            "with_summary": with_summary,
            "with_status_bucket": with_status,
            "title_pct": round(with_title / total * 100, 1) if total else 0,
            "summary_pct": round(with_summary / total * 100, 1) if total else 0,
        }
    finally:
        db.close()


@router.get("/bills/{bill_id}")
def get_bill(bill_id: str):
    """Full bill detail."""
    db = SessionLocal()
    try:
        bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
        if not bill:
            raise HTTPException(status_code=404, detail=f"Bill not found: {bill_id}")

        timeline = (
            db.query(BillAction)
            .filter(BillAction.bill_id == bill_id)
            .order_by(desc(BillAction.action_date))
            .all()
        )

        sponsors = (
            db.query(MemberBillGroundTruth, TrackedMember)
            .outerjoin(TrackedMember, TrackedMember.bioguide_id == MemberBillGroundTruth.bioguide_id)
            .filter(MemberBillGroundTruth.bill_id == bill_id)
            .all()
        )

        return {
            "bill_id": bill.bill_id,
            "congress": bill.congress,
            "bill_type": bill.bill_type,
            "bill_number": bill.bill_number,
            "title": bill.title,
            "policy_area": bill.policy_area,
            "subjects_json": bill.subjects_json,
            "summary_text": bill.summary_text,
            "status_bucket": bill.status_bucket,
            "latest_action_text": bill.latest_action_text,
            "latest_action_date": bill.latest_action_date.isoformat() if bill.latest_action_date else None,
            "introduced_date": bill.introduced_date.isoformat() if bill.introduced_date else None,
            "congress_url": bill.congress_url,
            "timeline": [{
                "action_date": a.action_date.isoformat() if a.action_date else None,
                "action_text": a.action_text,
                "action_type": a.action_type,
            } for a in timeline],
            "sponsors": [{
                "bioguide_id": gt.bioguide_id,
                "role": gt.role,
                "person_id": m.person_id if m else None,
                "display_name": m.display_name if m else gt.bioguide_id,
                "party": m.party if m else None,
                "state": m.state if m else None,
            } for gt, m in sponsors],
        }
    finally:
        db.close()


@router.get("/bills/{bill_id}/timeline")
def get_bill_timeline(bill_id: str):
    """Bill timeline with action history."""
    db = SessionLocal()
    try:
        bill = db.query(Bill).filter(Bill.bill_id == bill_id).first()
        if not bill:
            raise HTTPException(status_code=404, detail=f"Bill not found: {bill_id}")

        timeline = (
            db.query(BillAction)
            .filter(BillAction.bill_id == bill_id)
            .order_by(desc(BillAction.action_date))
            .all()
        )

        return {
            "bill_id": bill.bill_id,
            "title": bill.title,
            "status_bucket": bill.status_bucket,
            "timeline": [{
                "action_date": a.action_date.isoformat() if a.action_date else None,
                "action_text": a.action_text,
                "action_type": a.action_type,
            } for a in timeline],
        }
    finally:
        db.close()


# ── Dashboard Stats ──

@router.get("/dashboard/stats")
def get_dashboard_stats():
    """Aggregate stats for the dashboard hero section."""
    db = SessionLocal()
    try:
        total_people = db.query(func.count(TrackedMember.id)).filter(TrackedMember.is_active == 1).scalar() or 0
        total_claims = db.query(func.count(Claim.id)).scalar() or 0
        total_actions = db.query(func.count(Action.id)).scalar() or 0
        total_bills = db.query(func.count(Bill.bill_id)).scalar() or 0

        by_tier = dict(
            db.query(GoldLedgerEntry.tier, func.count(GoldLedgerEntry.id))
            .group_by(GoldLedgerEntry.tier).all()
        )
        total_scored = sum(by_tier.values())
        match_rate = round((total_scored / total_claims * 100), 1) if total_claims > 0 else 0.0

        return {
            "total_people": total_people, "total_claims": total_claims,
            "total_actions": total_actions, "total_bills": total_bills,
            "by_tier": by_tier, "match_rate": match_rate,
        }
    finally:
        db.close()
