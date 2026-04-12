"""
Twitter Reply-with-Data CLI — quote-tweet political tweets with WTP data.

Finds an entity in WTP's database, pulls real data (lobbying, contracts,
enforcement, trades, donations, anomalies), composes a factual quote-tweet
with a link to the entity's WTP profile, and posts it.

IMPORTANT: Direct replies are DISABLED. Per X's 2026 API rules, API replies
only succeed if the original author @mentioned you (unless Enterprise tier).
All responses are posted as quote-tweets instead.

Modes:
    --quote (default): Post as a quote-tweet of the target tweet.
    --auto-quote: Search monitored accounts for tweets mentioning entities
                  we track, then queue quote-tweets for human approval.

Usage:
    python jobs/twitter_reply.py --tweet-id 123456789 --entity "Pfizer"
    python jobs/twitter_reply.py --tweet-id 123456789 --entity "Elizabeth Warren" --type politician
    python jobs/twitter_reply.py --auto-quote --dry-run
    python jobs/twitter_reply.py --dry-run --tweet-id 123456789 --entity "Lockheed Martin"

Safety:
    - Quote-only mode (no direct replies — X API restriction)
    - Max 10 quotes per day
    - Max 3 auto-quote-tweets per hour
    - Won't quote the same tweet twice
    - Won't quote our own tweets
    - All auto-quotes require human approval (drafts-only by default)
    - Content safety filter on all generated text
    - --dry-run shows the quote without posting
"""

import json
import os
import sys
import argparse
import logging
import random
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.twitter import post_tweet, search_recent_tweets, get_user_tweets, is_own_tweet
from models.database import SessionLocal
from models.twitter_models import TweetLog, DraftReply
from utils.twitter_helpers import (
    SITE, JOURNAL_SITE, OUR_USERNAME, MAX_POSTS_PER_DAY,
    api_get, is_paused,
    fmt_money, content_hash, entity_tweeted_recently,
    posts_today, log_tweet,
    build_url, build_profile_url,
    content_is_safe, neutralize_language, validate_tweet_length,
    data_freshness_note, pick_hashtags,
    is_safe_entity_match, FALSE_POSITIVE_NAMES,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

MAX_QUOTES_PER_DAY = 10
MAX_QUOTES_PER_HOUR = 3

# Accounts to monitor for auto-quote-tweeting
AUTO_QUOTE_ACCOUNTS = [
    "OpenSecrets",       # Campaign finance / lobbying tracker
    "ProPublica",        # Investigative journalism
    "CapitolTrades",     # Capitol Trades (congressional trades)
    "unusual_whales",    # Congressional trades + options
    "JuddLegum",        # Popular Information newsletter
    "waborshauf",        # Walter Shaub (former ethics chief)
    "WSJ",              # Wall Street Journal politics
    "Reuters",          # Reuters politics
]

# Auto-quote mode: drafts-only by default (requires human approval)
AUTO_QUOTE_DRAFTS_ONLY = os.getenv("WTP_AUTO_QUOTE_DIRECT", "0") != "1"

# Sector search endpoints: (search_path, entity_key, sector_slug, profile_prefix)
COMPANY_SECTORS = [
    ("/finance/institutions", "institutions", "finance", "finance/company"),
    ("/health/companies", "companies", "health", "health/company"),
    ("/tech/companies", "companies", "technology", "technology/company"),
    ("/energy/companies", "companies", "energy", "energy/company"),
    ("/transportation/companies", "companies", "transportation", "transportation/company"),
    ("/defense/companies", "companies", "defense", "defense/company"),
    ("/chemicals/companies", "companies", "chemicals", "chemicals/company"),
    ("/agriculture/companies", "companies", "agriculture", "agriculture/company"),
    ("/education/companies", "companies", "education", "education/company"),
    ("/telecom/companies", "companies", "telecom", "telecom/company"),
]

# Entity cache with TTL (refreshes every 2 hours)
_ENTITY_CACHE: dict = {}
_ENTITY_CACHE_LOADED_AT: Optional[datetime] = None
_ENTITY_CACHE_TTL = timedelta(hours=2)


# ── Helpers ────────────────────────────────────────────────────────────────────

def quotes_today(session) -> int:
    """Count quote tweets posted today."""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        session.query(TweetLog)
        .filter(TweetLog.posted_at >= today, TweetLog.category.in_(["quote", "reply"]))
        .count()
    )


