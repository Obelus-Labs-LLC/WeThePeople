"""
Shared Twitter/X utilities — consolidated helpers used by twitter_bot,
twitter_monitor, and twitter_reply.

Eliminates code duplication across the 3 bot files. All shared logic lives here:
- API fetching with exponential backoff
- Money formatting
- Content hashing / dedup
- Entity recency checks (SQL-optimized)
- URL construction with UTM tracking
- Content moderation / safety filters
- Posting time optimization
"""

import hashlib
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import requests
from sqlalchemy import func as sa_func

log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

# Paid tier: Basic ($200/month) = 3,000 posts/month = ~100/day
# We target 10-12 posts/day (bot + monitor + replies) = ~330/month
# This leaves 90% headroom for growth.
TIER = "basic"
MONTHLY_POST_LIMIT = 3000
DAILY_POST_TARGET = 12  # Conservative target (well under 100/day max)
MAX_POSTS_PER_DAY = 15  # Hard cap per day across all systems

# Sites — always with protocol
SITE = "https://wethepeopleforus.com"
JOURNAL_SITE = "https://journal.wethepeopleforus.com"
RESEARCH_SITE = "https://research.wethepeopleforus.com"
VERIFY_SITE = "https://verify.wethepeopleforus.com"

# Bot identity
OUR_USERNAME = "WTPForUs"
OUR_DISPLAY_NAME = "WeThePeople"

# Kill switch: set WTP_BOT_PAUSED=1 to immediately halt ALL posting
# without redeploying. Check this before every post attempt.
PAUSED = os.getenv("WTP_BOT_PAUSED", "0") == "1"

# API configuration
API_BASE = os.getenv("WTP_API_URL", "http://localhost:8006")
API_TIMEOUT = 20  # seconds
API_MAX_RETRIES = 3
API_BACKOFF_BASE = 2  # exponential backoff: 2s, 4s, 8s


# ── Kill Switch ────────────────────────────────────────────────────────────────

def is_paused() -> bool:
    """Check kill switch. Re-reads env var each call for hot-reload capability."""
    # Check env var (can be changed without restart via systemd override)
    if os.getenv("WTP_BOT_PAUSED", "0") == "1":
        return True
    # Check flag file (can be created via SSH without service restart)
    pause_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".bot_paused")
    if os.path.exists(pause_file):
        return True
    return False


# ── API Helpers (with exponential backoff) ─────────────────────────────────────

