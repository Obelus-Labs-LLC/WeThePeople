"""
Twitter Monitor — Scan watchdog accounts and auto-quote-tweet with WTP data.

Searches X for recent posts from transparency/watchdog accounts, extracts
entity names (politicians, companies, tickers), matches them against the
WTP database, and generates data-backed quote-tweets.

Posts at most ONE auto-quote per day (stored in TweetLog with category='quote').
All matches generate DraftReply records for manual review.

Target accounts:
    unusual_whales, OpenSecretsDC, CREWcrew, MapLightTech,
    POGOwatchdog, faramonitor, IssueOneReform

Usage:
    python jobs/twitter_monitor.py                # scan + auto-quote 1
    python jobs/twitter_monitor.py --drafts-only  # only generate drafts, don't post
    python jobs/twitter_monitor.py --dry-run      # print what would happen
"""

import os
import sys
import re
import json
import random
import hashlib
import argparse
import logging
import time
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List, Dict, Any

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors.twitter import post_tweet, search_recent_tweets
from models.database import SessionLocal
from models.twitter_models import TweetLog, DraftReply
from sqlalchemy import text

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

API_BASE = os.getenv("WTP_API_URL", "http://localhost:8006")
SITE = "wethepeopleforus.com"
JOURNAL_SITE = "journal.wethepeopleforus.com"
OUR_USERNAME = "WTPForUs"