def quotes_this_hour(session) -> int:
    """Count quote-tweets posted in the last hour."""
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    return (
        session.query(TweetLog)
        .filter(TweetLog.posted_at >= one_hour_ago, TweetLog.category == "quote")
        .count()
    )


def already_quoted(session, tweet_id: str) -> bool:
    """Check if we already quoted this specific tweet."""
    return (
        session.query(TweetLog)
        .filter(
            TweetLog.category == "quote",
            TweetLog.text.contains(f"[reply_to:{tweet_id}]"),
        )
        .first()
        is not None
    )


# ── Entity Lookup ──────────────────────────────────────────────────────────────

def find_politician(name: str) -> Optional[dict]:
    """Search for a politician by name. Returns dict with data or None."""
    data = api_get("/people", {"q": name, "limit": 5})
    people = data.get("people", data.get("items", data.get("results", [])))
    if not people:
        if isinstance(data, list) and data:
            people = data
        else:
            return None

    person = people[0]
    person_id = person.get("person_id", person.get("id", ""))
    display_name = person.get("display_name", person.get("name", name))

    # Fetch profile detail
    detail = {}
    if person_id:
        detail = api_get(f"/people/{person_id}")

    lobbying_total = detail.get("total_lobbying", 0)
    trades_count = detail.get("trades_count", detail.get("total_trades", 0))
    donations_total = detail.get("total_donations", detail.get("donations_total", 0))
    anomalies_count = detail.get("anomalies_count", detail.get("total_anomalies", 0))

    if not trades_count and person_id:
        trades_data = api_get("/congressional-trades", {"person_id": person_id, "limit": 1})
        trades_count = trades_data.get("total", trades_data.get("count", 0))

    profile_url = build_profile_url("politics", person_id or display_name.lower().replace(" ", "-"), campaign="quote")

    return {
        "type": "politician",
        "name": display_name,
        "profile_url": profile_url,
        "lobbying_total": lobbying_total,
        "trades_count": trades_count,
        "donations_total": donations_total,
        "anomalies_count": anomalies_count,
        "party": detail.get("party", person.get("party", "")),
        "state": detail.get("state", person.get("state", "")),
    }


def find_company(name: str) -> Optional[dict]:
    """Search across all company sectors. Returns dict with data or None."""
    for search_path, entity_key, sector, profile_prefix in COMPANY_SECTORS:
        data = api_get(search_path, {"q": name, "limit": 5})
        items = data.get(entity_key, data.get("items", data.get("results", [])))
        if not items:
            if isinstance(data, list) and data:
                items = data
            else:
                continue

        company = items[0]
        company_id = company.get("id", company.get("company_id", ""))
        display_name = company.get("display_name", company.get("name", name))

        detail = {}
        if company_id:
            for dp in [
                f"/{sector}/companies/{company_id}",
                f"/{sector}/company/{company_id}",
                f"/{sector}/institutions/{company_id}",
                f"/{sector}/institution/{company_id}",
            ]:
                detail = api_get(dp)
                if detail and not detail.get("detail", "").startswith("Not"):
                    break

        lobbying_total = detail.get("total_lobbying", company.get("total_lobbying", 0))
        contracts_total = detail.get("total_contracts", company.get("total_contracts", 0))
        enforcement_count = detail.get("enforcement_count", detail.get("total_enforcement", company.get("enforcement_count", 0)))
        anomalies_count = detail.get("anomalies_count", detail.get("total_anomalies", 0))

        profile_url = build_profile_url(sector, company_id or display_name.lower().replace(" ", "-"), campaign="quote")

        return {
            "type": "company",
            "sector": sector,
            "name": display_name,
            "profile_url": profile_url,
            "lobbying_total": lobbying_total,
            "contracts_total": contracts_total,
            "enforcement_count": enforcement_count,
            "anomalies_count": anomalies_count,
        }

    return None


def find_entity(name: str, entity_type: Optional[str] = None) -> Optional[dict]:
    """Find an entity by name, auto-detecting type if not specified."""
    if entity_type == "politician":
        return find_politician(name)
    elif entity_type == "company":
        return find_company(name)

    # Auto-detect: try politician first, then company
    result = find_politician(name)
    if result and (result.get("lobbying_total") or result.get("trades_count")):
        return result

    result = find_company(name)
    if result:
        return result

    return find_politician(name)


# ── Quote-Tweet Composition ────────────────────────────────────────────────────

