"""
Politics sub-router — Bill-related endpoints (bill list, bill detail, bill
timeline, enrichment stats).
"""

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

@router.get("/bills")
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
            "congress_url": f"https://www.congress.gov/bill/{_ordinal(bill.congress)}-congress/{_bill_type_label(bill.bill_type)}/{bill.bill_number}",
            "timeline": [{
                "action_date": a.action_date.isoformat() if a.action_date else None,
                "action_text": a.action_text,
                "action_type": a.action_code,
            } for a in timeline],
            "sponsors": [{
                "bioguide_id": gt.bioguide_id,
                "role": gt.role,
                "person_id": m.person_id if m else None,
                "display_name": m.display_name if m else gt.bioguide_id,
                "party": m.party if m else None,
                "state": m.state if m else None,
                "photo_url": m.photo_url if m else None,
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
                "action_type": a.action_code,
            } for a in timeline],
        }
    finally:
        db.close()
