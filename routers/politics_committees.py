"""
Politics sub-router — Committee endpoints (list, detail, members).
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func
from typing import Optional, Dict, Any

from models.database import (
    SessionLocal,
    TrackedMember,
)
from models.committee_models import Committee, CommitteeMembership
from models.response_schemas import CommitteesListResponse

router = APIRouter(tags=["politics"])


# ── Helpers ──

def _serialize_committee(c: Committee, member_count: int = 0) -> Dict[str, Any]:
    return {
        "id": c.id,
        "thomas_id": c.thomas_id,
        "name": c.name,
        "chamber": c.chamber,
        "committee_type": c.committee_type,
        "url": c.url,
        "phone": c.phone,
        "jurisdiction": c.jurisdiction,
        "parent_thomas_id": c.parent_thomas_id,
        "member_count": member_count,
    }


def _serialize_membership(m: CommitteeMembership, member_info: Optional[TrackedMember] = None) -> Dict[str, Any]:
    result = {
        "bioguide_id": m.bioguide_id,
        "person_id": m.person_id,
        "member_name": m.member_name,
        "role": m.role,
        "rank": m.rank,
        "party": m.party,
    }
    if member_info:
        result["display_name"] = member_info.display_name
        result["chamber"] = member_info.chamber
        result["state"] = member_info.state
        result["member_party"] = member_info.party
        result["photo_url"] = member_info.photo_url
    return result


# ── Committee Endpoints ──

@router.get("/committees", response_model=CommitteesListResponse)
def list_committees(
    chamber: Optional[str] = Query(None, description="Filter by chamber: house, senate, joint"),
    include_subcommittees: bool = Query(False, description="Include subcommittees in listing"),
):
    """List all congressional committees with member counts."""
    db = SessionLocal()
    try:
        q = db.query(Committee)

        if not include_subcommittees:
            q = q.filter(Committee.parent_thomas_id.is_(None))

        if chamber:
            q = q.filter(Committee.chamber == chamber.lower())

        committees = q.order_by(Committee.chamber, Committee.name).all()

        # Bulk-fetch member counts
        count_rows = (
            db.query(
                CommitteeMembership.committee_thomas_id,
                func.count(CommitteeMembership.id).label("cnt"),
            )
            .group_by(CommitteeMembership.committee_thomas_id)
            .all()
        )
        count_map = {row[0]: row[1] for row in count_rows}

        results = []
        for c in committees:
            member_count = count_map.get(c.thomas_id, 0)
            serialized = _serialize_committee(c, member_count)

            # Include subcommittees inline if this is a top-level committee
            if not include_subcommittees and c.parent_thomas_id is None:
                subs = (
                    db.query(Committee)
                    .filter(Committee.parent_thomas_id == c.thomas_id)
                    .order_by(Committee.name)
                    .all()
                )
                if subs:
                    serialized["subcommittees"] = [
                        _serialize_committee(s, count_map.get(s.thomas_id, 0))
                        for s in subs
                    ]
                else:
                    serialized["subcommittees"] = []

            results.append(serialized)

        return {
            "total": len(results),
            "committees": results,
        }
    finally:
        db.close()


@router.get("/committees/{committee_id}")
def get_committee_detail(committee_id: str):
    """Get committee detail with full member list."""
    db = SessionLocal()
    try:
        committee = db.query(Committee).filter(Committee.thomas_id == committee_id).first()
        if not committee:
            raise HTTPException(status_code=404, detail=f"Committee {committee_id} not found")

        # Get all memberships for this committee
        memberships = (
            db.query(CommitteeMembership)
            .filter(CommitteeMembership.committee_thomas_id == committee_id)
            .order_by(CommitteeMembership.party, CommitteeMembership.rank)
            .all()
        )

        # Bulk-fetch tracked member info for linked members
        linked_person_ids = [m.person_id for m in memberships if m.person_id]
        tracked_map = {}
        if linked_person_ids:
            tracked = db.query(TrackedMember).filter(TrackedMember.person_id.in_(linked_person_ids)).all()
            tracked_map = {t.person_id: t for t in tracked}

        # Get subcommittees
        subcommittees = (
            db.query(Committee)
            .filter(Committee.parent_thomas_id == committee_id)
            .order_by(Committee.name)
            .all()
        )
        sub_counts = {}
        if subcommittees:
            sub_ids = [s.thomas_id for s in subcommittees]
            sub_count_rows = (
                db.query(
                    CommitteeMembership.committee_thomas_id,
                    func.count(CommitteeMembership.id),
                )
                .filter(CommitteeMembership.committee_thomas_id.in_(sub_ids))
                .group_by(CommitteeMembership.committee_thomas_id)
                .all()
            )
            sub_counts = {row[0]: row[1] for row in sub_count_rows}

        result = _serialize_committee(committee, len(memberships))
        result["members"] = [
            _serialize_membership(m, tracked_map.get(m.person_id))
            for m in memberships
        ]
        result["subcommittees"] = [
            _serialize_committee(s, sub_counts.get(s.thomas_id, 0))
            for s in subcommittees
        ]

        return result
    finally:
        db.close()


@router.get("/committees/{committee_id}/members")
def get_committee_members(
    committee_id: str,
    role: Optional[str] = Query(None, description="Filter by role: chair, ranking_member, member, vice_chair, ex_officio"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """Paginated member list for a committee."""
    db = SessionLocal()
    try:
        # Verify committee exists
        committee = db.query(Committee).filter(Committee.thomas_id == committee_id).first()
        if not committee:
            raise HTTPException(status_code=404, detail=f"Committee {committee_id} not found")

        q = db.query(CommitteeMembership).filter(
            CommitteeMembership.committee_thomas_id == committee_id
        )

        if role:
            q = q.filter(CommitteeMembership.role == role.lower())

        total = q.count()
        memberships = (
            q.order_by(CommitteeMembership.party, CommitteeMembership.rank)
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Bulk-fetch tracked member info
        linked_person_ids = [m.person_id for m in memberships if m.person_id]
        tracked_map = {}
        if linked_person_ids:
            tracked = db.query(TrackedMember).filter(TrackedMember.person_id.in_(linked_person_ids)).all()
            tracked_map = {t.person_id: t for t in tracked}

        return {
            "committee_id": committee_id,
            "committee_name": committee.name,
            "total": total,
            "limit": limit,
            "offset": offset,
            "members": [
                _serialize_membership(m, tracked_map.get(m.person_id))
                for m in memberships
            ],
        }
    finally:
        db.close()
