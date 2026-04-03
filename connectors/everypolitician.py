"""
EveryPolitician Connector

Access global legislator data from the EveryPolitician project hosted
on GitHub. Provides structured data on politicians from every country
in Popolo format.

Data source: https://github.com/everypolitician/everypolitician-data
Rate limit: None (static GitHub files)
Auth: None required (public data)
"""

import requests
from typing import Optional, List, Dict, Any

from connectors._base import with_circuit_breaker
from utils.logging import get_logger

logger = get_logger(__name__)

EP_BASE = "https://raw.githubusercontent.com/everypolitician/everypolitician-data/master"


@with_circuit_breaker("everypolitician", failure_threshold=3, recovery_timeout=120.0)
def fetch_countries_index() -> List[Dict[str, Any]]:
    """
    Fetch the master countries index from EveryPolitician.

    Returns:
        List of country dicts with keys: name, code, slug, legislatures
        (where legislatures is a list of {name, type, popolo_url, csv_url, ...}).
        Returns empty list on failure.
    """
    try:
        resp = requests.get(
            f"{EP_BASE}/countries.json",
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("EveryPolitician countries index fetch failed: %s", e)
        return []

    if not isinstance(data, list):
        logger.error("EveryPolitician countries index: unexpected format (not a list)")
        return []

    logger.info("EveryPolitician countries index: %d countries", len(data))
    return data


@with_circuit_breaker("everypolitician", failure_threshold=3, recovery_timeout=120.0)
def fetch_legislature_popolo(popolo_url: str) -> Optional[Dict[str, Any]]:
    """
    Fetch full legislator data for a legislature in Popolo format.

    Args:
        popolo_url: URL to the Popolo JSON file (from countries index)

    Returns:
        Dict with Popolo data (persons, organizations, memberships, events),
        or None on failure
    """
    try:
        resp = requests.get(
            popolo_url,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("EveryPolitician popolo fetch failed for %s: %s", popolo_url, e)
        return None

    persons = data.get("persons") or []
    orgs = data.get("organizations") or []
    logger.info(
        "EveryPolitician popolo: %d persons, %d organizations from %s",
        len(persons), len(orgs), popolo_url,
    )
    return data


@with_circuit_breaker("everypolitician", failure_threshold=3, recovery_timeout=120.0)
def fetch_all_countries() -> List[Dict[str, Any]]:
    """
    Convenience: fetch countries index and return a simplified list.

    Returns:
        List of dicts with keys: name, code, legislature_count.
        Returns empty list on failure.
    """
    countries_raw = fetch_countries_index()
    if not countries_raw:
        return []

    results = []
    for country in countries_raw:
        legislatures = country.get("legislatures") or []
        results.append({
            "name": country.get("name"),
            "code": country.get("code"),
            "legislature_count": len(legislatures),
        })

    logger.info("EveryPolitician simplified: %d countries", len(results))
    return results
