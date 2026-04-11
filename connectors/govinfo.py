"""
GovInfo Connector — Congressional Record & Federal Publications

Fetches Congressional Record (CREC) data from the Government Publishing Office API.
The Congressional Record is the verbatim transcript of floor proceedings — when
a politician speaks on the floor about a bill, that's a claim with a direct bill reference.

API docs: https://api.govinfo.gov/docs/
Auth: data.gov API key (query param: api_key)
Rate limit: 1,000 requests/hour
"""

import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from utils.http_client import http_client, HTTPError, AuthError
from utils.http_client import config
from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Polite delay between API calls (seconds)
POLITE_DELAY = 1.0


# ============================================================================
# CONGRESSIONAL RECORD (CREC) — Floor speeches, debates, extensions of remarks
# ============================================================================

def fetch_crec_collection(
    start_date: str,
    end_date: str,
    page_size: int = 100,
    max_pages: int = 5,
) -> List[Dict[str, Any]]:
    """
    Fetch Congressional Record packages for a date range.

    Uses the /published/{date} endpoint which is more reliable than
    /collections/CREC. Iterates day by day through the date range.

    Args:
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        page_size: Results per page (max 100)
        max_pages: Max pages per date query

    Returns:
        List of CREC package metadata dicts
    """
    all_packages = []
    seen_ids = set()

    # Normalize dates
    start_date = start_date[:10]
    end_date = end_date[:10]

    try:
        data = http_client.get_govinfo(
            f"published/{start_date}",
            params={
                "collection": "CREC",
                "pageSize": page_size,
                "offsetMark": "*",
            },
            use_cache=True,
        )

        packages = data.get("packages", [])
        for pkg in packages:
            pkg_id = pkg.get("packageId", "")
            if pkg_id not in seen_ids:
                seen_ids.add(pkg_id)
                all_packages.append(pkg)

        # Follow pagination
        pages_fetched = 1
        while data.get("nextPage") and pages_fetched < max_pages:
            time.sleep(POLITE_DELAY)
            next_url = data["nextPage"]
            # nextPage is a full URL; extract path after base
            try:
                import requests as _req
                data = _req.get(next_url, params={"api_key": config.GOVINFO_API_KEY}, timeout=30).json()
                for pkg in data.get("packages", []):
                    pkg_id = pkg.get("packageId", "")
                    if pkg_id not in seen_ids:
                        seen_ids.add(pkg_id)
                        all_packages.append(pkg)
                pages_fetched += 1
            except Exception as e:
                logger.error("GovInfo pagination failed: %s", e)
                break

    except HTTPError as e:
        logger.error("GovInfo CREC published fetch failed: %s", e)

    logger.info("Fetched %d CREC packages for %s to %s", len(all_packages), start_date, end_date)
    return all_packages


def fetch_recent_crec(days: int = 7, page_size: int = 100) -> List[Dict[str, Any]]:
    """
    Convenience: fetch Congressional Record packages from the last N days.

    Args:
        days: Number of days to look back
        page_size: Results per page

    Returns:
        List of CREC package metadata dicts
    """
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return fetch_crec_collection(
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
        page_size=page_size,
    )


def fetch_package_granules(
    package_id: str,
    page_size: int = 100,
    max_pages: int = 5
) -> List[Dict[str, Any]]:
    """
    Fetch granules (individual items) within a CREC package.

    Each granule is typically one speech, one extension of remarks, or one section.

    Args:
        package_id: GovInfo package ID (e.g., "CREC-2025-01-15")
        page_size: Results per page
        max_pages: Max pages to fetch

    Returns:
        List of granule metadata dicts
    """
    all_granules = []

    for page in range(max_pages):
        offset = page * page_size

        try:
            data = http_client.get_govinfo(
                f"packages/{package_id}/granules",
                params={
                    "pageSize": page_size,
                    "offset": offset,
                },
                use_cache=True,
            )
        except HTTPError as e:
            logger.error("GovInfo granules fetch failed for %s: %s", package_id, e)
            break

        granules = data.get("granules", [])
        if not granules:
            break

        all_granules.extend(granules)

        next_page = data.get("nextPage")
        if not next_page:
            break

        time.sleep(POLITE_DELAY)

    logger.info("Fetched %d granules for package %s", len(all_granules), package_id)
    return all_granules