# ── Target Accounts ──
# Transparency/watchdog accounts whose tweets we monitor for entity mentions
TARGET_ACCOUNTS = [
    "unusual_whales",   # Congressional trades + options flow
    "OpenSecretsDC",    # Campaign finance / lobbying
    "CREWcrew",         # Citizens for Responsibility and Ethics
    "MapLightTech",     # Money in politics
    "POGOwatchdog",     # Project on Government Oversight
    "faramonitor",      # FARA foreign lobbying
    "IssueOneReform",   # Money in politics reform
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

# Lobbying tables for data lookup: (table, entity_col, entity_table)
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


# ── Helpers ──

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


def entity_tweeted_recently(session, entity_name: str, days: int = 3) -> bool:
    """Check if we tweeted/quoted about this entity in the last N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    recent = (
        session.query(TweetLog)
        .filter(TweetLog.posted_at >= cutoff)
        .all()
    )
    name_lower = entity_name.lower()
    for tweet in recent:
        if tweet.text and name_lower in tweet.text.lower():
            return True
    return False


def quotes_today(session) -> int:
    """Count auto-quote tweets posted today (category='quote')."""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        session.query(TweetLog)
        .filter(TweetLog.posted_at >= today, TweetLog.category == "quote")
        .count()
    )


def all_posts_today(session) -> int:
    """Count ALL tweets posted today (all categories, including bot tweets)."""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return session.query(TweetLog).filter(TweetLog.posted_at >= today).count()


def already_drafted(session, tweet_id: str) -> bool:
    """Check if we already created a draft for this tweet."""
    return (
        session.query(DraftReply)
        .filter(DraftReply.target_tweet_id == tweet_id)
        .first()
        is not None
    )


def log_tweet(session, tweet_id: str, category: str, tweet_text: str):
    """Log a posted tweet with retry on DB lock."""
    for attempt in range(3):
        try:
            session.add(TweetLog(
                tweet_id=tweet_id,
                category=category,
                content_hash=content_hash(tweet_text),
                text=tweet_text,
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


# ── Entity Matching (direct DB queries) ──

def _build_entity_index(session) -> Dict[str, Dict[str, Any]]:
    """Build an in-memory index of all tracked entities for fast text matching.

    Returns dict keyed by uppercase entity name -> {entity_id, display_name, ticker, sector, table, id_col}
    Also indexes by ticker symbol.
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
                    index[display_name.upper()] = entry

                    # Also index by last name for politicians
                    if table == "tracked_members":
                        parts = display_name.split()
                        if len(parts) >= 2:
                            last = parts[-1]
                            # Only index last names > 4 chars to avoid false positives
                            if len(last) > 4:
                                key = last.upper()
                                # Don't overwrite a more specific match
                                if key not in index:
                                    index[key] = entry

                # Index by ticker symbol
                if ticker:
                    index[f"${ticker.upper()}"] = entry
                    index[ticker.upper()] = entry

        except Exception as e:
            log.warning("Failed to index %s: %s", table, e)

    log.info("Built entity index: %d entries from %d tables", len(index), len(ENTITY_TABLES))
    return index


def match_entities_in_text(text: str, entity_index: Dict[str, Dict]) -> List[Dict[str, Any]]:
    """Find all WTP-tracked entities mentioned in tweet text.

    Matching strategy:
    1. Exact ticker match ($AAPL, $PFE)
    2. Full display_name match (case-insensitive)
    3. Last-name match for politicians (only if >4 chars)

    Returns list of matched entity dicts, best matches first.
    """
    matches = []
    seen_ids = set()
    text_upper = text.upper()

    # 1. Ticker symbols: $AAPL, $PFE etc.
    ticker_pattern = re.findall(r'\$([A-Z]{1,5})\b', text)
    for ticker in ticker_pattern:
        key = f"${ticker}"
        if key in entity_index:
            entry = entity_index[key]
            eid = entry["entity_id"]
            if eid not in seen_ids:
                matches.append(entry)
                seen_ids.add(eid)

    # 2. Full display name match
    for key, entry in entity_index.items():
        if key.startswith("$"):
            continue  # skip ticker entries, already handled
        eid = entry["entity_id"]
        if eid in seen_ids:
            continue
        # Only match full names (at least 2 words) or sufficiently long single tokens
        if len(key) > 6 and key in text_upper:
            matches.append(entry)
            seen_ids.add(eid)

    return matches


# ── Data Lookup ──

def lookup_entity_data(session, entity: Dict[str, Any]) -> Dict[str, Any]:
    """Pull lobbying spend, contract totals, enforcement, and trade counts for a matched entity.

    Returns a dict with keys: lobbying_total, contract_total, enforcement_count,
    trades_count, top_issues, sector, profile_url
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
        "profile_url": "",
    }

    # Build profile URL
    if sector == "politics":
        data["profile_url"] = f"{SITE}/politics/person/{entity_id}"
    elif sector == "finance":
        data["profile_url"] = f"{SITE}/finance/company/{entity_id}"
    else:
        data["profile_url"] = f"{SITE}/{sector}/company/{entity_id}"

    # Look up lobbying data across all lobbying tables
    for lobby_table, lobby_id_col, lobby_entity_table in LOBBYING_TABLES:
        if lobby_entity_table == table:
            try:
                row = session.execute(text(
                    f"SELECT COALESCE(SUM(income), 0), COUNT(*) "
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
            except Exception:
                pass
            break

    # Look up contract data
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

    # Congressional trades (politicians only)
    if sector == "politics":
        try:
            row = session.execute(text(
                "SELECT COUNT(*) FROM congressional_trades WHERE person_id = :pid"
            ), {"pid": entity_id}).fetchone()
            if row:
                data["trades_count"] = int(row[0] or 0)
        except Exception:
            pass

    # Congressional trades by ticker (companies)
    if entity.get("ticker"):
        try:
            row = session.execute(text(
                "SELECT COUNT(*) FROM congressional_trades WHERE ticker = :ticker"
            ), {"ticker": entity["ticker"]}).fetchone()
            if row:
                data["trades_count"] = int(row[0] or 0)
        except Exception:
            pass

    return data


# ── Quote-Tweet Composition ──

def compose_quote_text(entity: Dict, data: Dict, include_journal_link: bool = True) -> str:
    """Generate a quote-tweet text from matched entity data.

    Rotates between 4 template styles. Varies format to avoid repetition.
    Returns the quote text (without the original tweet URL -- that's handled
    by the quote_tweet_id parameter in the X API).
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

    # Template A: Lobbying + Contracts cross-reference
    if lobbying > 0 and contracts > 0:
        source_list = "Data: Senate LDA Filings, USASpending.gov"
        text_a = (
            f"{name} spent {_fmt_money(lobbying)} lobbying Congress "
            f"while receiving {_fmt_money(contracts)} in federal contracts. "
            f"Public record.\n\n{source_list}\n\n#FollowTheMoney"
        )
        candidates.append(text_a)

    # Template B: Lobbying filings + top issues
    if filings > 0 and lobbying > 0:
        issues_str = ""
        if top_issues:
            issues_str = ", ".join(top_issues[:2])
            issues_str = f"Top issues: {issues_str}"
        else:
            issues_str = "What were they lobbying for?"
        text_b = (
            f"Since 2020, {name} filed {filings:,} lobbying disclosures "
            f"totaling {_fmt_money(lobbying)}.\n\n"
            f"{issues_str}\n\n#FollowTheMoney"
        )
        candidates.append(text_b)

    # Template C: Congressional trades + lobbying (ticker-based)
    if trades > 0 and ticker:
        lobby_note = ""
        if lobbying > 0:
            lobby_note = f" Lobbying spend: {_fmt_money(lobbying)}."
        text_c = (
            f"{trades} members of Congress traded ${ticker} stock.{lobby_note}\n\n"
            f"All publicly disclosed under the STOCK Act.\n\n#CongressTrades"
        )
        candidates.append(text_c)

    # Template D: Politician trades
    if entity.get("sector") == "politics" and trades > 0:
        text_d = (
            f"{name} made {trades:,} stock trade{'s' if trades != 1 else ''} while in office.\n\n"
            f"Members of Congress are required to disclose trades within 45 days. "
            f"Many don't.\n\n#CongressTrades"
        )
        candidates.append(text_d)

    # Template E: Enforcement fallback
    if lobbying > 0 and not contracts and not trades:
        text_e = (
            f"According to Senate filings, {name} spent "
            f"{_fmt_money(lobbying)} lobbying Congress.\n\n"
            f"Who they lobbied. What they asked for. All public record.\n\n"
            f"#CorporateLobbying"
        )
        candidates.append(text_e)

    if not candidates:
        # Generic fallback -- we have the entity but sparse data
        candidates.append(
            f"We track {name}. Lobbying, contracts, trades, enforcement "
            f"-- all from public records.\n\n#FollowTheMoney"
        )

    # Pick a random template
    quote_text = random.choice(candidates)

    # Optionally append journal link (~70% of the time)
    if include_journal_link and random.random() < 0.7 and profile_url:
        quote_text += f"\n\n{profile_url}"

    return quote_text


# ── Scanning Logic ──

def scan_account(username: str, session, entity_index: Dict,
                 drafts: List[Dict], max_tweets: int = 10):
    """Scan recent tweets from one account for entity matches.

    Appends match dicts to `drafts` list. Each dict contains:
    tweet_id, username, tweet_text, entity, entity_data, suggested_text
    """
    log.info("Scanning @%s ...", username)

    # Use search endpoint: from:username (more reliable on free tier than user timeline)
    query = f"from:{username} -is:retweet -is:reply"
    tweets = search_recent_tweets(query, max_results=max_tweets)

    if not tweets:
        log.info("  No tweets found from @%s", username)
        return

    log.info("  Found %d tweets from @%s", len(tweets), username)

    for tweet in tweets:
        tweet_id = str(tweet["id"])
        tweet_text = tweet.get("text", "")

        # Skip retweets / quote-tweets that are just RT
        if tweet_text.startswith("RT @"):
            continue

        # Skip tweets we already drafted
        if already_drafted(session, tweet_id):
            continue

        # Match entities
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

        drafts.append({
            "tweet_id": tweet_id,
            "username": username,
            "tweet_text": tweet_text,
            "entity": entity,
            "entity_data": entity_data,
            "suggested_text": quote_text,
        })

        log.info("  Match: %s in tweet %s (lobby=%s, contracts=%s, trades=%d)",
                 display_name, tweet_id,
                 _fmt_money(entity_data["lobbying_total"]),
                 _fmt_money(entity_data["contract_total"]),
                 entity_data["trades_count"])


def save_drafts(session, drafts: List[Dict]):
    """Save draft replies to the database for review."""
    saved = 0
    for d in drafts:
        try:
            # Serialize entity_data as JSON for the matched_data column
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
                status="pending",
            ))
            saved += 1
        except Exception as e:
            log.warning("Failed to save draft for tweet %s: %s", d["tweet_id"], e)

    if saved > 0:
        for attempt in range(3):
            try:
                session.commit()
                log.info("Saved %d draft replies", saved)
                return
            except Exception as e:
                session.rollback()
                if attempt < 2:
                    log.warning("DB locked on save_drafts, retry %d/3: %s", attempt + 1, e)
                    time.sleep(2)
                else:
                    log.error("Failed to save drafts after 3 attempts: %s", e)


