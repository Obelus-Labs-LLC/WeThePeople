"""
Politics sub-router — Bill-related endpoints (bill list, bill detail, bill
timeline, enrichment stats).
"""

import json
import re
from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional, Dict, Any

from utils.sanitize import escape_like
from models.database import (
    SessionLocal,
    Bill,
    BillAction,
    TrackedMember,
    MemberBillGroundTruth,
)
from models.response_schemas import (
    BillsListResponse,
    BillDetailResponse,
    BillEnrichmentStats,
)

router = APIRouter(tags=["politics"])


# ── Helpers ──

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


# ── Bills ──

@router.get("/bills", response_model=BillsListResponse)
def list_bills(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filter by status bucket"),
    chamber: Optional[str] = Query(None, description="Filter by chamber: 'house' or 'senate'"),
    q: Optional[str] = Query(None, description="Search bill title"),
):
    """List bills with optional filters for status, chamber, and keyword search."""
    db = SessionLocal()
    try:
        base = db.query(Bill)

        # Status filter — match status_bucket
        if status:
            # Map friendly names to possible status_bucket values
            STATUS_MAP = {
                "introduced": ["introduced"],
                "in_committee": ["in_committee"],
                "passed_one": ["passed_one", "passed_house", "passed_senate"],
                "passed_both": ["passed_both"],
                "became_law": ["enacted", "became_law", "signed"],
                "vetoed": ["vetoed"],
            }
            allowed = STATUS_MAP.get(status.lower())
            if allowed:
                base = base.filter(Bill.status_bucket.in_(allowed))
            else:
                base = base.filter(func.lower(Bill.status_bucket) == status.lower())

        # Chamber filter — bill_type prefix
        if chamber:
            ch = chamber.lower()
            if ch == "house":
                base = base.filter(Bill.bill_type.in_(["hr", "hres", "hjres", "hconres"]))
            elif ch == "senate":
                base = base.filter(Bill.bill_type.in_(["s", "sres", "sjres", "sconres"]))

        # Keyword search on title
        if q:
            base = base.filter(Bill.title.ilike(f"%{escape_like(q)}%", escape="\\"))

        total = base.with_entities(func.count(Bill.bill_id)).scalar() or 0

        rows = (
            base.order_by(desc(Bill.latest_action_date))
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Collect bill_ids for sponsor lookup
        bill_ids = [b.bill_id for b in rows]
        sponsors_raw = (
            db.query(MemberBillGroundTruth, TrackedMember)
            .outerjoin(TrackedMember, TrackedMember.bioguide_id == MemberBillGroundTruth.bioguide_id)
            .filter(MemberBillGroundTruth.bill_id.in_(bill_ids))
            .all()
        ) if bill_ids else []

        # Group sponsors by bill_id
        sponsors_by_bill: Dict[str, list] = {}
        for gt, m in sponsors_raw:
            sponsors_by_bill.setdefault(gt.bill_id, []).append({
                "bioguide_id": gt.bioguide_id,
                "role": gt.role,
                "person_id": m.person_id if m else None,
                "display_name": m.display_name if m else gt.bioguide_id,
                "party": m.party if m else None,
                "state": m.state if m else None,
                "photo_url": m.photo_url if m else None,
            })

        bills_out = []
        for b in rows:
            bills_out.append({
                "bill_id": b.bill_id,
                "congress": b.congress,
                "bill_type": b.bill_type,
                "bill_number": b.bill_number,
                "title": b.title,
                "policy_area": b.policy_area,
                "status_bucket": b.status_bucket,
                "latest_action_text": b.latest_action_text,
                "latest_action_date": b.latest_action_date.isoformat() if b.latest_action_date else None,
                "introduced_date": b.introduced_date.isoformat() if b.introduced_date else None,
                "sponsors": sponsors_by_bill.get(b.bill_id, []),
            })

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "bills": bills_out,
        }
    finally:
        db.close()


@router.get("/bills/enrichment/stats", response_model=BillEnrichmentStats)
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


# Role string the ground-truth ingest writes ("sponsored", "cosponsored")
# vs the role string the frontend filters on ("sponsor", "cosponsor").
# Normalize at the API boundary so the DB stays canonical and the
# frontend contract stays stable.
_GT_ROLE_TO_API = {
    "sponsored": "sponsor",
    "cosponsored": "cosponsor",
    # Pass through anything already in API form so historic clients
    # don't double-translate.
    "sponsor": "sponsor",
    "cosponsor": "cosponsor",
}


def _normalize_role(raw: Optional[str]) -> str:
    if not raw:
        return "cosponsor"  # safe default for unknown entries
    return _GT_ROLE_TO_API.get(raw.strip().lower(), raw.strip().lower())


