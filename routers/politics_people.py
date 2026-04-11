"""
Politics sub-router — People directory, person profile, person activity,
person stats, performance, finance, representative lookup, trends, graph,
compare, industry donors, person committees.
"""

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy import func, desc, case
from typing import Optional, Dict, Any
from datetime import date
import time as _time
import json

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
    GoldLedgerEntry,
    TrackedMember,
    MemberBillGroundTruth,
    CompanyDonation,
    CongressionalTrade,
    PersonBill,
)
from models.committee_models import Committee, CommitteeMembership
from connectors.wikipedia import build_politician_profile
from connectors.fec import build_finance_profile
from models.response_schemas import PeopleListResponse, PersonDetailResponse
from utils.db_compat import extract_year
from utils.sanitize import escape_like

router = APIRouter(tags=["politics"])


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


def _ordinal(n: int) -> str:
    """Return ordinal suffix for an integer (1st, 2nd, 3rd, 4th, ...)."""
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


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


# ── Cached external lookups (TTL-based) ──

_profile_cache: dict = {}
_PROFILE_TTL = 3600  # 1 hour


def _cached_with_ttl(cache_key: str, fetch_fn):
    now = _time.time()
    if cache_key in _profile_cache:
        ts, val = _profile_cache[cache_key]
        if now - ts < _PROFILE_TTL:
            return val
    result = fetch_fn()
    _profile_cache[cache_key] = (now, result)
    return result


def _cached_wikipedia_profile(display_name: str, state: str = "", chamber: str = ""):
    key = f"wiki:{display_name}|{state}|{chamber}"
    def _fetch():
        try:
            return build_politician_profile(
                display_name,
                state=state or None,
                chamber=chamber or None,
            )
        except Exception:
            return None
    return _cached_with_ttl(key, _fetch)


def _cached_fec_profile(display_name: str):
    key = f"fec:{display_name}"
    def _fetch():
        try:
            return build_finance_profile(display_name)
        except Exception:
            return None
    return _cached_with_ttl(key, _fetch)


LEDGER_TIER_VALUES = ("strong", "moderate", "weak", "none")


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
                desc(GoldLedgerEntry.claim_date),
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
    """Single claim view from the Gold ledger, with matched action embedded."""
    db = SessionLocal()
    try:
        row = db.query(GoldLedgerEntry).filter(GoldLedgerEntry.claim_id == claim_id).one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail={"error": "ledger claim not found", "claim_id": claim_id})
        result = _serialize_gold_row(row)

        # Embed the matched action details if available
        if row.best_action_id:
            action = (
                db.query(Action, SourceDocument)
                .outerjoin(SourceDocument, SourceDocument.id == Action.source_id)
                .filter(Action.id == row.best_action_id)
                .first()
            )
            if action:
                a, src = action
                result["matched_action"] = {
                    "id": a.id,
                    "title": a.title,
                    "summary": a.summary,
                    "date": a.date.isoformat() if a.date else None,
                    "source_url": src.url if src else None,
                    "bill_congress": a.bill_congress,
                    "bill_type": a.bill_type,
                    "bill_number": a.bill_number,
                    "policy_area": a.policy_area,
                    "latest_action_text": a.latest_action_text,
                }
            else:
                result["matched_action"] = None
        else:
            result["matched_action"] = None

        # Also include the member display_name for the header back link
        member = db.query(TrackedMember).filter(TrackedMember.person_id == row.person_id).first()
        result["display_name"] = member.display_name if member else row.person_id

        return result
    finally:
        db.close()


# ── People Directory ──

@router.get("/people", response_model=PeopleListResponse)
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
            query = query.filter(TrackedMember.party.like(f"{escape_like(party)}%", escape="\\"))
        if chamber:
            query = query.filter(func.lower(TrackedMember.chamber) == chamber.lower())
        if q:
            like = f"%{escape_like(q.strip().lower())}%"
            query = query.filter(
                func.lower(TrackedMember.person_id).like(like, escape="\\")
                | func.lower(TrackedMember.display_name).like(like, escape="\\")
                | func.lower(TrackedMember.bioguide_id).like(like, escape="\\")
                | func.lower(TrackedMember.state).like(like, escape="\\")
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
                    "ai_profile_summary": r.ai_profile_summary,
                    "sanctions_status": r.sanctions_status,
                }
                for r in rows
            ],
            "limit": limit,
            "offset": offset,
        }
    finally:
        db.close()


