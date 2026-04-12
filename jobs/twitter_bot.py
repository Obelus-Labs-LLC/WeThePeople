"""
Twitter Bot — Automated posting for @WTPForUs.

Production-grade automated posting system for the WeThePeople civic
transparency platform. Posts data-driven tweets about corporate lobbying,
government contracts, congressional trades, and enforcement actions.

Tier: Basic ($200/month) — 3,000 posts/month capacity.
Target: 10-12 posts/day (stories + data + threads).
Tone: Factual, authoritative, neutral. Let the data speak.

Safety:
    - Gate 5: STORIES_ONLY mode ensures only human-approved stories go out
    - Kill switch: WTP_BOT_PAUSED=1 or .bot_paused file halts all posting
    - Content moderation: filters loaded language and unsafe content
    - UTM tracking: all links tracked for performance measurement
    - Legal: presents public record data, never accuses or implies wrongdoing

Schedule: Cron-triggered at US-optimized times (UTC):
    12:17, 13:43, 16:11, 17:37, 21:08, 23:22, 01:14

Usage:
    python jobs/twitter_bot.py                  # Auto-pick category and post
    python jobs/twitter_bot.py --category data  # Post a specific category
    python jobs/twitter_bot.py --dry-run        # Preview without posting
    python jobs/twitter_bot.py --test           # Post a test tweet
    python jobs/twitter_bot.py --collect-metrics # Update engagement metrics
"""