def _bill_summary_with_fallback(bill: Bill, db_session=None) -> Optional[str]:
    """Return the best available bill summary.

    Resolution order:
      1. CRS summary (`bill.summary_text`) when Congress.gov has
         published one.
      2. Cached AI-generated summary on metadata_json.ai_summary
         (Haiku-generated 2-3 sentence factual summary).
      3. On-demand AI summary, generated and cached in
         metadata_json.ai_summary. Requires db_session.
      4. Constitutional authority statement from metadata_json,
         labeled as a stand-in.
      5. None.

    Each fallback is clearly labeled in the returned text so readers
    know it isn't an official CRS summary.
    """
    if bill.summary_text and bill.summary_text.strip():
        return bill.summary_text

    # 2. Cached AI summary (free, fast).
    try:
        from services.bill_ai_summary import cached_ai_summary
        cached = cached_ai_summary(bill)
        if cached:
            return (
                "AI-generated summary (no CRS summary published yet):\n\n"
                + cached
            )
    except Exception as e:
        logger = __import__("logging").getLogger(__name__)
        logger.debug("bill_ai_summary cache read failed: %s", e)

    # 3. On-demand generation. Skipped when the API has no DB
    #    session handle (e.g. pure-cache reads from offline tools).
    if db_session is not None:
        try:
            from services.bill_ai_summary import generate_and_cache_summary
            generated = generate_and_cache_summary(bill, db_session)
            if generated:
                return (
                    "AI-generated summary (no CRS summary published yet):\n\n"
                    + generated
                )
        except Exception as e:
            logger = __import__("logging").getLogger(__name__)
            logger.debug("bill_ai_summary generation failed: %s", e)

    # 4. Constitutional authority statement.
    raw_meta = bill.metadata_json
    if not raw_meta:
        return None
    if isinstance(raw_meta, str):
        try:
            meta = json.loads(raw_meta)
        except (ValueError, TypeError):
            return None
    elif isinstance(raw_meta, dict):
        meta = raw_meta
    else:
        return None

    auth = meta.get("constitutionalAuthorityStatementText")
    if not isinstance(auth, str) or not auth.strip():
        return None
    # The constitutional authority statement is HTML-wrapped; strip the
    # <pre>/<a> tags so it renders as plain text in the frontend.
    cleaned = re.sub(r"<[^>]+>", "", auth).strip()
    if not cleaned:
        return None
    return (
        "No CRS summary has been published for this bill yet. "
        "The sponsor's stated constitutional authority is included below.\n\n"
        + cleaned
    )


def _sponsors_from_metadata(bill: Bill) -> list[dict]:
    """Pull sponsors out of metadata_json when ground-truth join is
    empty. Used as a fallback so brand-new bills (where the ground-
    truth ingest hasn't caught up) still show their sponsor.
    """
    raw_meta = bill.metadata_json
    if not raw_meta:
        return []
    if isinstance(raw_meta, str):
        try:
            meta = json.loads(raw_meta)
        except (ValueError, TypeError):
            return []
    elif isinstance(raw_meta, dict):
        meta = raw_meta
    else:
        return []

    sponsors = meta.get("sponsors") or []
    if not isinstance(sponsors, list):
        return []
    out = []
    for s in sponsors:
        if not isinstance(s, dict):
            continue
        bioguide = s.get("bioguideId") or s.get("bioguide_id")
        if not bioguide:
            continue
        out.append({
            "bioguide_id": bioguide,
            "role": "sponsor",
            "person_id": None,
            "display_name": s.get("fullName") or bioguide,
            "party": s.get("party"),
            "state": s.get("state"),
            "photo_url": None,
        })
    return out


@router.get("/bills/{bill_id}", response_model=BillDetailResponse)
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

        sponsors_rows = (
            db.query(MemberBillGroundTruth, TrackedMember)
            .outerjoin(TrackedMember, TrackedMember.bioguide_id == MemberBillGroundTruth.bioguide_id)
            .filter(MemberBillGroundTruth.bill_id == bill_id)
            .all()
        )

        sponsors_payload: list[dict] = [{
            "bioguide_id": gt.bioguide_id,
            # DB stores 'sponsored' / 'cosponsored'. Frontend filters on
            # 'sponsor' / 'cosponsor'. Normalize at the boundary.
            "role": _normalize_role(gt.role),
            "person_id": m.person_id if m else None,
            "display_name": m.display_name if m else gt.bioguide_id,
            "party": m.party if m else None,
            "state": m.state if m else None,
            "photo_url": m.photo_url if m else None,
        } for gt, m in sponsors_rows]

        # Fallback: if the ground-truth join produced nothing for this
        # bill, surface whatever sponsor we can pull from
        # metadata_json.sponsors. This covers the bring-up window
        # where the ground-truth ingest hasn't reached a brand-new bill.
        if not sponsors_payload:
            sponsors_payload = _sponsors_from_metadata(bill)

        return {
            "bill_id": bill.bill_id,
            "congress": bill.congress,
            "bill_type": bill.bill_type,
            "bill_number": bill.bill_number,
            "title": bill.title,
            "policy_area": bill.policy_area,
            "subjects_json": bill.subjects_json,
            "summary_text": _bill_summary_with_fallback(bill, db_session=db),
            "status_bucket": bill.status_bucket,
            "latest_action_text": bill.latest_action_text,
            "latest_action_date": bill.latest_action_date.isoformat() if bill.latest_action_date else None,
            "introduced_date": bill.introduced_date.isoformat() if bill.introduced_date else None,
            "congress_url": f"https://www.congress.gov/bill/{_ordinal(bill.congress)}-congress/{_bill_type_label(bill.bill_type)}/{bill.bill_number}",
            "timeline": [{
                "action_date": a.action_date.isoformat() if a.action_date else None,
                "action_text": a.action_text,
                "action_type": a.action_code,
            } for a in timeline],
            "sponsors": sponsors_payload,
        }
    finally:
        db.close()


@router.get("/bills/{bill_id}/timeline")  # response shape varies per bill
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
                "action_type": a.action_code,
            } for a in timeline],
        }
    finally:
        db.close()
