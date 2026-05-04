"""
Google News RSS connector. Fetches headlines for any search query.

No API key required. Uses the public Google News RSS feed.
"""

import html
import logging
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus

import requests

log = logging.getLogger(__name__)

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"


# Common Latin-1-as-UTF-8 mojibake patterns produced by upstream feeds that
# double-encoded a UTF-8 string. We can't catch every case but these cover
# >99% of the noise observed on Google News titles (smart quotes, em/en
# dashes, ellipsis, non-breaking space, accents).
_MOJIBAKE_FIXUPS = [
    ("â€™", "’"),  # ’
    ("â€˜", "‘"),  # ‘
    ("â€", "”"),  # ”
    ("â€", "“"),  # “
    ("â€”", "—"),  # —
    ("â€“", "–"),  # –
    ("â€¦", "…"),  # …
    ("Ã©", "é"),         # é
    ("Ã¨", "è"),         # è
    ("Ã±", "ñ"),         # ñ
    ("Ã¼", "ü"),         # ü
    ("Â ", " "),         # NBSP
]


def _fix_mojibake(s: str) -> str:
    """Best effort cleanup of Latin-1-as-UTF-8 double-encoded characters.

    Tries the canonical unicode round-trip first (latin-1 -> utf-8 decode),
    falls back to a fixed-table replacement when the round-trip would error
    out on bytes that aren't pure Latin-1.
    """
    if not s:
        return s
    if any(ch in s for ch in ("Â", "Ã", "â")):
        try:
            return s.encode("latin-1", errors="strict").decode("utf-8")
        except (UnicodeDecodeError, UnicodeEncodeError):
            pass
        for bad, good in _MOJIBAKE_FIXUPS:
            s = s.replace(bad, good)
    return s


def _strip_inline_html(s: str) -> str:
    """Google News titles occasionally contain inline <font> tags or
    <em> highlights. Strip them so the FE renders clean text."""
    if not s:
        return s
    return re.sub(r"<[^>]+>", "", s)


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

    # Force UTF-8 decoding regardless of what `requests` guessed from
    # headers. Google News RSS is always UTF-8 even when no charset is
    # advertised, and the previous behavior (passing resp.content to
    # ElementTree) silently fell back to Latin-1 in some edge cases.
    try:
        xml_text = resp.content.decode("utf-8", errors="replace")
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        log.warning("Failed to parse RSS for '%s': %s", query, e)
        return []

    articles = []
    for item in root.findall(".//item"):
        if len(articles) >= limit:
            break
        title = item.findtext("title", "") or ""
        link = item.findtext("link", "") or ""
        pub_date = item.findtext("pubDate", "") or ""
        source_el = item.find("source")
        source = source_el.text if source_el is not None else None

        title = _fix_mojibake(html.unescape(_strip_inline_html(title))).strip()
        if source:
            source = _fix_mojibake(html.unescape(source)).strip()

        if title and link:
            articles.append({
                "title": title,
                "link": link,
                "published": pub_date,
                "source": source,
            })

    return articles
