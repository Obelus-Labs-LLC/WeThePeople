"""
Twitter Bot — Automated posting for @WTPForUs.

Pulls interesting data from the WTP API and posts punchy, personality-driven
tweets that promote the platform and drive traffic to wethepeopleforus.com.

Schedule: 3-4 tweets/day via scheduler (~100/month, well under 500 free cap).
Tone: Short, punchy, slight attitude. Like a smart friend sharing something wild.

Usage:
    python jobs/twitter_bot.py                  # Auto-pick category and post
    python jobs/twitter_bot.py --category data  # Post a specific category
    python jobs/twitter_bot.py --dry-run        # Preview without posting
    python jobs/twitter_bot.py --test           # Post a test tweet
"""

import os
import sys
import json
import random
import hashlib
import argparse
import logging
import time
from datetime import datetime, date, timezone

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.twitter import post_tweet, post_thread
from models.database import SessionLocal
from models.twitter_models import TweetLog

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

API_BASE = os.getenv("WTP_API_URL", "http://localhost:8006")
SITE = "wethepeopleforus.com"


# ── API Helpers ──

def api_healthy() -> bool:
    """Check if the WTP API is up and serving data."""
    try:
        r = requests.get(f"{API_BASE}/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def api_get(path: str, params: dict = None) -> dict:
    """Fetch from WTP API."""
    try:
        r = requests.get(f"{API_BASE}{path}", params=params or {}, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        log.warning("API call failed %s: %s", path, e)
        return {}


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def already_posted(session, text: str) -> bool:
    h = content_hash(text)
    return session.query(TweetLog).filter_by(content_hash=h).first() is not None


def log_tweet(session, tweet_id: str, category: str, text: str):
    """Log a posted tweet. Retries on DB lock since syncs may be writing."""
    for attempt in range(3):
        try:
            session.add(TweetLog(
                tweet_id=tweet_id,
                category=category,
                content_hash=content_hash(text),
                text=text,
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


def posts_today(session) -> int:
    """Count tweets posted today.
    NOTE: Uses UTC midnight as the boundary. If the bot runs near midnight UTC,
    some tweets may count toward the next day's total."""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return session.query(TweetLog).filter(TweetLog.posted_at >= today).count()


# ── Tweet Generators ──

def _fmt_money(n: float) -> str:
    if n >= 1_000_000_000:
        return f"${n / 1_000_000_000:.1f}B"
    if n >= 1_000_000:
        return f"${n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"${n / 1_000:.0f}K"
    return f"${n:,.0f}"


def generate_data_tweet() -> tuple:
    """Pull real data and generate a story-driven tweet that connects dots.

    Strategy: Lead with the discovery, not the product. Name names, show
    connections, let the data speak. Link goes in reply.
    """
    options = []

    # --- Cross-reference: lobbying + contracts for the same company ---
    lobbying_data = api_get("/influence/top-lobbying", {"limit": 10})
    contract_data = api_get("/influence/top-contracts", {"limit": 10})
    lobby_items = lobbying_data if isinstance(lobbying_data, list) else lobbying_data.get("leaders", [])
    contract_items = contract_data if isinstance(contract_data, list) else contract_data.get("leaders", [])

    # Find companies that appear in BOTH top lobbying AND top contracts
    lobby_map = {i.get("entity_id"): i for i in lobby_items}
    for ci in contract_items:
        eid = ci.get("entity_id")
        if eid in lobby_map:
            name = ci.get("display_name", "A company")
            lobby = lobby_map[eid].get("total_lobbying", 0)
            contracts = ci.get("total_contracts", 0)
            sector = ci.get("sector", "")
            if lobby > 0 and contracts > 0:
                options.append((
                    f"{name} spent {_fmt_money(lobby)} lobbying Congress and received "
                    f"{_fmt_money(contracts)} in government contracts.\n\n"
                    f"Public record. Connected for the first time.\n\n"
                    f"#FollowTheMoney",
                    f"{SITE}/{sector}/{eid}" if sector else f"{SITE}/influence"
                ))

    # --- Congressional trades with context ---
    data = api_get("/congressional-trades", {"limit": 20})
    trades = data.get("trades", data.get("items", []))
    if trades:
        trade = random.choice(trades[:10])
        person = trade.get("member_name", trade.get("person_name", ""))
        if not person or person == "N/A":
            person = "A member of Congress"
        ticker = trade.get("ticker", "???")
        raw_type = (trade.get("transaction_type", "") or "").lower()
        tx_verb = {
            "purchase": "bought", "purchased": "bought",
            "sale": "sold", "sold": "sold",
            "sale (partial)": "sold", "sale_partial": "sold",
            "purchase (partial)": "bought", "purchase_partial": "bought",
            "exchange": "exchanged",
        }.get(raw_type, "traded")
        amount = trade.get("amount_range", "")
        date_str = trade.get("transaction_date", "")
        disc_str = trade.get("disclosure_date", "")

        # Calculate reporting gap if both dates available
        gap_note = ""
        if date_str and disc_str and date_str != disc_str:
            try:
                from datetime import datetime as dt
                td = dt.fromisoformat(date_str)
                dd = dt.fromisoformat(disc_str)
                gap = (dd - td).days
                if gap > 30:
                    gap_note = f" Disclosed {gap} days later."
                elif gap > 0:
                    gap_note = f" Disclosed {gap} days after the trade."
            except (ValueError, TypeError):
                pass

        amount_str = f" ({amount})" if amount and amount != "N/A" else ""
        options.append((
            f"{person} {tx_verb} ${ticker} stock{amount_str}.{gap_note}\n\n"
            f"Members of Congress are required to disclose trades within 45 days. "
            f"Many don't.\n\n#CongressTrades",
            f"{SITE}/politics/trades"
        ))

    # --- Lobbying-to-sector ratio insight ---
    stats = api_get("/influence/stats")
    if stats and stats.get("by_sector"):
        sectors = stats["by_sector"]
        # Find the sector with highest lobbying-to-enforcement ratio
        best_ratio = None
        best_sector = None
        for sec_name, sec_data in sectors.items():
            lobby = sec_data.get("lobbying", 0)
            enforcement = sec_data.get("enforcement", 0)
            if lobby > 0 and enforcement > 0:
                ratio = lobby / enforcement
                if best_ratio is None or ratio > best_ratio:
                    best_ratio = ratio
                    best_sector = (sec_name, sec_data)

        if best_sector:
            sec_name, sec_data = best_sector
            lobby_spend = sec_data.get("lobbying_spend", sec_data.get("lobbying", 0))
            enforcement_count = sec_data.get("enforcement", 0)
            options.append((
                f"The {sec_name} sector has {sec_data.get('lobbying', 0):,} lobbying filings "
                f"and only {enforcement_count:,} enforcement actions.\n\n"
                f"That's {sec_data.get('lobbying', 0) // max(enforcement_count, 1)} lobbying filings "
                f"for every enforcement action.\n\n#FollowTheMoney",
                f"{SITE}/{sec_name}"
            ))

    # --- Single company deep dive ---
    if lobby_items:
        item = random.choice(lobby_items[:5])
        name = item.get("display_name", "A company")
        sector = item.get("sector", "")
        eid = item.get("entity_id", "")
        total = item.get("total_lobbying", 0)
        if total > 0 and sector and eid:
            options.append((
                f"Since 2020, {name} has filed {_fmt_money(total)} in lobbying disclosures "
                f"with the U.S. Senate.\n\n"
                f"Who they lobbied. What they asked for. All public record.\n\n"
                f"#CorporateLobbying",
                f"{SITE}/{sector}/{eid}"
            ))

    if not options:
        return None, "data"

    tweet_text, link = random.choice(options)
    return (tweet_text, link), "data"


def generate_product_tweet() -> tuple:
    """Generate a product tweet that sounds like a discovery, not an ad."""
    templates = [
        ("Your senator bought pharma stocks while sitting on the Health Committee.\n\nPublic record.\n\n#CongressTrades", f"{SITE}/politics/trades"),
        ("Politicians write the rules. Corporations fund the politicians.\n\nHere's the receipt.\n\n#FollowTheMoney", SITE),
        ("\"I don't take corporate money.\"\n\nThe FEC filing from last quarter says otherwise.\n\n#FollowTheMoney", f"{SITE}/verify"),
        ("Open source. Because transparency shouldn't have a paywall.\n\n#CivicTech #OpenData", SITE),
    ]

    tweet_text, link = random.choice(templates)
    return (tweet_text, link), "product"


def generate_verify_tweet() -> tuple:
    """Generate a claim verification promo tweet. Link in reply."""
    templates = [
        ("Politicians talk. We check receipts.\n\n#FactCheck", f"{SITE}/verify"),
        ("They said they'd never take corporate money.\n\nThe FEC data says otherwise.\n\n#FactCheck", f"{SITE}/verify"),
        ("Submit any political claim. We match it against votes, trades, lobbying, contracts, and donations.\n\nAutomatically.\n\n#FactCheck", f"{SITE}/verify"),
        ("\"I've always fought for the working class.\"\n\nCool. Let's see the lobbying disclosures.\n\n#FactCheck", f"{SITE}/verify"),
        ("Campaign promises vs. legislative record.\n\nWe automate that comparison.\n\n#FactCheck", f"{SITE}/verify"),
        ("9 data sources. One verdict.\n\nStrong. Moderate. Weak. Unverified.\n\nEvery claim, fact-checked against the record.\n\n#FactCheck", f"{SITE}/verify"),
    ]

    tweet_text, link = random.choice(templates)
    return (tweet_text, link), "verify"


def generate_engagement_tweet() -> tuple:
    """Generate an engagement tweet. No link — pure engagement."""
    templates = [
        "Guess which sector spent the most on lobbying this year.\n\nWrong answers only.",
        "Name a politician. We'll show you who's paying them.",
        "What company should we investigate next? Drop a name.",
        "Which surprises you more — the lobbying spend or the stock trades?",
        "If you could make one thing about Congress transparent, what would it be?",
        "Your representative made a stock trade last week.\n\nDid you know? Should you?",
        "What's wilder — how much pharma spends lobbying or how many FDA enforcement actions they dodge?",
    ]

    tweet_text = random.choice(templates)
    return (tweet_text, None), "engagement"


def generate_thread() -> tuple:
    """Generate a short 'Follow the Money' thread (2-3 tweets max)."""
    # Pull data to build a real thread
    lobbying = api_get("/influence/top-lobbying", {"limit": 5})
    items = lobbying if isinstance(lobbying, list) else lobbying.get("leaders", [])

    if not items:
        return None, "thread"

    company = random.choice(items[:3])
    name = company.get("display_name", company.get("name", "A major corporation"))
    lobby_total = company.get("total_lobbying", 0)

    if lobby_total <= 0:
        return None, "thread"

    tweets = [
        f"{name} spent {_fmt_money(lobby_total)} lobbying Congress. Where'd that money go?\n\n#FollowTheMoney",
        f"We track every dollar — from lobbying filings to government contracts to stock trades by the politicians they target.",
    ]

    return (tweets, f"{SITE}/influence/network"), "thread"


# ── Category Rotation ──

def generate_story_tweet():
    """Generate a tweet that's an excerpt of a published journal story.

    The tweet IS the story, just truncated. Links to the full investigation
    on the journal site. This is the primary content type.
    """
    data = api_get("/stories/latest", {"limit": 10})
    stories = data.get("stories", [])
    if not stories:
        # Fall back to data tweet if no stories published yet
        return generate_data_tweet()

    story = random.choice(stories[:5])
    title = story.get("title", "")
    summary = story.get("summary", "")
    body = story.get("body", "") or story.get("content", "")
    slug = story.get("slug", "")
    category = story.get("category", "")
    sources_count = len(story.get("data_sources", []))
    data_sources = story.get("data_sources", [])

    if not title:
        return generate_data_tweet()

    # Build tweet: title + summary + first 1-2 body paragraphs (the hook).
    # Don't include the full article — save the analysis for the journal page.
    excerpt_paras = []
    if body:
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
        summary_lower = (summary or "").lower()[:80]
        for p in paragraphs:
            if len(excerpt_paras) >= 2:
                break
            # Skip markdown headings
            if p.startswith("#"):
                continue
            # Skip if it's basically the same as the summary
            if summary_lower and p.lower()[:80] == summary_lower:
                continue
            excerpt_paras.append(p)

    parts = [title]
    if summary:
        parts.append(summary)
    if excerpt_paras:
        parts.append("\n\n".join(excerpt_paras))

    # Source attribution — map table names to official government databases
    SOURCE_DB_MAP = {
        "lobbying_records": "Senate LDA Filings",
        "health_lobbying_records": "Senate LDA Filings",
        "finance_lobbying_records": "Senate LDA Filings",
        "tech_lobbying_records": "Senate LDA Filings",
        "energy_lobbying_records": "Senate LDA Filings",
        "defense_lobbying_records": "Senate LDA Filings",
        "chemical_lobbying_records": "Senate LDA Filings",
        "agriculture_lobbying_records": "Senate LDA Filings",
        "government_contracts": "USASpending.gov",
        "health_government_contracts": "USASpending.gov",
        "finance_government_contracts": "USASpending.gov",
        "defense_government_contracts": "USASpending.gov",
        "energy_government_contracts": "USASpending.gov",
        "chemical_government_contracts": "USASpending.gov",
        "agriculture_government_contracts": "USASpending.gov",
        "congressional_trades": "House Financial Disclosures",
        "company_donations": "FEC Campaign Finance Data",
        "committees": "congress-legislators (CC0)",
        "committee_memberships": "congress-legislators (CC0)",
        "votes": "Senate.gov Roll Call Votes",
    }
    if sources_count > 0:
        db_names = list(dict.fromkeys(SOURCE_DB_MAP.get(s, s.replace('_', ' ').title()) for s in data_sources))
        parts.append(f"Data: {', '.join(db_names[:4])}")

    # CTA to read the full investigation
    journal_url = "journal.wethepeopleforus.com"
    link = f"{journal_url}/story/{slug}" if slug else journal_url
    parts.append(f"Read the full investigation:")

    # Hashtag based on category
    hashtag = {
        "lobbying_spike": "#CorporateLobbying",
        "lobbying_influence": "#CorporateLobbying",
        "trade_timing": "#CongressTrades",
        "trade_cluster": "#CongressTrades",
        "regulatory_capture": "#FollowTheMoney",
        "regulatory_arbitrage": "#FollowTheMoney",
        "bipartisan_buying": "#FollowTheMoney",
        "revolving_door": "#RevolvingDoor",
        "enforcement_gap": "#Accountability",
        "contract_windfall": "#FollowTheMoney",
        "full_influence_loop": "#FollowTheMoney",
    }.get(category, "#FollowTheMoney")
    parts.append(hashtag)

    text = "\n\n".join(parts)

    return (text, link), "story"


def generate_anomaly_tweet() -> tuple:
    """Generate a tweet from detected anomalies (trade-committee overlaps, lobbying spikes, etc.)."""
    data = api_get("/anomalies", {"limit": 10})
    anomalies = data.get("anomalies", data.get("items", []))
    if not anomalies:
        return None, "anomaly"

    anomaly = random.choice(anomalies[:5])
    a_type = anomaly.get("type", anomaly.get("anomaly_type", ""))
    description = anomaly.get("description", anomaly.get("summary", ""))
    entity = anomaly.get("entity_name", anomaly.get("name", ""))

    if a_type in ("trade_committee_overlap", "trade-committee"):
        ticker = anomaly.get("ticker", anomaly.get("details", {}).get("ticker", ""))
        committee = anomaly.get("committee", anomaly.get("details", {}).get("committee", ""))
        person = entity or "A member of Congress"
        if ticker and committee:
            text = (
                f"{person} traded ${ticker} while sitting on the committee overseeing that industry.\n\n"
                f"Coincidence?\n\n#CongressTrades"
            )
        elif ticker:
            text = (
                f"{person} traded ${ticker} stock — then voted on legislation affecting that company.\n\n"
                f"Timing is everything.\n\n#CongressTrades"
            )
        else:
            text = (
                f"{person}'s stock trades overlap with their committee assignments.\n\n"
                f"We mapped it.\n\n#CongressTrades"
            )
        return (text, f"{SITE}/politics/trades"), "anomaly"

    elif a_type in ("lobbying_contract_correlation", "lobbying-contract"):
        company = entity or "A major corporation"
        lobby_amt = anomaly.get("lobbying_amount", anomaly.get("details", {}).get("lobbying_amount", 0))
        contract_amt = anomaly.get("contract_amount", anomaly.get("details", {}).get("contract_amount", 0))
        if lobby_amt and contract_amt:
            text = (
                f"{company} spent {_fmt_money(lobby_amt)} lobbying Congress, "
                f"then landed {_fmt_money(contract_amt)} in government contracts.\n\n"
                f"Totally unrelated, surely.\n\n#FollowTheMoney"
            )
        else:
            text = (
                f"{company}'s lobbying spend spiked right before they won a major government contract.\n\n"
                f"Just good timing, right?\n\n#FollowTheMoney"
            )
        return (text, f"{SITE}/influence"), "anomaly"

    elif a_type in ("enforcement_anomaly", "enforcement"):
        company = entity or "A company"
        text = (
            f"{company} racked up enforcement actions while increasing lobbying spend.\n\n"
            f"Paying fines. Paying lobbyists. Paying politicians.\n\n#FollowTheMoney"
        )
        return (text, f"{SITE}/influence"), "anomaly"

    elif a_type in ("donation_timing", "donation-timing"):
        person = entity or "A politician"
        text = (
            f"Donations to {person} spiked right around a key vote.\n\n"
            f"The money always arrives on time.\n\n#FollowTheMoney"
        )
        return (text, f"{SITE}/politics"), "anomaly"

    # Generic fallback for any anomaly type
    if description:
        text = f"{description}\n\n#FollowTheMoney"
        return (text, f"{SITE}/influence"), "anomaly"

    return None, "anomaly"


CATEGORIES = {
    "story": (generate_story_tweet, 50),     # Journal excerpts — primary content
    "data": (generate_data_tweet, 25),       # Cross-referenced data discoveries
    "anomaly": (generate_anomaly_tweet, 15), # Suspicious patterns
    "thread": (generate_thread, 10),         # Mini deep-dives
    "engagement": (generate_engagement_tweet, 0),  # Disabled — no engagement fluff
    "product": (generate_product_tweet, 0),  # Disabled — no self-promo
}


def pick_category() -> str:
    """Weighted random category selection."""
    choices = []
    for cat, (_, weight) in CATEGORIES.items():
        choices.extend([cat] * weight)
    return random.choice(choices)


# ── Main ──

def run(category: str = None, dry_run: bool = False):
    """Generate and post a tweet. Links go in a reply for better reach.

    X penalizes tweets with external links by 30-50% reach. Strategy:
    post the insight as native text, then immediately reply with the link.
    Replying to own tweets also boosts algorithm score (+75 weight).
    """
    session = SessionLocal()

    # Rate limit: max 4 tweets/day
    count = posts_today(session)
    if count >= 4 and not dry_run:
        log.info("Already posted %d tweets today. Skipping.", count)
        session.close()
        return

    # Check API health — skip data/thread tweets if API is down
    api_up = api_healthy()
    if not api_up:
        log.warning("API is down. Skipping data tweets, using product/engagement only.")

    # Pick category
    cat = category or pick_category()

    # If API is down, fall back to story (reads from DB) or skip this cycle
    if not api_up and cat in ("data", "thread", "anomaly"):
        cat = "story"

    generator, _ = CATEGORIES.get(cat, (generate_product_tweet, 0))

    # Generate content — all generators return ((text, link), category)
    result, actual_cat = generator()
    if result is None:
        log.warning("Category '%s' returned no content. Trying story fallback.", cat)
        result, actual_cat = generate_story_tweet()
    if result is None:
        log.warning("Story fallback also empty. Trying data tweet.")
        result, actual_cat = generate_data_tweet()
    if result is None:
        log.warning("No content available at all. Skipping this cycle.")
        session.close()
        return

    # Handle thread vs single tweet
    # Threads return (tweets_list, link) where tweets_list is a list
    is_thread = isinstance(result, tuple) and isinstance(result[0], list)

    if is_thread:
        thread_tweets, link = result
        tweet_text = thread_tweets[0]
    else:
        tweet_text, link = result

    if dry_run:
        if is_thread:
            print(f"\n[DRY RUN] Thread ({actual_cat}):")
            for i, t in enumerate(thread_tweets):
                print(f"  [{i+1}] {t}")
            if link:
                print(f"  [REPLY] {link}")
        else:
            print(f"\n[DRY RUN] Tweet ({actual_cat}):")
            print(f"  {tweet_text}")
            if link:
                print(f"  [REPLY] {link}")
        session.close()
        return

    # Check for duplicates — only retries once by design. If both attempts
    # produce duplicates, we skip this cycle rather than looping indefinitely.
    check_text = thread_tweets[0] if is_thread else tweet_text
    if already_posted(session, check_text):
        log.info("Already posted similar content. Regenerating...")
        result, actual_cat = generator()
        if result is None:
            result, actual_cat = generate_story_tweet()
        if result is None:
            result, actual_cat = generate_data_tweet()
        if result is None:
            log.warning("No unique content available. Skipping this cycle.")
            session.close()
            return
        is_thread = isinstance(result, tuple) and isinstance(result[0], list)
        if is_thread:
            thread_tweets, link = result
            tweet_text = thread_tweets[0]
        else:
            tweet_text, link = result
        check_text = thread_tweets[0] if is_thread else tweet_text
        if already_posted(session, check_text):
            log.warning("Still a duplicate. Skipping this cycle.")
            session.close()
            return

    # Post
    if is_thread:
        ids = post_thread(thread_tweets)
        if ids:
            log_tweet(session, ids[0], actual_cat, thread_tweets[0])
            log.info("Thread posted: %d tweets", len(ids))
            # Reply with link after the last tweet in thread
            if link and ids:
                reply_id = post_tweet(link, reply_to=ids[-1])
                if reply_id:
                    log.info("Thread link reply posted: %s", reply_id)
    else:
        tweet_id = post_tweet(tweet_text)
        if tweet_id:
            log_tweet(session, tweet_id, actual_cat, tweet_text)
            log.info("Tweet posted: %s", tweet_id)
            # Reply with link for better reach (links in main tweet = -50% reach)
            if link:
                reply_id = post_tweet(link, reply_to=tweet_id)
                if reply_id:
                    log.info("Link reply posted: %s", reply_id)

    session.close()


def main():
    parser = argparse.ArgumentParser(description="WTP Twitter Bot")
    parser.add_argument("--category", choices=list(CATEGORIES.keys()),
                        help="Force a specific tweet category")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview tweet without posting")
    parser.add_argument("--test", action="store_true",
                        help="Post a test tweet")
    args = parser.parse_args()

    if args.test:
        tweet_id = post_tweet(
            f"Testing WeThePeople bot. Follow the money from industry to politics. {SITE}"
        )
        if tweet_id:
            print(f"Test tweet posted: https://x.com/WTPForUs/status/{tweet_id}")
        else:
            print("Test tweet failed.")
        return

    run(category=args.category, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
