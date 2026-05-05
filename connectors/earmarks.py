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

    # Use current fiscal year start (Oct 1 of previous calendar year)
    now = datetime.now()
    fy_start_year = now.year if now.month >= 10 else now.year - 1
    fy_start = f"{fy_start_year}-10-01"
    # USASpending award type codes:
    #   02 = Block Grant         (Medicaid, TANF, CDBG — ENTITLEMENT, not earmark)
    #   03 = Formula Grant       (formula-driven, not earmark)
    #   04 = Project Grant       (competitive, often earmarks)
    #   05 = Cooperative Agreement (project-tied, often earmarks)
    #   06 = Direct Payment for Specified Use (closest to a true earmark)
    #   07 = Direct Payment Unrestricted (commonly named beneficiary)
    #   08 = Insurance, Loan Guarantee, etc.
    #
    # The previous filter included 02 (Block Grants) which surfaced
    # $100B Medicaid entitlement grants as if they were earmarks.
    # Caught in the May 5 walkthrough (R-EM-2). Restrict to the
    # award types most likely to represent actual congressionally
    # directed spending.
    filters: Dict[str, Any] = {
        "award_type_codes": ["04", "05", "06", "07"],
        "time_period": [
            {"start_date": fy_start, "end_date": now.strftime('%Y-%m-%d')}
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
    # Earmarks come back from USASpending with occasional duplicate
    # rows (the same Award ID surfaces twice when an award has been
    # modified). Dedupe on Award ID, keep first occurrence. Caught in
    # the May 5 walkthrough (R-EM-3).
    seen_award_ids: set = set()
    # Real earmarks (Congressionally Directed Spending) are typically
    # under $50M for a single project. Awards above that cap are usually
    # block-grant-shaped entitlements that slipped past the type filter
    # (e.g. multi-state grants or large research-program rollups). Drop
    # them to keep the tool focused on what a journalist actually wants.
    EARMARK_MAX_AMOUNT = 50_000_000

    for award in results_raw:
        award_id = award.get("Award ID") or ""
        if award_id and award_id in seen_award_ids:
            continue
        if award_id:
            seen_award_ids.add(award_id)
        amount = _safe_float(award.get("Award Amount"))
        if amount is not None and amount > EARMARK_MAX_AMOUNT:
            continue
        results.append({
            "award_id": award_id,
            "award_amount": amount,
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
            # Same restriction as search_earmarks: drop block grants
            # (02) and formula grants (03) which are entitlements, not
            # earmarks.
            "award_type_codes": ["04", "05", "06", "07"],
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
    # Same dedup + amount cap as search_earmarks (R-EM-3).
    seen_award_ids: set = set()
    EARMARK_MAX_AMOUNT = 50_000_000

    for award in results_raw:
        award_id = award.get("Award ID") or ""
        if award_id and award_id in seen_award_ids:
            continue
        if award_id:
            seen_award_ids.add(award_id)
        amount = _safe_float(award.get("Award Amount"))
        if amount is not None and amount > EARMARK_MAX_AMOUNT:
            continue
        results.append({
            "award_id": award_id,
            "award_amount": amount,
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
