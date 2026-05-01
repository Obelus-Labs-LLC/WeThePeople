"""
OpenStates API v3 Connector

Fetch state-level legislative data: legislators and bills.

API docs: https://v3.openstates.org/docs
Rate limit: Rate-limited for anonymous access; higher limits with API key.
Auth: Optional — set OPENSTATES_API_KEY env var for higher limits.
"""

import os
import hashlib
import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

OPENSTATES_BASE = "https://v3.openstates.org"
POLITE_DELAY = 2.0  # OpenStates rate-limits aggressively
MAX_RETRIES = 3


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _headers() -> Dict[str, str]:
    """Build request headers, including API key if available."""
    h = {"Accept": "application/json"}
    api_key = os.getenv("OPENSTATES_API_KEY")
    if api_key:
        h["X-API-KEY"] = api_key
    return h


def fetch_state_legislators(
    state: str,
    chamber: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch state legislators from OpenStates API.

    Args:
        state: Two-letter state abbreviation or full jurisdiction (e.g. 'ny', 'california')
        chamber: Optional — 'upper' (senate) or 'lower' (house/assembly)

    Returns:
        List of legislator dicts with keys: ocd_id, name, state, chamber,
        party, district, photo_url, is_active
    """
    params: Dict[str, Any] = {
        "jurisdiction": state.lower(),
        "per_page": 50,
    }
    if chamber:
        params["org_classification"] = chamber

    all_results: List[Dict[str, Any]] = []
    page = 1

    while True:
        params["page"] = page
        data = None
        for attempt in range(MAX_RETRIES):
            try:
                time.sleep(POLITE_DELAY)
                resp = requests.get(
                    f"{OPENSTATES_BASE}/people",
                    params=params,
                    headers=_headers(),
                    timeout=30,
                )
                if resp.status_code == 429:
                    wait = min(5 * (2 ** attempt), 60)  # 5s, 10s, 20s (capped at 60s)
                    logger.warning("Rate limited on '%s', waiting %ds (attempt %d/%d)...", state, wait, attempt + 1, MAX_RETRIES)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                data = resp.json()
                break
            except requests.exceptions.RequestException as e:
                logger.error("OpenStates legislators fetch failed for '%s': %s", state, e)
                if attempt < MAX_RETRIES - 1:
                    time.sleep(5 * (2 ** attempt))
                else:
                    break
        if data is None:
            break

        results = data.get("results") or []
        if not results:
            break

        for person in results:
            ocd_id = person.get("id", "")
            name = person.get("name", "")
            current_role = person.get("current_role") or {}
            raw_party = person.get("party") or ""
            # API returns either a string or a list of dicts
            if isinstance(raw_party, list):
                party_name = raw_party[0].get("name", "") if raw_party else ""
            else:
                party_name = str(raw_party)

            # Normalize party to single letter
            party = party_name
            if "democrat" in party_name.lower():
                party = "D"
            elif "republican" in party_name.lower():
                party = "R"
            elif party_name.lower() in ("independent", "libertarian", "green"):
                party = "I"

            all_results.append({
                "ocd_id": ocd_id,
                "name": name,
                "state": state.upper()[:2],
                "chamber": current_role.get("org_classification", ""),
                "party": party,
                "district": current_role.get("district", ""),
                "photo_url": person.get("image", ""),
                "is_active": True,
            })

        # Check pagination
        pagination = data.get("pagination") or {}
        max_page = pagination.get("max_page", 1)
        if page >= max_page:
            break
        page += 1

    logger.info("OpenStates legislators '%s': %d results", state, len(all_results))
    return all_results


# 2-letter postal → OpenStates jurisdiction display name. The /bills
# endpoint accepts either the OCD URN or the state name as the
# `jurisdiction` query value, but `requests` percent-encodes the slashes
# in the URN form which OpenStates rejects with 400. The state-name
# form passes through unchanged. DC is included because OpenStates
# tracks it.
_STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana",
    "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
    "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota",
    "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon",
    "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}


def _ocd_jurisdiction(state: str) -> str:
    """Translate a 2-letter state code into a value the OpenStates
    /bills endpoint accepts.

    The endpoint accepts either an `ocd-jurisdiction/...` URN or the
    full state name. requests percent-encodes the URN's slashes so
    OpenStates rejects it with HTTP 400. Returning the state name
    sidesteps the encoding issue entirely.
    """
    s = (state or "").strip()
    if s.lower().startswith("ocd-jurisdiction"):
        return state
    name = _STATE_NAMES.get(s.upper()[:2])
    return name or s.lower()


def fetch_state_bills(
    state: str,
    query: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
) -> List[Dict[str, Any]]:
    """
    Fetch state bills from OpenStates API.

    Args:
        state: Two-letter state abbreviation or full jurisdiction
        query: Optional search query
        page: Page number (1-based)
        per_page: Results per page (max 50)

    Returns:
        List of bill dicts with keys: bill_id, state, session, identifier,
        title, subjects, latest_action, latest_action_date, sponsor_name, source_url
    """
    params: Dict[str, Any] = {
        "jurisdiction": _ocd_jurisdiction(state),
        "page": page,
        "per_page": min(per_page, 50),
        "sort": "updated_desc",
    }
    if query:
        params["q"] = query

    data = None
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(
                f"{OPENSTATES_BASE}/bills",
                params=params,
                headers=_headers(),
                timeout=30,
            )
            if resp.status_code == 429:
                wait = min(5 * (2 ** attempt), 60)  # 5s, 10s, 20s (capped at 60s)
                logger.warning("Rate limited on bills '%s', waiting %ds (attempt %d/%d)...", state, wait, attempt + 1, MAX_RETRIES)
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            break
        except requests.exceptions.RequestException as e:
            logger.error("OpenStates bills fetch failed for '%s': %s", state, e)
            if attempt < MAX_RETRIES - 1:
                time.sleep(5 * (2 ** attempt))
            else:
                return []
    if data is None:
        return []

    results = data.get("results") or []
    bills: List[Dict[str, Any]] = []

    for bill in results:
        identifier = bill.get("identifier", "")
        session = bill.get("legislative_session", "")
        state_upper = state.upper()[:2]

        # Build a unique bill_id
        bill_id = f"{state_upper.lower()}-{session}-{identifier}".replace(" ", "")

        # Latest action
        latest_action = ""
        latest_action_date = None
        actions = bill.get("latest_action") or {}
        if actions:
            latest_action = actions.get("description", "")
            latest_action_date = actions.get("date")

        # Primary sponsor
        sponsor_name = ""
        sponsorships = bill.get("sponsorships") or []
        for sp in sponsorships:
            if sp.get("primary"):
                sponsor_name = sp.get("name", "")
                break
        if not sponsor_name and sponsorships:
            sponsor_name = sponsorships[0].get("name", "")

        # Subjects
        subjects = bill.get("subject") or []

        # Source URL
        source_url = ""
        sources = bill.get("sources") or []
        if sources:
            source_url = sources[0].get("url", "")
        openstates_url = bill.get("openstates_url", "")

        bills.append({
            "bill_id": bill_id,
            "state": state_upper,
            "session": session,
            "identifier": identifier,
            "title": bill.get("title", ""),
            "subjects": subjects,
            "latest_action": latest_action,
            "latest_action_date": latest_action_date,
            "sponsor_name": sponsor_name,
            "source_url": source_url or openstates_url,
        })

    logger.info(
        "OpenStates bills '%s' (page %d): %d results",
        state, page, len(bills),
    )
    return bills


def fetch_state_legislator_detail(person_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch full legislator profile from OpenStates.

    Args:
        person_id: OpenStates person ID (OCD-ID format)

    Returns:
        Full person dict or None on failure
    """
    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            f"{OPENSTATES_BASE}/people/{person_id}",
            headers=_headers(),
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error("OpenStates person detail failed for '%s': %s", person_id, e)
        return None