@router.get("/people/{person_id}", response_model=PersonDetailResponse)
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
            "photo_url": row.photo_url,
            "ai_profile_summary": row.ai_profile_summary,
            "sanctions_status": row.sanctions_status,
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
              .outerjoin(SourceDocument, Action.source_id == SourceDocument.id)
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
                desc(Bill.latest_action_date),
                desc(MemberBillGroundTruth.id),
            )
            .offset(offset).limit(limit).all()
        )

        sponsored_q = (
            db.query(func.count(MemberBillGroundTruth.id))
            .outerjoin(Bill, MemberBillGroundTruth.bill_id == Bill.bill_id)
            .filter(
                MemberBillGroundTruth.bioguide_id == member.bioguide_id,
                MemberBillGroundTruth.role.in_(["sponsored", "sponsor"]),
            )
        )
        cosponsored_q = (
            db.query(func.count(MemberBillGroundTruth.id))
            .outerjoin(Bill, MemberBillGroundTruth.bill_id == Bill.bill_id)
            .filter(
                MemberBillGroundTruth.bioguide_id == member.bioguide_id,
                MemberBillGroundTruth.role.in_(["cosponsored", "cosponsor"]),
            )
        )
        if congress is not None:
            sponsored_q = sponsored_q.filter(Bill.congress == congress)
            cosponsored_q = cosponsored_q.filter(Bill.congress == congress)
        if policy_area is not None:
            sponsored_q = sponsored_q.filter(func.lower(Bill.policy_area) == func.lower(policy_area))
            cosponsored_q = cosponsored_q.filter(func.lower(Bill.policy_area) == func.lower(policy_area))
        sponsored_count = sponsored_q.scalar() or 0
        cosponsored_count = cosponsored_q.scalar() or 0

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
                "congress_url": f"https://www.congress.gov/bill/{_ordinal(bill.congress)}-congress/{_bill_type_label(bill.bill_type)}/{bill.bill_number}" if bill else None,
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
        actions_count = db.query(func.count(Action.id)).filter(Action.person_id == person_id).scalar() or 0
        last_action_date = None
        if actions_count > 0:
            last = db.query(Action.date).filter(Action.person_id == person_id, Action.date.isnot(None)).order_by(desc(Action.date)).limit(1).scalar()
            last_action_date = last.isoformat() if last else None
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
              .order_by(ClaimEvaluation.score.desc(), ClaimEvaluation.updated_at.desc())
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
                    "latest_action_date": act.latest_action_date.isoformat() if act.latest_action_date else None,
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


# ── Representative Lookup ──

