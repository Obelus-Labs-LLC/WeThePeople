"""
EveryPolitician Connector

Access global legislator data from the EveryPolitician project hosted
on GitHub. Provides structured data on politicians from every country
in Popolo format.

Data source: https://github.com/everypolitician/everypolitician-data
Rate limit: None (static GitHub files)
Auth: None required (public data)
"""

import threading
import time
import requests
from typing import Optional, List, Dict, Any

from connectors._base import with_circuit_breaker
from utils.logging import get_logger

logger = get_logger(__name__)

EP_BASE = "https://raw.githubusercontent.com/everypolitician/everypolitician-data/master"

# In-process TTL cache for the countries index + per-legislature Popolo
# blobs. Both endpoints fetch large GitHub-hosted JSON files (the US
# Popolo blob is ~36 KB and the cold path is consistently 1.1-1.4s on
# prod). EveryPolitician refreshes its dataset roughly monthly, so a
# 6-hour cache is conservative and absorbs essentially every repeat
# request from one user (autocomplete, page reloads, etc.) at zero
# upstream cost.
_CACHE_TTL_SEC = 6 * 3600
_cache: Dict[str, Any] = {}
_cache_lock = threading.Lock()


def _cache_get(key: str):
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
    if entry is None:
        return None
    ts, value = entry
    if now - ts > _CACHE_TTL_SEC:
        return None
    return value


def _cache_put(key: str, value) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), value)


@with_circuit_breaker("everypolitician", failure_threshold=3, recovery_timeout=120.0)
def fetch_countries_index() -> List[Dict[str, Any]]:
    """
    Fetch the master countries index from EveryPolitician.

    Returns:
        List of country dicts with keys: name, code, slug, legislatures
        (where legislatures is a list of {name, type, popolo_url, csv_url, ...}).
        Returns empty list on failure.
    """
    cached = _cache_get("countries_index")
    if cached is not None:
        return cached

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
    _cache_put("countries_index", data)
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
    cache_key = f"popolo:{popolo_url}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

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
    _cache_put(cache_key, data)
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
