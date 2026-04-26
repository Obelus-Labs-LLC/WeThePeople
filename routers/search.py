"""
Global search endpoint — searches across politicians, companies (all sectors).
"""

import logging

from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_

logger = logging.getLogger(__name__)

from models.database import get_db, TrackedMember
from models.finance_models import TrackedInstitution
from models.health_models import TrackedCompany
from models.tech_models import TrackedTechCompany
from models.energy_models import TrackedEnergyCompany
from models.transportation_models import TrackedTransportationCompany
from models.defense_models import TrackedDefenseCompany
from models.chemicals_models import TrackedChemicalCompany
from models.agriculture_models import TrackedAgricultureCompany
from models.education_models import TrackedEducationCompany
from models.telecom_models import TrackedTelecomCompany
from models.response_schemas import SearchResponse
from utils.sanitize import escape_like

import threading
import time as _time

router = APIRouter(prefix="/search", tags=["search"])

# Global search runs 23 ILIKE queries (politicians + 11 sector tables × 2
# columns). Cache by query for 60 seconds to absorb autocomplete spam and
# repeat-search noise.
_search_cache: dict = {}
_search_lock = threading.Lock()
_SEARCH_TTL = 60  # seconds


@router.get("", response_model=SearchResponse)
def global_search(
    q: str = Query(
        ...,
        # 2-char minimum: "%a%" against 23 unindexed tables effectively
        # returns most rows of the largest sector and was a trivial DoS
        # vector. 2 chars cuts the candidate set dramatically while still
        # supporting state-code and short-name searches.
        min_length=2,
        max_length=200,
    ),
    db: Session = Depends(get_db),
):
    """Search across politicians and companies in all sectors. Cached 60s."""
    logger.info("Global search: q=%r", q)
    cache_key = q.strip().lower()
    now = _time.time()
    with _search_lock:
        cached = _search_cache.get(cache_key)
        if cached and (now - cached["ts"]) < _SEARCH_TTL:
            return cached["data"]

    # Escape LIKE wildcards so user input like '%' or '_' doesn't match everything
    pattern = f"%{escape_like(q)}%"

    # Politicians — TrackedMember
    politicians_raw = (
        db.query(TrackedMember)
        .filter(
            or_(
                TrackedMember.display_name.ilike(pattern, escape="\\"),
                TrackedMember.state.ilike(pattern, escape="\\"),
                TrackedMember.bioguide_id.ilike(pattern, escape="\\"),
                TrackedMember.person_id.ilike(pattern, escape="\\"),
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
        .filter(or_(TrackedInstitution.display_name.ilike(pattern, escape="\\"), TrackedInstitution.ticker.ilike(pattern, escape="\\")))
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
        .filter(or_(TrackedCompany.display_name.ilike(pattern, escape="\\"), TrackedCompany.ticker.ilike(pattern, escape="\\")))
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
        .filter(or_(TrackedTechCompany.display_name.ilike(pattern, escape="\\"), TrackedTechCompany.ticker.ilike(pattern, escape="\\")))
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
        .filter(or_(TrackedEnergyCompany.display_name.ilike(pattern, escape="\\"), TrackedEnergyCompany.ticker.ilike(pattern, escape="\\")))
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
        .filter(or_(TrackedTransportationCompany.display_name.ilike(pattern, escape="\\"), TrackedTransportationCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "transportation",
        })

    # Defense
    for co in (
        db.query(TrackedDefenseCompany)
        .filter(or_(TrackedDefenseCompany.display_name.ilike(pattern, escape="\\"), TrackedDefenseCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "defense",
        })

    # Chemicals
    for co in (
        db.query(TrackedChemicalCompany)
        .filter(or_(TrackedChemicalCompany.display_name.ilike(pattern, escape="\\"), TrackedChemicalCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "chemicals",
        })

    # Agriculture
    for co in (
        db.query(TrackedAgricultureCompany)
        .filter(or_(TrackedAgricultureCompany.display_name.ilike(pattern, escape="\\"), TrackedAgricultureCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "agriculture",
        })

    # Education
    for co in (
        db.query(TrackedEducationCompany)
        .filter(or_(TrackedEducationCompany.display_name.ilike(pattern, escape="\\"), TrackedEducationCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "education",
        })

    # Telecom
    for co in (
        db.query(TrackedTelecomCompany)
        .filter(or_(TrackedTelecomCompany.display_name.ilike(pattern, escape="\\"), TrackedTelecomCompany.ticker.ilike(pattern, escape="\\")))
        .limit(5)
        .all()
    ):
        companies.append({
            "entity_id": co.company_id,
            "name": co.display_name,
            "ticker": co.ticker,
            "sector": "telecom",
        })

    # Sanitize query in response to prevent XSS if rendered as HTML
    import html as _html
    safe_q = _html.escape(q)

    response = {
        "politicians": politicians,
        "companies": companies,
        "query": safe_q,
    }
    with _search_lock:
        _search_cache[cache_key] = {"ts": _time.time(), "data": response}
    return response
