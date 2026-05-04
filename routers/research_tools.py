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

# /company-lookup proxies OpenCorporates which is a paid API; without a
# cache, a user typing "apple" + "appl" + "apple inc" hits OpenCorporates
# three times for very similar payloads. Cache by (query, jurisdiction)
# for 1 hour — corporate registry data rarely changes minute-to-minute.
_company_lookup_cache: dict = {}
_company_lookup_lock = threading.Lock()
_COMPANY_LOOKUP_TTL = 3600  # 1 hour

# Shared cache for slow upstream-API research tools. The audit found that
# /research/toxic-releases (EPA), /research/college-scorecard,
# /research/fcc-proceedings, /research/fcc-complaints, /research/earmarks,
# and /research/federal-grants all do live calls to government APIs with
# no caching layer, producing 1.5-3 second latencies and occasional
# upstream timeouts (EPA EnviroFacts in particular times out around 18s
# every few minutes).
#
# Successful responses are cached for 1 hour (these datasets update at
# best daily). Failed responses are cached for 60 seconds with a flag
# so we don't lock in failures forever, but we also don't re-hammer a
# misbehaving upstream every time a user reloads the page.
_upstream_cache: dict = {}
_upstream_lock = threading.Lock()
_UPSTREAM_TTL_SUCCESS = 3600   # 1 hour
_UPSTREAM_TTL_FAILURE = 60     # 1 minute (don't lock in transient failures)


def _upstream_cached(name: str, key: tuple, fetch_fn):
    """Run ``fetch_fn`` and cache the result keyed by (name, key).

    On exception, the failure is cached briefly so a misbehaving upstream
    doesn't kill our request rate. Caller decides what to do with the
    cached failure (typically: surface as an error response that the
    frontend can recover from with a retry button).

    Returns ``(value, is_failure)``. is_failure=True means the cached
    entry is an exception we should re-raise (we re-raise here and let
    the route's try/except surface a clean HTTP error).
    """
    cache_key = (name, key)
    now = _time.time()
    with _upstream_lock:
        cached = _upstream_cache.get(cache_key)
        if cached:
            ttl = _UPSTREAM_TTL_FAILURE if cached.get("failed") else _UPSTREAM_TTL_SUCCESS
            if (now - cached["ts"]) < ttl:
                if cached.get("failed"):
                    raise RuntimeError(cached["error"])
                return cached["data"]
    # Cache miss — fetch with the upstream call. Done outside the lock
    # so concurrent requests for different keys don't serialize.
    try:
        data = fetch_fn()
    except Exception as e:
        with _upstream_lock:
            _upstream_cache[cache_key] = {
                "ts": _time.time(),
                "failed": True,
                "error": str(e)[:500],
            }
        raise
    with _upstream_lock:
        _upstream_cache[cache_key] = {
            "ts": _time.time(),
            "failed": False,
            "data": data,
        }
    return data


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


# OpenFDA recall responses get an in-process TTL cache. The dataset
# updates daily at most; serving the same query within 30 min has zero
# correctness cost and drops a 3.9s upstream call to <1ms. Threading
# Lock so concurrent FastAPI workers don't race the dict.
_OPENFDA_CACHE: dict[tuple, tuple[float, dict]] = {}
_OPENFDA_CACHE_TTL = 1800  # 30 min
_OPENFDA_CACHE_LOCK = threading.Lock()


def _cached_openfda(product_type: str, search: str, limit: int) -> dict:
    key = (product_type, search, limit)
    now = _time.time()
    with _OPENFDA_CACHE_LOCK:
        cached = _OPENFDA_CACHE.get(key)
        if cached and now - cached[0] < _OPENFDA_CACHE_TTL:
            return cached[1]
    # Fetch outside the lock — a slow upstream shouldn't block other
    # cache reads. Two callers racing the same key would each do one
    # upstream fetch; both winners write the same value.
    result = search_enforcement(product_type=product_type, search=search, limit=limit)
    if "error" not in result:
        with _OPENFDA_CACHE_LOCK:
            _OPENFDA_CACHE[key] = (now, result)
    return result


