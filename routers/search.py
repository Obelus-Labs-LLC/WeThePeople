"""
Global search endpoint — searches across politicians, companies (all sectors).
"""

from fastapi import APIRouter, Query
from sqlalchemy import or_

from models.database import SessionLocal, TrackedMember
from models.finance_models import TrackedInstitution
from models.health_models import TrackedCompany
from models.tech_models import TrackedTechCompany
from models.energy_models import TrackedEnergyCompany
from models.transportation_models import TrackedTransportationCompany

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def global_search(q: str = Query(..., min_length=1, max_length=200)):
    """Search across politicians and companies in all sectors."""
    db = SessionLocal()
    try:
        pattern = f"%{q}%"

        # Politicians — TrackedMember
        politicians_raw = (
            db.query(TrackedMember)
            .filter(
                or_(
                    TrackedMember.display_name.ilike(pattern),
                    TrackedMember.state.ilike(pattern),
                    TrackedMember.bioguide_id.ilike(pattern),
                    TrackedMember.person_id.ilike(pattern),
                )
            )
            .limit(5)
            .all()
        )
        politicians = [
            {
                "person_id": m.person_id,
                "name": m.display_name,
                "state": m.state,
                "party": m.party,
                "chamber": m.chamber,
                "photo_url": m.photo_url,
            }
            for m in politicians_raw
        ]

        # Companies — merge all four sectors
        companies = []

        # Finance
        for inst in (
            db.query(TrackedInstitution)
            .filter(or_(TrackedInstitution.display_name.ilike(pattern), TrackedInstitution.ticker.ilike(pattern)))
            .limit(5)
            .all()
        ):
            companies.append({
                "entity_id": inst.institution_id,
                "name": inst.display_name,
                "ticker": inst.ticker,
                "sector": "finance",
            })

        # Health
        for co in (
            db.query(TrackedCompany)
            .filter(or_(TrackedCompany.display_name.ilike(pattern), TrackedCompany.ticker.ilike(pattern)))
            .limit(5)
            .all()
        ):
            companies.append({
                "entity_id": co.company_id,
                "name": co.display_name,
                "ticker": co.ticker,
                "sector": "health",
            })

        # Tech
        for co in (
            db.query(TrackedTechCompany)
            .filter(or_(TrackedTechCompany.display_name.ilike(pattern), TrackedTechCompany.ticker.ilike(pattern)))
            .limit(5)
            .all()
        ):
            companies.append({
                "entity_id": co.company_id,
                "name": co.display_name,
                "ticker": co.ticker,
                "sector": "tech",
            })

        # Energy
        for co in (
            db.query(TrackedEnergyCompany)
            .filter(or_(TrackedEnergyCompany.display_name.ilike(pattern), TrackedEnergyCompany.ticker.ilike(pattern)))
            .limit(5)
            .all()
        ):
            companies.append({
                "entity_id": co.company_id,
                "name": co.display_name,
                "ticker": co.ticker,
                "sector": "energy",
            })

        # Transportation
        for co in (
            db.query(TrackedTransportationCompany)
            .filter(or_(TrackedTransportationCompany.display_name.ilike(pattern), TrackedTransportationCompany.ticker.ilike(pattern)))
            .limit(5)
            .all()
        ):
            companies.append({
                "entity_id": co.company_id,
                "name": co.display_name,
                "ticker": co.ticker,
                "sector": "transportation",
            })

        return {
            "politicians": politicians,
            "companies": companies,
            "query": q,
        }
    finally:
        db.close()
