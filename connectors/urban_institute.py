"""
Urban Institute Education Data Portal Connector

Fetch higher education data from the Urban Institute's Education Data API,
which aggregates IPEDS (Integrated Postsecondary Education Data System) data
including enrollment, finances, and graduation rates.

API docs: https://educationdata.urban.org/documentation/
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)
"""

import logging
import time
import requests
from typing import Optional, List, Dict, Any

log = logging.getLogger(__name__)

URBAN_BASE = "https://educationdata.urban.org/api/v1"

POLITE_DELAY = 0.5


def _urban_get(endpoint: str, params: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """
    Make a GET request to the Urban Institute Education Data API.
    Handles pagination via the 'next' URL in the response.

    Args:
        endpoint: API path after the base URL
        params: Optional query parameters

    Returns:
        List of result records, or empty list on error
    """
    url = f"{URBAN_BASE}{endpoint}"
    all_results: List[Dict[str, Any]] = []
    max_pages = 5  # Safety limit to avoid runaway pagination

    for page in range(max_pages):
        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(url, params=params if page == 0 else None, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response is not None else "unknown"
            log.error("Urban Institute API failed (HTTP %s) %s: %s", status, endpoint, e)
            break
        except Exception as e:
            log.error("Urban Institute API failed %s: %s", endpoint, e)
            break

        results = data.get("results", [])
        all_results.extend(results)

        # Check for next page
        next_url = data.get("next")
        if not next_url or not results:
            break
        url = next_url

    return all_results


def get_college_enrollment(
    year: Optional[int] = None,
    institution_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch IPEDS fall enrollment data for colleges/universities.

    Args:
        year: Academic year (e.g. 2022). If None, returns most recent available.
        institution_id: IPEDS unit ID for a specific institution. If None, returns all.

    Returns:
        List of enrollment records with headcount, demographics, etc.
    """
    parts = ["/college-university/ipeds/fall-enrollment"]
    if year:
        parts.append(str(year))
    if institution_id:
        parts.append(str(institution_id))
    parts.append("")  # trailing slash

    endpoint = "/".join(parts)
    results = _urban_get(endpoint)

    log.info(
        "Urban Institute enrollment (year=%s, id=%s): %d records",
        year, institution_id, len(results),
    )
    return results


def get_college_finances(
    year: Optional[int] = None,
    institution_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch IPEDS institutional finance data (revenue, expenditures, assets).

    Args:
        year: Fiscal year (e.g. 2022). If None, returns most recent available.
        institution_id: IPEDS unit ID for a specific institution. If None, returns all.

    Returns:
        List of finance records with revenue, expenditure, and endowment data
    """
    parts = ["/college-university/ipeds/finance"]
    if year:
        parts.append(str(year))
    if institution_id:
        parts.append(str(institution_id))
    parts.append("")

    endpoint = "/".join(parts)
    results = _urban_get(endpoint)

    log.info(
        "Urban Institute finances (year=%s, id=%s): %d records",
        year, institution_id, len(results),
    )
    return results


def get_graduation_rates(
    institution_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch IPEDS completion/graduation rate data.

    Args:
        institution_id: IPEDS unit ID for a specific institution. If None, returns all.

    Returns:
        List of completion rate records with graduation counts and rates
    """
    parts = ["/college-university/ipeds/completions"]
    if institution_id:
        parts.append(str(institution_id))
    parts.append("")

    endpoint = "/".join(parts)
    results = _urban_get(endpoint)

    log.info(
        "Urban Institute graduation rates (id=%s): %d records",
        institution_id, len(results),
    )
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing Urban Institute Education Data Connector ===\n")

    # Use Harvard's IPEDS ID as a test
    test_id = 166027  # Harvard University

    print(f"--- Enrollment for institution {test_id} (2022) ---")
    enrollment = get_college_enrollment(year=2022, institution_id=test_id)
    for e in enrollment[:3]:
        print(f"  Level: {e.get('level_of_study', 'N/A')}, Headcount: {e.get('enrollment_fall', 'N/A')}")
    print(f"  Total records: {len(enrollment)}\n")

    print(f"--- Finances for institution {test_id} (2022) ---")
    finances = get_college_finances(year=2022, institution_id=test_id)
    for f in finances[:3]:
        print(f"  Revenue: {f.get('rev_total_current', 'N/A')}")
    print(f"  Total records: {len(finances)}\n")

    print(f"--- Graduation rates for institution {test_id} ---")
    grads = get_graduation_rates(institution_id=test_id)
    for g in grads[:3]:
        print(f"  Award level: {g.get('award_level', 'N/A')}, Count: {g.get('number_of_awards', 'N/A')}")
    print(f"  Total records: {len(grads)}")
