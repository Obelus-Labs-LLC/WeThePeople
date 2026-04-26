"""
Research Tools — lightweight proxy router for external public APIs.

Proxies FDA, USDA, EPA, and Congress.gov data so the research site
doesn't need to handle CORS or expose third-party endpoints to the browser.

All external API calls go through the connector layer — never raw httpx/requests.
"""

import logging
import os
import threading
import time as _time
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from connectors.openfda import search_enforcement
from connectors.epa_envirofacts import search_tri_releases
from connectors.usajobs import search_jobs
from connectors.fec import search_candidates_research
from connectors.congress import search_bills
from models.database import get_db
from utils.sanitize import escape_like

# /bill-text-search runs a 10-table UNION ALL with `LIKE %x%` on
# lobbying_issues / specific_issues — no index, no LIMIT inside the
# per-table SELECT. Cache results for 5 minutes by (query, congress, limit)
# so repeat searches (very common when users explore the page) cost nothing.
_bill_search_cache: dict = {}
_bill_search_lock = threading.Lock()
_BILL_SEARCH_TTL = 300  # 5 minutes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["research"])


# ── FDA Food Recalls (OpenFDA) ──────────────────────────────────────────────


@router.get("/food-recalls")
def food_recalls(
    search: str = Query("", description="Product or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA food enforcement (recall) endpoint."""
    result = search_enforcement(product_type="food", search=search, limit=limit)
    if "error" in result:
        raise HTTPException(502, "OpenFDA request failed")
    return result


# ── OpenFDA Drug Recalls ───────────────────────────────────────────────────


@router.get("/drug-recalls")
def drug_recalls(
    search: str = Query("", description="Drug or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA drug enforcement (recall) endpoint."""
    result = search_enforcement(product_type="drug", search=search, limit=limit)
    if "error" in result:
        raise HTTPException(502, "OpenFDA drug request failed")
    return result


@router.get("/device-recalls")
def device_recalls(
    search: str = Query("", description="Device or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA device enforcement (recall) endpoint."""
    result = search_enforcement(product_type="device", search=search, limit=limit)
    if "error" in result:
        raise HTTPException(502, "OpenFDA device request failed")
    return result


# ── EPA Toxic Release Inventory (EnviroFacts) ───────────────────────────────


@router.get("/toxic-releases")
def toxic_releases(
    state: Optional[str] = Query(None, description="2-letter state code"),
    chemical: Optional[str] = Query(None, description="Chemical name search"),
    year: Optional[int] = Query(None, description="Reporting year"),
    facility_name: Optional[str] = Query(None, description="Facility name search"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to EPA EnviroFacts TRI facility data."""
    result = search_tri_releases(
        state=state,
        chemical=chemical,
        year=year,
        facility_name=facility_name,
        limit=limit,
    )
    if "error" in result:
        raise HTTPException(502, "EPA EnviroFacts request failed")
    return result


# ── USAJobs Federal Job Listings ───────────────────────────────────────────


@router.get("/fed-jobs")
def fed_jobs(
    keyword: str = Query("", description="Job title or keyword"),
    agency: Optional[str] = Query(None, description="Agency subelement code"),
    min_salary: Optional[int] = Query(None, description="Minimum salary"),
    location: Optional[str] = Query(None, description="City or state"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to USAJobs Search API for federal job listings with salary data."""
    try:
        result = search_jobs(
            keyword=keyword,
            agency=agency,
            min_salary=min_salary,
            location=location,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(503, str(exc))
    if "error" in result:
        raise HTTPException(502, "USAJobs request failed")
    return result


# ── FEC Campaign Finance ──────────────────────────────────────────────────


@router.get("/campaign-finance")
def campaign_finance(
    candidate: str = Query("", description="Candidate name search"),
    state: Optional[str] = Query(None, description="2-letter state code"),
    cycle: int = Query(None, description="Election cycle year (defaults to current cycle)"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to FEC API for candidate campaign finance data."""
    return search_candidates_research(
        candidate=candidate,
        state=state,
        cycle=cycle,
        limit=limit,
    )


# ── Congress.gov Bill Text Search + Lobbying Cross-Reference ────────────────


# All sector lobbying tables share the same column layout for the fields we need.
_LOBBYING_TABLES = [
    "lobbying_records",
    "finance_lobbying_records",
    "health_lobbying_records",
    "energy_lobbying_records",
    "defense_lobbying_records",
    "chemical_lobbying_records",
    "agriculture_lobbying_records",
    "transportation_lobbying_records",
    "telecom_lobbying_records",
    "education_lobbying_records",
]

# Map table name -> human-readable sector label
_TABLE_SECTOR_MAP = {
    "lobbying_records": "Technology",
    "finance_lobbying_records": "Finance",
    "health_lobbying_records": "Health",
    "energy_lobbying_records": "Energy",
    "defense_lobbying_records": "Defense",
    "chemical_lobbying_records": "Chemicals",
    "agriculture_lobbying_records": "Agriculture",
    "transportation_lobbying_records": "Transportation",
    "telecom_lobbying_records": "Telecom",
    "education_lobbying_records": "Education",
}


def _build_lobbying_union_query(search_term: str) -> str:
    """Build a UNION ALL query across all sector lobbying tables.

    Searches lobbying_issues and specific_issues columns for the given term.
    Returns registrant_name (the lobbying firm or company), income, and sector.
    """
    parts = []
    for table in _LOBBYING_TABLES:
        sector = _TABLE_SECTOR_MAP[table]
        parts.append(
            f"SELECT registrant_name, client_name, income, '{sector}' AS sector "
            f"FROM {table} "
            f"WHERE LOWER(lobbying_issues) LIKE :term ESCAPE '\\' "
            f"OR LOWER(specific_issues) LIKE :term ESCAPE '\\'"
        )
    return " UNION ALL ".join(parts)


@router.get("/bill-text-search")
def bill_text_search(
    query: str = Query(..., min_length=3, description="Search term (lobbying issue, industry term, etc.)"),
    congress: int = Query(119, description="Congress number"),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search congressional bills via Congress.gov API and cross-reference with
    lobbying filings from our database that mention the same terms.

    Cached for 5 minutes by (query, congress, limit). Single-character queries
    are rejected via min_length=3 — `%a%` against 10 unindexed tables would
    return millions of rows.
    """
    cache_key = (query.strip().lower(), congress, limit)
    now = _time.time()
    with _bill_search_lock:
        cached = _bill_search_cache.get(cache_key)
        if cached and (now - cached["ts"]) < _BILL_SEARCH_TTL:
            return cached["data"]

    # ── 1. Query Congress.gov for matching bills via connector ──

    try:
        bill_result = search_bills(query=query, congress=congress, limit=limit)
    except ValueError as exc:
        raise HTTPException(503, str(exc))

    bills = bill_result.get("bills", [])
    total_bills = bill_result.get("total_bills", 0)

    # ── 2. Cross-reference with our lobbying database ──

    related_lobbying = {
        "total_filings": 0,
        "top_companies": [],
        "sectors": {},
    }

    try:
        search_term = f"%{escape_like(query.strip().lower())}%"
        union_sql = _build_lobbying_union_query(query)

        rows = db.execute(
            text(union_sql),
            {"term": search_term},
        ).fetchall()

        if rows:
            related_lobbying["total_filings"] = len(rows)

            # Aggregate by company (use client_name, fall back to registrant_name)
            company_agg: dict = {}
            sector_agg: dict = {}

            for row in rows:
                registrant = row[0] or "Unknown"
                client = row[1] or registrant
                income = row[2] or 0
                sector = row[3]

                # Use client name as the company (that's who hired the lobbyist)
                company_key = client.strip().upper()
                if company_key not in company_agg:
                    company_agg[company_key] = {
                        "name": client.strip(),
                        "filings": 0,
                        "total_spend": 0.0,
                    }
                company_agg[company_key]["filings"] += 1
                company_agg[company_key]["total_spend"] += float(income) if income else 0

                # Sector counts
                sector_agg[sector] = sector_agg.get(sector, 0) + 1

            # Sort companies by filing count descending, take top 20
            sorted_companies = sorted(
                company_agg.values(),
                key=lambda c: (c["filings"], c["total_spend"]),
                reverse=True,
            )
            related_lobbying["top_companies"] = sorted_companies[:20]
            related_lobbying["sectors"] = sector_agg

    except Exception as exc:
        logger.warning("Lobbying cross-reference query failed: %s", exc)
        # Don't fail the whole request — bills data is still useful

    response = {
        "total_bills": total_bills,
        "bills": bills,
        "related_lobbying": related_lobbying,
    }
    with _bill_search_lock:
        _bill_search_cache[cache_key] = {"ts": _time.time(), "data": response}
    return response


# ── OpenCorporates (Company Ownership) ─────────────────────────────────────


@router.get("/company-lookup")
def company_lookup(
    query: str = Query(..., min_length=1, description="Company name to search"),
    jurisdiction: Optional[str] = Query(None, description="Jurisdiction code, e.g. us_ny, gb"),
):
    """Search OpenCorporates for company registration, officers, and ownership data."""
    from connectors.opencorporates import search_companies, get_company_officers

    companies = search_companies(query, jurisdiction_code=jurisdiction)
    results = []
    for c in companies[:10]:
        item = {
            "name": c.get("name", ""),
            "company_number": c.get("company_number", ""),
            "jurisdiction_code": c.get("jurisdiction_code", ""),
            "incorporation_date": c.get("incorporation_date"),
            "company_type": c.get("company_type"),
            "current_status": c.get("current_status"),
            "registered_address": c.get("registered_address_in_full"),
            "opencorporates_url": c.get("opencorporates_url"),
        }
        results.append(item)

    return {"total": len(results), "companies": results}


# ── Follow the Money (State Campaign Finance) ──────────────────────────────


@router.get("/state-campaign-finance")
def state_campaign_finance(
    state: Optional[str] = Query(None, description="2-letter state code"),
    year: Optional[str] = Query(None, description="Election year"),
    office: Optional[str] = Query(None, description="Office filter"),
):
    """Search state-level campaign finance data via FollowTheMoney."""
    from connectors.followthemoney import search_candidates

    candidates = search_candidates(state=state, year=year, office=office)
    return {"total": len(candidates), "candidates": candidates[:50]}


@router.get("/state-donors")
def state_donors(
    name: str = Query(..., min_length=1, description="Donor name to search"),
    state: Optional[str] = Query(None, description="2-letter state code"),
):
    """Search state-level donor records via FollowTheMoney."""
    from connectors.followthemoney import search_donors

    donors = search_donors(name=name, state=state)
    return {"total": len(donors), "donors": donors[:50]}


# ── EveryPolitician (World Legislators) ────────────────────────────────────


@router.get("/world-politicians")
def world_politicians():
    """List all countries with available politician data from EveryPolitician."""
    from connectors.everypolitician import fetch_all_countries

    countries = fetch_all_countries()
    return {"total": len(countries), "countries": countries}


@router.get("/world-politicians/{country_code}")
def world_politicians_by_country(country_code: str):
    """Get legislators for a specific country from EveryPolitician."""
    from connectors.everypolitician import fetch_countries_index, fetch_legislature_popolo

    countries = fetch_countries_index()
    target = None
    for c in countries:
        if c.get("code", "").lower() == country_code.lower():
            target = c
            break

    if not target:
        raise HTTPException(status_code=404, detail=f"Country '{country_code}' not found")

    legislatures = target.get("legislatures", [])
    result = {
        "country": target.get("name"),
        "code": target.get("code"),
        "legislatures": [],
    }

    for leg in legislatures[:3]:  # Limit to 3 legislatures per country
        popolo_url = leg.get("popolo_url")
        if not popolo_url:
            continue
        data = fetch_legislature_popolo(popolo_url)
        if not data:
            continue
        persons = data.get("persons", [])
        result["legislatures"].append({
            "name": leg.get("name"),
            "type": leg.get("type"),
            "total_persons": len(persons),
            "persons": [
                {
                    "name": p.get("name"),
                    "sort_name": p.get("sort_name"),
                    "gender": p.get("gender"),
                    "image": p.get("image"),
                    "id": p.get("id"),
                }
                for p in persons[:100]  # Limit to 100 per legislature
            ],
        })

    return result


# ── Earmarks (Congressionally Directed Spending) ─────────────────────────


@router.get("/earmarks")
def earmarks_search(
    state: Optional[str] = Query(None, description="2-letter state code"),
    keyword: Optional[str] = Query(None, description="Award description keyword"),
    member: Optional[str] = Query(None, description="Congress member name"),
    year: Optional[str] = Query(None, description="Fiscal year"),
    limit: int = Query(25, ge=1, le=100),
):
    """Search USASpending.gov for congressionally directed spending (earmarks).

    If a member name is provided, searches for awards referencing that member.
    Otherwise, searches grants/direct payments by state, keyword, and year.
    """
    from connectors.earmarks import search_earmarks, fetch_member_earmarks

    fiscal_year = None
    if year:
        try:
            fiscal_year = int(year)
        except ValueError:
            pass

    if member and member.strip():
        awards = fetch_member_earmarks(member.strip(), limit=limit)
    else:
        awards = search_earmarks(
            state=state,
            keyword=keyword,
            year=fiscal_year,
            limit=limit,
        )

    return {"total": len(awards), "awards": awards}


# ── FCC Consumer Complaints (Telecom) ────────────────────────────────────────


@router.get("/fcc-complaints")
def fcc_complaints(
    issue_type: Optional[str] = Query(None, description="Type filter (Phone, Internet, TV)"),
    issue: Optional[str] = Query(None, description="Issue category (Unwanted Calls, Billing, Service)"),
    method: Optional[str] = Query(None, description="Method (Wired, Wireless, Cable, Satellite)"),
    state: Optional[str] = Query(None, description="2-letter state code"),
    limit: int = Query(50, ge=1, le=200),
):
    """Search FCC consumer complaint data by issue type, issue, method, or state."""
    try:
        from connectors.fcc_complaints import search_complaints

        results = search_complaints(
            issue_type=issue_type,
            issue=issue,
            method=method,
            state=state,
            limit=limit,
        )
        return {"total": len(results), "complaints": results}
    except ImportError:
        logger.warning("connectors.fcc_complaints not available")
        return {"total": 0, "complaints": []}
    except Exception as exc:
        logger.warning("FCC complaints search error: %s", exc)
        return {"total": 0, "complaints": []}


# ── FCC License Search (Telecom) ─────────────────────────────────────────────


@router.get("/fcc-licenses")
def fcc_licenses(
    query: str = Query(..., min_length=1, description="License search term"),
    limit: int = Query(50, ge=1, le=200),
):
    """Search FCC license database for broadcast, wireless, and spectrum licenses."""
    try:
        from connectors.fcc_license import search_licenses

        results = search_licenses(query=query, limit=limit)
        return {"total": len(results), "licenses": results}
    except ImportError:
        logger.warning("connectors.fcc_license not available")
        return {"total": 0, "licenses": []}
    except Exception as exc:
        logger.warning("FCC license search error: %s", exc)
        return {"total": 0, "licenses": []}


# ── College Scorecard (Education) ────────────────────────────────────────────


@router.get("/college-scorecard")
def college_scorecard(
    name: Optional[str] = Query(None, description="School name search"),
    state: Optional[str] = Query(None, description="2-letter state code"),
    for_profit: Optional[bool] = Query(None, description="Filter for-profit institutions"),
    limit: int = Query(20, ge=1, le=100),
):
    """Search the College Scorecard for institution data including costs, outcomes, and demographics."""
    try:
        from connectors import college_scorecard as cs

        if for_profit:
            results = cs.get_for_profit_schools(state=state, limit=limit)
        else:
            results = cs.search_schools(name=name, state=state, limit=limit)
        return {"total": len(results), "schools": results}
    except ImportError:
        logger.warning("connectors.college_scorecard not available")
        return {"total": 0, "schools": []}
    except Exception as exc:
        logger.warning("College Scorecard search error: %s", exc)
        return {"total": 0, "schools": []}


# ── Federal Grant Opportunities (Budget) ─────────────────────────────────────


@router.get("/federal-grants")
def federal_grants(
    keyword: Optional[str] = Query(None, description="Grant keyword search"),
    agency: Optional[str] = Query(None, description="Funding agency filter"),
    limit: int = Query(25, ge=1, le=100),
):
    """Search Grants.gov for federal grant opportunities by keyword or agency."""
    try:
        from connectors.grants_gov import search_grants

        results = search_grants(
            keyword=keyword,
            agency=agency,
            limit=limit,
        )
        return {"total": len(results), "grants": results}
    except ImportError:
        logger.warning("connectors.grants_gov not available")
        return {"total": 0, "grants": []}
    except Exception as exc:
        logger.warning("Federal grants search error: %s", exc)
        return {"total": 0, "grants": []}


# ── Treasury Fiscal Data (Budget/Tax) ────────────────────────────────────────


@router.get("/treasury-data")
def treasury_data(
    dataset: str = Query(
        ...,
        description="Dataset type: debt, revenue, or spending",
        regex="^(debt|revenue|spending)$",
    ),
    year: Optional[int] = Query(None, description="Filter by fiscal year"),
):
    """Fetch Treasury fiscal data (national debt, federal revenue, or spending)."""
    try:
        from connectors import treasury_fiscal

        if dataset == "debt":
            data = treasury_fiscal.get_debt_to_penny()
        elif dataset == "revenue":
            data = treasury_fiscal.get_revenue_by_source(year=year)
        elif dataset == "spending":
            data = treasury_fiscal.get_monthly_treasury_statement(year=year)
        else:
            data = []

        return {"dataset": dataset, "data": data}
    except ImportError:
        logger.warning("connectors.treasury_fiscal not available")
        return {"dataset": dataset, "data": []}
    except Exception as exc:
        logger.warning("Treasury fiscal data error: %s", exc)
        return {"dataset": dataset, "data": []}


# ── FCC ECFS Proceedings (Telecom Regulatory) ────────────────────────────────


@router.get("/fcc-proceedings")
def fcc_proceedings(
    proceeding: Optional[str] = Query(None, description="Proceeding/docket number"),
    filer: Optional[str] = Query(None, description="Filer name search"),
    limit: int = Query(25, ge=1, le=100),
):
    """Search FCC Electronic Comment Filing System (ECFS) for regulatory proceedings and filings."""
    try:
        from connectors.fcc_ecfs import search_filings

        results = search_filings(
            proceeding=proceeding,
            filer=filer,
            limit=limit,
        )
        return {"total": len(results), "filings": results}
    except ImportError:
        logger.warning("connectors.fcc_ecfs not available")
        return {"total": 0, "filings": []}
    except Exception as exc:
        logger.warning("FCC proceedings search error: %s", exc)
        return {"total": 0, "filings": []}