# Zip prefix → state mapping (first 3 digits of zip code)
_ZIP_STATE: Dict[str, str] = {
    "006": "PR", "007": "PR", "008": "PR", "009": "PR",
    "010": "MA", "011": "MA", "012": "MA", "013": "MA", "014": "MA", "015": "MA", "016": "MA", "017": "MA", "018": "MA", "019": "MA", "020": "MA", "021": "MA", "022": "MA", "023": "MA", "024": "MA", "025": "MA", "026": "MA", "027": "MA",
    "028": "RI", "029": "RI",
    "030": "NH", "031": "NH", "032": "NH", "033": "NH", "034": "NH", "035": "NH", "036": "NH", "037": "NH", "038": "NH",
    "039": "ME", "040": "ME", "041": "ME", "042": "ME", "043": "ME", "044": "ME", "045": "ME", "046": "ME", "047": "ME", "048": "ME", "049": "ME",
    "050": "VT", "051": "VT", "052": "VT", "053": "VT", "054": "VT", "056": "VT", "057": "VT", "058": "VT", "059": "VT",
    "060": "CT", "061": "CT", "062": "CT", "063": "CT", "064": "CT", "065": "CT", "066": "CT", "067": "CT", "068": "CT", "069": "CT",
    "070": "NJ", "071": "NJ", "072": "NJ", "073": "NJ", "074": "NJ", "075": "NJ", "076": "NJ", "077": "NJ", "078": "NJ", "079": "NJ", "080": "NJ", "081": "NJ", "082": "NJ", "083": "NJ", "084": "NJ", "085": "NJ", "086": "NJ", "087": "NJ", "088": "NJ", "089": "NJ",
    "100": "NY", "101": "NY", "102": "NY", "103": "NY", "104": "NY", "105": "NY", "106": "NY", "107": "NY", "108": "NY", "109": "NY", "110": "NY", "111": "NY", "112": "NY", "113": "NY", "114": "NY", "115": "NY", "116": "NY", "117": "NY", "118": "NY", "119": "NY", "120": "NY", "121": "NY", "122": "NY", "123": "NY", "124": "NY", "125": "NY", "126": "NY", "127": "NY", "128": "NY", "129": "NY", "130": "NY", "131": "NY", "132": "NY", "133": "NY", "134": "NY", "135": "NY", "136": "NY", "137": "NY", "138": "NY", "139": "NY", "140": "NY", "141": "NY", "142": "NY", "143": "NY", "144": "NY", "145": "NY", "146": "NY", "147": "NY", "148": "NY", "149": "NY",
    "150": "PA", "151": "PA", "152": "PA", "153": "PA", "154": "PA", "155": "PA", "156": "PA", "157": "PA", "158": "PA", "159": "PA", "160": "PA", "161": "PA", "162": "PA", "163": "PA", "164": "PA", "165": "PA", "166": "PA", "167": "PA", "168": "PA", "169": "PA", "170": "PA", "171": "PA", "172": "PA", "173": "PA", "174": "PA", "175": "PA", "176": "PA", "177": "PA", "178": "PA", "179": "PA", "180": "PA", "181": "PA", "182": "PA", "183": "PA", "184": "PA", "185": "PA", "186": "PA", "187": "PA", "188": "PA", "189": "PA", "190": "PA", "191": "PA", "192": "PA", "193": "PA", "194": "PA", "195": "PA", "196": "PA",
    "197": "DE", "198": "DE", "199": "DE",
    "200": "DC", "201": "VA", "202": "DC", "203": "DC", "204": "VA", "205": "WV", "206": "MD", "207": "MD", "208": "MD", "209": "MD", "210": "MD", "211": "MD", "212": "MD", "214": "MD", "215": "MD", "216": "MD", "217": "MD", "218": "MD", "219": "MD",
    "220": "VA", "221": "VA", "222": "VA", "223": "VA", "224": "VA", "225": "VA", "226": "VA", "227": "VA", "228": "VA", "229": "VA", "230": "VA", "231": "VA", "232": "VA", "233": "VA", "234": "VA", "235": "VA", "236": "VA", "237": "VA", "238": "VA", "239": "VA", "240": "VA", "241": "VA", "242": "VA", "243": "VA", "244": "VA", "245": "VA", "246": "VA",
    "247": "WV", "248": "WV", "249": "WV", "250": "WV", "251": "WV", "252": "WV", "253": "WV", "254": "WV", "255": "WV", "256": "WV", "257": "WV", "258": "WV", "259": "WV", "260": "WV", "261": "WV", "262": "WV", "263": "WV", "264": "WV", "265": "WV", "266": "WV", "267": "WV", "268": "WV",
    "270": "NC", "271": "NC", "272": "NC", "273": "NC", "274": "NC", "275": "NC", "276": "NC", "277": "NC", "278": "NC", "279": "NC", "280": "NC", "281": "NC", "282": "NC", "283": "NC", "284": "NC", "285": "NC", "286": "NC", "287": "NC", "288": "NC", "289": "NC",
    "290": "SC", "291": "SC", "292": "SC", "293": "SC", "294": "SC", "295": "SC", "296": "SC", "297": "SC", "298": "SC", "299": "SC",
    "300": "GA", "301": "GA", "302": "GA", "303": "GA", "304": "GA", "305": "GA", "306": "GA", "307": "GA", "308": "GA", "309": "GA", "310": "GA", "311": "GA", "312": "GA", "313": "GA", "314": "GA", "315": "GA", "316": "GA", "317": "GA", "318": "GA", "319": "GA",
    "320": "FL", "321": "FL", "322": "FL", "323": "FL", "324": "FL", "325": "FL", "326": "FL", "327": "FL", "328": "FL", "329": "FL", "330": "FL", "331": "FL", "332": "FL", "333": "FL", "334": "FL", "335": "FL", "336": "FL", "337": "FL", "338": "FL", "339": "FL", "340": "FL", "341": "FL", "342": "FL", "344": "FL", "346": "FL", "347": "FL", "349": "FL",
    "350": "AL", "351": "AL", "352": "AL", "354": "AL", "355": "AL", "356": "AL", "357": "AL", "358": "AL", "359": "AL", "360": "AL", "361": "AL", "362": "AL", "363": "AL", "364": "AL", "365": "AL", "366": "AL", "367": "AL", "368": "AL", "369": "AL",
    "370": "TN", "371": "TN", "372": "TN", "373": "TN", "374": "TN", "375": "TN", "376": "TN", "377": "TN", "378": "TN", "379": "TN", "380": "TN", "381": "TN", "382": "TN", "383": "TN", "384": "TN", "385": "TN",
    "386": "MS", "387": "MS", "388": "MS", "389": "MS", "390": "MS", "391": "MS", "392": "MS", "393": "MS", "394": "MS", "395": "MS", "396": "MS", "397": "MS",
    "398": "GA",
    "400": "KY", "401": "KY", "402": "KY", "403": "KY", "404": "KY", "405": "KY", "406": "KY", "407": "KY", "408": "KY", "409": "KY", "410": "KY", "411": "KY", "412": "KY", "413": "KY", "414": "KY", "415": "KY", "416": "KY", "417": "KY", "418": "KY", "419": "KY", "420": "KY", "421": "KY", "422": "KY", "423": "KY", "424": "KY", "425": "KY", "426": "KY", "427": "KY",
    "430": "OH", "431": "OH", "432": "OH", "433": "OH", "434": "OH", "435": "OH", "436": "OH", "437": "OH", "438": "OH", "439": "OH", "440": "OH", "441": "OH", "442": "OH", "443": "OH", "444": "OH", "445": "OH", "446": "OH", "447": "OH", "448": "OH", "449": "OH", "450": "OH", "451": "OH", "452": "OH", "453": "OH", "454": "OH", "455": "OH", "456": "OH", "457": "OH", "458": "OH",
    "460": "IN", "461": "IN", "462": "IN", "463": "IN", "464": "IN", "465": "IN", "466": "IN", "467": "IN", "468": "IN", "469": "IN", "470": "IN", "471": "IN", "472": "IN", "473": "IN", "474": "IN", "475": "IN", "476": "IN", "477": "IN", "478": "IN", "479": "IN",
    "480": "MI", "481": "MI", "482": "MI", "483": "MI", "484": "MI", "485": "MI", "486": "MI", "487": "MI", "488": "MI", "489": "MI", "490": "MI", "491": "MI", "492": "MI", "493": "MI", "494": "MI", "495": "MI", "496": "MI", "497": "MI", "498": "MI", "499": "MI",
    "500": "IA", "501": "IA", "502": "IA", "503": "IA", "504": "IA", "505": "IA", "506": "IA", "507": "IA", "508": "IA", "509": "IA", "510": "IA", "511": "IA", "512": "IA", "513": "IA", "514": "IA", "515": "IA", "516": "IA", "520": "IA", "521": "IA", "522": "IA", "523": "IA", "524": "IA", "525": "IA", "526": "IA", "527": "IA", "528": "IA",
    "530": "WI", "531": "WI", "532": "WI", "534": "WI", "535": "WI", "537": "WI", "538": "WI", "539": "WI", "540": "WI", "541": "WI", "542": "WI", "543": "WI", "544": "WI", "545": "WI", "546": "WI", "547": "WI", "548": "WI", "549": "WI",
    "550": "MN", "551": "MN", "553": "MN", "554": "MN", "555": "MN", "556": "MN", "557": "MN", "558": "MN", "559": "MN", "560": "MN", "561": "MN", "562": "MN", "563": "MN", "564": "MN", "565": "MN", "566": "MN", "567": "MN",
    "570": "SD", "571": "SD", "572": "SD", "573": "SD", "574": "SD", "575": "SD", "576": "SD", "577": "SD",
    "580": "ND", "581": "ND", "582": "ND", "583": "ND", "584": "ND", "585": "ND", "586": "ND", "587": "ND", "588": "ND",
    "590": "MT", "591": "MT", "592": "MT", "593": "MT", "594": "MT", "595": "MT", "596": "MT", "597": "MT", "598": "MT", "599": "MT",
    "600": "IL", "601": "IL", "602": "IL", "603": "IL", "604": "IL", "605": "IL", "606": "IL", "607": "IL", "608": "IL", "609": "IL", "610": "IL", "611": "IL", "612": "IL", "613": "IL", "614": "IL", "615": "IL", "616": "IL", "617": "IL", "618": "IL", "619": "IL", "620": "IL", "621": "IL", "622": "IL", "623": "IL", "624": "IL", "625": "IL", "626": "IL", "627": "IL", "628": "IL", "629": "IL",
    "630": "MO", "631": "MO", "633": "MO", "634": "MO", "635": "MO", "636": "MO", "637": "MO", "638": "MO", "639": "MO", "640": "MO", "641": "MO", "644": "MO", "645": "MO", "646": "MO", "647": "MO", "648": "MO", "649": "MO", "650": "MO", "651": "MO", "652": "MO", "653": "MO", "654": "MO", "655": "MO", "656": "MO", "657": "MO", "658": "MO",
    "660": "KS", "661": "KS", "662": "KS", "664": "KS", "665": "KS", "666": "KS", "667": "KS", "668": "KS", "669": "KS", "670": "KS", "671": "KS", "672": "KS", "673": "KS", "674": "KS", "675": "KS", "676": "KS", "677": "KS", "678": "KS", "679": "KS",
    "680": "NE", "681": "NE", "683": "NE", "684": "NE", "685": "NE", "686": "NE", "687": "NE", "688": "NE", "689": "NE", "690": "NE", "691": "NE", "692": "NE", "693": "NE",
    "700": "LA", "701": "LA", "703": "LA", "704": "LA", "705": "LA", "706": "LA", "707": "LA", "708": "LA", "710": "LA", "711": "LA", "712": "LA", "713": "LA", "714": "LA",
    "716": "AR", "717": "AR", "718": "AR", "719": "AR", "720": "AR", "721": "AR", "722": "AR", "723": "AR", "724": "AR", "725": "AR", "726": "AR", "727": "AR", "728": "AR", "729": "AR",
    "730": "OK", "731": "OK", "733": "OK", "734": "OK", "735": "OK", "736": "OK", "737": "OK", "738": "OK", "739": "OK", "740": "OK", "741": "OK", "743": "OK", "744": "OK", "745": "OK", "746": "OK", "747": "OK", "748": "OK", "749": "OK",
    "750": "TX", "751": "TX", "752": "TX", "753": "TX", "754": "TX", "755": "TX", "756": "TX", "757": "TX", "758": "TX", "759": "TX", "760": "TX", "761": "TX", "762": "TX", "763": "TX", "764": "TX", "765": "TX", "766": "TX", "767": "TX", "768": "TX", "769": "TX", "770": "TX", "771": "TX", "772": "TX", "773": "TX", "774": "TX", "775": "TX", "776": "TX", "777": "TX", "778": "TX", "779": "TX", "780": "TX", "781": "TX", "782": "TX", "783": "TX", "784": "TX", "785": "TX", "786": "TX", "787": "TX", "788": "TX", "789": "TX", "790": "TX", "791": "TX", "792": "TX", "793": "TX", "794": "TX", "795": "TX", "796": "TX", "797": "TX", "798": "TX", "799": "TX",
    "800": "CO", "801": "CO", "802": "CO", "803": "CO", "804": "CO", "805": "CO", "806": "CO", "807": "CO", "808": "CO", "809": "CO", "810": "CO", "811": "CO", "812": "CO", "813": "CO", "814": "CO", "815": "CO", "816": "CO",
    "820": "WY", "821": "WY", "822": "WY", "823": "WY", "824": "WY", "825": "WY", "826": "WY", "827": "WY", "828": "WY", "829": "WY", "830": "WY", "831": "WY",
    "832": "ID", "833": "ID", "834": "ID", "835": "ID", "836": "ID", "837": "ID", "838": "ID",
    "840": "UT", "841": "UT", "842": "UT", "843": "UT", "844": "UT", "845": "UT", "846": "UT", "847": "UT",
    "850": "AZ", "851": "AZ", "852": "AZ", "853": "AZ", "855": "AZ", "856": "AZ", "857": "AZ", "859": "AZ", "860": "AZ", "863": "AZ", "864": "AZ", "865": "AZ",
    "870": "NM", "871": "NM", "872": "NM", "873": "NM", "874": "NM", "875": "NM", "877": "NM", "878": "NM", "879": "NM", "880": "NM", "881": "NM", "882": "NM", "883": "NM", "884": "NM",
    "889": "NV", "890": "NV", "891": "NV", "893": "NV", "894": "NV", "895": "NV", "897": "NV", "898": "NV",
    "900": "CA", "901": "CA", "902": "CA", "903": "CA", "904": "CA", "905": "CA", "906": "CA", "907": "CA", "908": "CA", "910": "CA", "911": "CA", "912": "CA", "913": "CA", "914": "CA", "915": "CA", "916": "CA", "917": "CA", "918": "CA", "919": "CA", "920": "CA", "921": "CA", "922": "CA", "923": "CA", "924": "CA", "925": "CA", "926": "CA", "927": "CA", "928": "CA", "930": "CA", "931": "CA", "932": "CA", "933": "CA", "934": "CA", "935": "CA", "936": "CA", "937": "CA", "938": "CA", "939": "CA", "940": "CA", "941": "CA", "942": "CA", "943": "CA", "944": "CA", "945": "CA", "946": "CA", "947": "CA", "948": "CA", "949": "CA", "950": "CA", "951": "CA", "952": "CA", "953": "CA", "954": "CA", "955": "CA", "956": "CA", "957": "CA", "958": "CA", "959": "CA", "960": "CA", "961": "CA",
    "962": "AP", "963": "AP", "964": "AP", "965": "AP", "966": "HI",
    "967": "HI", "968": "HI",
    "970": "OR", "971": "OR", "972": "OR", "973": "OR", "974": "OR", "975": "OR", "976": "OR", "977": "OR", "978": "OR", "979": "OR",
    "980": "WA", "981": "WA", "982": "WA", "983": "WA", "984": "WA", "985": "WA", "986": "WA", "988": "WA", "989": "WA", "990": "WA", "991": "WA", "992": "WA", "993": "WA", "994": "WA",
    "995": "AK", "996": "AK", "997": "AK", "998": "AK", "999": "AK",
    "000": "PR", "055": "MA", "213": "MD", "343": "FL", "345": "FL", "348": "FL", "353": "AL", "399": "GA", "517": "IA", "518": "IA", "519": "IA", "533": "WI", "536": "WI", "552": "MN", "632": "MO", "642": "MO", "643": "MO", "663": "KS", "715": "LA", "732": "OK", "817": "CO", "818": "CO", "819": "CO", "848": "UT", "849": "UT", "854": "AZ", "858": "AZ", "861": "AZ", "862": "AZ", "876": "NM", "885": "TX", "886": "TX", "887": "TX",
    "682": "NE", "702": "LA", "709": "LA", "742": "OK", "892": "NV", "896": "NV", "909": "CA", "929": "CA", "987": "WA",
}