def fetch_package_summary(package_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch summary/metadata for a specific package.

    Args:
        package_id: GovInfo package ID

    Returns:
        Package summary dict, or None on error
    """
    try:
        return http_client.get_govinfo(
            f"packages/{package_id}/summary",
            use_cache=True,
        )
    except HTTPError as e:
        logger.error("GovInfo package summary failed for %s: %s", package_id, e)
        return None


def fetch_granule_summary(package_id: str, granule_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch metadata for a specific granule within a package.

    Args:
        package_id: GovInfo package ID
        granule_id: Granule ID within the package

    Returns:
        Granule summary dict, or None on error
    """
    try:
        return http_client.get_govinfo(
            f"packages/{package_id}/granules/{granule_id}/summary",
            use_cache=True,
        )
    except HTTPError as e:
        logger.error("GovInfo granule summary failed for %s/%s: %s", package_id, granule_id, e)
        return None


# ============================================================================
# SEARCH — Full-text search across GovInfo collections
# ============================================================================

def search_govinfo(
    query: str,
    collection: str = "CREC",
    page_size: int = 25,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Search GovInfo across collections (POST endpoint).

    Args:
        query: Search query string
        collection: Collection code (CREC, BILLS, FR, PLAW, etc.)
        page_size: Results per page
        offset: Starting offset

    Returns:
        Search results dict with 'results' list and pagination info
    """
    import requests as _req

    key = config.GOVINFO_API_KEY
    if not key:
        logger.error("Missing GovInfo API key")
        return {"count": 0, "results": []}

    try:
        response = _req.post(
            f"https://api.govinfo.gov/search",
            params={"api_key": key},
            json={
                "query": query,
                "pageSize": page_size,
                "offset": offset,
                "collection": collection,
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
    except _req.RequestException as e:
        logger.error("GovInfo search failed for '%s': %s", query, e)
        return {"count": 0, "results": []}


def search_crec(query: str, page_size: int = 25) -> List[Dict[str, Any]]:
    """
    Search within the Congressional Record.

    Args:
        query: Search query (e.g., member name, bill number, topic)
        page_size: Max results

    Returns:
        List of matching CREC result dicts
    """
    data = search_govinfo(query, collection="CREC", page_size=page_size)
    return data.get("results", [])


def search_bills(query: str, page_size: int = 25) -> List[Dict[str, Any]]:
    """
    Search within the BILLS collection on GovInfo.

    Args:
        query: Search query (e.g., bill number, topic)
        page_size: Max results

    Returns:
        List of matching bill result dicts
    """
    data = search_govinfo(query, collection="BILLS", page_size=page_size)
    return data.get("results", [])


# ============================================================================
# OTHER COLLECTIONS — Extensible for future use
# ============================================================================

COLLECTION_CODES = {
    "CREC": "Congressional Record",
    "BILLS": "Congressional Bills",
    "FR": "Federal Register",
    "PLAW": "Public Laws",
    "STATUTE": "Statutes at Large",
    "HMAN": "House Manual",
    "SMAN": "Senate Manual",
    "CFR": "Code of Federal Regulations",
    "USCODE": "United States Code",
    "CHRG": "Congressional Hearings",
    "CDOC": "Congressional Documents",
    "CRPT": "Congressional Reports",
    "COMPS": "Compilations",
    "GOVPUB": "Government Publications",
}


def list_collections() -> Dict[str, str]:
    """Return available GovInfo collection codes and names."""
    return COLLECTION_CODES.copy()


def fetch_collection(
    collection_code: str,
    start_date: str,
    end_date: str,
    page_size: int = 100,
    max_pages: int = 5
) -> List[Dict[str, Any]]:
    """
    Generic collection fetcher — works with any GovInfo collection.

    Uses the /published/{date} endpoint (more reliable than /collections/).

    Args:
        collection_code: Collection code (CREC, BILLS, FR, etc.)
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
        page_size: Results per page
        max_pages: Max pages to fetch

    Returns:
        List of package metadata dicts
    """
    all_packages = []
    seen_ids = set()
    start_date = start_date[:10]

    try:
        data = http_client.get_govinfo(
            f"published/{start_date}",
            params={
                "collection": collection_code,
                "pageSize": page_size,
                "offsetMark": "*",
            },
            use_cache=True,
        )

        for pkg in data.get("packages", []):
            pkg_id = pkg.get("packageId", "")
            if pkg_id not in seen_ids:
                seen_ids.add(pkg_id)
                all_packages.append(pkg)

        pages_fetched = 1
        while data.get("nextPage") and pages_fetched < max_pages:
            time.sleep(POLITE_DELAY)
            try:
                import requests as _req
                data = _req.get(
                    data["nextPage"],
                    params={"api_key": config.GOVINFO_API_KEY},
                    timeout=30,
                ).json()
                for pkg in data.get("packages", []):
                    pkg_id = pkg.get("packageId", "")
                    if pkg_id not in seen_ids:
                        seen_ids.add(pkg_id)
                        all_packages.append(pkg)
                pages_fetched += 1
            except Exception as e:
                logger.error("GovInfo pagination failed: %s", e)
                break

    except HTTPError as e:
        logger.error("GovInfo %s fetch failed: %s", collection_code, e)

    logger.info("Fetched %d %s packages from %s", len(all_packages), collection_code, start_date)
    return all_packages


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys

    setup_logging("INFO")

    if not config.GOVINFO_API_KEY:
        print("ERROR: API_KEY_DATA_GOV not set in .env")
        sys.exit(1)

    print("GovInfo Connector Test")
    print("=" * 60)

    # Test 1: Fetch recent CREC packages
    print("\n1. Fetching CREC packages from last 3 days...")
    packages = fetch_recent_crec(days=3, page_size=5)
    print(f"   Found {len(packages)} packages")
    for pkg in packages[:3]:
        print(f"   - {pkg.get('packageId', 'unknown')}: {pkg.get('title', 'no title')[:80]}")

    # Test 2: Search CREC
    print("\n2. Searching CREC for 'appropriations'...")
    results = search_crec("appropriations", page_size=5)
    print(f"   Found {len(results)} results")
    for r in results[:3]:
        print(f"   - {r.get('title', 'no title')[:80]}")

    # Test 3: Fetch granules from first package (if any)
    if packages:
        pkg_id = packages[0].get("packageId")
        print(f"\n3. Fetching granules for {pkg_id}...")
        granules = fetch_package_granules(pkg_id, page_size=5)
        print(f"   Found {len(granules)} granules")
        for g in granules[:3]:
            print(f"   - {g.get('granuleId', 'unknown')}: {g.get('title', 'no title')[:80]}")

    print("\n" + "=" * 60)
    print("GovInfo connector test complete.")
