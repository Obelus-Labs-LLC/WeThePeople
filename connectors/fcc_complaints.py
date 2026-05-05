"""
FCC Consumer Complaints Connector -- via Socrata SODA API

Fetch consumer complaint data filed with the Federal Communications Commission.
Covers issues like robocalls, billing disputes, service quality, and accessibility.

Dataset: https://opendata.fcc.gov/resource/3xyp-aqkj
Columns: id, ticket_created, date_created, issue_time, issue_type, method, issue,
         caller_id_number, city, state, zip, type_of_call_or_messge

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
    headers: Dict[str, str] = {"Accept": "application/json"}
    if APP_TOKEN:
        headers["X-App-Token"] = APP_TOKEN
    return headers


def search_complaints(
    issue_type: Optional[str] = None,
    issue: Optional[str] = None,
    method: Optional[str] = None,
    state: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Search FCC consumer complaints with optional filters.

    Args:
        issue_type: Type filter (e.g. 'Phone', 'Internet', 'TV')
        issue: Issue category (e.g. 'Unwanted Calls', 'Billing', 'Service')
        method: Method (e.g. 'Wired', 'Wireless', 'Cable', 'Satellite')
        state: Two-letter state code (e.g. 'CA', 'NY')
        q: Free-text full-text search over all fields. The FCC public
            consumer-complaint dataset (sn9z-f3y5) does not carry a
            carrier/company column so company-name search must use
            Socrata's `$q` full-text token, which scans every text
            column. Imperfect — "AT&T" hits any complaint mentioning
            "AT&T" anywhere in the description-like fields — but it's
            the best signal we have for a company filter from this
            dataset.
        limit: Max results to return (default 100)

    Returns:
        List of complaint dicts
    """
    params: Dict[str, Any] = {
        "$limit": min(limit, 50000),
        "$order": "ticket_created DESC",
    }

    where_clauses = []
    if issue_type:
        safe = issue_type.replace("'", "''")
        where_clauses.append(f"upper(issue_type) like '%{safe.upper()}%'")
    if issue:
        safe = issue.replace("'", "''")
        where_clauses.append(f"upper(issue) like '%{safe.upper()}%'")
    if method:
        safe = method.replace("'", "''")
        where_clauses.append(f"upper(method) like '%{safe.upper()}%'")
    if state:
        import re
        safe_state = re.sub(r'[^A-Z]', '', state.upper())[:2]
        where_clauses.append(f"state='{safe_state}'")

    if where_clauses:
        params["$where"] = " AND ".join(where_clauses)

    if q:
        # Socrata supports $q for full-text search across all string
        # columns. Two important sanitization steps:
        #
        # 1) Ampersands break $q silently. The `&` becomes a URL
        #    parameter delimiter regardless of percent-encoding in the
        #    request, so "AT&T" returns 0 rows. Strip them.
        # 2) Other URL-special characters get the same treatment to
        #    keep the parser happy.
        # Hyphens like "T-Mobile" are safe and pass through.
        # Caught in the May 5 walkthrough (R-FCC-3).
        sanitized = q.strip()
        for ch in ("&", "?", "#", "%", "$", "\\", '"', "'"):
            sanitized = sanitized.replace(ch, " ")
        sanitized = " ".join(sanitized.split())
        if sanitized:
            params["$q"] = sanitized[:120]

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
        "FCC complaints search (issue_type=%s, issue=%s, state=%s): %d results",
        issue_type, issue, state, len(results),
    )
    return results


def get_complaint_stats() -> List[Dict[str, Any]]:
    """
    Get aggregate complaint statistics grouped by issue type.

    Returns:
        List of dicts with 'issue' and 'count' keys, sorted by count descending
    """
    params: Dict[str, Any] = {
        "$select": "issue, count(*) as count",
        "$group": "issue",
        "$order": "count DESC",
        "$limit": 50,
    }

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

    log.info("FCC complaint stats: %d issue categories", len(results))
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    print("--- Search complaints (state=CA, limit 5) ---")
    complaints = search_complaints(state="CA", limit=5)
    for c in complaints[:3]:
        print(f"  {c.get('ticket_created', 'N/A')}: {c.get('issue', 'N/A')} ({c.get('issue_type', 'N/A')})")
    print(f"  Total: {len(complaints)}")
    print("\n--- Complaint stats ---")
    stats = get_complaint_stats()
    for s in stats[:5]:
        print(f"  {s.get('issue', 'N/A')}: {s.get('count', 0)}")
