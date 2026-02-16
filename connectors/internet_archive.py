"""
Internet Archive Connector — Wayback Machine Archival

Provides immutable citations for claim source URLs. Politicians delete
press releases; the Wayback Machine preserves them.

Key operations:
- Check if a URL has been archived (public, no auth needed)
- Request archival of a URL (Save Page Now, auth optional)
- Get the archived snapshot URL

API docs: https://archive.org/help/wayback_api.php
Auth: S3 keys for authenticated saves (higher priority); public for reads
Rate limit: Be polite — 1s between calls, 15s between save requests
"""

import time
import requests
from typing import Optional, Dict, Any, List

from utils.config import config
from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Delays between API calls (seconds)
AVAILABILITY_DELAY = 0.5  # Between availability checks
SAVE_DELAY = 15.0  # Between save requests (rate limited)

WAYBACK_BASE = "https://web.archive.org"
AVAILABILITY_API = "https://archive.org/wayback/available"


# ============================================================================
# AVAILABILITY — Check if a URL has been archived
# ============================================================================

def get_archived_url(url: str, timestamp: Optional[str] = None) -> Optional[str]:
    """
    Check if a URL has a Wayback Machine snapshot.

    Args:
        url: URL to check
        timestamp: Optional timestamp (YYYYMMDD or YYYYMMDDHHmmSS) to find
                   closest snapshot. If None, returns the most recent.

    Returns:
        Archived snapshot URL, or None if not archived
    """
    params: Dict[str, str] = {"url": url}
    if timestamp:
        params["timestamp"] = timestamp

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.get(AVAILABILITY_API, params=params, timeout=15)

            if response.status_code == 429:
                wait = (attempt + 1) * 5
                logger.warning("Wayback 429 rate limited, waiting %ds (attempt %d/%d)", wait, attempt + 1, max_retries)
                time.sleep(wait)
                continue

            response.raise_for_status()
            data = response.json()

            snapshots = data.get("archived_snapshots", {})
            closest = snapshots.get("closest")

            if closest and closest.get("available"):
                archived_url = closest.get("url")
                logger.info("Found snapshot for %s: %s", url, archived_url)
                return archived_url

            logger.info("No snapshot found for %s", url)
            return None

        except requests.RequestException as e:
            logger.error("Wayback availability check failed for %s: %s", url, e)
            if attempt < max_retries - 1:
                time.sleep((attempt + 1) * 3)
            else:
                return None

    return None


def check_multiple_urls(urls: List[str]) -> Dict[str, Optional[str]]:
    """
    Check availability of multiple URLs (with polite delay).

    Args:
        urls: List of URLs to check

    Returns:
        Dict mapping each URL to its snapshot URL (or None)
    """
    results = {}
    for url in urls:
        results[url] = get_archived_url(url)
        time.sleep(AVAILABILITY_DELAY)
    return results


# ============================================================================
# SAVE PAGE NOW — Request archival of a URL
# ============================================================================

def request_archive(url: str, use_auth: bool = True) -> Optional[str]:
    """
    Request the Wayback Machine to archive a URL (Save Page Now).

    Uses S3 credentials if available for higher priority queue.

    Args:
        url: URL to archive
        use_auth: Whether to use S3 auth (higher priority)

    Returns:
        Archived snapshot URL if successful, None otherwise
    """
    save_url = f"{WAYBACK_BASE}/save/{url}"

    headers = {}
    if use_auth and config.IA_S3_ACCESS and config.IA_S3_SECRET:
        headers["Authorization"] = f"LOW {config.IA_S3_ACCESS}:{config.IA_S3_SECRET}"
        headers["Accept"] = "application/json"

    try:
        response = requests.get(save_url, headers=headers, timeout=30, allow_redirects=True)

        # The Save Page Now API returns a redirect to the archived page
        if response.status_code in (200, 302):
            # Check if the final URL is an archive URL
            final_url = response.url
            if "web.archive.org/web/" in final_url:
                logger.info("Archived %s -> %s", url, final_url)
                return final_url

            # Try to extract from response headers
            content_location = response.headers.get("Content-Location")
            if content_location:
                snapshot = f"{WAYBACK_BASE}{content_location}"
                logger.info("Archived %s -> %s", url, snapshot)
                return snapshot

            # Still try the availability API as fallback
            time.sleep(2)
            return get_archived_url(url)

        logger.warning("Save Page Now returned %d for %s", response.status_code, url)
        return None

    except requests.RequestException as e:
        logger.error("Save Page Now failed for %s: %s", url, e)
        return None