def compose_quote(entity: dict) -> Optional[str]:
    """Compose a factual quote-tweet with data and source attribution.

    Returns the quote text or None if no compelling data found.
    Maximum length: 280 chars for reach optimization. Uses neutral language.
    """
    name = entity["name"]
    url = entity["profile_url"]
    freshness = data_freshness_note()

    candidates = []

    if entity["type"] == "politician":
        lobbying = entity.get("lobbying_total", 0)
        trades = entity.get("trades_count", 0)
        donations = entity.get("donations_total", 0)

        if trades and trades > 0:
            candidates.append(
                f"Public record: {name} made {trades:,} stock trade{'s' if trades != 1 else ''} while in office.\n\nSource: House Financial Disclosures\n\n{url}"
            )
        if lobbying and lobbying > 0:
            candidates.append(
                f"According to Senate filings, {fmt_money(lobbying)} in lobbying is connected to {name} {freshness}.\n\n{url}"
            )
        if donations and donations > 0:
            candidates.append(
                f"FEC filings show {name} received {fmt_money(donations)} in PAC donations {freshness}.\n\n{url}"
            )

    elif entity["type"] == "company":
        lobbying = entity.get("lobbying_total", 0)
        contracts = entity.get("contracts_total", 0)
        enforcement = entity.get("enforcement_count", 0)

        if lobbying and lobbying > 0:
            candidates.append(
                f"According to Senate filings, {name} spent {fmt_money(lobbying)} lobbying Congress {freshness}.\n\n{url}"
            )
        if contracts and contracts > 0:
            candidates.append(
                f"Public records: {name} received {fmt_money(contracts)} in government contracts {freshness}.\n\n{url}"
            )
        if enforcement and enforcement > 0:
            candidates.append(
                f"Federal records show {name} has {enforcement:,} enforcement action{'s' if enforcement != 1 else ''} on file.\n\n{url}"
            )
        if lobbying and lobbying > 0 and contracts and contracts > 0:
            candidates.append(
                f"{name}: {fmt_money(lobbying)} in lobbying, {fmt_money(contracts)} in contracts. Public record.\n\nData: Senate LDA, USASpending.gov\n\n{url}"
            )

    if not candidates:
        # No useful data — don't post a generic tweet (S5 fix)
        return None

    # Filter to reasonable length (280 for short-form engagement)
    valid = [c for c in candidates if len(c) <= 280]
    if not valid:
        # Try without URL if too long
        for c in candidates:
            trimmed = c.replace(f"\n\n{url}", "")
            if len(trimmed) <= 280:
                valid.append(trimmed)
                break

    if not valid:
        return None

    text = random.choice(valid)

    # Safety check
    if not content_is_safe(text):
        return None

    return text


# ── Main Run ───────────────────────────────────────────────────────────────────

def run(tweet_id: str, entity_name: str, entity_type: Optional[str] = None,
        dry_run: bool = False):
    """Find entity, compose quote-tweet, and post it."""
    if is_paused():
        log.warning("Bot is PAUSED. Cannot post.")
        return

    session = SessionLocal()
    try:
        _run_inner(session, tweet_id, entity_name, entity_type, dry_run)
    finally:
        session.close()


