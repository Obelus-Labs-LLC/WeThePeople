"""
FEC Connector — Federal Election Commission Campaign Finance Data

"Follow the money." Cross-reference a politician's legislative claims
with who funds them. Donors, expenditures, committee financials.

API docs: https://api.open.fec.gov/developers/
Auth: data.gov API key (query param: api_key)
Rate limit: 1,000 requests/hour
"""

import time
from typing import Optional, List, Dict, Any

from utils.http_client import http_client, HTTPError
from utils.config import config
from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Polite delay between API calls (seconds)
POLITE_DELAY = 0.5


# ============================================================================
# CANDIDATE LOOKUP
# ============================================================================

def search_candidate(
    name: str,
    office: Optional[str] = None,
    state: Optional[str] = None,
    cycle: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Search for a candidate by name.

    Args:
        name: Candidate name (partial match supported)
        office: Filter by office: "H" (House), "S" (Senate), "P" (President)
        state: Two-letter state code
        cycle: Election cycle year (e.g., 2024)

    Returns:
        List of candidate result dicts
    """
    params: Dict[str, Any] = {
        "q": name,
        "per_page": 20,
    }
    if office:
        params["office"] = office
    if state:
        params["state"] = state
    if cycle:
        params["cycle"] = cycle

    try:
        data = http_client.get_fec("candidates/search/", params=params, use_cache=True)
        results = data.get("results", [])
        logger.info("FEC candidate search '%s': %d results", name, len(results))
        return results
    except HTTPError as e:
        logger.error("FEC candidate search failed for '%s': %s", name, e)
        return []


def get_candidate(candidate_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch detailed info for a specific candidate.

    Args:
        candidate_id: FEC candidate ID (e.g., "H8NY15148" for AOC)

    Returns:
        Candidate detail dict, or None on error
    """
    try:
        data = http_client.get_fec(f"candidate/{candidate_id}/", use_cache=True)
        results = data.get("results", [])
        if results:
            return results[0]
        return None
    except HTTPError as e:
        logger.error("FEC candidate fetch failed for %s: %s", candidate_id, e)
        return None


# ============================================================================
# FINANCIAL TOTALS
# ============================================================================

def fetch_candidate_totals(
    candidate_id: str,
    cycle: int = 2024,
) -> Optional[Dict[str, Any]]:
    """
    Fetch financial totals for a candidate in a given election cycle.

    Includes: total raised, total spent, cash on hand, debt, etc.

    Args:
        candidate_id: FEC candidate ID
        cycle: Election cycle year

    Returns:
        Financial totals dict, or None on error
    """
    try:
        data = http_client.get_fec(
            f"candidate/{candidate_id}/totals/",
            params={"cycle": cycle},
            use_cache=True,
        )
        results = data.get("results", [])
        if results:
            logger.info("FEC totals for %s (cycle %d): $%s raised",
                        candidate_id, cycle,
                        f"{results[0].get('receipts', 0):,.0f}")
            return results[0]
        return None
    except HTTPError as e:
        logger.error("FEC totals fetch failed for %s: %s", candidate_id, e)
        return None


# ============================================================================
# COMMITTEE & FUNDRAISING
# ============================================================================

def fetch_candidate_committees(
    candidate_id: str,
    cycle: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch committees associated with a candidate.

    Args:
        candidate_id: FEC candidate ID
        cycle: Optional election cycle year

    Returns:
        List of committee dicts
    """
    params: Dict[str, Any] = {"per_page": 50}
    if cycle:
        params["cycle"] = cycle

    try:
        data = http_client.get_fec(
            f"candidate/{candidate_id}/committees/",
            params=params,
            use_cache=True,
        )
        return data.get("results", [])
    except HTTPError as e:
        logger.error("FEC committees fetch failed for %s: %s", candidate_id, e)
        return []


def fetch_top_donors(
    committee_id: str,
    cycle: int = 2024,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Fetch top individual donors to a committee (Schedule A).

    Args:
        committee_id: FEC committee ID
        cycle: Election cycle year
        limit: Max number of donors

    Returns:
        List of donor/contribution dicts sorted by amount
    """
    try:
        data = http_client.get_fec(
            "schedules/schedule_a/",
            params={
                "committee_id": committee_id,
                "two_year_transaction_period": cycle,
                "sort": "-contribution_receipt_amount",
                "per_page": limit,
                "is_individual": True,
            },
            use_cache=True,
        )
        results = data.get("results", [])
        logger.info("FEC top donors for committee %s: %d results", committee_id, len(results))
        return results
    except HTTPError as e:
        logger.error("FEC donors fetch failed for %s: %s", committee_id, e)
        return []


def fetch_committee_expenditures(
    committee_id: str,
    cycle: int = 2024,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Fetch top expenditures/disbursements for a committee (Schedule B).

    Args:
        committee_id: FEC committee ID
        cycle: Election cycle year
        limit: Max number of results

    Returns:
        List of disbursement dicts sorted by amount
    """
    try:
        data = http_client.get_fec(
            "schedules/schedule_b/",
            params={
                "committee_id": committee_id,
                "two_year_transaction_period": cycle,
                "sort": "-disbursement_amount",
                "per_page": limit,
            },
            use_cache=True,
        )
        results = data.get("results", [])
        logger.info("FEC expenditures for committee %s: %d results", committee_id, len(results))
        return results
    except HTTPError as e:
        logger.error("FEC expenditures fetch failed for %s: %s", committee_id, e)
        return []


# ============================================================================
# HIGH-LEVEL: FULL FINANCE PROFILE
# ============================================================================

def build_finance_profile(
    name: str,
    cycle: int = 2024,
    top_n_donors: int = 10,
) -> Optional[Dict[str, Any]]:
    """
    Build a complete financial profile for a politician.

    Searches by name, finds their candidate ID, fetches totals,
    committees, and top donors.

    Args:
        name: Candidate name
        cycle: Election cycle
        top_n_donors: Number of top donors to include

    Returns:
        Financial profile dict, or None if candidate not found
    """
    # Search for candidate
    candidates = search_candidate(name, cycle=cycle)
    if not candidates:
        logger.warning("No FEC candidate found for '%s'", name)
        return None

    candidate = candidates[0]
    candidate_id = candidate.get("candidate_id")
    if not candidate_id:
        return None

    time.sleep(POLITE_DELAY)

    # Get financial totals
    totals = fetch_candidate_totals(candidate_id, cycle=cycle)

    time.sleep(POLITE_DELAY)

    # Get committees
    committees = fetch_candidate_committees(candidate_id, cycle=cycle)

    # Get top donors from principal committee
    donors = []
    if committees:
        principal = next(
            (c for c in committees if c.get("designation") == "P"),
            committees[0]
        )
        committee_id = principal.get("committee_id")
        if committee_id:
            time.sleep(POLITE_DELAY)
            donors = fetch_top_donors(committee_id, cycle=cycle, limit=top_n_donors)

    profile = {
        "candidate_id": candidate_id,
        "name": candidate.get("name"),
        "party": candidate.get("party"),
        "office": candidate.get("office_full"),
        "state": candidate.get("state"),
        "district": candidate.get("district"),
        "cycle": cycle,
        "totals": totals,
        "committees": [
            {
                "committee_id": c.get("committee_id"),
                "name": c.get("name"),
                "designation": c.get("designation_full"),
            }
            for c in committees
        ],
        "top_donors": [
            {
                "name": d.get("contributor_name"),
                "employer": d.get("contributor_employer"),
                "amount": d.get("contribution_receipt_amount"),
                "date": d.get("contribution_receipt_date"),
                "city": d.get("contributor_city"),
                "state": d.get("contributor_state"),
            }
            for d in donors
        ],
    }

    logger.info("Built finance profile for %s (%s)", name, candidate_id)
    return profile


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys
    import json as json_module

    setup_logging("INFO")

    if not config.FEC_API_KEY:
        print("ERROR: API_KEY_DATA_GOV not set in .env")
        sys.exit(1)

    print("FEC Connector Test")
    print("=" * 60)

    # Test 1: Search for a well-known candidate
    test_name = "Alexandria Ocasio-Cortez"
    print(f"\n1. Searching for '{test_name}'...")
    candidates = search_candidate(test_name)
    if candidates:
        c = candidates[0]
        print(f"   Found: {c.get('name')} ({c.get('candidate_id')})")
        print(f"   Party: {c.get('party')}, Office: {c.get('office_full')}")
        print(f"   State: {c.get('state')}, District: {c.get('district')}")

        # Test 2: Get financial totals
        cid = c.get("candidate_id")
        if cid:
            time.sleep(POLITE_DELAY)
            print(f"\n2. Fetching financial totals for {cid}...")
            totals = fetch_candidate_totals(cid, cycle=2024)
            if totals:
                print(f"   Total raised: ${totals.get('receipts', 0):,.0f}")
                print(f"   Total spent: ${totals.get('disbursements', 0):,.0f}")
                print(f"   Cash on hand: ${totals.get('last_cash_on_hand_end_period', 0):,.0f}")
    else:
        print("   No candidates found (unexpected)")

    # Test 3: Search for a senator
    time.sleep(POLITE_DELAY)
    print(f"\n3. Searching for 'Bernie Sanders'...")
    sanders = search_candidate("Bernie Sanders", office="S")
    if sanders:
        s = sanders[0]
        print(f"   Found: {s.get('name')} ({s.get('candidate_id')})")
    else:
        print("   Not found")

    print("\n" + "=" * 60)
    print("FEC connector test complete.")
