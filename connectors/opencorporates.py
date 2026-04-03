"""
OpenCorporates Connector

Search global corporate registrations, company details, and officers
via the OpenCorporates API.

API docs: https://api.opencorporates.com/documentation/API-Reference
Rate limit: 50 requests/day (free tier), higher with API key
Auth: Optional API key via OPENCORPORATES_API_KEY env var
"""

import os
import time
import requests
from typing import Optional, List, Dict, Any

from connectors._base import with_circuit_breaker
from utils.logging import get_logger

logger = get_logger(__name__)

OC_BASE = "https://api.opencorporates.com/v0.4"
API_KEY = os.getenv("OPENCORPORATES_API_KEY")

POLITE_DELAY = 0.5  # 50/day free tier


def _build_params(**kwargs) -> Dict[str, Any]:
    """Build query params, injecting API key if available."""
    params = {k: v for k, v in kwargs.items() if v is not None}
    if API_KEY:
        params["api_token"] = API_KEY
    return params


@with_circuit_breaker("opencorporates", failure_threshold=3, recovery_timeout=120.0)
def search_companies(query: str, jurisdiction_code: str = None) -> List[Dict[str, Any]]:
    """
    Search companies by name across global corporate registries.

    Args:
        query: Company name or search term
        jurisdiction_code: ISO jurisdiction code (e.g. 'us_de', 'gb')

    Returns:
        List of company dicts with keys: name, company_number, jurisdiction_code,
        incorporation_date, company_type, registry_url, opencorporates_url
    """
    time.sleep(POLITE_DELAY)
    params = _build_params(q=query, jurisdiction_code=jurisdiction_code)

    try:
        resp = requests.get(
            f"{OC_BASE}/companies/search",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("OpenCorporates company search failed for '%s': %s", query, e)
        return []

    results = []
    for item in (data.get("results") or {}).get("companies") or []:
        c = item.get("company") or {}
        results.append({
            "name": c.get("name"),
            "company_number": c.get("company_number"),
            "jurisdiction_code": c.get("jurisdiction_code"),
            "incorporation_date": c.get("incorporation_date"),
            "company_type": c.get("company_type"),
            "registry_url": c.get("registry_url"),
            "opencorporates_url": c.get("opencorporates_url"),
        })

    logger.info("OpenCorporates company search '%s': %d results", query, len(results))
    return results


@with_circuit_breaker("opencorporates", failure_threshold=3, recovery_timeout=120.0)
def get_company(jurisdiction_code: str, company_number: str) -> Optional[Dict[str, Any]]:
    """
    Get detailed company information by jurisdiction and company number.

    Args:
        jurisdiction_code: ISO jurisdiction code (e.g. 'us_de', 'gb')
        company_number: Company registration number

    Returns:
        Company dict with full details, or None on failure
    """
    time.sleep(POLITE_DELAY)
    params = _build_params()

    try:
        resp = requests.get(
            f"{OC_BASE}/companies/{jurisdiction_code}/{company_number}",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(
            "OpenCorporates get_company failed for %s/%s: %s",
            jurisdiction_code, company_number, e,
        )
        return None

    company = (data.get("results") or {}).get("company")
    if company:
        logger.info(
            "OpenCorporates company: %s (%s/%s)",
            company.get("name"), jurisdiction_code, company_number,
        )
    return company


@with_circuit_breaker("opencorporates", failure_threshold=3, recovery_timeout=120.0)
def get_company_officers(jurisdiction_code: str, company_number: str) -> List[Dict[str, Any]]:
    """
    Get officers (directors, secretaries, etc.) for a specific company.

    Args:
        jurisdiction_code: ISO jurisdiction code (e.g. 'us_de', 'gb')
        company_number: Company registration number

    Returns:
        List of officer dicts with keys: name, position, start_date, end_date,
        occupation, nationality
    """
    time.sleep(POLITE_DELAY)
    params = _build_params()

    try:
        resp = requests.get(
            f"{OC_BASE}/companies/{jurisdiction_code}/{company_number}/officers",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(
            "OpenCorporates officers failed for %s/%s: %s",
            jurisdiction_code, company_number, e,
        )
        return []

    results = []
    for item in (data.get("results") or {}).get("officers") or []:
        o = item.get("officer") or {}
        results.append({
            "name": o.get("name"),
            "position": o.get("position"),
            "start_date": o.get("start_date"),
            "end_date": o.get("end_date"),
            "occupation": o.get("occupation"),
            "nationality": o.get("nationality"),
        })

    logger.info(
        "OpenCorporates officers %s/%s: %d officers",
        jurisdiction_code, company_number, len(results),
    )
    return results


@with_circuit_breaker("opencorporates", failure_threshold=3, recovery_timeout=120.0)
def search_officers(query: str) -> List[Dict[str, Any]]:
    """
    Search corporate officers by name across all jurisdictions.

    Args:
        query: Officer name to search for

    Returns:
        List of officer dicts with keys: name, position, company_name,
        company_number, jurisdiction_code, start_date, end_date
    """
    time.sleep(POLITE_DELAY)
    params = _build_params(q=query)

    try:
        resp = requests.get(
            f"{OC_BASE}/officers/search",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("OpenCorporates officer search failed for '%s': %s", query, e)
        return []

    results = []
    for item in (data.get("results") or {}).get("officers") or []:
        o = item.get("officer") or {}
        company = o.get("company") or {}
        results.append({
            "name": o.get("name"),
            "position": o.get("position"),
            "company_name": company.get("name"),
            "company_number": company.get("company_number"),
            "jurisdiction_code": company.get("jurisdiction_code"),
            "start_date": o.get("start_date"),
            "end_date": o.get("end_date"),
        })

    logger.info("OpenCorporates officer search '%s': %d results", query, len(results))
    return results
