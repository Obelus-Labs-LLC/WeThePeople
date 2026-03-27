"""
Twitter Reply-with-Data CLI — reply to political tweets with WTP data.

Finds an entity in WTP's database, pulls real data (lobbying, contracts,
enforcement, trades, donations, anomalies), composes a factual 280-char
reply with a link to the entity's WTP profile, and posts it as a reply.

Usage:
    python jobs/twitter_reply.py --tweet-id 123456789 --entity "Pfizer"
    python jobs/twitter_reply.py --tweet-id 123456789 --entity "Elizabeth Warren" --type politician
    python jobs/twitter_reply.py --dry-run --tweet-id 123456789 --entity "Lockheed Martin"

Safety:
    - Max 10 replies per day
    - Won't reply to the same tweet twice
    - Won't reply to our own tweets
    - --dry-run shows the reply without posting
"""

import os
import sys
import argparse
import hashlib
import logging
import random
import time
from datetime import datetime, timezone
from typing import Optional

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.twitter import post_tweet, _get_client
from models.database import SessionLocal
from models.twitter_models import TweetLog

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

API_BASE = os.getenv("WTP_API_URL", "http://localhost:8006")
SITE = "wethepeopleforus.com"
MAX_REPLIES_PER_DAY = 10
OUR_USERNAME = "WTPForUs"

# Sector search endpoints: (search_path, entity_key, sector_slug, profile_prefix)
COMPANY_SECTORS = [
    ("/finance/institutions", "institutions", "finance", "finance/company"),
    ("/health/companies", "companies", "health", "health/company"),
    ("/tech/companies", "companies", "technology", "technology/company"),
    ("/energy/companies", "companies", "energy", "energy/company"),
    ("/transportation/companies", "companies", "transportation", "transportation/company"),
    ("/defense/companies", "companies", "defense", "defense/company"),
]

HASHTAGS = [
    "#FollowTheMoney",
    "#CivicTech",
    "#OpenData",
    "#CorporateLobbying",
    "#CongressTrades",
    "#Transparency",
]


# -- Helpers --

def api_get(path: str, params: dict = None) -> dict:
    """Fetch from WTP API."""
    try:
        r = requests.get(f"{API_BASE}{path}", params=params or {}, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning("API call failed %s: %s", path, e)
        return {}


def _fmt_money(n: float) -> str:
    if n >= 1_000_000_000:
        return f"${n / 1_000_000_000:.1f}B"
    if n >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"${n / 1_000:.0f}K"
    return f"${n:,.0f}"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def replies_today(session) -> int:
    """Count reply tweets posted today."""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        session.query(TweetLog)
        .filter(TweetLog.posted_at >= today, TweetLog.category == "reply")
        .count()
    )


def already_replied_to(session, tweet_id: str) -> bool:
    """Check if we already replied to this specific tweet."""
    # Store reply-to tweet ID in the text field with a prefix for lookup
    return (
        session.query(TweetLog)
        .filter(
            TweetLog.category == "reply",
            TweetLog.text.contains(f"[reply_to:{tweet_id}]"),
        )
        .first()
        is not None
    )


def is_own_tweet(tweet_id: str) -> bool:
    """Check if the tweet belongs to our bot account."""
    try:
        client = _get_client()
        tweet = client.get_tweet(tweet_id, expansions=["author_id"])
        if tweet.data is None:
            log.warning("Could not fetch tweet %s", tweet_id)
            return False
        author_id = tweet.data.author_id
        me = client.get_me()
        return str(author_id) == str(me.data.id)
    except Exception as e:
        log.warning("Could not check tweet ownership: %s", e)
        return False


def log_reply(session, reply_tweet_id: str, text: str, original_tweet_id: str):
    """Log the reply to TweetLog with category='reply'."""
    tagged_text = f"[reply_to:{original_tweet_id}] {text}"
    for attempt in range(3):
        try:
            session.add(
                TweetLog(
                    tweet_id=reply_tweet_id,
                    category="reply",
                    content_hash=content_hash(tagged_text),
                    text=tagged_text,
                )
            )
            session.commit()
            return
        except Exception as e:
            session.rollback()
            if attempt < 2:
                log.warning("DB locked on log_reply, retry %d/3: %s", attempt + 1, e)
                time.sleep(2)
            else:
                log.error("Failed to log reply after 3 attempts: %s", e)


# -- Entity Lookup --

