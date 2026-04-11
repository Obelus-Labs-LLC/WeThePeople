"""
FARA (Foreign Agents Registration Act) API routes.

Cross-sector influence layer — foreign lobbying data from efile.fara.gov.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, case
from typing import Optional

from models.database import get_db
from models.fara_models import FARARegistrant, FARAForeignPrincipal, FARAShortForm
from utils.sanitize import escape_like

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fara", tags=["fara"])


# ── GET /fara/registrants ──────────────────────────────────────────────

@router.get("/registrants")
def list_registrants(
    search: Optional[str] = Query(None, description="Search by registrant name"),
    country: Optional[str] = Query(None, description="Filter by country"),
    status: Optional[str] = Query(None, description="Filter by status (Active/Terminated)"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List FARA registrants with optional filtering."""
    q = db.query(FARARegistrant)

    if search:
        q = q.filter(FARARegistrant.registrant_name.ilike(f"%{escape_like(search)}%", escape="\\"))
    if country:
        q = q.filter(FARARegistrant.country.ilike(f"%{escape_like(country)}%", escape="\\"))
    if status:
        q = q.filter(FARARegistrant.status.ilike(f"%{escape_like(status)}%", escape="\\"))

    total = q.count()
    registrants = q.order_by(desc(FARARegistrant.registration_date)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "registrants": [
            {
                "id": r.id,
                "registration_number": r.registration_number,
                "registrant_name": r.registrant_name,
                "address": r.address,
                "city": r.city,
                "state": r.state,
                "country": r.country,
                "registration_date": r.registration_date,
                "termination_date": r.termination_date,
                "status": r.status,
            }
            for r in registrants
        ],
    }


# ── GET /fara/registrants/{registration_number} ───────────────────────

@router.get("/registrants/{registration_number}")
def get_registrant(registration_number: str, db: Session = Depends(get_db)):
    """Get a single registrant with their foreign principals and agents."""
    registrant = db.query(FARARegistrant).filter_by(
        registration_number=registration_number
    ).first()

    if not registrant:
        raise HTTPException(status_code=404, detail="Registrant not found")

    principals = db.query(FARAForeignPrincipal).filter_by(
        registration_number=registration_number
    ).order_by(desc(FARAForeignPrincipal.principal_registration_date)).all()

    agents = db.query(FARAShortForm).filter_by(
        registration_number=registration_number
    ).order_by(desc(FARAShortForm.short_form_date)).all()

    return {
        "registrant": {
            "id": registrant.id,
            "registration_number": registrant.registration_number,
            "registrant_name": registrant.registrant_name,
            "address": registrant.address,
            "city": registrant.city,
            "state": registrant.state,
            "country": registrant.country,
            "registration_date": registrant.registration_date,
            "termination_date": registrant.termination_date,
            "status": registrant.status,
        },
        "foreign_principals": [
            {
                "id": fp.id,
                "foreign_principal_name": fp.foreign_principal_name,
                "country": fp.country,
                "principal_registration_date": fp.principal_registration_date,
                "principal_termination_date": fp.principal_termination_date,
                "status": fp.status,
            }
            for fp in principals
        ],
        "agents": [
            {
                "id": a.id,
                "agent_name": a.agent_name,
                "agent_city": a.agent_city,
                "agent_state": a.agent_state,
                "short_form_date": a.short_form_date,
                "status": a.status,
            }
            for a in agents
        ],
    }


# ── GET /fara/foreign-principals ──────────────────────────────────────