def pick_best_draft(drafts: List[Dict]) -> Optional[Dict]:
    """Pick the best draft to auto-quote based on data richness.

    Scoring:
    - Has both lobbying + contracts: +3
    - Has trades data: +2
    - Has top issues: +1
    - From higher-engagement accounts: +1
    """
    if not drafts:
        return None

    high_engagement_accounts = {"unusual_whales", "OpenSecretsDC", "CREWcrew"}

    scored = []
    for d in drafts:
        score = 0
        ed = d["entity_data"]
        if ed["lobbying_total"] > 0 and ed["contract_total"] > 0:
            score += 3
        elif ed["lobbying_total"] > 0 or ed["contract_total"] > 0:
            score += 1
        if ed["trades_count"] > 0:
            score += 2
        if ed["top_issues"]:
            score += 1
        if d["username"] in high_engagement_accounts:
            score += 1
        scored.append((score, d))

    scored.sort(key=lambda x: x[0], reverse=True)

    # Return the best, or random from top 3 if tied
    top_score = scored[0][0]
    top_drafts = [d for s, d in scored if s == top_score]
    return random.choice(top_drafts)


# ── Main ──

def run(drafts_only: bool = False, dry_run: bool = False):
    """Main monitor loop: scan accounts, generate drafts, optionally auto-quote."""
    session = SessionLocal()
    try:
        _run_inner(session, drafts_only, dry_run)
    finally:
        session.close()


