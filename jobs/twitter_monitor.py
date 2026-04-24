"""
Twitter Monitor — Scan watchdog accounts and generate data-backed quote-tweet drafts.

Searches X for recent posts from transparency/watchdog accounts, extracts
entity names (politicians, companies, tickers), matches them against the
WTP database, and generates draft quote-tweets for human review.

Gate 5 Extension: ALL quote-tweets now go through human approval.
Monitor generates drafts -> stored in draft_replies table -> human approves
via /ops/draft-queue -> approved drafts are posted by a separate cron job.

This eliminates the reputational risk of auto-posting responses to
third-party content without editorial review.

Target accounts:
    unusual_whales, OpenSecretsDC, CREWcrew, MapLightTech,
    POGOwatchdog, faramonitor, IssueOneReform

Usage:
    python jobs/twitter_monitor.py                # scan + generate drafts
    python jobs/twitter_monitor.py --post-approved  # post approved drafts
    python jobs/twitter_monitor.py --dry-run      # print what would happen
"""

import os
import sys
import re
import json
import random
import argparse
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.twitter import post_tweet, search_recent_tweets, is_own_tweet
from models.database import SessionLocal
from models.twitter_models import TweetLog, DraftReply
from sqlalchemy import text
from utils.twitter_helpers import (
    SITE, JOURNAL_SITE, OUR_USERNAME, MAX_POSTS_PER_DAY,
    api_get, is_paused,
    fmt_money, content_hash, entity_tweeted_recently,
    posts_today, log_tweet,
    build_url, build_profile_url,
    content_is_safe, neutralize_language, validate_tweet_length,
    format_sources, data_freshness_note,
    is_safe_entity_match, FALSE_POSITIVE_NAMES, MIN_MATCH_LENGTH,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

# Maximum drafts to generate per scan cycle
MAX_DRAFTS_PER_CYCLE = 10

# Maximum approved drafts to post per cycle (when running --post-approved)
MAX_POSTS_PER_CYCLE = 3

# Target accounts — transparency/watchdog orgs whose tweets we monitor
TARGET_ACCOUNTS = [
    "unusual_whales",   # Congressional trades + options flow
    "OpenSecretsDC",    # Campaign finance / lobbying
    "CREWcrew",        # Citizens for Responsibility and Ethics
    "MapLightTech",    # Money in politics
    "POGOwatchdog",    # Project on Government Oversight
    "faramonitor",     # FARA foreign lobbying
    "IssueOneReform",  # Money in politics reform
]

# All tracked-entity tables: (table_name, id_column, display_name_col, ticker_col, sector_slug)
ENTITY_TABLES = [
    ("tracked_members", "person_id", "display_name", None, "politics"),
    ("tracked_companies", "company_id", "display_name", "ticker", "health"),
    ("tracked_institutions", "institution_id", "display_name", "ticker", "finance"),
    ("tracked_tech_companies", "company_id", "display_name", "ticker", "technology"),
    ("tracked_energy_companies", "company_id", "display_name", "ticker", "energy"),
    ("tracked_defense_companies", "company_id", "display_name", "ticker", "defense"),
    ("tracked_transportation_companies", "company_id", "display_name", "ticker", "transportation"),
    ("tracked_chemical_companies", "company_id", "display_name", "ticker", "chemicals"),
    ("tracked_agriculture_companies", "company_id", "display_name", "ticker", "agriculture"),
    ("tracked_education_companies", "company_id", "display_name", "ticker", "education"),
    ("tracked_telecom_companies", "company_id", "display_name", "ticker", "telecom"),
]

# Lobbying tables for data lookup
LOBBYING_TABLES = [
    ("lobbying_records", "company_id", "tracked_tech_companies"),
    ("finance_lobbying_records", "institution_id", "tracked_institutions"),
    ("health_lobbying_records", "company_id", "tracked_companies"),
    ("energy_lobbying_records", "company_id", "tracked_energy_companies"),
    ("transportation_lobbying_records", "company_id", "tracked_transportation_companies"),
    ("defense_lobbying_records", "company_id", "tracked_defense_companies"),
    ("chemical_lobbying_records", "company_id", "tracked_chemical_companies"),
    ("agriculture_lobbying_records", "company_id", "tracked_agriculture_companies"),
    ("education_lobbying_records", "company_id", "tracked_education_companies"),
    ("telecom_lobbying_records", "company_id", "tracked_telecom_companies"),
]

# Contract tables for data lookup
CONTRACT_TABLES = [
    ("government_contracts", "company_id", "tracked_tech_companies"),
    ("finance_government_contracts", "institution_id", "tracked_institutions"),
    ("health_government_contracts", "company_id", "tracked_companies"),
    ("energy_government_contracts", "company_id", "tracked_energy_companies"),
    ("transportation_government_contracts", "company_id", "tracked_transportation_companies"),
    ("defense_government_contracts", "company_id", "tracked_defense_companies"),
    ("chemical_government_contracts", "company_id", "tracked_chemical_companies"),
    ("agriculture_government_contracts", "company_id", "tracked_agriculture_companies"),
    ("education_government_contracts", "company_id", "tracked_education_companies"),
    ("telecom_government_contracts", "company_id", "tracked_telecom_companies"),
]


# ── Entity Matching (direct DB queries, with safety filters) ───────────────────

def _build_entity_index(session) -> Dict[str, Dict[str, Any]]:
    """Build an in-memory index of all tracked entities for fast text matching.

    Returns dict keyed by uppercase entity name -> entity info dict.
    Applies safety filters to prevent false positive matches.
    """
    index = {}

    for table, id_col, name_col, ticker_col, sector in ENTITY_TABLES:
        try:
            cols = f"{id_col}, {name_col}"
            if ticker_col:
                cols += f", {ticker_col}"

            rows = session.execute(text(
                f"SELECT {cols} FROM {table} WHERE is_active = 1"
            )).fetchall()

            for row in rows:
                entity_id = row[0]
                display_name = row[1]
                ticker = row[2] if ticker_col and len(row) > 2 else None

                entry = {
                    "entity_id": entity_id,
                    "display_name": display_name,
                    "ticker": ticker,
                    "sector": sector,
                    "table": table,
                    "id_col": id_col,
                }

                # Index by full display name (uppercase)
                if display_name:
                    key = display_name.upper()
                    # Only index if name meets minimum length for safety
                    if len(key) >= MIN_MATCH_LENGTH or " " in key:
                        index[key] = entry

                    # For politicians, index by "FIRST LAST" (full name only)
                    # Do NOT index by last name alone — too many false positives
                    if table == "tracked_members" and " " in display_name:
                        # Full name is already indexed above
                        pass

                # Index by ticker symbol (with $ prefix for safety)
                if ticker and len(ticker) >= 2:
                    index[f"${ticker.upper()}"] = entry

        except Exception as e:
            log.warning("Failed to index %s: %s", table, e)

    log.info("Built entity index: %d entries from %d tables", len(index), len(ENTITY_TABLES))
    return index


def match_entities_in_text(text_content: str, entity_index: Dict[str, Dict]) -> List[Dict[str, Any]]:
    """Find all WTP-tracked entities mentioned in tweet text.

    Uses safe matching with false positive prevention:
    1. Exact ticker match ($AAPL, $PFE) — safest
    2. Full display_name match (case-insensitive) — requires word boundary for short names
    3. Multi-word name match — safe (e.g., "Elizabeth Warren")

    Returns list of matched entity dicts, best matches first.
    """
    matches = []
    seen_ids = set()
    text_upper = text_content.upper()

    # 1. Ticker symbols: $AAPL, $PFE etc.
    ticker_pattern = re.findall(r'\$([A-Z]{2,5})\b', text_content)
    for ticker in ticker_pattern:
        key = f"${ticker}"
        if key in entity_index:
            entry = entity_index[key]
            eid = entry["entity_id"]
            if eid not in seen_ids:
                matches.append(entry)
                seen_ids.add(eid)

    # 2. Full display name match (with safety filtering)
    for key, entry in entity_index.items():
        if key.startswith("$"):
            continue  # skip ticker entries, already handled
        eid = entry["entity_id"]
        if eid in seen_ids:
            continue

        # Use safe matching (prevents false positives)
        if is_safe_entity_match(key, text_upper):
            matches.append(entry)
            seen_ids.add(eid)

    return matches


# ── Data Lookup ────────────────────────────────────────────────────────────────

def lookup_entity_data(session, entity: Dict[str, Any]) -> Dict[str, Any]:
    """Pull lobbying spend, contract totals, and trade counts for a matched entity.

    Returns a dict with all data needed for quote-tweet composition.
    """
    entity_id = entity["entity_id"]
    table = entity["table"]
    id_col = entity["id_col"]
    sector = entity["sector"]
    display_name = entity["display_name"]

    data = {
        "display_name": display_name,
        "entity_id": entity_id,
        "sector": sector,
        "lobbying_total": 0,
        "contract_total": 0,
        "enforcement_count": 0,
        "trades_count": 0,
        "lobbying_filings": 0,
        "top_issues": [],
        "profile_url": build_profile_url(sector, entity_id, campaign="monitor"),
    }

    # Lobbying data
    for lobby_table, lobby_id_col, lobby_entity_table in LOBBYING_TABLES:
        if lobby_entity_table == table:
            try:
                row = session.execute(text(
                    f"SELECT COALESCE(SUM(COALESCE(income, 0) + COALESCE(expenses, 0)), 0), COUNT(*) "
                    f"FROM {lobby_table} WHERE {lobby_id_col} = :eid"
                ), {"eid": entity_id}).fetchone()
                if row:
                    data["lobbying_total"] += float(row[0] or 0)
                    data["lobbying_filings"] += int(row[1] or 0)
            except Exception as e:
                log.debug("Lobbying lookup failed for %s in %s: %s", entity_id, lobby_table, e)

            # Top lobbying issues
            try:
                issue_rows = session.execute(text(
                    f"SELECT specific_issue, COUNT(*) as cnt "
                    f"FROM {lobby_table} WHERE {lobby_id_col} = :eid "
                    f"AND specific_issue IS NOT NULL AND specific_issue != '' "
                    f"GROUP BY specific_issue ORDER BY cnt DESC LIMIT 3"
                ), {"eid": entity_id}).fetchall()
                data["top_issues"] = [r[0] for r in issue_rows if r[0]]
            except Exception as e:
                log.warning("top-issues lookup failed for %s in %s: %s", entity_id, lobby_table, e)
                data.setdefault("data_fetch_errors", []).append(f"top_issues:{lobby_table}")
            break

    # Contract data
    for contract_table, contract_id_col, contract_entity_table in CONTRACT_TABLES:
        if contract_entity_table == table:
            try:
                row = session.execute(text(
                    f"SELECT COALESCE(SUM(award_amount), 0), COUNT(*) "
                    f"FROM {contract_table} WHERE {contract_id_col} = :eid"
                ), {"eid": entity_id}).fetchone()
                if row:
                    data["contract_total"] += float(row[0] or 0)
            except Exception as e:
                log.debug("Contract lookup failed for %s in %s: %s", entity_id, contract_table, e)
            break

    # Congressional trades (politicians)
    if sector == "politics":
        try:
            row = session.execute(text(
                "SELECT COUNT(*) FROM congressional_trades WHERE person_id = :pid"
            ), {"pid": entity_id}).fetchone()
            if row:
                data["trades_count"] = int(row[0] or 0)
        except Exception as e:
            log.warning("person trades lookup failed for %s: %s", entity_id, e)
            data.setdefault("data_fetch_errors", []).append("trades_count:person")

    # Congressional trades by ticker (companies)
    if entity.get("ticker"):
        try:
            row = session.execute(text(
                "SELECT COUNT(*) FROM congressional_trades WHERE ticker = :ticker"
            ), {"ticker": entity["ticker"]}).fetchone()
            if row:
                data["trades_count"] = int(row[0] or 0)
        except Exception as e:
            log.warning("ticker trades lookup failed for %s: %s", entity.get("ticker"), e)
            data.setdefault("data_fetch_errors", []).append("trades_count:ticker")

    return data


# ── Quote-Tweet Composition ────────────────────────────────────────────────────

def compose_quote_text(entity: Dict, data: Dict) -> str:
    """Generate a factual quote-tweet from matched entity data.

    Uses neutral language with source attribution. Varies templates
    to avoid repetition. Never implies wrongdoing or causation.
    """
    name = data["display_name"]
    lobbying = data["lobbying_total"]
    contracts = data["contract_total"]
    trades = data["trades_count"]
    filings = data["lobbying_filings"]
    top_issues = data["top_issues"]
    ticker = entity.get("ticker", "")
    profile_url = data["profile_url"]

    candidates = []
    freshness = data_freshness_note()

    # Template A: Lobbying + Contracts cross-reference
    if lobbying > 0 and contracts > 0:
        text_a = (
            f"{name} spent {fmt_money(lobbying)} lobbying Congress "
            f"while receiving {fmt_money(contracts)} in federal contracts.\n\n"
            f"Both documented in public filings {freshness}.\n\n"
            f"Data: Senate LDA Filings, USASpending.gov\n\n"
            f"#FollowTheMoney"
        )
        candidates.append(text_a)

    # Template B: Lobbying filings + top issues
    if filings > 0 and lobbying > 0:
        issues_str = ""
        if top_issues:
            issues_str = f"Top issues: {', '.join(top_issues[:2])}"
        else:
            issues_str = "Full breakdown of lobbying targets available."
        text_b = (
            f"Since 2020, {name} filed {filings:,} lobbying disclosures "
            f"totaling {fmt_money(lobbying)} {freshness}.\n\n"
            f"{issues_str}\n\n"
            f"Source: Senate LDA Filings\n\n"
            f"#CorporateLobbying"
        )
        candidates.append(text_b)

    # Template C: Congressional trades + lobbying (ticker-based)
    if trades > 0 and ticker:
        lobby_note = ""
        if lobbying > 0:
            lobby_note = f" Lobbying spend: {fmt_money(lobbying)}."
        text_c = (
            f"{trades} members of Congress traded ${ticker} stock.{lobby_note}\n\n"
            f"All publicly disclosed under the STOCK Act.\n\n"
            f"Source: House Financial Disclosures\n\n"
            f"#CongressTrades"
        )
        candidates.append(text_c)

    # Template D: Politician trades
    if entity.get("sector") == "politics" and trades > 0:
        text_d = (
            f"{name} made {trades:,} stock trade{'s' if trades != 1 else ''} "
            f"while in office.\n\n"
            f"Members of Congress are required to disclose trades within 45 days "
            f"under the STOCK Act.\n\n"
            f"Source: House Financial Disclosures\n\n"
            f"#CongressTrades #STOCKAct"
        )
        candidates.append(text_d)

    # Template E: Lobbying-only (no contracts or trades)
    if lobbying > 0 and not contracts and not trades:
        text_e = (
            f"According to Senate filings, {name} spent "
            f"{fmt_money(lobbying)} lobbying Congress {freshness}.\n\n"
            f"Who they lobbied. What they asked for. All public record.\n\n"
            f"Source: Senate LDA Filings\n\n"
            f"#CorporateLobbying"
        )
        candidates.append(text_e)

    if not candidates:
        # Generic fallback — we have the entity but sparse data
        candidates.append(
            f"We track {name} across lobbying, contracts, trades, and enforcement "
            f"-- all from public records.\n\n"
            f"#FollowTheMoney"
        )

    # Pick a random template
    quote_text = random.choice(candidates)

    # Append profile link (~70% of the time)
    if profile_url and random.random() < 0.7:
        quote_text += f"\n\n{profile_url}"

    # Safety: validate content
    quote_text = neutralize_language(quote_text)
    return quote_text


# ── Scoring ────────────────────────────────────────────────────────────────────

def score_draft(draft: Dict) -> float:
    """Score a draft for prioritization in the review queue.

    Higher score = more data-rich = higher priority for posting.
    """
    ed = draft["entity_data"]
    score = 0.0

    if ed["lobbying_total"] > 0 and ed["contract_total"] > 0:
        score += 3.0  # Cross-reference is gold
    elif ed["lobbying_total"] > 0 or ed["contract_total"] > 0:
        score += 1.0

    if ed["trades_count"] > 0:
        score += 2.0  # Congressional trades are high-engagement

    if ed["top_issues"]:
        score += 1.0  # Specificity adds value

    # Bonus for high-engagement source accounts
    high_engagement_accounts = {"unusual_whales", "OpenSecretsDC", "CREWcrew"}
    if draft.get("username") in high_engagement_accounts:
        score += 1.0

    # Bonus for dollar amounts (more concrete data)
    if ed["lobbying_total"] > 1_000_000:
        score += 0.5
    if ed["contract_total"] > 10_000_000:
        score += 0.5

    return score


# ── Scanning Logic ─────────────────────────────────────────────────────────────

def scan_account(username: str, session, entity_index: Dict,
                 drafts: List[Dict], max_tweets: int = 10):
    """Scan recent tweets from one account for entity matches.

    Appends match dicts to `drafts` list for human review.
    """
    log.info("Scanning @%s ...", username)

    query = f"from:{username} -is:retweet -is:reply"
    tweets = search_recent_tweets(query, max_results=max_tweets)

    if not tweets:
        log.info("  No tweets found from @%s", username)
        return

    log.info("  Found %d tweets from @%s", len(tweets), username)

    for tweet in tweets:
        tweet_id = str(tweet["id"])
        tweet_text = tweet.get("text", "")

        # Skip retweets
        if tweet_text.startswith("RT @"):
            continue

        # Skip tweets we already drafted
        if _already_drafted(session, tweet_id):
            continue

        # Match entities (with safety filters)
        matches = match_entities_in_text(tweet_text, entity_index)
        if not matches:
            continue

        # Use the best match (first one found)
        entity = matches[0]
        display_name = entity["display_name"]

        # Skip entities we tweeted about recently
        if entity_tweeted_recently(session, display_name, days=3):
            log.info("  Skipping %s (tweeted recently)", display_name)
            continue

        # Look up data for this entity
        entity_data = lookup_entity_data(session, entity)

        # Only proceed if we have meaningful data to share
        has_data = (
            entity_data["lobbying_total"] > 0
            or entity_data["contract_total"] > 0
            or entity_data["trades_count"] > 0
        )
        if not has_data:
            log.info("  Matched %s but no data to share", display_name)
            continue

        # Generate quote-tweet text
        quote_text = compose_quote_text(entity, entity_data)

        # Final safety check
        if not content_is_safe(quote_text):
            log.warning("  Generated quote for %s failed safety check, skipping", display_name)
            continue

        draft = {
            "tweet_id": tweet_id,
            "username": username,
            "tweet_text": tweet_text,
            "entity": entity,
            "entity_data": entity_data,
            "suggested_text": quote_text,
        }
        draft["score"] = score_draft(draft)
        drafts.append(draft)

        log.info("  Match: %s in tweet %s (score=%.1f, lobby=%s, contracts=%s, trades=%d)",
                 display_name, tweet_id, draft["score"],
                 fmt_money(entity_data["lobbying_total"]),
                 fmt_money(entity_data["contract_total"]),
                 entity_data["trades_count"])

        if len(drafts) >= MAX_DRAFTS_PER_CYCLE:
            break


def _already_drafted(session, tweet_id: str) -> bool:
    """Check if we already created a draft for this tweet."""
    return (
        session.query(DraftReply)
        .filter(DraftReply.target_tweet_id == tweet_id)
        .first()
        is not None
    )


def save_drafts(session, drafts: List[Dict]):
    """Save draft replies to the database for human review."""
    saved = 0
    for d in drafts:
        try:
            matched_data_json = json.dumps({
                "lobbying_total": d["entity_data"]["lobbying_total"],
                "contract_total": d["entity_data"]["contract_total"],
                "trades_count": d["entity_data"]["trades_count"],
                "lobbying_filings": d["entity_data"]["lobbying_filings"],
                "top_issues": d["entity_data"]["top_issues"],
                "sector": d["entity_data"]["sector"],
                "profile_url": d["entity_data"]["profile_url"],
            })

            session.add(DraftReply(
                target_tweet_id=d["tweet_id"],
                target_username=d["username"],
                target_text=d["tweet_text"][:500],
                suggested_text=d["suggested_text"],
                matched_entity=d["entity"]["display_name"],
                matched_data=matched_data_json,
                score=d.get("score", 0.0),
                status="pending",
            ))
            saved += 1
        except Exception as e:
            log.warning("Failed to save draft for tweet %s: %s", d["tweet_id"], e)

    if saved > 0:
        for attempt in range(3):
            try:
                session.commit()
                log.info("Saved %d draft replies for human review", saved)
                return
            except Exception as e:
                session.rollback()
                if attempt < 2:
                    log.warning("DB locked on save_drafts, retry %d/3: %s", attempt + 1, e)
                    time.sleep(2)
                else:
                    log.error("Failed to save drafts after 3 attempts: %s", e)


# ── Post Approved Drafts ───────────────────────────────────────────────────────

def post_approved_drafts(dry_run: bool = False):
    """Post drafts that have been approved by a human via /ops/draft-queue.

    This is the ONLY way monitor content gets posted — no auto-posting.
    Called by a separate cron job (e.g., every 2 hours).
    """
    if is_paused():
        log.warning("Bot is PAUSED. Skipping approved draft posting.")
        return

    session = SessionLocal()
    try:
        # Check daily post limit
        count = posts_today(session)
        if count >= MAX_POSTS_PER_DAY and not dry_run:
            log.info("Daily post limit reached (%d). Skipping.", count)
            return

        # Get approved drafts, ordered by score (best first)
        approved = (
            session.query(DraftReply)
            .filter(DraftReply.status == "approved")
            .order_by(DraftReply.score.desc())
            .limit(MAX_POSTS_PER_CYCLE)
            .all()
        )

        if not approved:
            log.info("No approved drafts to post.")
            return

        log.info("Found %d approved drafts to post", len(approved))
        posted = 0

        for draft in approved:
            if posted >= MAX_POSTS_PER_CYCLE:
                break
            if posts_today(session) >= MAX_POSTS_PER_DAY:
                log.info("Daily post limit reached during posting. Stopping.")
                break

            quote_text = draft.suggested_text
            tweet_id = draft.target_tweet_id

            if dry_run:
                print(f"\n[DRY RUN] Would post approved draft #{draft.id}:")
                print(f"  Entity: {draft.matched_entity}")
                print(f"  Quote: {quote_text[:150]}...")
                print(f"  Original: @{draft.target_username} tweet {tweet_id}")
                posted += 1
                continue

            # Post as quote-tweet
            posted_id = post_tweet(quote_text, quote_tweet_id=tweet_id)

            if posted_id:
                log.info("Posted approved draft #%d: https://x.com/%s/status/%s",
                         draft.id, OUR_USERNAME, posted_id)
                log_tweet(session, posted_id, "quote", quote_text, reply_to=tweet_id)

                # Update draft status
                draft.status = "posted"
                draft.posted_at = datetime.now(timezone.utc)
                session.commit()
                posted += 1

                # Pause between posts (natural pacing)
                if posted < MAX_POSTS_PER_CYCLE:
                    delay = random.randint(60, 300)  # 1-5 minutes between posts
                    log.info("Waiting %ds before next post...", delay)
                    time.sleep(delay)
            else:
                log.error("Failed to post approved draft #%d", draft.id)

        log.info("Posted %d approved drafts", posted)

    except Exception as e:
        log.error("Error posting approved drafts: %s", e)
        session.rollback()
    finally:
        session.close()


# ── Main ───────────────────────────────────────────────────────────────────────

def run(dry_run: bool = False):
    """Main monitor loop: scan accounts, generate drafts for human review."""
    if is_paused():
        log.warning("Bot is PAUSED. Skipping monitor scan.")
        return

    session = SessionLocal()
    try:
        _run_inner(session, dry_run)
    finally:
        session.close()


def _run_inner(session, dry_run: bool = False):
    """Inner run logic — session lifetime managed by run()."""
    # Build entity index from database
    entity_index = _build_entity_index(session)
    if not entity_index:
        log.error("Entity index is empty. Is the database populated?")
        return

    # Scan all target accounts
    drafts = []
    for account in TARGET_ACCOUNTS:
        try:
            scan_account(account, session, entity_index, drafts, max_tweets=10)
        except Exception as e:
            log.error("Error scanning @%s: %s", account, e)

        # Brief pause between accounts to respect rate limits
        if not dry_run:
            time.sleep(2)

    log.info("Scan complete: %d matches found across %d accounts", len(drafts), len(TARGET_ACCOUNTS))

    if not drafts:
        log.info("No new matches found this cycle.")
        return

    # Sort by score
    drafts.sort(key=lambda d: d.get("score", 0), reverse=True)

    # Save all drafts for human review
    if not dry_run:
        save_drafts(session, drafts)

    # Print drafts summary
    for i, d in enumerate(drafts):
        entity_name = d["entity"]["display_name"]
        ed = d["entity_data"]
        print(f"\n{'='*60}")
        print(f"Draft #{i+1} (score={d.get('score', 0):.1f}): @{d['username']} -> {entity_name}")
        print(f"  Tweet: {d['tweet_text'][:100]}...")
        print(f"  Data:  lobby={fmt_money(ed['lobbying_total'])} "
              f"contracts={fmt_money(ed['contract_total'])} "
              f"trades={ed['trades_count']}")
        print(f"  Quote: {d['suggested_text'][:150]}...")

    log.info(
        "All %d drafts saved for human review. "
        "Approve via /ops/draft-queue, then run with --post-approved.",
        len(drafts)
    )


def main():
    parser = argparse.ArgumentParser(
        description="WTP Twitter Monitor — scan watchdog accounts and generate draft quote-tweets"
    )
    parser.add_argument(
        "--post-approved",
        action="store_true",
        help="Post drafts that have been approved by a human",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without posting or saving to DB",
    )
    args = parser.parse_args()

    if args.post_approved:
        post_approved_drafts(dry_run=args.dry_run)
    else:
        run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
