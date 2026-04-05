"""
Grants.gov Connector — Federal Grant Opportunities

Search and retrieve federal grant opportunity listings from Grants.gov.
Covers all discretionary grants from 26+ federal agencies.

API docs: https://www.grants.gov/web/grants/s2s/applicant/resources/grants-gov-api.html
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)
"""

import logging
import time
import requests
from typing import Optional, List, Dict, Any

log = logging.getLogger(__name__)

GRANTS_BASE = "https://api.grants.gov/v1/api"

POLITE_DELAY = 0.5


def search_grants(
    keyword: Optional[str] = None,
    agency: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """
    Search federal grant opportunities on Grants.gov.
    Uses POST to the /search2 endpoint with a JSON body.

    Args:
        keyword: Search keyword(s) for grant title/description
        agency: Agency code filter (e.g. 'HHS', 'DOE', 'EPA')
        category: Funding category filter (e.g. 'health', 'education', 'environment')
        limit: Max results to return (default 25)

    Returns:
        List of grant opportunity dicts with title, agency, dates, amounts
    """
    url = f"{GRANTS_BASE}/search2"

    body: Dict[str, Any] = {
        "rows": min(limit, 250),
        "sortBy": "openDate|desc",
    }
    if keyword:
        body["keyword"] = keyword
    if agency:
        body["agency"] = agency
    if category:
        body["category"] = category

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.post(
            url,
            json=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("Grants.gov search failed (HTTP %s): %s", status, e)
        return []
    except Exception as e:
        log.error("Grants.gov search failed: %s", e)
        return []

    # Response: {"errorcode": 0, "data": {"oppHits": [...], ...}}
    inner = data.get("data", data)
    results = inner.get("oppHits", inner.get("opportunities", inner.get("results", [])))
    if isinstance(results, dict):
        results = results.get("oppHit", [])

    log.info(
        "Grants.gov search (keyword=%s, agency=%s, category=%s): %d results",
        keyword, agency, category, len(results),
    )
    return results


def get_grant_detail(opp_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch detailed information about a specific grant opportunity.

    Args:
        opp_id: The Grants.gov opportunity ID (e.g. '350995')

    Returns:
        Grant detail dict with full description, eligibility, dates, etc.
        Returns None if not found.
    """
    url = f"{GRANTS_BASE}/fetchOpportunity"
    params = {"oppId": opp_id}

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            log.info("Grants.gov opportunity %s: not found", opp_id)
            return None
        log.error("Grants.gov detail failed for %s: %s", opp_id, e)
        return None
    except Exception as e:
        log.error("Grants.gov detail failed for %s: %s", opp_id, e)
        return None

    # Response may wrap the opportunity in a key
    result = data.get("opportunity", data)

    log.info("Grants.gov opportunity %s: found", opp_id)
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing Grants.gov Connector ===\n")

    print("--- Search grants (keyword='climate', limit 5) ---")
    grants = search_grants(keyword="climate", limit=5)
    for g in grants[:3]:
        title = g.get("title", g.get("oppTitle", "N/A"))
        agency = g.get("agency", g.get("agencyCode", "N/A"))
        print(f"  {agency}: {title}")
    print(f"  Total returned: {len(grants)}\n")

    print("--- Search grants (agency='EPA', limit 5) ---")
    epa_grants = search_grants(agency="EPA", limit=5)
    for g in epa_grants[:3]:
        title = g.get("title", g.get("oppTitle", "N/A"))
        print(f"  {title}")
    print(f"  Total returned: {len(epa_grants)}")
