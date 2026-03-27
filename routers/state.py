"""
State-level legislative routes — State explorer, legislators, bills.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case
from typing import Optional

logger = logging.getLogger(__name__)

from models.database import get_db
from models.state_models import StateLegislator, StateBill

router = APIRouter(prefix="/states", tags=["states"])

# ── US State name mapping ──

STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "PR": "Puerto Rico", "VI": "Virgin Islands", "GU": "Guam",
    "AS": "American Samoa", "MP": "Northern Mariana Islands",
}


@router.get("")
def list_states(db: Session = Depends(get_db)):
    """List all states that have data, with legislator/bill counts."""
    # Legislator counts by state
    leg_rows = db.query(
        StateLegislator.state,
        func.count(StateLegislator.id),
    ).group_by(StateLegislator.state).all()
    leg_counts = {row[0]: row[1] for row in leg_rows}

    # Bill counts by state
    bill_rows = db.query(
        StateBill.state,
        func.count(StateBill.id),
    ).group_by(StateBill.state).all()
    bill_counts = {row[0]: row[1] for row in bill_rows}

    # Merge all states that have data
    all_codes = set(leg_counts.keys()) | set(bill_counts.keys())

    states = []
    for code in sorted(all_codes):
        states.append({
            "code": code,
            "name": STATE_NAMES.get(code, code),
            "legislators": leg_counts.get(code, 0),
            "bills": bill_counts.get(code, 0),
        })

    return {"states": states}


@router.get("/{code}")
def get_state_dashboard(code: str, db: Session = Depends(get_db)):
    """State dashboard data: legislator counts by party/chamber, recent bills, summary stats."""
    logger.info("State dashboard request: %s", code.upper())
    code = code.upper()
    state_name = STATE_NAMES.get(code)
    if not state_name:
        raise HTTPException(status_code=404, detail=f"Unknown state code: {code}")

    # Total legislators
    total_legislators = db.query(StateLegislator).filter_by(state=code).count()
    if total_legislators == 0:
        # No data synced yet
        return {
            "code": code,
            "name": state_name,
            "total_legislators": 0,
            "total_bills": 0,
            "by_party": {},
            "by_chamber": {},
            "party_by_chamber": {},
            "recent_bills": [],
        }

    total_bills = db.query(StateBill).filter_by(state=code).count()

    # By party
    party_rows = db.query(
        StateLegislator.party, func.count(),
    ).filter_by(state=code).group_by(StateLegislator.party).all()
    by_party = {row[0]: row[1] for row in party_rows if row[0]}

    # By chamber
    chamber_rows = db.query(
        StateLegislator.chamber, func.count(),
    ).filter_by(state=code).group_by(StateLegislator.chamber).all()
    by_chamber = {row[0]: row[1] for row in chamber_rows if row[0]}

    # Party breakdown by chamber
    party_chamber_rows = db.query(
        StateLegislator.chamber,
        StateLegislator.party,
        func.count(),
    ).filter_by(state=code).group_by(
        StateLegislator.chamber, StateLegislator.party,
    ).all()
    party_by_chamber = {}
    for chamber, party, count in party_chamber_rows:
        if not chamber:
            continue
        if chamber not in party_by_chamber:
            party_by_chamber[chamber] = {}
        party_by_chamber[chamber][party or "Other"] = count

    # Recent bills
    recent_bills_q = db.query(StateBill).filter_by(state=code).order_by(
        desc(StateBill.latest_action_date)
    ).limit(10).all()

    recent_bills = [{
        "bill_id": b.bill_id,
        "identifier": b.identifier,
        "title": b.title,
        "session": b.legislative_session,
        "latest_action": b.latest_action,
        "latest_action_date": str(b.latest_action_date) if b.latest_action_date else None,
        "sponsor_name": b.sponsor_name,
        "source_url": b.source_url,
    } for b in recent_bills_q]

    return {
        "code": code,
        "name": state_name,
        "total_legislators": total_legislators,
        "total_bills": total_bills,
        "by_party": by_party,
        "by_chamber": by_chamber,
        "party_by_chamber": party_by_chamber,
        "recent_bills": recent_bills,
    }


@router.get("/{code}/legislators")
def get_state_legislators(
    code: str,
    chamber: Optional[str] = Query(None, description="'upper' or 'lower'"),
    party: Optional[str] = Query(None, description="'D', 'R', 'I'"),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated legislator list with search/filter."""
    code = code.upper()
    query = db.query(StateLegislator).filter_by(state=code)

    if chamber:
        query = query.filter(StateLegislator.chamber == chamber.lower())
    if party:
        query = query.filter(StateLegislator.party == party.upper())
    if search:
        pattern = f"%{search}%"
        query = query.filter(StateLegislator.name.ilike(pattern))

    total = query.count()
    legislators = query.order_by(StateLegislator.name).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "legislators": [{
            "id": leg.id,
            "ocd_id": leg.ocd_id,
            "name": leg.name,
            "state": leg.state,
            "chamber": leg.chamber,
            "party": leg.party,
            "district": leg.district,
            "photo_url": leg.photo_url,
            "is_active": leg.is_active,
        } for leg in legislators],
    }


@router.get("/{code}/bills")
def get_state_bills(
    code: str,
    search: Optional[str] = Query(None),
    session: Optional[str] = Query(None, alias="session"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Paginated bill list with search."""
    code = code.upper()
    query = db.query(StateBill).filter_by(state=code)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (StateBill.title.ilike(pattern))
            | (StateBill.identifier.ilike(pattern))
            | (StateBill.sponsor_name.ilike(pattern))
        )
    if session:
        query = query.filter(StateBill.legislative_session == session)

    total = query.count()
    bills = query.order_by(desc(StateBill.latest_action_date)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "bills": [{
            "id": b.id,
            "bill_id": b.bill_id,
            "identifier": b.identifier,
            "title": b.title,
            "session": b.legislative_session,
            "subjects": b.subjects,
            "latest_action": b.latest_action,
            "latest_action_date": str(b.latest_action_date) if b.latest_action_date else None,
            "sponsor_name": b.sponsor_name,
            "source_url": b.source_url,
        } for b in bills],
    }
