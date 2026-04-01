"""
Research Tools — lightweight proxy router for external public APIs.

Proxies FDA, USDA, and EPA data so the research site doesn't need
to handle CORS or expose third-party endpoints to the browser.
"""

import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Query, HTTPException

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
    email = os.environ.get("USAJOBS_EMAIL", "research@wethepeopleforus.com")
    api_key = os.environ.get("USAJOBS_API_KEY", "")

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
