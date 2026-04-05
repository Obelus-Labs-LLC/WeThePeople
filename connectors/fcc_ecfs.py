"""
FCC ECFS Connector — Electronic Comment Filing System

Fetch public comments and proceeding data from the FCC's ECFS.
Covers net neutrality, spectrum allocation, broadband, and all other
FCC rulemaking proceedings where the public can file comments.

API docs: https://www.fcc.gov/ecfs/public-api-docs
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)
"""

import logging
import os
import time
import requests
from typing import Optional, List, Dict, Any

log = logging.getLogger(__name__)

ECFS_BASE = "https://publicapi.fcc.gov/ecfs"

POLITE_DELAY = 0.5


def search_filings(
    proceeding: Optional[str] = None,
    filer: Optional[str] = None,
    limit: int = 25,
) -> List[Dict[str, Any]]:
    """
    Search ECFS filings (public comments, replies, ex parte notices).

    Args:
        proceeding: Proceeding number to filter (e.g. '17-108' for net neutrality)
        filer: Filer/organization name to search
        limit: Max results to return (default 25)

    Returns:
        List of filing dicts with filer info, proceeding, dates, document links
    """
    url = f"{ECFS_BASE}/filings"
    params: Dict[str, Any] = {
        "limit": min(limit, 100),
        "sort": "date_received,DESC",
        "api_key": os.environ.get("FCC_API_KEY", "DEMO_KEY"),
    }

    if proceeding:
        params["proceedings.name"] = proceeding
    if filer:
        params["filers.name"] = filer

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("FCC ECFS filings search failed (HTTP %s): %s", status, e)
        return []
    except Exception as e:
        log.error("FCC ECFS filings search failed: %s", e)
        return []

    results = data.get("filing", data.get("filings", data.get("results", [])))

    log.info(
        "FCC ECFS filings (proceeding=%s, filer=%s): %d results",
        proceeding, filer, len(results),
    )
    return results


def get_proceeding(proceeding_id: str) -> Optional[Dict[str, Any]]:
    """
    Get details about a specific FCC proceeding/docket.

    Args:
        proceeding_id: The proceeding number (e.g. '17-108', '22-271')

    Returns:
        Proceeding detail dict with description, bureau, dates, filing counts.
        Returns None if not found.
    """
    url = f"{ECFS_BASE}/proceedings/{proceeding_id}"

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            log.info("FCC ECFS proceeding %s: not found", proceeding_id)
            return None
        log.error("FCC ECFS proceeding failed for %s: %s", proceeding_id, e)
        return None
    except Exception as e:
        log.error("FCC ECFS proceeding failed for %s: %s", proceeding_id, e)
        return None

    log.info("FCC ECFS proceeding %s: found", proceeding_id)
    return data


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing FCC ECFS Connector ===\n")

    print("--- Search filings (proceeding 17-108, limit 5) ---")
    filings = search_filings(proceeding="17-108", limit=5)
    for f in filings[:3]:
        filers = f.get("filers", [{}])
        filer_name = filers[0].get("name", "N/A") if filers else "N/A"
        print(f"  {f.get('date_received', 'N/A')}: {filer_name}")
    print(f"  Total returned: {len(filings)}\n")

    print("--- Search filings by filer (AT&T, limit 5) ---")
    att_filings = search_filings(filer="AT&T", limit=5)
    for f in att_filings[:3]:
        proceedings = f.get("proceedings", [{}])
        proc_name = proceedings[0].get("name", "N/A") if proceedings else "N/A"
        print(f"  Proceeding {proc_name}: {f.get('date_received', 'N/A')}")
    print(f"  Total returned: {len(att_filings)}\n")

    print("--- Proceeding detail (17-108) ---")
    proc = get_proceeding("17-108")
    if proc:
        print(f"  Description: {str(proc.get('description', 'N/A'))[:100]}")
        print(f"  Bureau: {proc.get('bureau', 'N/A')}")