def _run_inner(session, tweet_id: str, entity_name: str,
               entity_type: Optional[str], dry_run: bool):
    """Inner logic for run() — session is managed by caller."""
    # Rate limit checks
    count = quotes_today(session)
    if count >= MAX_QUOTES_PER_DAY and not dry_run:
        log.error("Already posted %d quotes today (max %d). Stopping.", count, MAX_QUOTES_PER_DAY)
        return

    qcount = quotes_this_hour(session)
    if qcount >= MAX_QUOTES_PER_HOUR and not dry_run:
        log.error("Already posted %d quotes this hour (max %d). Stopping.", qcount, MAX_QUOTES_PER_HOUR)
        return

    # Dedup check
    if already_quoted(session, tweet_id):
        log.error("Already quoted tweet %s. Stopping.", tweet_id)
        return

    # Self-quote check
    if not dry_run:
        if is_own_tweet(tweet_id):
            log.error("Tweet %s is from our own account. Stopping.", tweet_id)
            return

    # Find entity
    log.info("Looking up entity: %s (type=%s)", entity_name, entity_type or "auto")
    entity = find_entity(entity_name, entity_type)

    if not entity:
        log.error("Entity '%s' not found in any WTP sector.", entity_name)
        return

    log.info("Found %s: %s (%s)", entity["type"], entity["name"],
             entity.get("sector", entity.get("party", "")))

    # Compose quote-tweet
    quote_text = compose_quote(entity)
    if not quote_text:
        log.error("No compelling data found for %s. Cannot compose quote.", entity["name"])
        return

    log.info("Quote (%d chars):\n  %s", len(quote_text), quote_text)

    if dry_run:
        print(f"\n[DRY RUN] Quote-tweet {tweet_id}:")
        print(f"  Entity: {entity['name']} ({entity['type']})")
        print(f"  Profile: {entity['profile_url']}")
        print(f"  Quote ({len(quote_text)} chars):")
        print(f"  ---")
        print(f"  {quote_text}")
        print(f"  ---")
        print(f"  Quotes today: {count}/{MAX_QUOTES_PER_DAY}")
        return

    # Post as quote-tweet (NOT reply — X API restriction)
    posted_id = post_tweet(quote_text, quote_tweet_id=tweet_id)

    if posted_id:
        log.info("Quote posted: https://x.com/%s/status/%s", OUR_USERNAME, posted_id)
        log_tweet(session, posted_id, "quote", quote_text, reply_to=tweet_id)
        print(f"Quote-tweet posted: https://x.com/{OUR_USERNAME}/status/{posted_id}")
    else:
        log.error("Failed to post quote-tweet.")


# ── Auto-Quote Logic ───────────────────────────────────────────────────────────

def _load_entity_cache():
    """Load tracked entity names from the WTP API for matching.

    Uses a TTL-based cache that refreshes every 2 hours.
    """
    global _ENTITY_CACHE, _ENTITY_CACHE_LOADED_AT

    now = datetime.now(timezone.utc)
    if _ENTITY_CACHE and _ENTITY_CACHE_LOADED_AT:
        if now - _ENTITY_CACHE_LOADED_AT < _ENTITY_CACHE_TTL:
            return  # Cache still fresh

    _ENTITY_CACHE = {}

    # Load politicians
    data = api_get("/people", {"limit": 200})
    people = data.get("people", data.get("items", []))
    for p in people:
        name = p.get("display_name", p.get("name", ""))
        if name and len(name) >= 6:
            _ENTITY_CACHE[name.upper()] = {"name": name, "type": "politician"}

    # Load companies from each sector
    for search_path, entity_key, sector, _ in COMPANY_SECTORS:
        data = api_get(search_path, {"limit": 50})
        items = data.get(entity_key, data.get("items", []))
        for c in items:
            name = c.get("display_name", c.get("name", ""))
            if name and len(name) >= 6:
                _ENTITY_CACHE[name.upper()] = {"name": name, "type": "company"}

    _ENTITY_CACHE_LOADED_AT = now
    log.info("Loaded %d entities into cache (TTL: %s)", len(_ENTITY_CACHE), _ENTITY_CACHE_TTL)


def _match_entity_in_tweet(tweet_text: str) -> Optional[dict]:
    """Check if a tweet mentions any entity we track.

    Uses safe matching with false positive prevention.
    """
    _load_entity_cache()

    text_upper = tweet_text.upper()

    # Exact match against our entity cache (with safety filtering)
    for key, info in _ENTITY_CACHE.items():
        if is_safe_entity_match(key, text_upper):
            return info

    return None


def run_auto_quote(dry_run: bool = False):
    """Search monitored accounts for tweets about entities we track.

    In drafts-only mode (default): saves matches as drafts for human review.
    In direct mode (WTP_AUTO_QUOTE_DIRECT=1): posts immediately (not recommended).
    """
    if is_paused():
        log.warning("Bot is PAUSED. Skipping auto-quote.")
        return

    session = SessionLocal()
    try:
        _run_auto_quote_inner(session, dry_run)
    finally:
        session.close()


