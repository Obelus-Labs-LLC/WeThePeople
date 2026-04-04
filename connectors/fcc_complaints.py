"""
FCC Consumer Complaints Connector — via Socrata SODA API

Fetch consumer complaint data filed with the Federal Communications Commission.
Covers issues like robocalls, billing disputes, service quality, and accessibility.

API docs: https://opendata.fcc.gov/resource/3xyp-aqkj
Rate limit: 1,000 requests/hour without app token, higher with token
Auth: Optional Socrata app token (env var SOCRATA_APP_TOKEN) for higher rate limits
"""

import logging
import os
import time
import requests
from typing import Optional, List, Dict, Any

log = logging.getLogger(__name__)

FCC_COMPLAINTS_BASE = "https://opendata.fcc.gov/resource/3xyp-aqkj.json"
APP_TOKEN = os.environ.get("SOCRATA_APP_TOKEN", "")

POLITE_DELAY = 0.5


def _build_headers() -> Dict[str, str]:
    """Build request headers, including Socrata app token if available."""
    headers: Dict[str, str] = {"Accept": "application/json"}
    if APP_TOKEN:
        headers["X-App-Token"] = APP_TOKEN
    return headers


def search_complaints(
    company: Optional[str] = None,
    issue: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Search FCC consumer complaints with optional filters.

    Args:
        company: Company/provider name to filter (case-insensitive LIKE match)
        issue: Issue category (e.g. 'Robocalls', 'Billing', 'Internet')
        state: Two-letter state code (e.g. 'CA', 'NY')
        limit: Max results to return (default 100, Socrata max 50000)

    Returns:
        List of complaint dicts with fields from the FCC dataset
    """
    params: Dict[str, Any] = {
        "$limit": min(limit, 50000),
        "$order": "date_of_issue DESC",
    }

    # Build SoQL $where clauses
    where_clauses = []
    if company:
        where_clauses.append(f"upper(company_name) like '%{company.upper()}%'")
    if issue:
        where_clauses.append(f"upper(issue) like '%{issue.upper()}%'")
    if state:
        where_clauses.append(f"state='{state.upper()}'")

    if where_clauses:
        params["$where"] = " AND ".join(where_clauses)

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            FCC_COMPLAINTS_BASE,
            params=params,
            headers=_build_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        results = resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("FCC complaints search failed (HTTP %s): %s", status, e)
        return []
    except Exception as e:
        log.error("FCC complaints search failed: %s", e)
        return []

    log.info(
        "FCC complaints search (company=%s, issue=%s, state=%s): %d results",
        company, issue, state, len(results),
    )
    return results


def get_complaint_stats(
    company: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Get aggregate complaint statistics grouped by issue type.

    Args:
        company: Optional company name to filter stats for

    Returns:
        List of dicts with 'issue' and 'count' keys, sorted by count descending
    """
    params: Dict[str, Any] = {
        "$select": "issue, count(*) as count",
        "$group": "issue",
        "$order": "count DESC",
        "$limit": 100,
    }

    if company:
        params["$where"] = f"upper(company_name) like '%{company.upper()}%'"

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            FCC_COMPLAINTS_BASE,
            params=params,
            headers=_build_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        results = resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("FCC complaint stats failed (HTTP %s): %s", status, e)
        return []
    except Exception as e:
        log.error("FCC complaint stats failed: %s", e)
        return []

    log.info(
        "FCC complaint stats (company=%s): %d issue categories",
        company, len(results),
    )
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing FCC Complaints Connector ===\n")

    print("--- Search complaints (AT&T, limit 5) ---")
    complaints = search_complaints(company="AT&T", limit=5)
    for c in complaints[:3]:
        print(f"  {c.get('date_of_issue', 'N/A')}: {c.get('issue', 'N/A')} - {c.get('company_name', 'N/A')}")
    print(f"  Total returned: {len(complaints)}\n")

    print("--- Complaint stats (all companies) ---")
    stats = get_complaint_stats()
    for s in stats[:5]:
        print(f"  {s.get('issue', 'N/A')}: {s.get('count', 0)}")