def _zip_to_state(zip_code: str) -> Optional[str]:
    """Resolve a 5-digit zip code to a US state abbreviation."""
    prefix = zip_code[:3]
    return _ZIP_STATE.get(prefix)


@router.get("/representatives")
def representative_lookup(zip: str = Query(..., min_length=5, max_length=10)):
    """Look up congressional representatives by zip code.
    Returns all senators for the state + all house members for the state.
    """
    cleaned = "".join(c for c in zip if c.isdigit())[:5]
    if len(cleaned) < 5:
        raise HTTPException(status_code=400, detail="Invalid zip code")

    state = _zip_to_state(cleaned)
    if not state:
        raise HTTPException(status_code=404, detail=f"No state found for zip code {cleaned}")

    db = SessionLocal()
    try:
        members = (
            db.query(TrackedMember)
            .filter(TrackedMember.state == state, TrackedMember.is_active == 1)
            .order_by(TrackedMember.chamber, TrackedMember.display_name)
            .all()
        )
        return {
            "zip": cleaned,
            "state": state,
            "total": len(members),
            "representatives": [
                {
                    "person_id": m.person_id,
                    "display_name": m.display_name,
                    "party": m.party,
                    "chamber": m.chamber,
                    "state": m.state,
                    "district": None,
                    "photo_url": m.photo_url,
                    "is_active": bool(m.is_active),
                }
                for m in members
            ],
        }
    finally:
        db.close()