def get_or_create_archive(url: str) -> Optional[str]:
    """
    Get existing snapshot or create one if missing.

    This is the primary function for the pipeline — "fire and forget"
    archival of claim source URLs.

    Args:
        url: URL to archive

    Returns:
        Archived snapshot URL (existing or newly created), or None
    """
    # First check if already archived
    existing = get_archived_url(url)
    if existing:
        return existing

    # Not archived yet — request archival
    logger.info("No existing snapshot for %s, requesting archive...", url)
    time.sleep(SAVE_DELAY)  # Polite delay before save
    return request_archive(url)


def archive_urls_batch(
    urls: List[str],
    skip_existing: bool = True
) -> Dict[str, Optional[str]]:
    """
    Archive a batch of URLs (with polite delays).

    Args:
        urls: List of URLs to archive
        skip_existing: If True, skip URLs that are already archived

    Returns:
        Dict mapping each URL to its snapshot URL (or None)
    """
    results = {}
    total = len(urls)

    for i, url in enumerate(urls, 1):
        logger.info("Processing URL %d/%d: %s", i, total, url[:80])

        if skip_existing:
            existing = get_archived_url(url)
            if existing:
                results[url] = existing
                time.sleep(AVAILABILITY_DELAY)
                continue

        # Request archival
        results[url] = request_archive(url)
        time.sleep(SAVE_DELAY)

    archived = sum(1 for v in results.values() if v)
    logger.info("Batch complete: %d/%d URLs archived", archived, total)
    return results


# ============================================================================
# SNAPSHOT URL BUILDER
# ============================================================================

def build_snapshot_url(url: str, timestamp: str = "*") -> str:
    """
    Build a Wayback Machine URL for direct access.

    Args:
        url: Original URL
        timestamp: Timestamp (YYYYMMDD or * for most recent)

    Returns:
        Wayback Machine URL
    """
    return f"{WAYBACK_BASE}/web/{timestamp}/{url}"


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys

    setup_logging("INFO")

    print("Internet Archive Connector Test")
    print("=" * 60)

    # Test 1: Check availability of a well-known URL
    test_url = "https://www.congress.gov"
    print(f"\n1. Checking if {test_url} is archived...")
    snapshot = get_archived_url(test_url)
    if snapshot:
        print(f"   Found: {snapshot}")
    else:
        print("   Not found (unexpected for congress.gov)")

    # Test 2: Check a congressional press release
    press_url = "https://www.sanders.senate.gov/press-releases"
    print(f"\n2. Checking Sanders press releases page...")
    snapshot = get_archived_url(press_url)
    if snapshot:
        print(f"   Found: {snapshot}")
    else:
        print("   Not archived yet")

    # Test 3: Build snapshot URL
    print(f"\n3. Building snapshot URL...")
    built = build_snapshot_url("https://www.congress.gov", "20250101")
    print(f"   {built}")

    # Test 4: Auth status
    print(f"\n4. S3 Auth status:")
    if config.IA_S3_ACCESS and config.IA_S3_SECRET:
        print(f"   Configured (access key: {config.IA_S3_ACCESS[:4]}...)")
    else:
        print("   Not configured (will use public API)")

    print("\n" + "=" * 60)
    print("Internet Archive connector test complete.")