@router.get("/foreign-principals")
def list_foreign_principals(
    search: Optional[str] = Query(None, description="Search by principal or registrant name"),
    country: Optional[str] = Query(None, description="Filter by country"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List foreign principals with optional filtering."""
    q = db.query(FARAForeignPrincipal)

    if search:
        q = q.filter(or_(
            FARAForeignPrincipal.foreign_principal_name.ilike(f"%{escape_like(search)}%", escape="\\"),
            FARAForeignPrincipal.registrant_name.ilike(f"%{escape_like(search)}%", escape="\\"),
        ))
    if country:
        q = q.filter(FARAForeignPrincipal.country.ilike(f"%{escape_like(country)}%", escape="\\"))
    if status:
        q = q.filter(FARAForeignPrincipal.status.ilike(f"%{escape_like(status)}%", escape="\\"))

    total = q.count()
    principals = q.order_by(desc(FARAForeignPrincipal.principal_registration_date)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "foreign_principals": [
            {
                "id": fp.id,
                "registration_number": fp.registration_number,
                "registrant_name": fp.registrant_name,
                "foreign_principal_name": fp.foreign_principal_name,
                "country": fp.country,
                "principal_registration_date": fp.principal_registration_date,
                "principal_termination_date": fp.principal_termination_date,
                "status": fp.status,
            }
            for fp in principals
        ],
    }


# ── GET /fara/countries ───────────────────────────────────────────────

@router.get("/countries")
def list_countries(db: Session = Depends(get_db)):
    """List all countries with registrant and principal counts."""
    # Get countries from foreign principals (more meaningful — these are the foreign entities)
    rows = (
        db.query(
            FARAForeignPrincipal.country,
            func.count(FARAForeignPrincipal.id).label("principal_count"),
        )
        .filter(FARAForeignPrincipal.country != "")
        .filter(FARAForeignPrincipal.country.isnot(None))
        .group_by(FARAForeignPrincipal.country)
        .order_by(desc(func.count(FARAForeignPrincipal.id)))
        .all()
    )

    return {
        "countries": [
            {"country": row.country, "principal_count": row.principal_count}
            for row in rows
        ],
    }


# ── GET /fara/stats ──────────────────────────────────────────────────

@router.get("/stats")
def fara_stats(db: Session = Depends(get_db)):
    """Summary statistics for FARA data."""
    total_registrants = db.query(func.count(FARARegistrant.id)).scalar() or 0
    active_registrants = (
        db.query(func.count(FARARegistrant.id))
        .filter(FARARegistrant.status.ilike("%active%"))
        .scalar() or 0
    )
    terminated_registrants = total_registrants - active_registrants

    total_principals = db.query(func.count(FARAForeignPrincipal.id)).scalar() or 0
    total_agents = db.query(func.count(FARAShortForm.id)).scalar() or 0

    # Top 10 countries by principal count
    top_countries = (
        db.query(
            FARAForeignPrincipal.country,
            func.count(FARAForeignPrincipal.id).label("count"),
        )
        .filter(FARAForeignPrincipal.country != "")
        .filter(FARAForeignPrincipal.country.isnot(None))
        .group_by(FARAForeignPrincipal.country)
        .order_by(desc(func.count(FARAForeignPrincipal.id)))
        .limit(10)
        .all()
    )

    return {
        "total_registrants": total_registrants,
        "active_registrants": active_registrants,
        "terminated_registrants": terminated_registrants,
        "total_foreign_principals": total_principals,
        "total_agents": total_agents,
        "top_countries": [
            {"country": row.country, "count": row.count}
            for row in top_countries
        ],
    }


# ── GET /fara/search ─────────────────────────────────────────────────

@router.get("/search")
def search_fara(
    q: str = Query(..., min_length=2, description="Search term"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Search across registrants and foreign principals by any term."""
    term = f"%{escape_like(q)}%"

    registrants = (
        db.query(FARARegistrant)
        .filter(or_(
            FARARegistrant.registrant_name.ilike(term, escape="\\"),
            FARARegistrant.registration_number.ilike(term, escape="\\"),
            FARARegistrant.country.ilike(term, escape="\\"),
        ))
        .limit(limit)
        .all()
    )

    principals = (
        db.query(FARAForeignPrincipal)
        .filter(or_(
            FARAForeignPrincipal.foreign_principal_name.ilike(term, escape="\\"),
            FARAForeignPrincipal.registrant_name.ilike(term, escape="\\"),
            FARAForeignPrincipal.country.ilike(term, escape="\\"),
        ))
        .limit(limit)
        .all()
    )

    return {
        "registrants": [
            {
                "id": r.id,
                "registration_number": r.registration_number,
                "registrant_name": r.registrant_name,
                "country": r.country,
                "status": r.status,
                "registration_date": r.registration_date,
            }
            for r in registrants
        ],
        "foreign_principals": [
            {
                "id": fp.id,
                "registration_number": fp.registration_number,
                "registrant_name": fp.registrant_name,
                "foreign_principal_name": fp.foreign_principal_name,
                "country": fp.country,
                "status": fp.status,
            }
            for fp in principals
        ],
    }
