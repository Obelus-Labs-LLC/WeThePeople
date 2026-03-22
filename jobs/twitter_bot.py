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
from datetime import datetime, date

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
    posted_at = Column(DateTime, default=datetime.utcnow)


# ── API Helpers ──

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
    session.add(TweetLog(
        tweet_id=tweet_id,
        category=category,
        content_hash=content_hash(text),
        text=text,
    ))
    session.commit()


def posts_today(session) -> int:
    """Count tweets posted today."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
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
    """Pull real data from the API and generate a 'Today in Influence' tweet."""
    options = []

    # Try: top lobbying
    data = api_get("/influence/top-lobbying", {"limit": 10})
    items = data if isinstance(data, list) else data.get("items", [])
    if items:
        item = random.choice(items[:5])
        name = item.get("name", "A company")
        total = item.get("total_income", 0) or item.get("total", 0)
        if total > 0:
            options.append(
                f"{name} spent {_fmt_money(total)} lobbying Congress. "
                f"Wonder what they want. {SITE}/influence"
            )

    # Try: top contracts
    data = api_get("/influence/top-contracts", {"limit": 10})
    items = data if isinstance(data, list) else data.get("items", [])
    if items:
        item = random.choice(items[:5])
        name = item.get("name", "A company")
        total = item.get("total_value", 0) or item.get("total", 0)
        if total > 0:
            options.append(
                f"{name} landed {_fmt_money(total)} in government contracts. "
                f"Your tax dollars at work. {SITE}/influence"
            )

    # Try: recent congressional trades
    data = api_get("/congressional-trades", {"limit": 20})
    trades = data.get("trades", data.get("items", []))
    if trades:
        trade = random.choice(trades[:10])
        person = trade.get("person_name", trade.get("politician", "A member of Congress"))
        ticker = trade.get("ticker", "???")
        tx_type = (trade.get("transaction_type", "") or "traded").lower()
        options.append(
            f"{person} just {tx_type} {ticker} stock. "
            f"Check the full trade log. {SITE}/politics/trades"
        )

    # Try: influence stats for a big number
    stats = api_get("/influence/stats")
    if stats:
        total_lobbying = stats.get("total_lobbying_filings", 0)
        total_contracts = stats.get("total_contracts", 0)
        total_trades = stats.get("total_trades", 0)
        if total_lobbying > 1000:
            options.append(
                f"We're tracking {total_lobbying:,} lobbying filings, "
                f"{total_contracts:,} government contracts, and {total_trades:,} "
                f"congressional stock trades. All free. {SITE}"
            )

    if not options:
        return None, "data"

    tweet = random.choice(options)
    return tweet, "data"


def generate_product_tweet() -> tuple:
    """Generate a 'Did You Know?' product awareness tweet."""
    templates = [
        f"Your senator bought pharma stocks while sitting on the Health Committee. We track all the trades. {SITE}/politics/trades",
        f"One search. Every lobbying dollar, every contract, every enforcement action. Six sectors. All free. {SITE}",
        f"We cross-reference congressional trades with committee assignments. The overlap is... something. {SITE}/politics/trades",
        f"Want to know who's lobbying your state's politicians? We mapped it. {SITE}/influence/map",
        f"6 sectors. 26 data sources. 600K+ records. No paywall. {SITE}",
        f"Politicians write the rules. Corporations fund the politicians. We track both sides. {SITE}",
        f"Every government contract. Every lobbying filing. Every stock trade by Congress. One platform. {SITE}",
        f"Think your representative works for you? Check who's actually paying them. {SITE}/politics",
        f"We built what Congress hoped nobody would build — a searchable record of who pays them. {SITE}",
        f"The influence network graph shows you exactly how money flows from corporations to politicians. {SITE}/influence/network",
        f"Track FDA enforcement, SEC filings, and lobbying spend for every major health company. All connected. {SITE}/health",
        f"Boeing, Lockheed, Raytheon — see which defense contractors are lobbying the hardest. {SITE}/transportation",
        f"CFPB complaints, insider trades, lobbying filings — the full picture on every major bank. {SITE}/finance",
        f"Follow the money from industry to politics. That's literally all we do. {SITE}",
        f"Open source. Free forever. Because transparency shouldn't have a paywall. {SITE}",
    ]

    tweet = random.choice(templates)
    return tweet, "product"


def generate_verify_tweet() -> tuple:
    """Generate a claim verification promo tweet."""
    templates = [
        f"Politicians talk. We check receipts. {SITE}/verify",
        f"They said they'd never take corporate money. The FEC data says otherwise. {SITE}/verify",
        f"Submit any political claim. We'll match it against the actual record — votes, trades, lobbying, all of it. {SITE}/verify",
        f"\"I've always fought for the working class.\" Cool. Let's see the lobbying disclosures. {SITE}/verify",
        f"Campaign promises vs. legislative record. We automate that comparison. {SITE}/verify",
    ]

    tweet = random.choice(templates)
    return tweet, "verify"


def generate_engagement_tweet() -> tuple:
    """Generate an engagement tweet (poll-style, question, etc.)."""
    templates = [
        "Guess which sector spent the most on lobbying this year. Wrong answers only.",
        "Name a politician. We'll show you who's paying them.",
        "What company should we investigate next? Drop a name.",
        "Which surprises you more — the lobbying spend or the stock trades?",
        "If you could make one thing about Congress transparent, what would it be?",
    ]

    tweet = random.choice(templates)
    return tweet, "engagement"


def generate_thread() -> tuple:
    """Generate a short 'Follow the Money' thread (2-3 tweets max)."""
    # Pull data to build a real thread
    lobbying = api_get("/influence/top-lobbying", {"limit": 5})
    items = lobbying if isinstance(lobbying, list) else lobbying.get("items", [])

    if not items:
        return None, "thread"

    company = random.choice(items[:3])
    name = company.get("name", "A major corporation")
    lobby_total = company.get("total_income", 0) or company.get("total", 0)

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
    """Generate and post a tweet."""
    session = SessionLocal()

    # Rate limit: max 4 tweets/day
    count = posts_today(session)
    if count >= 4 and not dry_run:
        log.info("Already posted %d tweets today. Skipping.", count)
        session.close()
        return

    # Pick category
    cat = category or pick_category()
    generator, _ = CATEGORIES.get(cat, (generate_product_tweet, 0))

    # Generate content
    result, actual_cat = generator()
    if result is None:
        log.warning("Category '%s' returned no content. Falling back to product.", cat)
        result, actual_cat = generate_product_tweet()

    # Handle thread vs single tweet
    is_thread = isinstance(result, list)

    if dry_run:
        if is_thread:
            print(f"\n[DRY RUN] Thread ({actual_cat}):")
            for i, t in enumerate(result):
                print(f"  [{i+1}] {t}")
        else:
            print(f"\n[DRY RUN] Tweet ({actual_cat}):")
            print(f"  {result}")
        session.close()
        return

    # Check for duplicates
    check_text = result[0] if is_thread else result
    if already_posted(session, check_text):
        log.info("Already posted similar content. Regenerating...")
        # Try once more
        result, actual_cat = generator()
        if result is None:
            result, actual_cat = generate_product_tweet()
        is_thread = isinstance(result, list)
        check_text = result[0] if is_thread else result
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
        tweet_id = post_tweet(result)
        if tweet_id:
            log_tweet(session, tweet_id, actual_cat, result)
            log.info("Tweet posted: %s", tweet_id)

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