def _run_auto_quote_inner(session, dry_run: bool):
    """Inner logic for run_auto_quote() — session is managed by caller."""
    # Rate limit checks
    count = quotes_today(session)
    if count >= MAX_QUOTES_PER_DAY and not dry_run:
        log.info("Already posted %d quotes today (max %d). Skipping.", count, MAX_QUOTES_PER_DAY)
        return

    qcount = quotes_this_hour(session)
    if qcount >= MAX_QUOTES_PER_HOUR and not dry_run:
        log.info("Already posted %d quotes this hour (max %d). Skipping.", qcount, MAX_QUOTES_PER_HOUR)
        return

    matches_found = 0
    drafts_saved = 0
    quotes_posted = 0

    for account in AUTO_QUOTE_ACCOUNTS:
        if quotes_posted >= MAX_QUOTES_PER_HOUR:
            break

        log.info("Checking tweets from @%s...", account)
        tweets = get_user_tweets(account, max_results=10)

        if not tweets:
            continue

        for tweet in tweets:
            if quotes_posted >= MAX_QUOTES_PER_HOUR:
                break

            tweet_id = str(tweet["id"])
            tweet_text = tweet.get("text", "")

            # Skip if already quoted
            if already_quoted(session, tweet_id):
                continue

            # Try to match an entity we track
            matched = _match_entity_in_tweet(tweet_text)
            if not matched:
                continue

            # Skip topic-only matches (no specific entity)
            if matched.get("type") == "topic":
                continue

            entity_name = matched.get("name", "")
            entity_type = matched.get("type", "")
            log.info("Matched '%s' (%s) in tweet %s from @%s",
                     entity_name, entity_type, tweet_id, account)
            matches_found += 1

            # Look up full entity data
            entity = find_entity(entity_name, entity_type)
            if not entity:
                log.warning("Entity '%s' not found despite being in cache.", entity_name)
                continue

            # Compose quote-tweet
            quote_text = compose_quote(entity)
            if not quote_text:
                continue

            if dry_run:
                print(f"\n[DRY RUN] Auto-quote @{account} tweet {tweet_id}:")
                print(f"  Original: {tweet_text[:120]}...")
                print(f"  Match: {entity_name} ({entity_type})")
                print(f"  Quote ({len(quote_text)} chars):")
                print(f"  ---")
                print(f"  {quote_text}")
                print(f"  ---")
                quotes_posted += 1
                continue

            if AUTO_QUOTE_DRAFTS_ONLY:
                # Save as draft for human review (Gate 5 extension)
                try:
                    session.add(DraftReply(
                        target_tweet_id=tweet_id,
                        target_username=account,
                        target_text=tweet_text[:500],
                        suggested_text=quote_text,
                        matched_entity=entity_name,
                        matched_data=json.dumps({"type": entity_type, "profile_url": entity.get("profile_url", "")}),
                        status="pending",
                    ))
                    session.commit()
                    drafts_saved += 1
                    log.info("Saved draft for human review: %s -> %s", account, entity_name)
                except Exception as e:
                    session.rollback()
                    log.warning("Failed to save draft: %s", e)
            else:
                # Direct posting (only if WTP_AUTO_QUOTE_DIRECT=1)
                posted_id = post_tweet(quote_text, quote_tweet_id=tweet_id)
                if posted_id:
                    log.info("Auto-quote posted: https://x.com/%s/status/%s", OUR_USERNAME, posted_id)
                    log_tweet(session, posted_id, "quote", quote_text, reply_to=tweet_id)
                    quotes_posted += 1
                    # Pause between posts
                    if quotes_posted < MAX_QUOTES_PER_HOUR:
                        time.sleep(random.randint(30, 90))
                else:
                    log.error("Failed to post auto-quote for tweet %s.", tweet_id)

    if matches_found == 0:
        log.info("No matching tweets found to quote this cycle.")
    else:
        log.info("Auto-quote complete: %d matches, %d drafts saved, %d posted directly.",
                 matches_found, drafts_saved, quotes_posted)


# ── Entry Point ────────────────────────────────────────────────────────────────

def main():
    import json  # noqa: F811

    parser = argparse.ArgumentParser(
        description="Quote-tweet with WTP data about a political entity"
    )
    parser.add_argument("--tweet-id", default=None, help="ID of the tweet to quote")
    parser.add_argument("--entity", default=None, help='Entity name (e.g. "Pfizer")')
    parser.add_argument("--type", choices=["politician", "company"], default=None)
    parser.add_argument("--dry-run", action="store_true", help="Preview without posting")
    parser.add_argument("--auto-quote", action="store_true",
                        help="Auto-search monitored accounts and queue quotes")

    args = parser.parse_args()

    if args.auto_quote:
        run_auto_quote(dry_run=args.dry_run)
    else:
        if not args.tweet_id or not args.entity:
            parser.error("--tweet-id and --entity are required for manual quote mode")
        run(tweet_id=args.tweet_id, entity_name=args.entity,
            entity_type=args.type, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
