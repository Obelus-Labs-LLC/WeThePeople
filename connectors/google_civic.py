"""
Google Civic Information API Connector

Provides real-time civic data:
- Division lookup by address (what political districts cover this address?)
- Election information (upcoming elections, polling locations)
- Voter information (registration, early voting, contests)
- Division search (find OCD-IDs by name)

NOTE: Google retired the /representatives endpoint on April 30, 2025.
The replacement is /divisionsByAddress, which returns all OCD division IDs
for a given address (congressional district, state senate, city council, etc.)
but NOT the names of officials. For official names, pair with Congress.gov
connector, OpenStates, or the Wikipedia connector.

API docs: https://developers.google.com/civic-information
Auth: Google API key (query param: key)
Rate limit: 25,000 requests/day (free tier)
"""

import re
from typing import Optional, List, Dict, Any

from utils.http_client import config
from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Polite delay between API calls (seconds)
POLITE_DELAY = 0.2

CIVIC_API_BASE = "https://www.googleapis.com/civicinfo/v2"


# ============================================================================
# CORE API HELPER
# ============================================================================

def _civic_get(endpoint: str, params: Optional[Dict[str, str]] = None) -> Optional[Dict[str, Any]]:
    """
    Make a GET request to the Google Civic Information API.

    Args:
        endpoint: API endpoint (e.g., "elections", "divisionsByAddress")
        params: Query parameters

    Returns:
        JSON response dict, or None on error
    """
    import requests

    key = config.GOOGLE_CIVIC_API_KEY
    if not key:
        logger.error("Missing Google Civic Information API key (API_KEY_GOOGLE_CIVIC)")
        return None

    url = f"{CIVIC_API_BASE}/{endpoint}"
    params = params or {}
    params["key"] = key

    try:
        response = requests.get(url, params=params, timeout=15)

        if response.status_code == 429:
            logger.warning("Google Civic API rate limited (429)")
            return None
        elif response.status_code == 400:
            error_data = response.json() if response.text else {}
            error_msg = error_data.get("error", {}).get("message", response.text[:200])
            logger.error("Google Civic API 400 Bad Request: %s", error_msg)
            return None
        elif response.status_code == 404:
            error_data = {}
            try:
                error_data = response.json()
            except Exception:
                pass
            error_msg = error_data.get("error", {}).get("message", "not found")
            logger.info("Google Civic API 404: %s", error_msg)
            return None

        response.raise_for_status()
        return response.json()

    except requests.RequestException as e:
        logger.error("Google Civic API request failed: %s", e)
        return None


# ============================================================================
# DIVISIONS BY ADDRESS — What political districts cover this address?
# ============================================================================

def lookup_divisions_by_address(address: str) -> Optional[Dict[str, Any]]:
    """
    Look up all political divisions (districts) for a given address.

    This is the primary "who represents me?" starting point. Returns OCD
    division IDs for every level of government covering the address:
    country, state, congressional district, state senate, state assembly,
    county, city, city council, judicial district, etc.

    NOTE: This does NOT return official names (Google retired that in April 2025).
    Use the OCD-IDs with other connectors (Congress.gov, OpenStates, Wikipedia)
    to resolve to actual people.

    Args:
        address: Full US address (e.g., "350 Fifth Avenue, New York, NY 10118")

    Returns:
        Dict with:
        - normalizedInput: Parsed address components (line1, city, state, zip)
        - divisions: Dict of ocd_id -> {name, alsoKnownAs[]}
        Or None on error
    """
    data = _civic_get("divisionsByAddress", {"address": address})
    if not data:
        return None

    divisions = data.get("divisions", {})
    logger.info("Found %d divisions for address: %s", len(divisions), address[:50])
    return data


def get_congressional_district(address: str) -> Optional[Dict[str, str]]:
    """
    Get the congressional district for an address.

    Convenience function that extracts just the congressional district
    OCD-ID and name from the full divisions response.

    Args:
        address: Full US address

    Returns:
        Dict with ocd_id, name, state, district_number, or None
    """
    data = lookup_divisions_by_address(address)
    if not data:
        return None

    for ocd_id, info in data.get("divisions", {}).items():
        if "/cd:" in ocd_id:
            # Parse "ocd-division/country:us/state:ny/cd:12"
            state_match = re.search(r'/state:(\w+)', ocd_id)
            district_match = re.search(r'/cd:(\d+)', ocd_id)

            return {
                "ocd_id": ocd_id,
                "name": info.get("name", ""),
                "state": state_match.group(1).upper() if state_match else "",
                "district_number": district_match.group(1) if district_match else "",
            }

    logger.info("No congressional district found for address: %s", address[:50])
    return None


