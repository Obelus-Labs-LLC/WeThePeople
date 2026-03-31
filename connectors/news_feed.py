"""
Google News RSS connector — fetches headlines for any search query.

No API key required. Uses the public Google News RSS feed.
"""

import logging
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

import requests

log = logging.getLogger(__name__)

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"


def fetch_news(query: str, limit: int = 10) -> list[dict]:
    """Fetch recent news headlines from Google News RSS.

    Returns a list of dicts with: title, link, published, source.
    """
    url = GOOGLE_NEWS_RSS.format(query=quote_plus(query))
    try:
        resp = requests.get(url, timeout=10, headers={"User-Agent": "WTP-Research/1.0"})
        resp.raise_for_status()
    except Exception as e:
        log.warning("Google News RSS fetch failed for '%s': %s", query, e)
        return []

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        log.warning("Failed to parse RSS for '%s': %s", query, e)
        return []

    articles = []
    for item in root.findall(".//item"):
        if len(articles) >= limit:
            break
        title = item.findtext("title", "")
        link = item.findtext("link", "")
        pub_date = item.findtext("pubDate", "")
        source_el = item.find("source")
        source = source_el.text if source_el is not None else None

        if title and link:
            articles.append({
                "title": title,
                "link": link,
                "published": pub_date,
                "source": source,
            })

    return articles