# ── Trend Data ──────────────────────────────────────────────────────────

@router.get("/people/{person_id}/trends")
def get_person_trends(person_id: str):
    """Yearly trend data for a politician: trades, votes, bills sponsored, donations received.

    NOTE: func.strftime is SQLite-specific. PostgreSQL equivalent: func.extract('year', col)
    or func.to_char(col, 'YYYY'). If migrating to PostgreSQL, update these queries.
    """
    import datetime
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="Person not found")

        current_year = datetime.date.today().year
        min_year = 2018

        # Trades by year (transaction_date)
        trade_rows = (
            db.query(
                extract_year(CongressionalTrade.transaction_date).label("yr"),
                func.count(CongressionalTrade.id),
            )
            .filter(CongressionalTrade.person_id == person_id)
            .filter(CongressionalTrade.transaction_date.isnot(None))
            .group_by("yr").all()
        )
        trades_by_year = {int(r[0]): r[1] for r in trade_rows if r[0]}

        # Votes by year (via MemberVote → Vote.vote_date)
        vote_rows = (
            db.query(
                extract_year(Vote.vote_date).label("yr"),
                func.count(MemberVote.id),
            )
            .join(Vote, Vote.id == MemberVote.vote_id)
            .filter(MemberVote.person_id == person_id)
            .filter(Vote.vote_date.isnot(None))
            .group_by("yr").all()
        )
        votes_by_year = {int(r[0]): r[1] for r in vote_rows if r[0]}

        # Bills sponsored by year (via PersonBill → Bill.introduced_date)
        bill_rows = (
            db.query(
                extract_year(Bill.introduced_date).label("yr"),
                func.count(PersonBill.id),
            )
            .join(Bill, Bill.bill_id == PersonBill.bill_id)
            .filter(PersonBill.person_id == person_id)
            .filter(Bill.introduced_date.isnot(None))
            .group_by("yr").all()
        )
        bills_by_year = {int(r[0]): r[1] for r in bill_rows if r[0]}

        # Donations received by year
        donation_rows = (
            db.query(
                extract_year(CompanyDonation.donation_date).label("yr"),
                func.count(CompanyDonation.id),
            )
            .filter(CompanyDonation.person_id == person_id)
            .filter(CompanyDonation.donation_date.isnot(None))
            .group_by("yr").all()
        )
        donations_by_year = {int(r[0]): r[1] for r in donation_rows if r[0]}

        # Build year range
        all_years_set = set(trades_by_year) | set(votes_by_year) | set(bills_by_year) | set(donations_by_year)
        all_years_set = {y for y in all_years_set if min_year <= y <= current_year}
        if not all_years_set:
            all_years_set = set(range(min_year, current_year + 1))
        years = sorted(all_years_set)

        return {
            "years": years,
            "series": {
                "trades": [trades_by_year.get(y, 0) for y in years],
                "votes": [votes_by_year.get(y, 0) for y in years],
                "bills_sponsored": [bills_by_year.get(y, 0) for y in years],
                "donations_received": [donations_by_year.get(y, 0) for y in years],
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

            # by_category: actions grouped by policy_area
            by_category = dict(
                db.query(Action.policy_area, func.count(Action.id))
                  .filter(Action.person_id == pid, Action.policy_area.isnot(None))
                  .group_by(Action.policy_area).all()
            )

            # by_timing: claims grouped by timing dimension
            by_timing = dict(
                db.query(ClaimEvaluation.timing, func.count(ClaimEvaluation.id))
                  .filter(ClaimEvaluation.person_id == pid, ClaimEvaluation.timing.isnot(None))
                  .group_by(ClaimEvaluation.timing).all()
            ) if hasattr(ClaimEvaluation, 'timing') else {}

            # by_progress: claims grouped by progress dimension
            by_progress = dict(
                db.query(ClaimEvaluation.progress, func.count(ClaimEvaluation.id))
                  .filter(ClaimEvaluation.person_id == pid, ClaimEvaluation.progress.isnot(None))
                  .group_by(ClaimEvaluation.progress).all()
            ) if hasattr(ClaimEvaluation, 'progress') else {}

            results.append({
                "person_id": pid,
                "display_name": member.display_name,
                "party": member.party,
                "chamber": member.chamber,
                "state": member.state,
                "total_claims": total_claims,
                "total_scored": total_scored,
                "by_tier": by_tier,
                "by_category": by_category,
                "by_timing": by_timing,
                "by_progress": by_progress,
                "total_actions": total_actions,
            })

        response = {"people": results}
        found_ids = {r["person_id"] for r in results}
        missing_ids = [pid for pid in person_ids if pid not in found_ids]
        if missing_ids:
            response["warnings"] = [f"Unknown person_id: {pid}" for pid in missing_ids]
        return response
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


# ── Cross-sector political connections ────────────────────────────────────


@router.get("/people/{person_id}/industry-donors")
def get_person_industry_donors(
    person_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    """Which companies across ALL sectors donate to this politician, grouped by sector."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter_by(person_id=person_id).first()
        if not member:
            raise HTTPException(status_code=404, detail={"error": "Person not found"})

        query = db.query(CompanyDonation).filter_by(person_id=person_id)
        total = query.count()
        total_amount = db.query(func.sum(CompanyDonation.amount)).filter_by(person_id=person_id).scalar() or 0

        donations = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()

        # Group by sector
        by_sector = {}
        sector_rows = db.query(
            CompanyDonation.entity_type, func.sum(CompanyDonation.amount), func.count(),
        ).filter_by(person_id=person_id).group_by(CompanyDonation.entity_type).all()
        for sector, amount, count in sector_rows:
            by_sector[sector] = {"total_amount": amount or 0, "donor_count": count}

        return {
            "person_id": person_id, "display_name": member.display_name,
            "total": total, "total_amount": total_amount, "limit": limit, "offset": offset,
            "by_sector": by_sector,
            "donations": [{
                "id": d.id, "entity_type": d.entity_type, "entity_id": d.entity_id,
                "committee_name": d.committee_name, "amount": d.amount, "cycle": d.cycle,
                "donation_date": str(d.donation_date) if d.donation_date else None,
                "source_url": d.source_url,
            } for d in donations],
        }
    finally:
        db.close()


@router.get("/people/{person_id}/committees")
def get_person_committees(person_id: str):
    """All committees a politician sits on, with their role on each."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter_by(person_id=person_id).first()
        if not member:
            raise HTTPException(status_code=404, detail={"error": "Person not found"})

        memberships = (
            db.query(CommitteeMembership)
            .filter(
                (CommitteeMembership.person_id == person_id) |
                (CommitteeMembership.bioguide_id == member.bioguide_id)
            )
            .all()
        )

        # Bulk-fetch committee details
        thomas_ids = list({m.committee_thomas_id for m in memberships})
        committees_map = {}
        if thomas_ids:
            comms = db.query(Committee).filter(Committee.thomas_id.in_(thomas_ids)).all()
            committees_map = {c.thomas_id: c for c in comms}

        results = []
        for m in memberships:
            c = committees_map.get(m.committee_thomas_id)
            if not c:
                continue
            results.append({
                "thomas_id": c.thomas_id,
                "name": c.name,
                "chamber": c.chamber,
                "committee_type": c.committee_type,
                "url": c.url,
                "parent_thomas_id": c.parent_thomas_id,
                "role": m.role,
                "rank": m.rank,
                "party": m.party,
            })

        # Sort: parent committees first, then subcommittees; chairs before members
        role_order = {"chair": 0, "vice_chair": 1, "ranking_member": 2, "ex_officio": 3, "member": 4}
        results.sort(key=lambda r: (
            0 if r["parent_thomas_id"] is None else 1,
            role_order.get(r["role"], 5),
            r["name"],
        ))

        return {
            "person_id": person_id,
            "display_name": member.display_name,
            "total": len(results),
            "committees": results,
        }
    finally:
        db.close()


@router.get("/people/{person_id}/full")
def get_person_full(person_id: str):
    """Combined endpoint: returns person, profile, stats, committees, activity,
    votes, trades, finance, donors, and trends in a single response.

    Eliminates 12 separate API calls from the frontend profile page.
    """
    import concurrent.futures
    import httpx

    base = "http://localhost:8006"
    results: Dict[str, Any] = {"person_id": person_id}

    paths = {
        "person": f"/people/{person_id}",
        "profile": f"/people/{person_id}/profile",
        "stats": f"/people/{person_id}/stats",
        "performance": f"/people/{person_id}/performance",
        "committees": f"/people/{person_id}/committees",
        "activity": f"/people/{person_id}/activity?limit=50",
        "votes": f"/people/{person_id}/votes?limit=50",
        "finance": f"/people/{person_id}/finance",
        "trends": f"/people/{person_id}/trends",
        "donors": f"/people/{person_id}/industry-donors?limit=100",
        "trades": f"/people/{person_id}/trades?limit=50",
        "graph": f"/graph/person/{person_id}?limit=20",
    }

    import logging
    _log = logging.getLogger("politics_people.full")

    def _fetch(key: str, path: str):
        try:
            r = httpx.get(f"{base}{path}", timeout=14.0)
            if r.status_code == 200:
                return key, r.json()
            _log.debug("full/%s returned %d", key, r.status_code)
        except Exception as e:
            _log.debug("full/%s failed: %s", key, e)
        return key, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_fetch, k, p) for k, p in paths.items()]
        for future in concurrent.futures.as_completed(futures, timeout=15):
            key, data = future.result()
            results[key] = data

    return results