def api_get(path: str, params: dict = None, timeout: int = None) -> dict:
    """Fetch from WTP API with exponential backoff on failure.

    Retries up to API_MAX_RETRIES times with exponential backoff.
    Returns empty dict on total failure (never raises).
    """
    url = f"{API_BASE}{path}"
    timeout = timeout or API_TIMEOUT

    for attempt in range(API_MAX_RETRIES):
        try:
            r = requests.get(url, params=params or {}, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.HTTPError as e:
            # Don't retry on 4xx client errors (except 429 rate limit)
            if r.status_code < 500 and r.status_code != 429:
                log.warning("API %s returned %d: %s", path, r.status_code, e)
                return {}
            log.warning("API %s attempt %d/%d failed (HTTP %d): %s",
                        path, attempt + 1, API_MAX_RETRIES, r.status_code, e)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
            log.warning("API %s attempt %d/%d failed (network): %s",
                        path, attempt + 1, API_MAX_RETRIES, e)
        except Exception as e:
            log.warning("API %s attempt %d/%d failed (unexpected): %s",
                        path, attempt + 1, API_MAX_RETRIES, e)

        if attempt < API_MAX_RETRIES - 1:
            wait = API_BACKOFF_BASE ** (attempt + 1)
            log.info("Retrying API %s in %ds...", path, wait)
            time.sleep(wait)

    # Total failure — retries exhausted. Log at CRITICAL so it shows in
    # dashboards/alerts, and bump the error counter so /metrics reflects
    # the outage. Callers that can tolerate `{}` (e.g. twitter_bot.run
    # falls back to DB-only "story" category via api_healthy()) will still
    # work, but operators now have a signal to react to.
    log.critical("API %s failed after %d attempts — returning empty dict; caller should degrade gracefully", path, API_MAX_RETRIES)
    try:
        from routers.metrics import record_error
        record_error()
    except Exception:
        pass
    return {}


def api_healthy() -> bool:
    """Check if the WTP API is up and serving data."""
    try:
        r = requests.get(f"{API_BASE}/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


# ── Formatting ─────────────────────────────────────────────────────────────────

def fmt_money(n: float) -> str:
    """Format a dollar amount for tweet display."""
    if not n or n <= 0:
        return "$0"
    if n >= 1_000_000_000:
        return f"${n / 1_000_000_000:.1f}B"
    if n >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"${n / 1_000:.0f}K"
    return f"${n:,.0f}"


def fmt_count(n: int, singular: str, plural: str = None) -> str:
    """Format a count with proper singular/plural."""
    plural = plural or f"{singular}s"
    return f"{n:,} {singular if n == 1 else plural}"


# ── Content Hashing & Deduplication ────────────────────────────────────────────

def content_hash(text: str) -> str:
    """SHA-256 hash for tweet deduplication."""
    return hashlib.sha256(text.encode()).hexdigest()


def entity_tweeted_recently(session, entity_name: str, days: int = 3) -> bool:
    """Check if we tweeted about this entity in the last N days.

    Uses SQL LIKE filtering instead of loading all tweets into memory.
    This is the correct, performant approach for growing tweet volumes.
    """
    from models.twitter_models import TweetLog

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    # Use SQL LIKE for case-insensitive search (SQLite LIKE is case-insensitive for ASCII)
    pattern = f"%{entity_name}%"
    count = (
        session.query(sa_func.count(TweetLog.id))
        .filter(
            TweetLog.posted_at >= cutoff,
            TweetLog.text.ilike(pattern),
        )
        .scalar()
    )
    return count > 0


def already_posted(session, text: str) -> bool:
    """Check if this exact content was already posted (by hash)."""
    from models.twitter_models import TweetLog
    h = content_hash(text)
    return session.query(TweetLog).filter_by(content_hash=h).first() is not None


def posts_today(session) -> int:
    """Count ALL tweets posted today (UTC midnight boundary)."""
    from models.twitter_models import TweetLog
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    for attempt in range(3):
        try:
            return session.query(TweetLog).filter(TweetLog.posted_at >= today).count()
        except Exception as e:
            if attempt < 2:
                log.warning("DB locked on posts_today, retry %d/3: %s", attempt + 1, e)
                time.sleep(2)
            else:
                log.error("Failed posts_today after 3 attempts, assuming 0: %s", e)
                return 0


def log_tweet(session, tweet_id: str, category: str, text: str,
              reply_to: str = None, engagement: dict = None):
    """Log a posted tweet with retry on DB lock.

    Args:
        session: SQLAlchemy session
        tweet_id: The posted tweet's ID
        category: Tweet category (story, quote, data, etc.)
        text: Full tweet text
        reply_to: Optional original tweet ID this was a reply/quote to
        engagement: Optional initial engagement metrics dict
    """
    from models.twitter_models import TweetLog

    tagged_text = f"[reply_to:{reply_to}] {text}" if reply_to else text

    for attempt in range(3):
        try:
            session.add(TweetLog(
                tweet_id=tweet_id,
                category=category,
                content_hash=content_hash(tagged_text),
                text=tagged_text,
            ))
            session.commit()
            return
        except Exception as e:
            session.rollback()
            if attempt < 2:
                log.warning("DB locked on log_tweet, retry %d/3: %s", attempt + 1, e)
                time.sleep(2)
            else:
                log.error("Failed to log tweet after 3 attempts: %s", e)


# ── URL Construction with UTM Tracking ─────────────────────────────────────────

def build_url(path: str, campaign: str = "bot", source: str = "twitter",
              medium: str = "social", site: str = None) -> str:
    """Build a tracked URL with UTM parameters.

    Args:
        path: URL path (e.g., "/politics/person/123" or "/story/slug")
        campaign: UTM campaign name (e.g., "story", "data", "anomaly")
        source: UTM source (default: "twitter")
        medium: UTM medium (default: "social")
        site: Base site URL (defaults to SITE)

    Returns:
        Full URL with UTM parameters
    """
    base = site or SITE
    # Ensure path starts with /
    if path and not path.startswith("/"):
        path = f"/{path}"
    url = f"{base}{path}"
    # Add UTM params
    separator = "&" if "?" in url else "?"
    url += f"{separator}utm_source={source}&utm_medium={medium}&utm_campaign={campaign}"
    return url


def build_profile_url(sector: str, entity_id: str, campaign: str = "bot") -> str:
    """Build a tracked entity profile URL."""
    if sector == "politics":
        path = f"/politics/person/{entity_id}"
    elif sector == "finance":
        path = f"/finance/company/{entity_id}"
    else:
        path = f"/{sector}/company/{entity_id}"
    return build_url(path, campaign=campaign)


def build_journal_url(slug: str, campaign: str = "story") -> str:
    """Build a tracked journal story URL."""
    return build_url(f"/story/{slug}", campaign=campaign, site=JOURNAL_SITE)


# ── Content Quality & Safety ───────────────────────────────────────────────────

# Words/phrases that should never appear in automated tweets
BLOCKED_CONTENT = [
    # Offensive/inappropriate
    r'\b(fuck|shit|damn|ass|bitch)\b',
    # Accusations of crime (we present data, not accusations)
    r'\b(corrupt|criminal|crook|fraud|thief|stole|stealing)\b',
    # Definitive causation claims (we show correlation)
    r'\b(bribe[ds]?|bribery|kickback|payoff|bought off)\b',
]

# Insinuation phrases to avoid (present data neutrally)
LOADED_LANGUAGE = [
    "Coincidence?",
    "Totally unrelated, surely.",
    "Just good timing, right?",
    "Timing is everything.",
    "The money always arrives on time.",
    "Connected for the first time.",
]


def content_is_safe(text: str) -> bool:
    """Check tweet text against content moderation filters.

    Returns True if safe to post, False if content contains blocked patterns.
    """
    text_lower = text.lower()
    for pattern in BLOCKED_CONTENT:
        if re.search(pattern, text_lower, re.IGNORECASE):
            log.warning("Content blocked by safety filter: matched pattern '%s'", pattern)
            return False
    return True


def neutralize_language(text: str) -> str:
    """Remove loaded/insinuation language and replace with neutral alternatives.

    We present public record data. We do not imply wrongdoing.
    """
    replacements = {
        "Coincidence?": "The public record shows the connection.",
        "Totally unrelated, surely.": "Both are documented in public filings.",
        "Just good timing, right?": "The timeline is documented in public filings.",
        "Timing is everything.": "The timeline is publicly documented.",
        "The money always arrives on time.": "The timing is documented in FEC filings.",
        "Connected for the first time.": "Cross-referenced from public records.",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def validate_tweet_length(text: str, max_length: int = 4000) -> str:
    """Validate and optionally truncate tweet text.

    For verified accounts, X allows up to 25,000 chars, but optimal
    engagement is at 100-280 chars for short tweets, or 1000-4000
    for long-form content. We cap at 4000 for readability.

    Args:
        text: Tweet text to validate
        max_length: Maximum allowed length (default 4000 for long-form)

    Returns:
        Text, truncated if necessary with proper word boundary
    """
    if len(text) <= max_length:
        return text

    # Truncate at word boundary
    truncated = text[:max_length - 3]
    last_space = truncated.rfind(" ")
    if last_space > max_length - 100:
        truncated = truncated[:last_space]
    return truncated + "..."


def strip_markdown(text: str) -> str:
    """Strip markdown formatting that renders as raw text on Twitter/X.

    Removes: **bold**, *italic*, | table | rows, markdown headings.
    Preserves: $dollar amounts, #hashtags, plain text.
    """
    # Remove markdown bold/italic
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    # Remove markdown table rows
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # Skip table separator rows (|---|---|)
        if stripped and all(c in '|-: ' for c in stripped):
            continue
        # Convert table data rows to readable format
        if stripped.startswith('|') and stripped.endswith('|'):
            cells = [c.strip() for c in stripped.strip('|').split('|')]
            cells = [c for c in cells if c]
            if cells:
                cleaned.append(' | '.join(cells))
        else:
            cleaned.append(line)
    text = '\n'.join(cleaned)
    # Remove markdown headings (## Heading -> Heading)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Clean up excess whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


# ── Entity Matching Safety ─────────────────────────────────────────────────────

# Minimum name length for substring matching (prevents false positives)
MIN_MATCH_LENGTH = 8

# Common words that happen to be politician last names or company substrings
# These should never trigger a match on their own
FALSE_POSITIVE_NAMES = {
    "JOHNSON", "SMITH", "BROWN", "YOUNG", "WHITE", "GREEN", "KING",
    "HILL", "LONG", "BLACK", "RICE", "LOVE", "CASH", "CHASE",
    "WELLS", "BAKER", "COOK", "CARTER", "FORD", "CLAY", "GRANT",
    "BUSH", "ROSE", "STONE", "BELL", "REED", "FOX", "WOLF",
    "META", "APPLE", "AMAZON", "DELTA", "TARGET", "PIONEER",
}


def is_safe_entity_match(key: str, text: str) -> bool:
    """Validate that an entity match is genuine, not a false positive.

    Prevents matching common words as entity names. Requires:
    1. Key is at least MIN_MATCH_LENGTH chars (or is a multi-word name)
    2. Key is not in the FALSE_POSITIVE_NAMES set (for single words)
    3. For single-word names, requires word boundary match

    Args:
        key: The entity name/key being matched (uppercase)
        text: The source text being searched (uppercase)

    Returns:
        True if the match is safe to use
    """
    # Multi-word names are generally safe (e.g., "ELIZABETH WARREN")
    if " " in key:
        return key in text

    # Single-word checks
    if key in FALSE_POSITIVE_NAMES:
        return False

    if len(key) < MIN_MATCH_LENGTH:
        return False

    # Require word boundary match for single words
    pattern = r'\b' + re.escape(key) + r'\b'
    return bool(re.search(pattern, text))


# ── Disclaimer & Source Attribution ────────────────────────────────────────────

# Official government source names for attribution
SOURCE_DB_MAP = {
    "lobbying_records": "Senate LDA Filings",
    "health_lobbying_records": "Senate LDA Filings",
    "finance_lobbying_records": "Senate LDA Filings",
    "tech_lobbying_records": "Senate LDA Filings",
    "energy_lobbying_records": "Senate LDA Filings",
    "defense_lobbying_records": "Senate LDA Filings",
    "chemical_lobbying_records": "Senate LDA Filings",
    "agriculture_lobbying_records": "Senate LDA Filings",
    "transportation_lobbying_records": "Senate LDA Filings",
    "education_lobbying_records": "Senate LDA Filings",
    "telecom_lobbying_records": "Senate LDA Filings",
    "government_contracts": "USASpending.gov",
    "health_government_contracts": "USASpending.gov",
    "finance_government_contracts": "USASpending.gov",
    "defense_government_contracts": "USASpending.gov",
    "energy_government_contracts": "USASpending.gov",
    "chemical_government_contracts": "USASpending.gov",
    "agriculture_government_contracts": "USASpending.gov",
    "transportation_government_contracts": "USASpending.gov",
    "education_government_contracts": "USASpending.gov",
    "telecom_government_contracts": "USASpending.gov",
    "congressional_trades": "House Financial Disclosures",
    "company_donations": "FEC Campaign Finance Data",
    "committees": "congress-legislators (CC0)",
    "committee_memberships": "congress-legislators (CC0)",
    "votes": "Senate.gov Roll Call Votes",
    "enforcement_actions": "Federal Agency Records",
}


def format_sources(data_sources: list, max_sources: int = 4) -> str:
    """Format data source attribution for tweet footer.

    Args:
        data_sources: List of internal table names
        max_sources: Maximum sources to display

    Returns:
        Formatted source line, e.g., "Data: Senate LDA Filings, USASpending.gov"
    """
    if not data_sources:
        return ""
    # Deduplicate while preserving order
    db_names = list(dict.fromkeys(
        SOURCE_DB_MAP.get(s, s.replace('_', ' ').title())
        for s in data_sources
    ))
    return f"Data: {', '.join(db_names[:max_sources])}"


def data_freshness_note() -> str:
    """Return a freshness timestamp for data claims.

    Adds 'as of [month year]' context so readers know data recency.
    """
    now = datetime.now(timezone.utc)
    return f"(as of {now.strftime('%B %Y')})"


# ── Hashtag Strategy ───────────────────────────────────────────────────────────

# Category-specific hashtags (more targeted than generic ones)
CATEGORY_HASHTAGS = {
    "lobbying": ["#CorporateLobbying", "#LobbyingData", "#FollowTheMoney"],
    "trades": ["#CongressTrades", "#STOCKAct", "#CongressionalTrading"],
    "contracts": ["#GovernmentContracts", "#FederalSpending", "#FollowTheMoney"],
    "enforcement": ["#Accountability", "#RegulatoryEnforcement", "#CorporateAccountability"],
    "donations": ["#CampaignFinance", "#DarkMoney", "#FollowTheMoney"],
    "anomaly": ["#PublicRecord", "#FollowTheMoney", "#CivicTransparency"],
    "story": ["#Investigation", "#PublicRecord", "#FollowTheMoney"],
    "general": ["#FollowTheMoney", "#CivicTransparency", "#OpenData"],
}


def pick_hashtags(category: str, count: int = 2) -> list:
    """Pick relevant hashtags for a tweet category.

    Args:
        category: Content category (lobbying, trades, contracts, etc.)
        count: Number of hashtags to include

    Returns:
        List of hashtag strings
    """
    import random
    tags = CATEGORY_HASHTAGS.get(category, CATEGORY_HASHTAGS["general"])
    return random.sample(tags, min(count, len(tags)))


# ── Posting Time Optimization ──────────────────────────────────────────────────

# Optimal posting hours for US audience (Eastern Time = UTC-4 / UTC-5)
# Peak engagement on X: 8-10am ET, 12-1pm ET, 5-7pm ET, 9-10pm ET
# In UTC (EDT, offset -4):
#   8am ET = 12:00 UTC
#   9am ET = 13:00 UTC
#   12pm ET = 16:00 UTC
#   1pm ET = 17:00 UTC
#   5pm ET = 21:00 UTC
#   7pm ET = 23:00 UTC
#   9pm ET = 01:00 UTC (next day)
OPTIMAL_POSTING_HOURS_UTC = [12, 13, 16, 17, 21, 23, 1]


def is_optimal_posting_time() -> bool:
    """Check if current time is within an optimal posting window.

    Used for scheduling decisions — not a hard gate, just advisory.
    """
    current_hour = datetime.now(timezone.utc).hour
    return current_hour in OPTIMAL_POSTING_HOURS_UTC