def get_state_legislative_districts(address: str) -> Dict[str, Dict[str, str]]:
    """
    Get state legislative districts (upper and lower chamber) for an address.

    Args:
        address: Full US address

    Returns:
        Dict with keys "upper" and/or "lower", each containing:
        - ocd_id, name, state, district_number
    """
    data = lookup_divisions_by_address(address)
    if not data:
        return {}

    result = {}
    for ocd_id, info in data.get("divisions", {}).items():
        state_match = re.search(r'/state:(\w+)', ocd_id)
        state = state_match.group(1).upper() if state_match else ""

        if "/sldu:" in ocd_id:
            # State Senate (upper)
            num_match = re.search(r'/sldu:(\d+)', ocd_id)
            result["upper"] = {
                "ocd_id": ocd_id,
                "name": info.get("name", ""),
                "state": state,
                "district_number": num_match.group(1) if num_match else "",
            }
        elif "/sldl:" in ocd_id:
            # State House/Assembly (lower)
            num_match = re.search(r'/sldl:(\d+)', ocd_id)
            result["lower"] = {
                "ocd_id": ocd_id,
                "name": info.get("name", ""),
                "state": state,
                "district_number": num_match.group(1) if num_match else "",
            }

    return result


def get_all_districts(address: str) -> Dict[str, Any]:
    """
    Get a structured breakdown of all political districts for an address.

    Returns a categorized view: federal, state, county, city, judicial.

    Args:
        address: Full US address

    Returns:
        Dict with:
        - normalized_address: Parsed address dict
        - federal: {country, congressional_district}
        - state: {state, senate_district, house_district}
        - county: county division if found
        - city: city division if found
        - city_council: council district if found
        - judicial: judicial districts if found
        - all_divisions: complete raw list
    """
    data = lookup_divisions_by_address(address)
    if not data:
        return {"error": "No data returned for address"}

    result: Dict[str, Any] = {
        "normalized_address": data.get("normalizedInput", {}),
        "federal": {},
        "state": {},
        "county": None,
        "city": None,
        "city_council": None,
        "judicial": [],
        "all_divisions": [],
    }

    for ocd_id, info in data.get("divisions", {}).items():
        entry = {
            "ocd_id": ocd_id,
            "name": info.get("name", ""),
            "also_known_as": info.get("alsoKnownAs", []),
        }
        result["all_divisions"].append(entry)

        # Categorize
        if ocd_id == "ocd-division/country:us":
            result["federal"]["country"] = entry
        elif "/cd:" in ocd_id:
            result["federal"]["congressional_district"] = entry
        elif re.match(r'ocd-division/country:us/state:\w+$', ocd_id):
            result["state"]["state"] = entry
        elif "/sldu:" in ocd_id:
            result["state"]["senate_district"] = entry
        elif "/sldl:" in ocd_id:
            result["state"]["house_district"] = entry
        elif "/county:" in ocd_id:
            result["county"] = entry
        elif "/place:" in ocd_id and "/council_district:" not in ocd_id:
            result["city"] = entry
        elif "/council_district:" in ocd_id:
            result["city_council"] = entry
        elif "/supreme_court:" in ocd_id or "/court:" in ocd_id:
            result["judicial"].append(entry)

    return result


# ============================================================================
# ELECTIONS — Upcoming elections
# ============================================================================

def list_elections() -> List[Dict[str, Any]]:
    """
    List all upcoming elections known to Google.

    Returns:
        List of election dicts with id, name, electionDay, ocdDivisionId
    """
    data = _civic_get("elections")
    if not data:
        return []

    elections = data.get("elections", [])
    logger.info("Found %d elections", len(elections))
    return elections


# ============================================================================
# VOTER INFO — Polling places, contests, ballot info
# ============================================================================

