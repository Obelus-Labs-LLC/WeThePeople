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
from datetime import datetime, date, timezone

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.twitter import post_tweet, post_thread
from models.database import SessionLocal, Base
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, event as sa_event

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

API_BASE = os.getenv("WTP_API_URL", "http://localhost:8006")
SITE = "wethepeopleforus.com"

# ── Tweet Log (tracks what we've posted to avoid repeats) ──

from models.database import Base as _Base


class TweetLog(_Base):
    __tablename__ = "tweet_log"
    id = Column(Integer, primary_key=True)
    tweet_id = Column(String(50))
    category = Column(String(50))
    content_hash = Column(String(64), unique=True)
    text = Column(Text)
    posted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


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
    """Pull real data and generate a punchy, name-and-dollar tweet.

    Strategy: Post insight as native text (no link), then reply with link.
    Links in main tweet get 30-50% reach penalty on X.
    """
    options = []

    # Try: top lobbying — name names
    data = api_get("/influence/top-lobbying", {"limit": 10})
    items = data if isinstance(data, list) else data.get("leaders", [])
    if items:
        item = random.choice(items[:5])
        name = item.get("display_name", item.get("name", "A company"))
        total = item.get("total_lobbying", 0)
        if total > 0:
            options.append((
                f"{name} spent {_fmt_money(total)} lobbying Congress.\n\n"
                f"Wonder what they asked for.",
                f"{SITE}/influence"
            ))

    # Try: top contracts — taxpayer angle
    data = api_get("/influence/top-contracts", {"limit": 10})
    items = data if isinstance(data, list) else data.get("leaders", [])
    if items:
        item = random.choice(items[:5])
        name = item.get("display_name", item.get("name", "A company"))
        total = item.get("total_contracts", 0)
        if total > 0:
            options.append((
                f"{name} received {_fmt_money(total)} in government contracts.\n\n"
                f"Your tax dollars. Their bottom line.",
                f"{SITE}/influence"
            ))

    # Try: congressional trades — irony/conflict angle
    data = api_get("/congressional-trades", {"limit": 20})
    trades = data.get("trades", data.get("items", []))
    if trades:
        trade = random.choice(trades[:10])
        person = trade.get("member_name", trade.get("person_name", "A member of Congress"))
        ticker = trade.get("ticker", "???")
        raw_type = (trade.get("transaction_type", "") or "").lower()
        tx_type = {"purchase": "bought", "sale": "sold", "sale (partial)": "sold", "purchase (partial)": "bought", "exchange": "exchanged"}.get(raw_type, "traded")
        amount = trade.get("amount_range", "")
        amount_str = f" ({amount})" if amount and amount != "N/A" else ""
        options.append((
            f"{person} {tx_type} ${ticker}{amount_str}.\n\n"
            f"Disclosed days later. As required by law. Barely.",
            f"{SITE}/politics/trades"
        ))

    # Try: influence stats — big numbers
    # API returns: total_lobbying_spend, total_contract_value, total_enforcement_actions, politicians_connected
    stats = api_get("/influence/stats")
    if stats:
        lobbying_spend = stats.get("total_lobbying_spend", 0)
        contract_value = stats.get("total_contract_value", 0)
        enforcement = stats.get("total_enforcement_actions", 0)
        politicians = stats.get("politicians_connected", 0)
        if lobbying_spend > 0 and contract_value > 0:
            options.append((
                f"{_fmt_money(lobbying_spend)} in lobbying.\n"
                f"{_fmt_money(contract_value)} in government contracts.\n"
                f"{enforcement:,} enforcement actions.\n\n"
                f"All searchable. All free.",
                SITE
            ))

    if not options:
        return None, "data"

    tweet_text, link = random.choice(options)
    return (tweet_text, link), "data"


