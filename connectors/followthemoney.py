"""
FollowTheMoney (National Institute on Money in Politics) Connector

Track state-level campaign contributions, candidate fundraising, and
donor/industry spending via the FollowTheMoney API.

API docs: https://api.followthemoney.org
Rate limit: Moderate (0.3s polite delay)
Auth: Required — FOLLOWTHEMONEY_API_KEY env var
"""

import os
import time
import requests
from typing import Optional, List, Dict, Any

from connectors._base import with_circuit_breaker
from utils.logging import get_logger

logger = get_logger(__name__)

FTM_BASE = "https://api.followthemoney.org"
API_KEY = os.getenv("FOLLOWTHEMONEY_API_KEY")

POLITE_DELAY = 0.3


def _check_api_key() -> bool:
    """Verify API key is configured."""
    if not API_KEY:
        logger.error("FOLLOWTHEMONEY_API_KEY not set — cannot query FollowTheMoney API")
        return False
    return True


def _build_params(**kwargs) -> Dict[str, Any]:
    """Build query params with API key and optional filters."""
    params = {"APIKey": API_KEY}
    for k, v in kwargs.items():
        if v is not None:
            params[k] = v
    return params


@with_circuit_breaker("followthemoney", failure_threshold=3, recovery_timeout=120.0)
def search_candidates(
    state: str = None,
    year: str = None,
    office: str = None,
) -> List[Dict[str, Any]]:
    """
    Search candidates for state-level offices.

    Args:
        state: Two-letter state code (e.g. 'CA', 'TX')
        year: Election year (e.g. '2024')
        office: Office name filter

    Returns:
        List of candidate dicts from the API, or empty list on failure
    """
    if not _check_api_key():
        return []

    time.sleep(POLITE_DELAY)
    params = _build_params(s=state, y=year, o=office)

    try:
        resp = requests.get(
            f"{FTM_BASE}/candidates.php",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("FollowTheMoney candidate search failed: %s", e)
        return []

    # API returns a dict with "records" or a list depending on endpoint
    if isinstance(data, list):
        results = data
    elif isinstance(data, dict):
        results = data.get("records") or data.get("data") or []
    else:
        results = []

    logger.info(
        "FollowTheMoney candidates (state=%s, year=%s): %d results",
        state, year, len(results),
    )
    return results


@with_circuit_breaker("followthemoney", failure_threshold=3, recovery_timeout=120.0)
def get_candidate_contributions(candidate_id: str) -> List[Dict[str, Any]]:
    """
    Get contribution records for a specific candidate.

    Args:
        candidate_id: FollowTheMoney candidate ID

    Returns:
        List of contribution dicts, or empty list on failure
    """
    if not _check_api_key():
        return []

    time.sleep(POLITE_DELAY)
    params = _build_params(id=candidate_id)

    try:
        resp = requests.get(
            f"{FTM_BASE}/candidates.php",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(
            "FollowTheMoney contributions failed for candidate %s: %s",
            candidate_id, e,
        )
        return []

    if isinstance(data, list):
        results = data
    elif isinstance(data, dict):
        results = data.get("records") or data.get("data") or []
    else:
        results = []

    logger.info(
        "FollowTheMoney contributions for candidate %s: %d records",
        candidate_id, len(results),
    )
    return results


@with_circuit_breaker("followthemoney", failure_threshold=3, recovery_timeout=120.0)
def search_donors(name: str, state: str = None) -> List[Dict[str, Any]]:
    """
    Search political donors by name.

    Args:
        name: Donor name to search for
        state: Two-letter state code filter

    Returns:
        List of donor dicts, or empty list on failure
    """
    if not _check_api_key():
        return []

    time.sleep(POLITE_DELAY)
    params = _build_params(d=name, s=state)

    try:
        resp = requests.get(
            f"{FTM_BASE}/donors.php",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("FollowTheMoney donor search failed for '%s': %s", name, e)
        return []

    if isinstance(data, list):
        results = data
    elif isinstance(data, dict):
        results = data.get("records") or data.get("data") or []
    else:
        results = []

    logger.info(
        "FollowTheMoney donor search '%s' (state=%s): %d results",
        name, state, len(results),
    )
    return results


@with_circuit_breaker("followthemoney", failure_threshold=3, recovery_timeout=120.0)
def get_industry_contributions(
    industry: str,
    state: str = None,
    year: str = None,
) -> List[Dict[str, Any]]:
    """
    Get campaign contributions by industry sector.

    Args:
        industry: Industry name or code
        state: Two-letter state code filter
        year: Election year filter

    Returns:
        List of industry contribution dicts, or empty list on failure
    """
    if not _check_api_key():
        return []

    time.sleep(POLITE_DELAY)
    params = _build_params(i=industry, s=state, y=year)

    try:
        resp = requests.get(
            f"{FTM_BASE}/industries.php",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(
            "FollowTheMoney industry contributions failed for '%s': %s",
            industry, e,
        )
        return []

    if isinstance(data, list):
        results = data
    elif isinstance(data, dict):
        results = data.get("records") or data.get("data") or []
    else:
        results = []

    logger.info(
        "FollowTheMoney industry '%s' (state=%s, year=%s): %d results",
        industry, state, year, len(results),
    )
    return results