def lookup_voter_info(
    address: str,
    election_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Get voter information for an address and election.

    Returns polling locations, early vote sites, contests (races on ballot),
    and other election-specific info.

    Args:
        address: Full US address
        election_id: Specific election ID (from list_elections()).
                     If None, uses the next upcoming election.

    Returns:
        Dict with pollingLocations, earlyVoteSites, contests, state info,
        or None on error
    """
    params: Dict[str, str] = {"address": address}

    if election_id:
        params["electionId"] = election_id

    data = _civic_get("voterinfo", params)
    if not data:
        return None

    contests = data.get("contests", [])
    polling = data.get("pollingLocations", [])
    logger.info(
        "Voter info for %s: %d contests, %d polling locations",
        address[:50], len(contests), len(polling)
    )
    return data


def get_upcoming_contests(address: str) -> List[Dict[str, Any]]:
    """
    Get contests (races) on the ballot for an address.

    Convenience function that extracts just the contests from voter info.

    Args:
        address: Full US address

    Returns:
        List of contest dicts with type, office, district, candidates
    """
    data = lookup_voter_info(address)
    if not data:
        return []
    return data.get("contests", [])


# ============================================================================
# DIVISION SEARCH — Find OCD division IDs by name
# ============================================================================

def search_divisions(query: str) -> List[Dict[str, Any]]:
    """
    Search for OCD divisions by name.

    Useful for finding division IDs for a state, district, etc.

    Args:
        query: Search term (e.g., "New York", "California 14th")

    Returns:
        List of division dicts with ocdId, name, aliases
    """
    data = _civic_get("divisions", {"query": query})
    if not data:
        return []

    results = []
    raw_results = data.get("results", [])

    # API returns a list of dicts with ocdId, name, aliases
    if isinstance(raw_results, list):
        for item in raw_results:
            results.append({
                "ocdId": item.get("ocdId", ""),
                "name": item.get("name", ""),
                "aliases": item.get("aliases", []),
            })
    elif isinstance(raw_results, dict):
        # Fallback: older format was {ocdId: {name, aliases}}
        for ocd_id, info in raw_results.items():
            results.append({
                "ocdId": ocd_id,
                "name": info.get("name", ""),
                "aliases": info.get("aliases", []),
            })

    logger.info("Division search '%s': %d results", query, len(results))
    return results


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys
    import json

    setup_logging("INFO")

    if not config.GOOGLE_CIVIC_API_KEY:
        print("ERROR: API_KEY_GOOGLE_CIVIC not set in .env")
        print("Get a key at: https://console.cloud.google.com/apis/credentials")
        sys.exit(1)

    print("Google Civic Information API Connector Test")
    print("=" * 60)

    # Test 1: List elections
    print("\n1. Listing upcoming elections...")
    elections = list_elections()
    print(f"   Found {len(elections)} elections")
    for e in elections[:5]:
        print(f"   - {e.get('name', 'unknown')} ({e.get('electionDay', 'no date')})")

    # Test 2: Divisions by address
    test_address = "350 Fifth Avenue, New York, NY 10118"
    print(f"\n2. Divisions for: {test_address}...")
    data = lookup_divisions_by_address(test_address)
    if data:
        divs = data.get("divisions", {})
        print(f"   Found {len(divs)} divisions")
        for ocd_id, info in divs.items():
            print(f"   - {info.get('name', '?')} ({ocd_id})")

    # Test 3: Congressional district
    print(f"\n3. Congressional district...")
    cd = get_congressional_district(test_address)
    if cd:
        print(f"   {cd['name']} (State: {cd['state']}, District: {cd['district_number']})")

    # Test 4: State legislative
    print(f"\n4. State legislative districts...")
    state_dists = get_state_legislative_districts(test_address)
    for chamber, info in state_dists.items():
        print(f"   {chamber}: {info['name']}")

    # Test 5: All districts structured
    print(f"\n5. All districts (structured)...")
    all_d = get_all_districts(test_address)
    print(f"   Normalized: {all_d.get('normalized_address', {})}")
    if all_d.get("federal", {}).get("congressional_district"):
        print(f"   Federal CD: {all_d['federal']['congressional_district']['name']}")
    if all_d.get("state", {}).get("senate_district"):
        print(f"   State Senate: {all_d['state']['senate_district']['name']}")
    if all_d.get("state", {}).get("house_district"):
        print(f"   State House: {all_d['state']['house_district']['name']}")
    if all_d.get("city"):
        print(f"   City: {all_d['city']['name']}")
    if all_d.get("city_council"):
        print(f"   City Council: {all_d['city_council']['name']}")
    if all_d.get("county"):
        print(f"   County: {all_d['county']['name']}")

    # Test 6: Division search
    print("\n6. Searching divisions for 'New York 14'...")
    divisions = search_divisions("New York 14")
    print(f"   Found {len(divisions)} divisions")
    for d in divisions[:5]:
        print(f"   - {d['ocdId']}: {d['name']}")

    print("\n" + "=" * 60)
    print("Google Civic connector test complete.")