def generate_product_tweet() -> tuple:
    """Generate a punchy product awareness tweet. Link goes in reply."""
    templates = [
        ("Your senator bought pharma stocks while sitting on the Health Committee.\n\nWe track every trade.", f"{SITE}/politics/trades"),
        ("One search. Every lobbying dollar, every contract, every enforcement action.\n\nSix sectors. Open source.", SITE),
        ("We cross-reference congressional trades with committee assignments.\n\nThe overlap is... something.", f"{SITE}/politics/trades"),
        ("Want to know who's lobbying your state's politicians?\n\nWe mapped it.", f"{SITE}/influence/map"),
        ("6 sectors. 26 data sources. 600K+ records. No paywall.", SITE),
        ("Politicians write the rules. Corporations fund the politicians.\n\nWe track both sides.", SITE),
        ("Every government contract. Every lobbying filing. Every stock trade by Congress.\n\nOne platform.", SITE),
        ("Think your representative works for you?\n\nCheck who's actually paying them.", f"{SITE}/politics"),
        ("We built what Congress hoped nobody would build — a searchable record of who pays them.", SITE),
        ("The influence network shows you exactly how money flows from corporations to politicians.", f"{SITE}/influence/network"),
        ("FDA enforcement. SEC filings. Lobbying spend. All connected for every major health company.", f"{SITE}/health"),
        ("CFPB complaints, insider trades, lobbying filings — the full picture on every major bank.", f"{SITE}/finance"),
        ("Follow the money from industry to politics.\n\nThat's literally all we do.", SITE),
        ("Open source. Because transparency shouldn't have a paywall.", SITE),
        ("\"I don't take corporate money.\"\n\nCool. We checked the FEC filings.\n\nYou do.", f"{SITE}/verify"),
    ]

    tweet_text, link = random.choice(templates)
    return (tweet_text, link), "product"


def generate_verify_tweet() -> tuple:
    """Generate a claim verification promo tweet. Link in reply."""
    templates = [
        ("Politicians talk. We check receipts.", f"{SITE}/verify"),
        ("They said they'd never take corporate money.\n\nThe FEC data says otherwise.", f"{SITE}/verify"),
        ("Submit any political claim. We match it against votes, trades, lobbying, contracts, and donations.\n\nAutomatically.", f"{SITE}/verify"),
        ("\"I've always fought for the working class.\"\n\nCool. Let's see the lobbying disclosures.", f"{SITE}/verify"),
        ("Campaign promises vs. legislative record.\n\nWe automate that comparison.", f"{SITE}/verify"),
        ("9 data sources. One verdict.\n\nStrong. Moderate. Weak. Unverified.\n\nEvery claim, fact-checked against the record.", f"{SITE}/verify"),
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
        f"{name} spent {_fmt_money(lobby_total)} lobbying Congress. Where'd that money go?",
        f"We track every dollar — from lobbying filings to government contracts to stock trades by the politicians they target. {SITE}/influence/network",
    ]

    return tweets, "thread"


# ── Category Rotation ──

CATEGORIES = {
    "data": (generate_data_tweet, 30),
    "product": (generate_product_tweet, 30),
    "thread": (generate_thread, 20),
    "verify": (generate_verify_tweet, 10),
    "engagement": (generate_engagement_tweet, 10),
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

    # If API is down, only allow categories that don't need live data
    if not api_up and cat in ("data", "thread"):
        cat = random.choice(["product", "verify", "engagement"])

    generator, _ = CATEGORIES.get(cat, (generate_product_tweet, 0))

    # Generate content — all generators return ((text, link), category)
    result, actual_cat = generator()
    if result is None:
        log.warning("Category '%s' returned no content. Falling back to product.", cat)
        result, actual_cat = generate_product_tweet()

    # Handle thread vs single tweet
    is_thread = isinstance(result, list)

    if is_thread:
        tweet_text = result[0]
        link = None
    else:
        tweet_text, link = result

    if dry_run:
        if is_thread:
            print(f"\n[DRY RUN] Thread ({actual_cat}):")
            for i, t in enumerate(result):
                print(f"  [{i+1}] {t}")
        else:
            print(f"\n[DRY RUN] Tweet ({actual_cat}):")
            print(f"  {tweet_text}")
            if link:
                print(f"  [REPLY] {link}")
        session.close()
        return

    # Check for duplicates — only retries once by design. If both attempts
    # produce duplicates, we skip this cycle rather than looping indefinitely.
    check_text = result[0] if is_thread else tweet_text
    if already_posted(session, check_text):
        log.info("Already posted similar content. Regenerating...")
        result, actual_cat = generator()
        if result is None:
            result, actual_cat = generate_product_tweet()
        is_thread = isinstance(result, list)
        if is_thread:
            tweet_text = result[0]
            link = None
        else:
            tweet_text, link = result
        check_text = result[0] if is_thread else tweet_text
        if already_posted(session, check_text):
            log.warning("Still a duplicate. Skipping this cycle.")
            session.close()
            return

    # Post
    if is_thread:
        ids = post_thread(result)
        if ids:
            log_tweet(session, ids[0], actual_cat, result[0])
            log.info("Thread posted: %d tweets", len(ids))
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
