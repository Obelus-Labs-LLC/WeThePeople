"""
College Scorecard Connector — Department of Education

Fetch institution-level data on costs, graduation rates, debt,
and repayment outcomes from the College Scorecard API.
Useful for education sector accountability and for-profit school tracking.

API docs: https://collegescorecard.ed.gov/data/documentation/
Rate limit: Standard data.gov key limits (~1,000 req/hour)
Auth: data.gov API key (env var DATA_GOV_API_KEY or DATAGOV_API_KEY)
"""

import logging
import os
import time
import requests
from typing import Optional, List, Dict, Any

log = logging.getLogger(__name__)

SCORECARD_BASE = "https://api.data.gov/ed/collegescorecard/v1/schools"
API_KEY = os.environ.get("DATA_GOV_API_KEY") or os.environ.get("DATAGOV_API_KEY") or "DEMO_KEY"

POLITE_DELAY = 0.5

# Standard fields to request for school searches
DEFAULT_FIELDS = ",".join([
    "id",
    "school.name",
    "school.city",
    "school.state",
    "school.school_url",
    "school.ownership",
    "school.institutional_characteristics.level",
    "latest.student.size",
    "latest.cost.tuition.in_state",
    "latest.cost.tuition.out_of_state",
    "latest.completion.rate_suppressed.overall",
    "latest.repayment.3_yr_repayment.overall",
    "latest.aid.median_debt.completers.overall",
    "latest.earnings.10_yrs_after_entry.median",
    "latest.admissions.admission_rate.overall",
])


def _build_params(**kwargs) -> Dict[str, Any]:
    """Build base params with API key and extra filters."""
    params: Dict[str, Any] = {}
    if API_KEY:
        params["api_key"] = API_KEY
    params.update(kwargs)
    return params


def search_schools(
    name: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Search institutions in the College Scorecard.

    Args:
        name: School name to search (partial match)
        state: Two-letter state code (e.g. 'CA', 'NY')
        limit: Max results (default 20, API max 100)

    Returns:
        List of school dicts with cost, completion, debt, and earnings data
    """
    params = _build_params(
        fields=DEFAULT_FIELDS,
        per_page=min(limit, 100),
    )

    if name:
        params["school.name"] = name
    if state:
        params["school.state"] = state.upper()

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(SCORECARD_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("College Scorecard search failed (HTTP %s): %s", status, e)
        return []
    except Exception as e:
        log.error("College Scorecard search failed: %s", e)
        return []

    results = data.get("results", [])
    log.info(
        "College Scorecard search (name=%s, state=%s): %d schools",
        name, state, len(results),
    )
    return results


def get_school_detail(school_id: int) -> Optional[Dict[str, Any]]:
    """
    Get detailed data for a single school by its College Scorecard ID.

    Args:
        school_id: The numeric school ID (IPEDS unit ID)

    Returns:
        School dict with full fields, or None if not found
    """
    params = _build_params(
        id=school_id,
        fields=DEFAULT_FIELDS,
    )

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(SCORECARD_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            log.info("College Scorecard school %d: not found", school_id)
            return None
        log.error("College Scorecard detail failed for %d: %s", school_id, e)
        return None
    except Exception as e:
        log.error("College Scorecard detail failed for %d: %s", school_id, e)
        return None

    results = data.get("results", [])
    if not results:
        log.info("College Scorecard school %d: no results", school_id)
        return None

    log.info("College Scorecard school %d: found", school_id)
    return results[0]


def get_for_profit_schools(
    state: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Get for-profit institutions (ownership type 3).
    Useful for tracking predatory lending and low completion rates.

    Args:
        state: Two-letter state code to filter (optional)
        limit: Max results (default 50)

    Returns:
        List of for-profit school dicts sorted by student size descending
    """
    params = _build_params(
        fields=DEFAULT_FIELDS,
        per_page=min(limit, 100),
        sort="latest.student.size:desc",
    )
    params["school.ownership"] = 3  # 1=Public, 2=Private nonprofit, 3=Private for-profit

    if state:
        params["school.state"] = state.upper()

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(SCORECARD_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("College Scorecard for-profit search failed (HTTP %s): %s", status, e)
        return []
    except Exception as e:
        log.error("College Scorecard for-profit search failed: %s", e)
        return []

    results = data.get("results", [])
    log.info(
        "College Scorecard for-profit (state=%s): %d schools",
        state, len(results),
    )
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing College Scorecard Connector ===\n")

    print("--- Search schools (name=Harvard) ---")
    schools = search_schools(name="Harvard", limit=5)
    for s in schools[:3]:
        print(f"  {s.get('school.name', 'N/A')} ({s.get('school.state', '')})")
        print(f"    Tuition: ${s.get('latest.cost.tuition.in_state', 'N/A')}")
        print(f"    Completion: {s.get('latest.completion.rate_suppressed.overall', 'N/A')}")
    print(f"  Total: {len(schools)}\n")

    print("--- For-profit schools (CA, limit 5) ---")
    fp = get_for_profit_schools(state="CA", limit=5)
    for s in fp[:3]:
        print(f"  {s.get('school.name', 'N/A')}: students={s.get('latest.student.size', 'N/A')}")
    print(f"  Total: {len(fp)}")
