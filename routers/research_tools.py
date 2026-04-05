"""
Research Tools — lightweight proxy router for external public APIs.

Proxies FDA, USDA, EPA, and Congress.gov data so the research site
doesn't need to handle CORS or expose third-party endpoints to the browser.
"""

import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from models.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/research", tags=["research"])

_TIMEOUT = 15.0


# ── FDA Food Recalls (OpenFDA) ──────────────────────────────────────────────


@router.get("/food-recalls")
async def food_recalls(
    search: str = Query("", description="Product or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA food enforcement (recall) endpoint."""
    base = "https://api.fda.gov/food/enforcement.json"
    params: dict = {"limit": limit}
    if search.strip():
        # OpenFDA search: field:term, use + for AND. For broad search, just search one field.
        q = search.strip().replace('"', "")
        params["search"] = f'product_description:"{q}"'

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(base, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "recalls": []}
        logger.warning("OpenFDA error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(502, "OpenFDA request failed")
    except Exception as exc:
        logger.warning("OpenFDA request error: %s", exc)
        raise HTTPException(502, "OpenFDA request failed")

    results = data.get("results", [])
    total = data.get("meta", {}).get("results", {}).get("total", len(results))

    recalls = []
    for r in results:
        recalls.append({
            "recall_number": r.get("recall_number"),
            "classification": r.get("classification"),
            "status": r.get("status"),
            "product_description": r.get("product_description"),
            "reason_for_recall": r.get("reason_for_recall"),
            "recall_initiation_date": r.get("recall_initiation_date"),
            "recalling_firm": r.get("recalling_firm"),
            "city": r.get("city"),
            "state": r.get("state"),
            "distribution_pattern": r.get("distribution_pattern"),
        })

    return {"total": total, "recalls": recalls}


# ── USDA FSIS Recalls ───────────────────────────────────────────────────────


@router.get("/drug-recalls")
async def drug_recalls(
    search: str = Query("", description="Drug or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA drug enforcement (recall) endpoint."""
    base = "https://api.fda.gov/drug/enforcement.json"
    params: dict = {"limit": limit}
    if search.strip():
        q = search.strip().replace('"', "")
        params["search"] = f'product_description:"{q}"'

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(base, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "recalls": []}
        logger.warning("OpenFDA drug error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(502, "OpenFDA drug request failed")
    except Exception as exc:
        logger.warning("OpenFDA drug request error: %s", exc)
        raise HTTPException(502, "OpenFDA drug request failed")

    results = data.get("results", [])
    total = data.get("meta", {}).get("results", {}).get("total", len(results))

    recalls = []
    for r in results:
        recalls.append({
            "recall_number": r.get("recall_number"),
            "classification": r.get("classification"),
            "status": r.get("status"),
            "product_description": r.get("product_description"),
            "reason_for_recall": r.get("reason_for_recall"),
            "recall_initiation_date": r.get("recall_initiation_date"),
            "recalling_firm": r.get("recalling_firm"),
            "city": r.get("city"),
            "state": r.get("state"),
            "distribution_pattern": r.get("distribution_pattern"),
        })

    return {"total": total, "recalls": recalls}


@router.get("/device-recalls")
async def device_recalls(
    search: str = Query("", description="Device or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA device enforcement (recall) endpoint."""
    base = "https://api.fda.gov/device/enforcement.json"
    params: dict = {"limit": limit}
    if search.strip():
        q = search.strip().replace('"', "")
        params["search"] = f'product_description:"{q}"'

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(base, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "recalls": []}
        logger.warning("OpenFDA device error %s", exc.response.status_code)
        raise HTTPException(502, "OpenFDA device request failed")
    except Exception as exc:
        logger.warning("OpenFDA device request error: %s", exc)
        raise HTTPException(502, "OpenFDA device request failed")

    results = data.get("results", [])
    total = data.get("meta", {}).get("results", {}).get("total", len(results))

    recalls = []
    for r in results:
        recalls.append({
            "recall_number": r.get("recall_number"),
            "classification": r.get("classification"),
            "status": r.get("status"),
            "product_description": r.get("product_description"),
            "reason_for_recall": r.get("reason_for_recall"),
            "recall_initiation_date": r.get("recall_initiation_date"),
            "recalling_firm": r.get("recalling_firm"),
            "city": r.get("city"),
            "state": r.get("state"),
            "distribution_pattern": r.get("distribution_pattern"),
        })

    return {"total": total, "recalls": recalls}


# ── EPA Toxic Release Inventory (EnviroFacts) ───────────────────────────────


@router.get("/toxic-releases")
async def toxic_releases(
    state: Optional[str] = Query(None, description="2-letter state code"),
    chemical: Optional[str] = Query(None, description="Chemical name search"),
    year: Optional[int] = Query(None, description="Reporting year"),
    facility_name: Optional[str] = Query(None, description="Facility name search"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to EPA EnviroFacts TRI facility data."""
    # Build EnviroFacts REST URL segments
    # API: https://enviro.epa.gov/enviro/efservice/tri_facility/<filters>/JSON
    base = "https://enviro.epa.gov/enviro/efservice"
    segments = ["V_TRI_FORM_R_EZ"]

    if state:
        segments.append(f"FACILITY_STATE/{state.upper()}")
    if chemical:
        segments.append(f"CHEMICAL_NAME/CONTAINING/{chemical.strip().upper()}")
    if year:
        segments.append(f"REPORTING_YEAR/{year}")
    if facility_name:
        segments.append(f"FACILITY_NAME/CONTAINING/{facility_name.strip().upper()}")

    segments.append(f"rows/0:{limit}")
    segments.append("JSON")

    url = "/".join([base] + segments)

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "releases": []}
        logger.warning("EPA EnviroFacts error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(502, "EPA EnviroFacts request failed")
    except Exception as exc:
        logger.warning("EPA EnviroFacts request error: %s", exc)
        raise HTTPException(502, "EPA EnviroFacts request failed")

    if not isinstance(data, list):
        return {"total": 0, "releases": []}

    releases = []
    for row in data:
        # Try to parse total releases from on-site + off-site columns
        on_site = _safe_float(row.get("ON_SITE_RELEASE_TOTAL"))
        off_site = _safe_float(row.get("OFF_SITE_RELEASE_TOTAL"))
        total = (on_site or 0) + (off_site or 0)

        releases.append({
            "facility_name": row.get("FACILITY_NAME", ""),
            "city": row.get("FACILITY_CITY", ""),
            "state": row.get("FACILITY_STATE", ""),
            "chemical": row.get("CHEMICAL_NAME", ""),
            "total_releases": total,
            "industry": row.get("INDUSTRY_SECTOR", row.get("PRIMARY_SIC_CODE", "")),
            "latitude": _safe_float(row.get("FACILITY_LATITUDE")),
            "longitude": _safe_float(row.get("FACILITY_LONGITUDE")),
            "year": row.get("REPORTING_YEAR"),
        })

    # Sort by total_releases descending
    releases.sort(key=lambda r: r["total_releases"] or 0, reverse=True)

    return {"total": len(releases), "releases": releases}


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# ── USAJobs Federal Job Listings ───────────────────────────────────────────


@router.get("/fed-jobs")
async def fed_jobs(
    keyword: str = Query("", description="Job title or keyword"),
    agency: Optional[str] = Query(None, description="Agency subelement code"),
    min_salary: Optional[int] = Query(None, description="Minimum salary"),
    location: Optional[str] = Query(None, description="City or state"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to USAJobs Search API for federal job listings with salary data."""
    import os

    base = "https://data.usajobs.gov/api/Search"
    params: dict = {"ResultsPerPage": limit}

    if keyword.strip():
        params["Keyword"] = keyword.strip()
    if agency:
        params["Organization"] = agency
    if min_salary:
        params["RemunerationMinimumAmount"] = min_salary
    if location:
        params["LocationName"] = location.strip()

    # USAJobs requires User-Agent and Authorization-Key headers
    # Register free at https://developer.usajobs.gov/APIRequest/Index
    email = os.environ.get("USAJOBS_EMAIL", "research@wethepeopleforus.com")
    api_key = os.environ.get("USAJOBS_API_KEY", "")

    if not api_key:
        raise HTTPException(503, "USAJobs API key not configured. Register free at developer.usajobs.gov")

    headers = {
        "User-Agent": email,
        "Authorization-Key": api_key,
        "Host": "data.usajobs.gov",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(base, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "jobs": []}
        logger.warning("USAJobs error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(502, "USAJobs request failed")
    except Exception as exc:
        logger.warning("USAJobs request error: %s", exc)
        raise HTTPException(502, "USAJobs request failed")

    search_result = data.get("SearchResult", {})
    total = int(search_result.get("SearchResultCountAll", 0))
    items = search_result.get("SearchResultItems", [])

    jobs = []
    for item in items:
        matched = item.get("MatchedObjectDescriptor", {})
        pos_loc = matched.get("PositionLocation", [{}])
        loc_name = pos_loc[0].get("LocationName", "") if pos_loc else ""

        remun = matched.get("PositionRemuneration", [{}])
        salary_min = ""
        salary_max = ""
        if remun:
            salary_min = remun[0].get("MinimumRange", "")
            salary_max = remun[0].get("MaximumRange", "")

        schedule = matched.get("PositionSchedule", [{}])
        schedule_type = schedule[0].get("Name", "") if schedule else ""

        jobs.append({
            "position_title": matched.get("PositionTitle", ""),
            "organization_name": matched.get("OrganizationName", ""),
            "department_name": matched.get("DepartmentName", ""),
            "salary_min": salary_min,
            "salary_max": salary_max,
            "location": loc_name,
            "grade": matched.get("JobGrade", [{}])[0].get("Code", "") if matched.get("JobGrade") else "",
            "schedule_type": schedule_type,
            "start_date": matched.get("PublicationStartDate", ""),
            "end_date": matched.get("ApplicationCloseDate", ""),
            "url": matched.get("PositionURI", ""),
        })

    return {"total": total, "jobs": jobs}


# ── FEC Campaign Finance ──────────────────────────────────────────────────


@router.get("/campaign-finance")
async def campaign_finance(
    candidate: str = Query("", description="Candidate name search"),
    state: Optional[str] = Query(None, description="2-letter state code"),
    cycle: int = Query(2024, description="Election cycle year"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to FEC API for candidate campaign finance data."""
    import os

    api_key = os.environ.get("FEC_API_KEY", "DEMO_KEY")
    base = "https://api.open.fec.gov/v1/candidates/search/"
    params: dict = {
        "api_key": api_key,
        "per_page": limit,
        "sort": "-receipts",
        "cycle": cycle,
        "is_active_candidate": "true",
    }

    if candidate.strip():
        params["q"] = candidate.strip()
    if state:
        params["state"] = state.upper()

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(base, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            return {"total": 0, "candidates": []}
        logger.warning("FEC API error %s: %s", exc.response.status_code, exc.response.text[:200])
        raise HTTPException(502, "FEC API request failed")
    except Exception as exc:
        logger.warning("FEC API request error: %s", exc)
        raise HTTPException(502, "FEC API request failed")

    pagination = data.get("pagination", {})
    total = pagination.get("count", 0)
    results = data.get("results", [])

    candidates = []
    for c in results:
        candidates.append({
            "candidate_id": c.get("candidate_id", ""),
            "name": c.get("name", ""),
            "party": c.get("party_full", c.get("party", "")),
            "office": c.get("office_full", c.get("office", "")),
            "state": c.get("state", ""),
            "district": c.get("district", ""),
            "incumbent_challenge": c.get("incumbent_challenge_full", ""),
            "total_receipts": c.get("receipts", 0),
            "total_disbursements": c.get("disbursements", 0),
            "cash_on_hand": c.get("cash_on_hand_end_period", 0),
            "debt": c.get("debt_owed_by_committee", 0),
            "cycle": cycle,
            "fec_url": f"https://www.fec.gov/data/candidate/{c.get('candidate_id', '')}/" if c.get("candidate_id") else "",
        })

    return {"total": total, "candidates": candidates}


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
            f"WHERE LOWER(lobbying_issues) LIKE :term "
            f"OR LOWER(specific_issues) LIKE :term"
        )
    return " UNION ALL ".join(parts)


@router.get("/bill-text-search")
async def bill_text_search(
    query: str = Query(..., description="Search term (lobbying issue, industry term, etc.)"),
    congress: int = Query(119, description="Congress number"),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search congressional bills via Congress.gov API and cross-reference with
    lobbying filings from our database that mention the same terms."""

    congress_api_key = os.environ.get("CONGRESS_API_KEY", "")
    if not congress_api_key:
        raise HTTPException(503, "Congress.gov API key not configured")

    # ── 1. Query Congress.gov for matching bills ──

    bills_url = "https://api.congress.gov/v3/bill"
    params = {
        "query": query.strip(),
        "limit": limit,
        "api_key": congress_api_key,
        "format": "json",
    }
    if congress:
        params["congress"] = congress

    bills = []
    total_bills = 0

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(bills_url, params=params)
            resp.raise_for_status()
            data = resp.json()

        total_bills = data.get("pagination", {}).get("count", 0)

        for b in data.get("bills", []):
            bill_type = b.get("type", "").lower()
            bill_number = b.get("number", "")
            bill_congress = b.get("congress", congress)
            latest = b.get("latestAction", {})

            bills.append({
                "bill_id": f"{bill_type}{bill_number}-{bill_congress}",
                "title": b.get("title", ""),
                "policy_area": b.get("policyArea", {}).get("name", "") if isinstance(b.get("policyArea"), dict) else b.get("policyArea", ""),
                "latest_action": latest.get("text", "") if isinstance(latest, dict) else str(latest),
                "latest_action_date": latest.get("actionDate", "") if isinstance(latest, dict) else "",
                "sponsor": b.get("sponsor", {}).get("fullName", "") if isinstance(b.get("sponsor"), dict) else "",
                "url": b.get("url", f"https://www.congress.gov/bill/{bill_congress}th-congress/{bill_type}-bill/{bill_number}"),
            })
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            pass  # No bills found, continue to lobbying
        else:
            logger.warning("Congress.gov API error %s: %s", exc.response.status_code, exc.response.text[:200])
            raise HTTPException(502, "Congress.gov API request failed")
    except Exception as exc:
        logger.warning("Congress.gov API request error: %s", exc)
        raise HTTPException(502, "Congress.gov API request failed")

    # ── 2. Cross-reference with our lobbying database ──

    related_lobbying = {
        "total_filings": 0,
        "top_companies": [],
        "sectors": {},
    }

    try:
        search_term = f"%{query.strip().lower()}%"
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

    return {
        "total_bills": total_bills,
        "bills": bills,
        "related_lobbying": related_lobbying,
    }


# ── OpenCorporates (Company Ownership) ─────────────────────────────────────


@router.get("/company-lookup")
async def company_lookup(
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
async def state_campaign_finance(
    state: Optional[str] = Query(None, description="2-letter state code"),
    year: Optional[str] = Query(None, description="Election year"),
    office: Optional[str] = Query(None, description="Office filter"),
):
    """Search state-level campaign finance data via FollowTheMoney."""
    from connectors.followthemoney import search_candidates

    candidates = search_candidates(state=state, year=year, office=office)
    return {"total": len(candidates), "candidates": candidates[:50]}


@router.get("/state-donors")
async def state_donors(
    name: str = Query(..., min_length=1, description="Donor name to search"),
    state: Optional[str] = Query(None, description="2-letter state code"),
):
    """Search state-level donor records via FollowTheMoney."""
    from connectors.followthemoney import search_donors

    donors = search_donors(name=name, state=state)
    return {"total": len(donors), "donors": donors[:50]}


# ── EveryPolitician (World Legislators) ────────────────────────────────────


@router.get("/world-politicians")
async def world_politicians():
    """List all countries with available politician data from EveryPolitician."""
    from connectors.everypolitician import fetch_all_countries

    countries = fetch_all_countries()
    return {"total": len(countries), "countries": countries}


@router.get("/world-politicians/{country_code}")
async def world_politicians_by_country(country_code: str):
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
async def earmarks_search(
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
async def fcc_complaints(
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
async def fcc_licenses(
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
async def college_scorecard(
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
async def federal_grants(
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
async def treasury_data(
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
async def fcc_proceedings(
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
