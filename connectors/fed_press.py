"""
Federal Reserve Press Releases Connector

Fetch Fed press releases (FOMC statements, policy announcements)
from the Federal Reserve Board RSS feeds.

Source: https://www.federalreserve.gov/feeds/
Rate limit: Be polite (1s between calls)
Auth: None required
"""

import hashlib
import time
import re
import requests
from datetime import datetime
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

# Fed RSS feeds for press releases
FED_RSS_URL = "https://www.federalreserve.gov/feeds/press_all.xml"

POLITE_DELAY = 1.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _parse_rss_date(date_str: str) -> Optional[datetime]:
    """Parse RSS date formats (RFC 822 / RFC 2822)."""
    if not date_str:
        return None
    # Common RSS date formats
    formats = [
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except (ValueError, TypeError):
            continue
    return None


def fetch_press_releases(
    limit: int = 500,
    feed_url: str = FED_RSS_URL,
) -> List[Dict[str, Any]]:
    """
    Fetch Federal Reserve press releases from RSS feed.

    Args:
        limit: Max releases to return
        feed_url: RSS feed URL (defaults to all press releases)

    Returns:
        List of release dicts with keys: title, link, published_at,
        category, summary, dedupe_hash
    """
    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            feed_url,
            headers={
                "User-Agent": "WeThePeople/1.0 (contact@wethepeopleforus.com)",
                "Accept": "application/rss+xml, application/xml, text/xml",
            },
            timeout=30,
        )
        resp.raise_for_status()
        xml_text = resp.text
    except Exception as e:
        logger.error("Fed RSS fetch failed: %s", e)
        return []

    # Parse XML manually to avoid requiring lxml/feedparser dependency
    results = _parse_rss_xml(xml_text, limit)

    logger.info("Fed press releases: %d items fetched", len(results))
    return results


def _parse_rss_xml(xml_text: str, limit: int) -> List[Dict[str, Any]]:
    """Parse RSS XML for item entries. Simple regex-based parser."""
    results = []

    # Extract items
    items = re.findall(r'<item>(.*?)</item>', xml_text, re.DOTALL)

    for item_xml in items[:limit]:
        title = _extract_tag(item_xml, "title")
        link = _extract_tag(item_xml, "link")
        pub_date = _extract_tag(item_xml, "pubDate")
        category = _extract_tag(item_xml, "category")
        description = _extract_tag(item_xml, "description")

        if not title or not link:
            continue

        published_at = _parse_rss_date(pub_date)

        # Clean HTML from description
        summary = re.sub(r'<[^>]+>', '', description or '').strip()[:500]

        results.append({
            "title": title.strip(),
            "link": link.strip(),
            "published_at": published_at,
            "category": category.strip() if category else None,
            "summary": summary if summary else None,
            "dedupe_hash": _compute_hash(link.strip()),
        })

    return results


def _extract_tag(xml: str, tag: str) -> Optional[str]:
    """Extract content from an XML tag. Handles CDATA sections."""
    # Try CDATA first
    pattern = rf'<{tag}[^>]*>\s*<!\[CDATA\[(.*?)\]\]>\s*</{tag}>'
    match = re.search(pattern, xml, re.DOTALL)
    if match:
        return match.group(1)

    # Plain content
    pattern = rf'<{tag}[^>]*>(.*?)</{tag}>'
    match = re.search(pattern, xml, re.DOTALL)
    if match:
        return match.group(1)

    # Self-closing link tags (RSS puts link as text after tag sometimes)
    if tag == "link":
        pattern = r'<link[^>]*/>\s*([^\s<]+)'
        match = re.search(pattern, xml)
        if match:
            return match.group(1)

    return None