@router.get("/drug-recalls")
def drug_recalls(
    search: str = Query("", description="Drug or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA drug enforcement (recall) endpoint.

    30-min in-process cache because OpenFDA is slow (3.9s on cold call
    in the 2026-05-03 probe) and the underlying recall feed updates
    weekly at best. Cache misses fall through to upstream; cache hits
    serve in <1ms.
    """
    result = _cached_openfda("drug", search, limit)
    if "error" in result:
        raise HTTPException(502, "OpenFDA drug request failed")
    return result


@router.get("/device-recalls")
def device_recalls(
    search: str = Query("", description="Device or company search term"),
    limit: int = Query(25, ge=1, le=100),
):
    """Proxy to OpenFDA device enforcement (recall) endpoint."""
    result = _cached_openfda("device", search, limit)
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
    # Bumped from 100 → 250 so users searching a broad state (CA, TX,
    # NY) actually see the magnitude of the data. EPA's API caps each
    # request around 10K rows and the wire-time scales linearly so
    # 250 is still <2s round-trip.
    limit: int = Query(50, ge=1, le=250),
):
    """Proxy to EPA EnviroFacts TRI facility data.

    EPA EnviroFacts is unstable — sometimes returns 200 in 800ms,
    sometimes 5xx after 18 seconds. We cache successful responses for
    1 hour (the underlying TRI dataset updates yearly, not minutely)
    and cache failures for 1 minute so we don't lock in transient
    upstream errors but we also don't re-hammer EPA every page load
    when it's already failing. Returns 503 instead of 502 on cached
    failures so the frontend can render a "try again" CTA without
    treating it as an unrecoverable bad gateway.
    """
    cache_key = (state or "", chemical or "", year, facility_name or "", limit)

    def _fetch():
        result = search_tri_releases(
            state=state, chemical=chemical, year=year,
            facility_name=facility_name, limit=limit,
        )
        if "error" in result:
            raise RuntimeError(result["error"])
        return result

    try:
        return _upstream_cached("toxic-releases", cache_key, _fetch)
    except Exception as e:
        # 503 (Service Unavailable) is more accurate than 502 — the
        # upstream is reachable, just unstable. Frontend can map 503
        # to a "retry in a moment" message.
        raise HTTPException(503, f"EPA EnviroFacts is currently unavailable: {e}")


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
    query: str = Query(
        "",
        max_length=200,
        description=(
            "Search term (lobbying issue, industry term, etc.). Empty "
            "returns the most-active bills of the current Congress so the "
            "page renders something useful before the user types."
        ),
    ),
    congress: int = Query(119, description="Congress number"),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    # Empty-query default: show recent bills with NO lobbying cross-reference.
    # This replaces the previous min_length=3 behavior that 422'd on empty.
    if not query.strip():
        try:
            bill_result = search_bills(query="", congress=congress, limit=limit)
        except (ValueError, Exception):
            bill_result = {"bills": [], "total_bills": 0}
        return {
            "total_bills": bill_result.get("total_bills", 0),
            "bills": bill_result.get("bills", []),
            "related_lobbying": {"total_filings": 0, "top_companies": [], "sectors": {}},
        }
    if len(query.strip()) < 3:
        # Single + double-character queries against 10 unindexed LIKE-search
        # tables would return millions of rows; keep the lower bound.
        raise HTTPException(
            422,
            {"error": "query too short", "hint": "Enter 3 or more characters."},
        )
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
    query: str = Query(
        "",
        max_length=200,
        description=(
            "Company name to search. Empty returns an empty result set "
            "rather than 422 so the tool page renders cleanly before the "
            "user types."
        ),
    ),
    jurisdiction: Optional[str] = Query(None, description="Jurisdiction code, e.g. us_ny, gb"),
):
    """Search OpenCorporates for company registration, officers, and ownership data.

    OpenCorporates is paid per-call; cache by (query, jurisdiction) for 1h
    to avoid amplifying user typing into many billable hits. Empty queries
    short-circuit to an empty result set so we never spend a paid call on
    an unintentional fetch.
    """
    if not query.strip():
        return {"total": 0, "companies": []}
    if len(query.strip()) < 2:
        raise HTTPException(
            422,
            {"error": "query too short", "hint": "Enter 2 or more characters."},
        )
    from connectors.opencorporates import search_companies  # noqa: F401

    cache_key = (query.strip().lower(), jurisdiction or "")
    now = _time.time()
    with _company_lookup_lock:
        cached = _company_lookup_cache.get(cache_key)
        if cached and (now - cached["ts"]) < _COMPANY_LOOKUP_TTL:
            return cached["data"]

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

    response = {"total": len(results), "companies": results}
    with _company_lookup_lock:
        _company_lookup_cache[cache_key] = {"ts": _time.time(), "data": response}
    return response


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
    name: str = Query(
        "",
        max_length=200,
        description=(
            "Donor name to search. Empty returns an empty result set "
            "rather than 422 so the tool page renders cleanly before the "
            "user types."
        ),
    ),
    state: Optional[str] = Query(None, description="2-letter state code"),
):
    """Search state-level donor records via FollowTheMoney."""
    if not name.strip():
        return {"total": 0, "donors": []}
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

    cache_key = (state or "", keyword or "", member or "", fiscal_year, limit)

    def _fetch():
        if member and member.strip():
            return fetch_member_earmarks(member.strip(), limit=limit)
        return search_earmarks(
            state=state, keyword=keyword, year=fiscal_year, limit=limit,
        )

    try:
        awards = _upstream_cached("earmarks", cache_key, _fetch)
    except Exception as e:
        # Earmarks search is journalist-relevant (HIGH for the reporter's beat)
        # so cache failures briefly but return them as 503 so the UI can
        # offer a retry rather than treating it as terminal.
        raise HTTPException(503, f"USASpending earmarks search failed: {e}")

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
    except ImportError:
        logger.warning("connectors.fcc_complaints not available")
        return {"total": 0, "complaints": []}

    cache_key = (issue_type or "", issue or "", method or "", state or "", limit)

    def _fetch():
        return search_complaints(
            issue_type=issue_type, issue=issue, method=method,
            state=state, limit=limit,
        )

    try:
        results = _upstream_cached("fcc-complaints", cache_key, _fetch)
    except Exception as exc:
        # FCC consumer-complaint API is slow (2s) and unstable; on
        # failure return empty rather than 5xx so the page renders.
        logger.warning("FCC complaints search error: %s", exc)
        return {"total": 0, "complaints": []}

    return {"total": len(results), "complaints": results}


# ── FCC License Search (Telecom) ─────────────────────────────────────────────


@router.get("/fcc-licenses")
def fcc_licenses(
    query: str = Query(
        "",
        max_length=200,
        description=(
            "License search term. Empty returns an empty result set "
            "rather than 422 so the tool page renders before the user types."
        ),
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """Search FCC license database for broadcast, wireless, and spectrum licenses."""
    if not query.strip():
        return {"total": 0, "licenses": []}
    try:
        from connectors.fcc_license import search_licenses
    except ImportError:
        logger.warning("connectors.fcc_license not available")
        return {"total": 0, "licenses": []}

    cache_key = (query.strip().lower(), limit)

    def _fetch():
        return search_licenses(query=query, limit=limit)

    try:
        results = _upstream_cached("fcc-licenses", cache_key, _fetch)
    except Exception as exc:
        logger.warning("FCC license search error: %s", exc)
        return {"total": 0, "licenses": []}

    return {"total": len(results), "licenses": results}


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
    except ImportError:
        logger.warning("connectors.college_scorecard not available")
        return {"total": 0, "schools": []}

    cache_key = (name or "", state or "", bool(for_profit), limit)

    def _fetch():
        if for_profit:
            return cs.get_for_profit_schools(state=state, limit=limit)
        return cs.search_schools(name=name, state=state, limit=limit)

    try:
        results = _upstream_cached("college-scorecard", cache_key, _fetch)
    except Exception as exc:
        logger.warning("College Scorecard search error: %s", exc)
        return {"total": 0, "schools": []}

    return {"total": len(results), "schools": results}


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
    except ImportError:
        logger.warning("connectors.grants_gov not available")
        return {"total": 0, "grants": []}

    cache_key = (keyword or "", agency or "", limit)

    def _fetch():
        return search_grants(keyword=keyword, agency=agency, limit=limit)

    try:
        results = _upstream_cached("federal-grants", cache_key, _fetch)
    except Exception as exc:
        logger.warning("Federal grants search error: %s", exc)
        return {"total": 0, "grants": []}

    return {"total": len(results), "grants": results}


# ── Treasury Fiscal Data (Budget/Tax) ────────────────────────────────────────


@router.get("/treasury-data")
def treasury_data(
    dataset: str = Query(
        "debt",
        description="Dataset type: debt, revenue, or spending. Defaults to 'debt' so the page renders before the user picks.",
        regex="^(debt|revenue|spending)$",
    ),
    year: Optional[int] = Query(None, description="Filter by fiscal year"),
):
    """Fetch Treasury fiscal data (national debt, federal revenue, or spending).

    Response shape is `{dataset, total, rows, as_of}` to match the research
    site's TreasuryResponse TS interface. Pre-2026-05-03 the endpoint
    returned `{dataset, data}` — the FE then crashed in
    TreasuryDataPage.tsx with `Cannot read properties of undefined
    (reading 'toLocaleString')` on `data.total` because that key didn't
    exist. Symptom was a totally blank page on /treasury.
    """
    try:
        from connectors import treasury_fiscal
    except ImportError:
        logger.warning("connectors.treasury_fiscal not available")
        return {"dataset": dataset, "total": 0, "rows": [], "as_of": None}

    cache_key = (dataset, year)

    def _fetch():
        if dataset == "debt":
            return treasury_fiscal.get_debt_to_penny()
        if dataset == "revenue":
            return treasury_fiscal.get_revenue_by_source(year=year)
        if dataset == "spending":
            return treasury_fiscal.get_monthly_treasury_statement(year=year)
        return []

    try:
        raw = _upstream_cached("treasury-data", cache_key, _fetch) or []
    except Exception as exc:
        logger.warning("Treasury fiscal data error: %s", exc)
        return {"dataset": dataset, "total": 0, "rows": [], "as_of": None}

    # The Treasury Fiscal Service returns raw record-level fields that
    # vary per dataset. The FE TreasuryRow shape expects a uniform
    # {period, label, amount, category, change_pct}. Map per-dataset.
    def _to_float(v):
        try:
            return float(v) if v not in (None, "", "null") else None
        except (TypeError, ValueError):
            return None

    rows: list[dict] = []
    if dataset == "debt":
        for r in raw:
            rows.append({
                "period": r.get("record_date"),
                "label": "Total Public Debt Outstanding",
                "amount": _to_float(r.get("tot_pub_debt_out_amt")),
                "category": None,
                "change_pct": None,  # computed below
            })
    elif dataset == "revenue":
        # Treasury Fiscal Service revenue endpoint returns
        # current_month_net_rcpt_amt (net of refunds). Pre-2026-05-04
        # this code looked for `current_month_rcpt_outly_amt` which
        # doesn't exist on this dataset → all amounts came back null
        # and the FE rendered em-dashes for every row. Caught in the
        # 2026-05-04 walkthrough (R-TR-4).
        for r in raw:
            rows.append({
                "period": r.get("record_date") or r.get("record_calendar_year"),
                "label": r.get("classification_desc"),
                "amount": _to_float(
                    r.get("current_month_net_rcpt_amt")
                    or r.get("current_fytd_net_rcpt_amt")
                ),
                "category": r.get("classification_desc"),
                "change_pct": None,
            })
    elif dataset == "spending":
        for r in raw:
            rows.append({
                "period": r.get("record_date"),
                "label": r.get("classification_desc"),
                "amount": _to_float(
                    r.get("current_month_net_outly_amt")
                    or r.get("current_fytd_net_outly_amt")
                ),
                "category": r.get("classification_desc"),
                "change_pct": None,
            })
    else:
        rows = []

    # Sort newest-first and compute period-over-period change_pct
    rows.sort(key=lambda r: r.get("period") or "", reverse=True)
    for i in range(len(rows) - 1):
        cur = rows[i]["amount"]
        prev = rows[i + 1]["amount"]
        if cur is not None and prev not in (None, 0):
            rows[i]["change_pct"] = (cur - prev) / prev

    as_of = rows[0].get("period") if rows else None

    return {
        "dataset": dataset,
        "total": len(rows),
        "rows": rows,
        "as_of": as_of,
    }


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
    except ImportError:
        logger.warning("connectors.fcc_ecfs not available")
        return {"total": 0, "filings": []}

    cache_key = (proceeding or "", filer or "", limit)

    def _fetch():
        return search_filings(proceeding=proceeding, filer=filer, limit=limit)

    try:
        results = _upstream_cached("fcc-proceedings", cache_key, _fetch)
    except Exception as exc:
        logger.warning("FCC proceedings search error: %s", exc)
        return {"total": 0, "filings": []}

    return {"total": len(results), "filings": results}
