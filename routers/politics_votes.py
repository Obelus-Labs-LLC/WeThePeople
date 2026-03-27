"""
Politics sub-router — Vote-related endpoints (vote ingest, vote list,
vote detail, member votes).
"""

from fastapi import APIRouter, Query, HTTPException, Request, Depends
from sqlalchemy import func, desc
from typing import Optional

from models.database import (
    SessionLocal,
    Vote,
    MemberVote,
    Bill,
    TrackedMember,
)
from services.auth import require_press_key

router = APIRouter(tags=["politics"])


# ── Votes ──

@router.post("/votes/ingest", dependencies=[Depends(require_press_key)])
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
                "session": v.vote_session, "roll_number": v.roll_number,
                "vote_date": v.vote_date.isoformat() if v.vote_date else None,
                "question": v.question, "result": v.result,
                "related_bill_congress": v.related_bill_congress,
                "related_bill_type": v.related_bill_type,
                "related_bill_number": v.related_bill_number,
                "yea_count": v.yea_count, "nay_count": v.nay_count,
                "not_voting_count": v.not_voting_count, "present_count": v.present_count,
                "ai_summary": v.ai_summary,
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

        member_votes = (
            db.query(MemberVote, TrackedMember)
            .outerjoin(TrackedMember, TrackedMember.bioguide_id == MemberVote.bioguide_id)
            .filter(MemberVote.vote_id == vote_id)
            .all()
        )

        return {
            "id": v.id, "congress": v.congress, "chamber": v.chamber,
            "session": v.vote_session, "roll_number": v.roll_number,
            "vote_date": v.vote_date.isoformat() if v.vote_date else None,
            "question": v.question, "result": v.result,
            "related_bill_congress": v.related_bill_congress,
            "related_bill_type": v.related_bill_type,
            "related_bill_number": v.related_bill_number,
            "yea_count": v.yea_count, "nay_count": v.nay_count,
            "not_voting_count": v.not_voting_count, "present_count": v.present_count,
            "source_url": v.source_url,
            "ai_summary": v.ai_summary,
            "member_votes": [{
                "bioguide_id": mv.bioguide_id,
                "member_name": mv.member_name,
                "position": mv.position,
                "party": mv.party,
                "state": mv.state,
                "person_id": m.person_id if m else None,
            } for mv, m in member_votes],
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

        # Look up bill titles/summaries for related bills
        bill_info: dict = {}
        bill_keys = set()
        for mv, v in rows:
            if v.related_bill_congress and v.related_bill_type and v.related_bill_number:
                bill_id = f"{v.related_bill_type.lower()}{v.related_bill_number}-{v.related_bill_congress}"
                bill_keys.add(bill_id)
        if bill_keys:
            bills = db.query(Bill).filter(Bill.bill_id.in_(bill_keys)).all()
            for b in bills:
                bill_info[b.bill_id] = {"title": b.title, "summary": b.summary_text}

        votes_out = []
        for mv, v in rows:
            bill_id = None
            bill_title = None
            bill_summary = None
            if v.related_bill_congress and v.related_bill_type and v.related_bill_number:
                bill_id = f"{v.related_bill_type.lower()}{v.related_bill_number}-{v.related_bill_congress}"
                info = bill_info.get(bill_id)
                if info:
                    bill_title = info["title"]
                    bill_summary = info["summary"]
            votes_out.append({
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
                "bill_title": bill_title,
                "bill_summary": bill_summary,
                "ai_summary": v.ai_summary,
            })

        return {
            "person_id": person_id,
            "display_name": member.display_name,
            "total": total,
            "position_summary": position_counts,
            "limit": limit,
            "offset": offset,
            "votes": votes_out,
        }
    finally:
        db.close()