def _run_inner(session, drafts_only: bool = False, dry_run: bool = False):
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
            time.sleep(1)

    log.info("Scan complete: %d matches found across %d accounts", len(drafts), len(TARGET_ACCOUNTS))

    if not drafts:
        log.info("No new matches found this cycle.")
        return

    # Save all drafts to database
    if not dry_run:
        save_drafts(session, drafts)

    # Print drafts summary
    for i, d in enumerate(drafts):
        entity_name = d["entity"]["display_name"]
        ed = d["entity_data"]
        print(f"\n{'='*60}")
        print(f"Draft #{i+1}: @{d['username']} -> {entity_name}")
        print(f"  Tweet: {d['tweet_text'][:100]}...")
        print(f"  Data:  lobby={_fmt_money(ed['lobbying_total'])} "
              f"contracts={_fmt_money(ed['contract_total'])} "
              f"trades={ed['trades_count']}")
        print(f"  Quote: {d['suggested_text'][:150]}...")

    # Auto-quote: post ONE per day max
    if drafts_only:
        log.info("Drafts-only mode. Skipping auto-post.")
        return

    # Check overall daily cap (shared with twitter_bot: 4 tweets/day total)
    total_today = all_posts_today(session)
    if total_today >= 4 and not dry_run:
        log.info("Overall daily cap reached (%d tweets today). Skipping auto-post.", total_today)
        return

    # Check if we already quoted today (1 quote/day from monitor)
    already_quoted = quotes_today(session)
    if already_quoted >= 1 and not dry_run:
        log.info("Already posted %d quote-tweet(s) today. Skipping auto-post.", already_quoted)
        return

    # Pick the best draft to post
    best = pick_best_draft(drafts)
    if not best:
        log.info("No suitable draft for auto-posting.")
        return

    quote_text = best["suggested_text"]
    tweet_id = best["tweet_id"]
    entity_name = best["entity"]["display_name"]

    if dry_run:
        print(f"\n{'='*60}")
        print(f"[DRY RUN] Would auto-quote tweet {tweet_id} from @{best['username']}")
        print(f"  Entity: {entity_name}")
        print(f"  Quote ({len(quote_text)} chars):")
        print(f"  ---")
        print(f"  {quote_text}")
        print(f"  ---")
        return

    # Add randomized delay (30-120 seconds) so it doesn't look automated
    delay = random.randint(30, 120)
    log.info("Auto-quote in %d seconds (entity: %s, tweet: %s)", delay, entity_name, tweet_id)
    time.sleep(delay)

    # Post the quote-tweet using the X API v2 quote_tweet_id parameter
    posted_id = post_tweet(quote_text, quote_tweet_id=tweet_id)

    if posted_id:
        log.info("Auto-quote posted: https://x.com/%s/status/%s", OUR_USERNAME, posted_id)
        log_tweet(session, posted_id, "quote", f"[reply_to:{tweet_id}] {quote_text}")

        # Mark the draft as posted
        try:
            draft_row = (
                session.query(DraftReply)
                .filter(DraftReply.target_tweet_id == tweet_id)
                .first()
            )
            if draft_row:
                draft_row.status = "posted"
                draft_row.posted_at = datetime.now(timezone.utc)
                session.commit()
        except Exception as e:
            log.warning("Failed to update draft status: %s", e)
            session.rollback()

        print(f"Quote-tweet posted: https://x.com/{OUR_USERNAME}/status/{posted_id}")
    else:
        log.error("Failed to post auto-quote for tweet %s", tweet_id)


def main():
    parser = argparse.ArgumentParser(
        description="WTP Twitter Monitor — scan watchdog accounts and auto-quote with data"
    )
    parser.add_argument(
        "--drafts-only",
        action="store_true",
        help="Generate drafts but don't auto-post any quote-tweets",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without posting or saving to DB",
    )
    args = parser.parse_args()

    run(drafts_only=args.drafts_only, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
