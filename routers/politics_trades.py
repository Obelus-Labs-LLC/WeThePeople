"""
Politics sub-router — Congressional trade endpoints (person trades, all trades).
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional

from models.database import (
    SessionLocal,
    TrackedMember,
    CongressionalTrade,
)
from models.response_schemas import TradesListResponse

router = APIRouter(tags=["politics"])


# ── Congressional Trades ──

@router.get("/people/{person_id}/trades", response_model=TradesListResponse)
def get_person_trades(
    person_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    transaction_type: Optional[str] = Query(None, description="purchase, sale, exchange"),
):
    """Congressional stock trades (STOCK Act disclosures) for a politician."""
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter_by(person_id=person_id).first()
        if not member:
            raise HTTPException(status_code=404, detail={"error": "Person not found"})

        query = db.query(CongressionalTrade).filter_by(person_id=person_id)
        if transaction_type:
            query = query.filter(CongressionalTrade.transaction_type == transaction_type)
        total = query.count()
        trades = query.order_by(desc(CongressionalTrade.transaction_date)).offset(offset).limit(limit).all()

        return {
            "person_id": person_id, "display_name": member.display_name,
            "total": total, "limit": limit, "offset": offset,
            "trades": [{
                "id": t.id, "ticker": t.ticker, "asset_name": t.asset_name,
                "transaction_type": t.transaction_type, "amount_range": t.amount_range,
                "disclosure_date": str(t.disclosure_date) if t.disclosure_date else None,
                "transaction_date": str(t.transaction_date) if t.transaction_date else None,
                "owner": t.owner, "source_url": t.source_url, "reporting_gap": t.reporting_gap,
            } for t in trades],
        }
    finally:
        db.close()


@router.get("/congressional-trades", response_model=TradesListResponse)
def get_all_congressional_trades(
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    transaction_type: Optional[str] = Query(None),
    ticker: Optional[str] = Query(None),
    person_id: Optional[str] = Query(None),
):
    """All Congressional stock trades, sortable/filterable."""
    db = SessionLocal()
    try:
        query = db.query(CongressionalTrade)
        if transaction_type:
            query = query.filter(CongressionalTrade.transaction_type == transaction_type)
        if ticker:
            query = query.filter(CongressionalTrade.ticker == ticker.upper())
        if person_id:
            query = query.filter(CongressionalTrade.person_id == person_id)

        total = query.count()
        trades = query.order_by(desc(CongressionalTrade.disclosure_date)).offset(offset).limit(limit).all()

        # Bulk-fetch member names
        person_ids = list({t.person_id for t in trades})
        members = {m.person_id: m.display_name for m in db.query(TrackedMember).filter(TrackedMember.person_id.in_(person_ids)).all()} if person_ids else {}

        return {
            "total": total, "limit": limit, "offset": offset,
            "trades": [{
                "id": t.id, "person_id": t.person_id,
                "member_name": members.get(t.person_id, t.person_id),
                "ticker": t.ticker, "asset_name": t.asset_name,
                "transaction_type": t.transaction_type, "amount_range": t.amount_range,
                "disclosure_date": str(t.disclosure_date) if t.disclosure_date else None,
                "transaction_date": str(t.transaction_date) if t.transaction_date else None,
                "owner": t.owner, "source_url": t.source_url, "reporting_gap": t.reporting_gap,
            } for t in trades],
        }
    finally:
        db.close()
