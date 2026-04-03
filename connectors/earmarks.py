"""
Earmarks Connector — Congressionally Directed Spending via USASpending.gov

Searches federal award data for grants and other assistance commonly used
for congressional earmarks (award types 07, 08 — grants).

API docs: https://api.usaspending.gov/
Rate limit: None documented (be polite — 1s between calls)
Auth: None required (free public API)
"""

import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

USASPENDING_BASE = "https://api.usaspending.gov/api/v2"
POLITE_DELAY = 1.0


def _safe_float(val) -> Optional[float]:
    """Safely convert a value to float."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def search_earmarks(
    state: Optional[str] = None,
    keyword: Optional[str] = None,
    agency: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Search USASpending.gov for congressionally directed spending (grants).

    Uses award_type_codes 07 (direct payment) and 08 (grant) which are
    the primary vehicles for earmarked spending.

    Args:
        state: 2-letter state code filter
        keyword: Search term for award description
        agency: Awarding agency name filter
        year: Fiscal year filter
        limit: Max results (default 50, max 100)

    Returns:
        List of award dicts with keys: award_id, award_amount,
        recipient_name, awarding_agency, description, start_date,
        state, fiscal_year, award_type
    """
    url = f"{USASPENDING_BASE}/search/spending_by_award/"
    page_size = min(limit, 100)

    from datetime import datetime

    filters: Dict[str, Any] = {
        "award_type_codes": ["07", "08"],  # Direct payments + Grants
        "time_period": [
            {"start_date": "2023-10-01", "end_date": f"{datetime.now().strftime('%Y-%m-%d')}"}
        ],
    }

    # Build keywords list - combine keyword and state name for broader matching
    kw_list = []
    if keyword:
        kw_list.append(keyword.strip())

    # USASpending's place_of_performance_locations filter is unreliable;
    # use state name as a keyword instead for more consistent results
    STATE_NAMES = {
        "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
        "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
        "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
        "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
        "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
        "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
        "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
        "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
        "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
        "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
        "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
        "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
        "WI": "Wisconsin", "WY": "Wyoming",
    }
    if state:
        state_name = STATE_NAMES.get(state.upper(), state)
        kw_list.append(state_name)

    if kw_list:
        filters["keywords"] = kw_list

    if agency:
        filters["agencies"] = [
            {
                "type": "awarding",
                "tier": "toptier",
                "name": agency.strip(),
            }
        ]

    if year:
        filters["time_period"] = [
            {"start_date": f"{year - 1}-10-01", "end_date": f"{year}-09-30"}
        ]

    payload = {
        "filters": filters,
        "fields": [
            "Award ID",
            "Award Amount",
            "Recipient Name",
            "Awarding Agency",
            "Description",
            "Start Date",
            "End Date",
            "Award Type",
            "Place of Performance State Code",
            "recipient_id",
        ],
        "limit": page_size,
        "page": 1,
        "sort": "Award Amount",
        "order": "desc",
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("USASpending earmarks search failed: %s", e)
        return []

    results_raw = data.get("results", [])
    results = []

    for award in results_raw:
        results.append({
            "award_id": award.get("Award ID", ""),
            "award_amount": _safe_float(award.get("Award Amount")),
            "recipient_name": award.get("Recipient Name", ""),
            "awarding_agency": award.get("Awarding Agency", ""),
            "description": (award.get("Description") or "")[:500],
            "start_date": award.get("Start Date"),
            "end_date": award.get("End Date"),
            "state": award.get("Place of Performance State Code", ""),
            "award_type": award.get("Award Type", ""),
        })

    logger.info(
        "USASpending earmarks search: %d results (keyword=%s, state=%s, year=%s)",
        len(results), keyword, state, year,
    )
    return results


def fetch_member_earmarks(member_name: str, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Search for awards where a congress member's name appears in the
    award description or recipient name.

    This is a best-effort search — USASpending doesn't directly tag
    awards by sponsoring member, but earmark descriptions often
    reference the requesting member.

    Args:
        member_name: Congress member name (e.g. "Schumer", "Pelosi")
        limit: Max results (default 50)

    Returns:
        List of award dicts matching the member name
    """
    url = f"{USASPENDING_BASE}/search/spending_by_award/"
    page_size = min(limit, 100)

    payload = {
        "filters": {
            "award_type_codes": ["02", "03", "04", "05", "07", "08"],
            "keywords": [member_name.strip()],
        },
        "fields": [
            "Award ID",
            "Award Amount",
            "Recipient Name",
            "Awarding Agency",
            "Description",
            "Start Date",
            "End Date",
            "Award Type",
            "Place of Performance State Code",
        ],
        "limit": page_size,
        "page": 1,
        "sort": "Award Amount",
        "order": "desc",
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("USASpending member earmarks failed for '%s': %s", member_name, e)
        return []

    results_raw = data.get("results", [])
    results = []

    for award in results_raw:
        results.append({
            "award_id": award.get("Award ID", ""),
            "award_amount": _safe_float(award.get("Award Amount")),
            "recipient_name": award.get("Recipient Name", ""),
            "awarding_agency": award.get("Awarding Agency", ""),
            "description": (award.get("Description") or "")[:500],
            "start_date": award.get("Start Date"),
            "end_date": award.get("End Date"),
            "state": award.get("Place of Performance State Code", ""),
            "award_type": award.get("Award Type", ""),
        })

    logger.info(
        "USASpending member earmarks '%s': %d results",
        member_name, len(results),
    )
    return results