import os
import sys
import json
import random
import argparse
import logging
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.twitter import (
    post_tweet, post_thread, verify_account,
    get_tweet_metrics, get_own_recent_tweets,
)
from models.database import SessionLocal
from models.twitter_models import TweetLog
from utils.twitter_helpers import (
    SITE, JOURNAL_SITE, MAX_POSTS_PER_DAY, OUR_USERNAME,
    api_get, api_healthy, is_paused,
    fmt_money, content_hash, strip_markdown,
    entity_tweeted_recently, already_posted, posts_today, log_tweet,
    build_url, build_profile_url, build_journal_url,
    content_is_safe, neutralize_language, validate_tweet_length,
    format_sources, data_freshness_note,
    pick_hashtags, SOURCE_DB_MAP,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# Gate 5 enforcement: when set, the bot will ONLY post tweets derived from
# journal stories that a human approved via /ops/story-queue.
STORIES_ONLY = os.getenv("WTP_BOT_STORIES_ONLY", "1") == "1"


# ── Tweet Generators ───────────────────────────────────────────────────────────

def generate_data_tweet(session) -> tuple:
    """Pull real data and generate a factual tweet that cross-references records.

    Strategy: Lead with the discovery, not the product. Name names, show
    connections, cite sources. Link goes in reply for algorithmic reach.
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
            if entity_tweeted_recently(session, name, days=3):
                continue
            lobby = lobby_map[eid].get("total_lobbying", 0)
            contracts = ci.get("total_contracts", 0)
            sector = ci.get("sector", "")
            if lobby > 0 and contracts > 0:
                freshness = data_freshness_note()
                options.append((
                    f"{name} spent {fmt_money(lobby)} lobbying Congress and received "
                    f"{fmt_money(contracts)} in government contracts.\n\n"
                    f"Cross-referenced from public records {freshness}.\n\n"
                    f"Data: Senate LDA Filings, USASpending.gov\n\n"
                    f"#FollowTheMoney",
                    build_profile_url(sector, eid, campaign="data") if sector
                    else build_url("/influence", campaign="data")
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
                if gap > 45:
                    gap_note = f" Disclosure filed {gap} days after the trade (45-day deadline)."
                elif gap > 30:
                    gap_note = f" Disclosed {gap} days after the trade."
            except (ValueError, TypeError):
                pass

        amount_str = f" ({amount})" if amount and amount != "N/A" else ""
        options.append((
            f"{person} {tx_verb} ${ticker} stock{amount_str}.{gap_note}\n\n"
            f"Members of Congress are required to disclose trades within 45 days "
            f"under the STOCK Act.\n\n"
            f"Source: House Financial Disclosures\n\n"
            f"#CongressTrades #STOCKAct",
            build_url("/politics/trades", campaign="data")
        ))

    # --- Lobbying-to-enforcement ratio insight ---
    stats = api_get("/influence/stats")
    if stats and stats.get("by_sector"):
        sectors = stats["by_sector"]
        best_ratio = None
        best_sector = None
        for sec_name, sec_data in sectors.items():
            lobby_spend = sec_data.get("lobbying", 0)
            enforcement = sec_data.get("enforcement", 0)
            if lobby_spend > 0 and enforcement > 0:
                ratio = lobby_spend / enforcement
                if best_ratio is None or ratio > best_ratio:
                    best_ratio = ratio
                    best_sector = (sec_name, sec_data)

        if best_sector:
            sec_name, sec_data = best_sector
            lobby_spend = sec_data.get("lobbying", 0)
            enforcement_count = sec_data.get("enforcement", 0)
            if lobby_spend > 1000:
                options.append((
                    f"The {sec_name} sector spent {fmt_money(lobby_spend)} on lobbying "
                    f"and faces {enforcement_count:,} enforcement actions on record.\n\n"
                    f"That's {fmt_money(lobby_spend / max(enforcement_count, 1))} in lobbying "
                    f"per enforcement action.\n\n"
                    f"Source: Senate LDA Filings, Federal Agency Records\n\n"
                    f"#CorporateLobbying #Accountability",
                    build_url(f"/{sec_name}", campaign="data")
                ))

    # --- Single company deep dive ---
    if lobby_items:
        item = random.choice(lobby_items[:5])
        name = item.get("display_name", "A company")
        sector = item.get("sector", "")
        eid = item.get("entity_id", "")
        total = item.get("total_lobbying", 0)
        if total > 0 and sector and eid and not entity_tweeted_recently(session, name, days=3):
            options.append((
                f"Since 2020, {name} has filed {fmt_money(total)} in lobbying disclosures "
                f"with the U.S. Senate.\n\n"
                f"Who they lobbied. What they asked for. All public record.\n\n"
                f"Source: Senate LDA Filings {data_freshness_note()}\n\n"
                f"#CorporateLobbying",
                build_profile_url(sector, eid, campaign="data")
            ))

    if not options:
        return None, "data"

    tweet_text, link = random.choice(options)
    # Safety: neutralize any loaded language and validate content
    tweet_text = neutralize_language(tweet_text)
    if not content_is_safe(tweet_text):
        log.warning("Generated data tweet failed safety check, skipping")
        return None, "data"
    return (tweet_text, link), "data"


def generate_story_tweet(session) -> tuple:
    """Generate a tweet from a published, human-approved journal story.

    The primary content type. Pulls from approved stories, constructs
    a compelling excerpt with source attribution and tracked link.
    """
    data = api_get("/stories/latest", {"limit": 50})
    stories = data.get("stories", [])
    if not stories:
        if STORIES_ONLY:
            log.info("No published stories available; STORIES_ONLY mode skipping cycle")
            return None, "story"
        return generate_data_tweet(session)

    # Filter out stories about entities we tweeted about recently
    candidates = []
    for s in stories:
        title = s.get("title", "")
        entity_ids = s.get("entity_ids", [])
        recently_covered = False
        for eid in entity_ids:
            display = eid.replace("_", " ").replace("-", " ")
            if entity_tweeted_recently(session, display, days=3):
                recently_covered = True
                break
        if not recently_covered and title:
            for word in title.split():
                if len(word) > 5 and word[0].isupper() and entity_tweeted_recently(session, word, days=3):
                    recently_covered = True
                    break
        if not recently_covered:
            candidates.append(s)

    if not candidates:
        candidates = stories  # Fall back if everything was recent

    story = random.choice(candidates[:10])
    title = story.get("title", "")
    summary = story.get("summary", "")
    body = story.get("body", "") or story.get("content", "")
    slug = story.get("slug", "")
    category = story.get("category", "")
    data_sources = story.get("data_sources", [])

    if not title:
        if STORIES_ONLY:
            log.info("Selected story has no title; STORIES_ONLY mode skipping cycle")
            return None, "story"
        return generate_data_tweet(session)

    # ── Lobbying breakdown: tease-and-link pattern ──
    if category == "lobbying_breakdown":
        evidence = story.get("evidence", {})
        total = evidence.get("total_lobbying_spend", 0)
        issue_count = evidence.get("issue_count", 0)
        top_issue = evidence.get("top_issue", "")
        top_spend = evidence.get("top_issue_spend", 0)
        sector_label = (story.get("sector") or "corporate").capitalize()

        if total and top_issue:
            fmt_total = fmt_money(total)
            fmt_top = fmt_money(top_spend)
            remaining = total - top_spend
            fmt_remaining = fmt_money(remaining)

            parts = [
                f"{sector_label} companies filed thousands of lobbying disclosures "
                f"totaling {fmt_total} across {issue_count} policy areas.",
                f"{top_issue} was the top target at {fmt_top}.",
                f"Where did the other {fmt_remaining} go?",
                f"Full breakdown with government sources:",
            ]
        else:
            parts = [title, "Where does the lobbying money actually go? "
                     "We broke it down by issue, agency, and company."]

        link = build_journal_url(slug, campaign="story") if slug else build_url("", site=JOURNAL_SITE, campaign="story")
        parts.append("#FollowTheMoney #CorporateLobbying")
        text = "\n\n".join(parts)
        return (text, link), "story"

    # ── Standard stories: title + summary + body excerpt ──
    excerpt_paras = []
    if body:
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
        summary_lower = (summary or "").lower()[:80]
        for p in paragraphs:
            if len(excerpt_paras) >= 2:
                break
            if p.startswith("#"):
                continue
            if summary_lower and p.lower()[:80] == summary_lower:
                continue
            excerpt_paras.append(p)

    parts = [title]
    if summary:
        parts.append(summary)
    if excerpt_paras:
        parts.append("\n\n".join(excerpt_paras))

    # Source attribution
    if data_sources:
        source_line = format_sources(data_sources)
        if source_line:
            parts.append(source_line)

    # CTA
    link = build_journal_url(slug, campaign="story") if slug else build_url("", site=JOURNAL_SITE, campaign="story")
    parts.append("Read the full investigation:")

    # Category-specific hashtag
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
        "lobbying_breakdown": "#CorporateLobbying",
        "enforcement_immunity": "#Accountability",
        "penalty_contract_ratio": "#Accountability",
        "prolific_trader": "#CongressTrades",
        "stock_act_violation": "#CongressTrades",
        "committee_stock_trade": "#CongressTrades",
    }.get(category, "#FollowTheMoney")
    parts.append(hashtag)

    text = "\n\n".join(parts)
    text = strip_markdown(text)
    text = validate_tweet_length(text, max_length=4000)

    return (text, link), "story"


def generate_thread(session) -> tuple:
    """Generate a short 'Follow the Money' thread (2-3 tweets).

    Threads consistently outperform single tweets for in-depth content.
    """
    lobbying = api_get("/influence/top-lobbying", {"limit": 5})
    items = lobbying if isinstance(lobbying, list) else lobbying.get("leaders", [])

    if not items:
        return None, "thread"

    # Filter out recently tweeted entities
    candidates = [
        c for c in items
        if not entity_tweeted_recently(session, c.get("display_name", c.get("name", "")), days=3)
    ]
    if not candidates:
        candidates = items

    company = random.choice(candidates[:5])
    name = company.get("display_name", company.get("name", "A major corporation"))
    lobby_total = company.get("total_lobbying", 0)

    if lobby_total <= 0:
        return None, "thread"

    sector = company.get("sector", "")
    entity_id = company.get("entity_id", company.get("id", ""))
    contracts_total = company.get("total_contracts", 0)

    tweet1 = (
        f"{name} spent {fmt_money(lobby_total)} lobbying Congress since 2020.\n\n"
        f"Here's what public records show:\n\n"
        f"#FollowTheMoney"
    )

    if contracts_total > 0:
        tweet2 = (
            f"During the same period, they received {fmt_money(contracts_total)} "
            f"in government contracts from the same agencies they lobbied.\n\n"
            f"The public record shows both sides of this relationship.\n\n"
            f"Data: Senate LDA Filings, USASpending.gov"
        )
    else:
        tweet2 = (
            f"That's {fmt_money(lobby_total)} spent on lobbying disclosures "
            f"filed with the U.S. Senate.\n\n"
            f"We track every filing from lobbying to government contracts.\n\n"
            f"Source: Senate LDA Filings"
        )

    tweets = [tweet1, tweet2]
    link = build_profile_url(sector, entity_id, campaign="thread") if sector and entity_id else build_url("/influence/network", campaign="thread")

    return (tweets, link), "thread"


def generate_anomaly_tweet(session) -> tuple:
    """Generate a tweet from detected anomalies.

    IMPORTANT: Uses neutral, factual language. Never implies wrongdoing.
    Presents the data pattern and lets readers draw their own conclusions.
    """
    data = api_get("/anomalies", {"limit": 10})
    anomalies = data.get("anomalies", data.get("items", []))
    if not anomalies:
        return None, "anomaly"

    anomaly = random.choice(anomalies[:5])
    a_type = anomaly.get("type", anomaly.get("anomaly_type", ""))
    entity = anomaly.get("entity_name", anomaly.get("name", ""))

    if entity and entity_tweeted_recently(session, entity, days=3):
        return None, "anomaly"

    if a_type in ("trade_committee_overlap", "trade-committee"):
        ticker = anomaly.get("ticker", anomaly.get("details", {}).get("ticker", ""))
        committee = anomaly.get("committee", anomaly.get("details", {}).get("committee", ""))
        person = entity or "A member of Congress"
        if ticker and committee:
            text = (
                f"{person} traded ${ticker} while serving on the {committee}.\n\n"
                f"The STOCK Act requires disclosure of such trades. "
                f"This one is publicly documented.\n\n"
                f"Source: House Financial Disclosures, Committee Assignments\n\n"
                f"#CongressTrades #STOCKAct"
            )
        elif ticker:
            text = (
                f"{person} traded ${ticker} stock. The trade and related legislative "
                f"activity are both documented in public filings.\n\n"
                f"Source: House Financial Disclosures\n\n"
                f"#CongressTrades"
            )
        else:
            text = (
                f"{person}'s stock trades overlap with their committee assignments, "
                f"according to public financial disclosures.\n\n"
                f"Source: House Financial Disclosures, Committee Assignments\n\n"
                f"#CongressTrades"
            )
        return (text, build_url("/politics/trades", campaign="anomaly")), "anomaly"

    elif a_type in ("lobbying_contract_correlation", "lobbying-contract"):
        company = entity or "A major corporation"
        lobby_amt = anomaly.get("lobbying_amount", anomaly.get("details", {}).get("lobbying_amount", 0))
        contract_amt = anomaly.get("contract_amount", anomaly.get("details", {}).get("contract_amount", 0))
        if lobby_amt and contract_amt:
            text = (
                f"{company} spent {fmt_money(lobby_amt)} lobbying Congress, "
                f"then received {fmt_money(contract_amt)} in government contracts.\n\n"
                f"Both are documented in public filings.\n\n"
                f"Data: Senate LDA Filings, USASpending.gov\n\n"
                f"#FollowTheMoney"
            )
        else:
            text = (
                f"{company}'s lobbying filings and government contract awards "
                f"show temporal overlap, according to public records.\n\n"
                f"Data: Senate LDA Filings, USASpending.gov\n\n"
                f"#FollowTheMoney"
            )
        return (text, build_url("/influence", campaign="anomaly")), "anomaly"

    elif a_type in ("enforcement_anomaly", "enforcement"):
        company = entity or "A company"
        text = (
            f"{company} has enforcement actions on record while maintaining "
            f"active lobbying filings with the U.S. Senate.\n\n"
            f"Both are publicly documented.\n\n"
            f"Data: Federal Agency Records, Senate LDA Filings\n\n"
            f"#CorporateAccountability"
        )
        return (text, build_url("/influence", campaign="anomaly")), "anomaly"

    elif a_type in ("donation_timing", "donation-timing"):
        person = entity or "A politician"
        text = (
            f"PAC donations to {person} and a key committee vote "
            f"occurred within the same reporting period, "
            f"according to FEC and congressional records.\n\n"
            f"Data: FEC Campaign Finance Data, Congressional Record\n\n"
            f"#CampaignFinance"
        )
        return (text, build_url("/politics", campaign="anomaly")), "anomaly"

    # Generic fallback
    description = anomaly.get("description", anomaly.get("summary", ""))
    if description:
        text = neutralize_language(f"{description}\n\nSource: Public records\n\n#FollowTheMoney")
        if content_is_safe(text):
            return (text, build_url("/influence", campaign="anomaly")), "anomaly"

    return None, "anomaly"


def generate_engagement_tweet() -> tuple:
    """Generate an engagement tweet. No link - pure engagement.

    Asks questions that invite data-curious followers to interact.
    """
    templates = [
        "Which sector do you think spends the most on lobbying?\n\nWe have the receipts.",
        "Name a politician. We'll show you their financial disclosures, stock trades, and donor list.\n\nAll public record.",
        "What company should we investigate next? Drop a name below.",
        "What's more surprising to you — the amount of lobbying spend or the congressional stock trades?",
        "If you could make one thing about Congress more transparent, what would it be?",
        "Your representative made a stock trade last month.\n\nDid you know? Should you care?",
        "We track 1,000+ companies across 11 sectors.\n\nLobbying. Contracts. Enforcement. Trades. Donations.\n\nWhat should we dig into next?",
    ]
    tweet_text = random.choice(templates)
    return (tweet_text, None), "engagement"


# ── Category Rotation ──────────────────────────────────────────────────────────

if STORIES_ONLY:
    # Gate 5: only human-approved journal stories
    CATEGORIES = {
        "story": (generate_story_tweet, 100),
        "data": (generate_data_tweet, 0),
        "anomaly": (generate_anomaly_tweet, 0),
        "thread": (generate_thread, 0),
        "engagement": (generate_engagement_tweet, 0),
    }
else:
    # Full content mix for paid tier utilization
    CATEGORIES = {
        "story": (generate_story_tweet, 40),      # Journal excerpts — primary
        "data": (generate_data_tweet, 25),        # Cross-referenced data
        "anomaly": (generate_anomaly_tweet, 15),  # Patterns from public records
        "thread": (generate_thread, 15),          # Mini deep-dives (high engagement)
        "engagement": (generate_engagement_tweet, 5),  # Community questions
    }


def pick_category() -> str:
    """Weighted random category selection."""
    if STORIES_ONLY:
        return "story"
    choices = []
    for cat, (_, weight) in CATEGORIES.items():
        choices.extend([cat] * weight)
    return random.choice(choices)


# ── Engagement Metrics Collection ──────────────────────────────────────────────

def collect_metrics():
    """Fetch engagement metrics for recent tweets and update the database.

    Called periodically to track which content categories perform best.
    Basic tier supports public_metrics on tweet lookup.
    """
    session = SessionLocal()
    try:
        # Get tweets from the last 7 days that don't have metrics yet
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        tweets = (
            session.query(TweetLog)
            .filter(
                TweetLog.posted_at >= cutoff,
                TweetLog.metrics_updated_at.is_(None),
                TweetLog.tweet_id.isnot(None),
            )
            .limit(50)
            .all()
        )

        updated = 0
        for tweet in tweets:
            if not tweet.tweet_id:
                continue
            metrics = get_tweet_metrics(tweet.tweet_id)
            if metrics:
                tweet.impressions = metrics.get("impression_count", 0)
                tweet.likes = metrics.get("like_count", 0)
                tweet.retweets = metrics.get("retweet_count", 0)
                tweet.replies = metrics.get("reply_count", 0)
                tweet.quotes = metrics.get("quote_count", 0)
                tweet.bookmarks = metrics.get("bookmark_count", 0)
                # Weighted engagement score
                tweet.engagement_score = (
                    (tweet.likes or 0) * 1.0
                    + (tweet.retweets or 0) * 3.0
                    + (tweet.replies or 0) * 5.0
                    + (tweet.quotes or 0) * 4.0
                    + (tweet.bookmarks or 0) * 2.0
                )
                tweet.metrics_updated_at = datetime.now(timezone.utc)
                updated += 1

            # Brief pause to respect rate limits
            time.sleep(1)

        if updated:
            session.commit()
            log.info("Updated metrics for %d tweets", updated)
        else:
            log.info("No tweets needed metrics update")

    except Exception as e:
        session.rollback()
        log.error("Failed to collect metrics: %s", e)
    finally:
        session.close()


# ── Main ───────────────────────────────────────────────────────────────────────

def run(category: str = None, dry_run: bool = False):
    """Generate and post a tweet. Links go in a reply for better reach.

    X penalizes tweets with external links by 30-50% reach. Strategy:
    post the insight as native text, then immediately reply with the link.
    """
    # Kill switch
    if is_paused():
        log.warning("Bot is PAUSED (kill switch active). Exiting.")
        return

    session = SessionLocal()
    try:
        _run_inner(session, category, dry_run)
    finally:
        session.close()


def _run_inner(session, category: str = None, dry_run: bool = False):
    """Inner run logic — session lifetime managed by run()."""
    # Rate limit: paid tier allows more, but we stay conservative
    count = posts_today(session)
    if count >= MAX_POSTS_PER_DAY and not dry_run:
        log.info("Already posted %d tweets today (max %d). Skipping.", count, MAX_POSTS_PER_DAY)
        return

    # Check API health
    api_up = api_healthy()
    if not api_up:
        log.warning("API is down. Falling back to story category only.")

    # Pick category
    cat = category or pick_category()

    # If API is down, fall back to story (reads from DB)
    if not api_up and cat in ("data", "thread", "anomaly"):
        cat = "story"

    # Gate 5: force story in STORIES_ONLY mode
    if STORIES_ONLY and cat != "story":
        log.info("STORIES_ONLY mode: ignoring '%s', using 'story'", cat)
        cat = "story"

    generator, _ = CATEGORIES.get(cat, (generate_story_tweet, 0))

    # Generate content — generators now take session parameter
    result, actual_cat = generator(session) if cat != "engagement" else generator()

    if result is None and not STORIES_ONLY:
        log.warning("Category '%s' returned no content. Trying story fallback.", cat)
        result, actual_cat = generate_story_tweet(session)
    if result is None and not STORIES_ONLY:
        log.warning("Story fallback empty. Trying data tweet.")
        result, actual_cat = generate_data_tweet(session)
    if result is None:
        log.info("No content available for this cycle. Skipping.")
        return

    # Handle thread vs single tweet
    is_thread = isinstance(result, tuple) and isinstance(result[0], list)

    if is_thread:
        thread_tweets, link = result
        thread_tweets = [strip_markdown(t) for t in thread_tweets]
        tweet_text = thread_tweets[0]
    else:
        tweet_text, link = result
        tweet_text = strip_markdown(tweet_text)
        tweet_text = validate_tweet_length(tweet_text)

    # Final safety check
    check_text = thread_tweets[0] if is_thread else tweet_text
    if not content_is_safe(check_text):
        log.warning("Generated tweet failed safety check. Skipping this cycle.")
        return

    if dry_run:
        if is_thread:
            print(f"\n[DRY RUN] Thread ({actual_cat}):")
            for i, t in enumerate(thread_tweets):
                print(f"  [{i+1}] ({len(t)} chars) {t}")
            if link:
                print(f"  [REPLY LINK] {link}")
        else:
            print(f"\n[DRY RUN] Tweet ({actual_cat}, {len(tweet_text)} chars):")
            print(f"  {tweet_text}")
            if link:
                print(f"  [REPLY LINK] {link}")
        print(f"\n  Posts today: {count}/{MAX_POSTS_PER_DAY}")
        return

    # Dedup check
    if already_posted(session, check_text):
        log.info("Already posted similar content. Regenerating...")
        result, actual_cat = generator(session) if cat != "engagement" else generator()
        if result is None:
            result, actual_cat = generate_story_tweet(session)
        if result is None:
            log.warning("No unique content available. Skipping.")
            return
        is_thread = isinstance(result, tuple) and isinstance(result[0], list)
        if is_thread:
            thread_tweets, link = result
            tweet_text = thread_tweets[0]
        else:
            tweet_text, link = result
            tweet_text = strip_markdown(tweet_text)
        check_text = thread_tweets[0] if is_thread else tweet_text
        if already_posted(session, check_text):
            log.warning("Still a duplicate. Skipping this cycle.")
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
            log.info("Tweet posted: https://x.com/%s/status/%s", OUR_USERNAME, tweet_id)
            # Reply with link for better reach
            if link:
                reply_id = post_tweet(link, reply_to=tweet_id)
                if reply_id:
                    log.info("Link reply posted: %s", reply_id)


def main():
    parser = argparse.ArgumentParser(description="WTP Twitter Bot (Basic tier)")
    parser.add_argument("--category", choices=list(CATEGORIES.keys()),
                        help="Force a specific tweet category")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview tweet without posting")
    parser.add_argument("--test", action="store_true",
                        help="Post a test tweet")
    parser.add_argument("--collect-metrics", action="store_true",
                        help="Collect engagement metrics for recent tweets")
    parser.add_argument("--verify", action="store_true",
                        help="Verify account credentials and exit")
    args = parser.parse_args()

    if args.verify:
        info = verify_account()
        print(f"Verified: @{info['username']} (ID: {info['id']})")
        return

    if args.collect_metrics:
        collect_metrics()
        return

    if args.test:
        if is_paused():
            print("Bot is PAUSED. Cannot post.")
            return
        tweet_id = post_tweet(
            f"Testing WeThePeople bot. Civic transparency across 11 sectors. "
            f"{SITE}"
        )
        if tweet_id:
            print(f"Test tweet posted: https://x.com/{OUR_USERNAME}/status/{tweet_id}")
        else:
            print("Test tweet failed.")
        return

    run(category=args.category, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