def find_politician(name: str) -> Optional[dict]:
    """Search for a politician by name. Returns dict with data or None."""
    data = api_get("/politics/people", {"q": name, "limit": 5})
    people = data.get("people", data.get("items", data.get("results", [])))
    if not people:
        # Try as a list response
        if isinstance(data, list) and data:
            people = data
        else:
            return None

    # Pick the best match (first result from API search)
    person = people[0]
    person_id = person.get("person_id", person.get("id", ""))
    display_name = person.get("display_name", person.get("name", name))

    # Fetch profile detail for richer data
    detail = {}
    if person_id:
        detail = api_get(f"/politics/people/{person_id}")

    # Gather data points
    lobbying_total = detail.get("total_lobbying", 0)
    trades_count = detail.get("trades_count", detail.get("total_trades", 0))
    donations_total = detail.get("total_donations", detail.get("donations_total", 0))
    votes_count = detail.get("votes_count", detail.get("total_votes", 0))
    anomalies_count = detail.get("anomalies_count", detail.get("total_anomalies", 0))

    # Try fetching trades separately if not in detail
    if not trades_count and person_id:
        trades_data = api_get(f"/congressional-trades", {"person_id": person_id, "limit": 1})
        trades_count = trades_data.get("total", trades_data.get("count", 0))

    # Build profile URL slug
    slug = person_id or display_name.lower().replace(" ", "-")
    profile_url = f"{SITE}/politics/person/{slug}"

    return {
        "type": "politician",
        "name": display_name,
        "profile_url": profile_url,
        "lobbying_total": lobbying_total,
        "trades_count": trades_count,
        "donations_total": donations_total,
        "votes_count": votes_count,
        "anomalies_count": anomalies_count,
        "party": detail.get("party", person.get("party", "")),
        "state": detail.get("state", person.get("state", "")),
        "chamber": detail.get("chamber", person.get("chamber", "")),
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

        # Fetch profile detail
        detail = {}
        if company_id:
            # Build detail path based on sector
            detail_path = f"/{sector}/{entity_key.rstrip('s')}/{company_id}" if entity_key != "institutions" else f"/{sector}/institution/{company_id}"
            # Try a few path variations
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

        slug = company_id or display_name.lower().replace(" ", "-")
        profile_url = f"{SITE}/{profile_prefix}/{slug}"

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
    if result and (
        result.get("lobbying_total")
        or result.get("trades_count")
        or result.get("votes_count")
    ):
        return result

    result = find_company(name)
    if result:
        return result

    # Fallback: try politician even if sparse data
    return find_politician(name)


# -- Reply Composition --

def compose_reply(entity: dict) -> Optional[str]:
    """Compose a factual reply tweet (max 280 chars) with one data point and link.

    Returns the reply text or None if no compelling data found.
    """
    name = entity["name"]
    url = entity["profile_url"]
    hashtag = random.choice(HASHTAGS)

    candidates = []

    if entity["type"] == "politician":
        lobbying = entity.get("lobbying_total", 0)
        trades = entity.get("trades_count", 0)
        donations = entity.get("donations_total", 0)
        anomalies = entity.get("anomalies_count", 0)

        if trades and trades > 0:
            candidates.append(
                f"According to public records, {name} made {trades:,} stock trade{'s' if trades != 1 else ''} while in office.\n\n{url}\n{hashtag}"
            )
        if lobbying and lobbying > 0:
            candidates.append(
                f"Public records show {_fmt_money(lobbying)} in lobbying connected to {name}.\n\n{url}\n{hashtag}"
            )
        if donations and donations > 0:
            candidates.append(
                f"According to FEC filings, {name} received {_fmt_money(donations)} in PAC donations.\n\n{url}\n{hashtag}"
            )
        if anomalies and anomalies > 0:
            candidates.append(
                f"Our system flagged {anomalies} anomal{'ies' if anomalies != 1 else 'y'} in {name}'s financial disclosures and voting record.\n\n{url}\n{hashtag}"
            )

    elif entity["type"] == "company":
        lobbying = entity.get("lobbying_total", 0)
        contracts = entity.get("contracts_total", 0)
        enforcement = entity.get("enforcement_count", 0)
        anomalies = entity.get("anomalies_count", 0)

        if lobbying and lobbying > 0:
            candidates.append(
                f"According to Senate filings, {name} spent {_fmt_money(lobbying)} lobbying Congress.\n\n{url}\n{hashtag}"
            )
        if contracts and contracts > 0:
            candidates.append(
                f"Public records show {name} received {_fmt_money(contracts)} in government contracts.\n\n{url}\n{hashtag}"
            )
        if enforcement and enforcement > 0:
            candidates.append(
                f"According to federal records, {name} has {enforcement:,} enforcement action{'s' if enforcement != 1 else ''} on file.\n\n{url}\n{hashtag}"
            )
        if lobbying and lobbying > 0 and contracts and contracts > 0:
            candidates.append(
                f"{name}: {_fmt_money(lobbying)} in lobbying, {_fmt_money(contracts)} in government contracts. All public record.\n\n{url}\n{hashtag}"
            )
        if anomalies and anomalies > 0:
            candidates.append(
                f"Our system flagged {anomalies} anomal{'ies' if anomalies != 1 else 'y'} in {name}'s lobbying and contract patterns.\n\n{url}\n{hashtag}"
            )

    if not candidates:
        # Fallback: generic link reply
        candidates.append(
            f"See the full public record for {name} on WeThePeople.\n\n{url}\n{hashtag}"
        )

    # Filter to 280-char limit
    valid = [c for c in candidates if len(c) <= 280]
    if not valid:
        # Trim candidates that are too long by shortening the hashtag or name
        for c in candidates:
            # Try without hashtag
            trimmed = c.replace(f"\n{hashtag}", "")
            if len(trimmed) <= 280:
                valid.append(trimmed)
                break

    if not valid:
        # Last resort: generic short reply
        fallback = f"Full public record for {name}: {url}"
        if len(fallback) <= 280:
            valid.append(fallback)
        else:
            valid.append(f"Public records: {url}")

    return random.choice(valid)


# -- Main --

def run(tweet_id: str, entity_name: str, entity_type: Optional[str] = None, dry_run: bool = False):
    """Find entity, compose reply, and post it."""
    session = SessionLocal()

    # Safety: rate limit
    count = replies_today(session)
    if count >= MAX_REPLIES_PER_DAY and not dry_run:
        log.error("Already posted %d replies today (max %d). Stopping.", count, MAX_REPLIES_PER_DAY)
        session.close()
        return

    # Safety: don't reply to same tweet twice
    if already_replied_to(session, tweet_id):
        log.error("Already replied to tweet %s. Stopping.", tweet_id)
        session.close()
        return

    # Safety: don't reply to our own tweets
    if not dry_run:
        if is_own_tweet(tweet_id):
            log.error("Tweet %s is from our own account (@%s). Stopping.", tweet_id, OUR_USERNAME)
            session.close()
            return

    # Step 1: Find entity
    log.info("Looking up entity: %s (type=%s)", entity_name, entity_type or "auto")
    entity = find_entity(entity_name, entity_type)

    if not entity:
        log.error("Entity '%s' not found in any WTP sector.", entity_name)
        session.close()
        return

    log.info("Found %s: %s (%s)", entity["type"], entity["name"], entity.get("sector", entity.get("party", "")))

    # Log data points found
    if entity["type"] == "politician":
        log.info(
            "  Lobbying: %s | Trades: %s | Donations: %s | Anomalies: %s",
            _fmt_money(entity.get("lobbying_total", 0)),
            entity.get("trades_count", 0),
            _fmt_money(entity.get("donations_total", 0)),
            entity.get("anomalies_count", 0),
        )
    else:
        log.info(
            "  Lobbying: %s | Contracts: %s | Enforcement: %s | Anomalies: %s",
            _fmt_money(entity.get("lobbying_total", 0)),
            _fmt_money(entity.get("contracts_total", 0)),
            entity.get("enforcement_count", 0),
            entity.get("anomalies_count", 0),
        )

    # Step 2: Compose reply
    reply_text = compose_reply(entity)
    if not reply_text:
        log.error("Could not compose a reply for %s.", entity["name"])
        session.close()
        return

    log.info("Reply (%d chars):\n  %s", len(reply_text), reply_text)

    if dry_run:
        print(f"\n[DRY RUN] Reply to tweet {tweet_id}:")
        print(f"  Entity: {entity['name']} ({entity['type']})")
        print(f"  Profile: {entity['profile_url']}")
        print(f"  Reply ({len(reply_text)} chars):")
        print(f"  ---")
        print(f"  {reply_text}")
        print(f"  ---")
        print(f"  Replies today: {count}/{MAX_REPLIES_PER_DAY}")
        session.close()
        return

    # Step 3: Post reply
    reply_id = post_tweet(reply_text, reply_to=tweet_id)
    if reply_id:
        log.info("Reply posted: https://x.com/WTPForUs/status/%s", reply_id)
        log_reply(session, reply_id, reply_text, tweet_id)
        print(f"Reply posted: https://x.com/WTPForUs/status/{reply_id}")
    else:
        log.error("Failed to post reply.")

    session.close()


def main():
    parser = argparse.ArgumentParser(
        description="Reply to a tweet with WTP data about a political entity"
    )
    parser.add_argument(
        "--tweet-id",
        required=True,
        help="ID of the tweet to reply to",
    )
    parser.add_argument(
        "--entity",
        required=True,
        help='Entity name to look up (e.g. "Pfizer", "Elizabeth Warren")',
    )
    parser.add_argument(
        "--type",
        choices=["politician", "company"],
        default=None,
        help="Entity type (auto-detected if omitted)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview the reply without posting",
    )
    args = parser.parse_args()

    run(
        tweet_id=args.tweet_id,
        entity_name=args.entity,
        entity_type=args.type,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
