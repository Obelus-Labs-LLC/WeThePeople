"""
Congressional Stock Trades Sync

Fetches real congressional trade data from Quiver Quantitative API.
Matches trades to tracked members by BioGuide ID.

Requires: QUIVER_API_KEY in .env

Usage:
    python jobs/sync_congressional_trades.py
    python jobs/sync_congressional_trades.py --person-id pelosi
    python jobs/sync_congressional_trades.py --chamber senate
"""

import os
import sys
import hashlib
import argparse
import logging
import time
from datetime import datetime, date
from typing import Optional

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base, TrackedMember, CongressionalTrade
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_congressional_trades")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
QUIVER_API_KEY = os.getenv("QUIVER_API_KEY", "")

QUIVER_LIVE_URL = "https://api.quiverquant.com/beta/live/congresstrading"
QUIVER_HISTORICAL_URL = "https://api.quiverquant.com/beta/historical/congresstrading"

AINVEST_API_KEY = os.getenv("AINVEST_API_KEY", "")
AINVEST_URL = "https://openapi.ainvest.com/open/ownership/congress"

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})

if is_sqlite():
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

Session = sessionmaker(bind=engine)


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def parse_date_str(val: Optional[str]) -> Optional[date]:
    if not val:
        return None
    val = val.strip()[:10]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(val, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def normalize_transaction_type(raw: str) -> str:
    raw = raw.lower().strip()
    if "purchase" in raw:
        return "purchase"
    elif "sale" in raw:
        if "partial" in raw:
            return "sale_partial"
        elif "full" in raw:
            return "sale_full"
        return "sale"
    elif "exchange" in raw:
        return "exchange"
    return raw or "unknown"


def normalize_chamber(house_field: str) -> str:
    h = house_field.lower().strip()
    if "senate" in h or "senator" in h:
        return "senate"
    return "house"


def fetch_quiver_trades() -> list[dict]:
    """Fetch recent congressional trades from Quiver Quantitative API."""
    if not QUIVER_API_KEY:
        log.error("QUIVER_API_KEY not set in .env")
        return []

    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {QUIVER_API_KEY}",
    }

    try:
        resp = requests.get(QUIVER_LIVE_URL, headers=headers, timeout=30)
        if resp.status_code == 401:
            log.error("Quiver API: Unauthorized (check QUIVER_API_KEY)")
            return []
        if resp.status_code == 403:
            log.error("Quiver API: Forbidden (API key may be expired)")
            return []
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            log.warning(f"Quiver API returned unexpected format: {type(data)}")
            return []
        log.info(f"Quiver API returned {len(data)} trades")
        return data
    except Exception as e:
        log.error(f"Quiver API error: {e}", exc_info=True)
        raise


def fetch_ainvest_reporting_gaps(tickers: set[str]) -> dict[str, dict]:
    """
    Fetch reporting gaps from AInvest API for a set of tickers.
    Returns a lookup: (name_lower, trade_date) → reporting_gap string.
    """
    if not AINVEST_API_KEY:
        log.info("AINVEST_API_KEY not set, skipping reporting gap enrichment")
        return {}

    headers = {"Authorization": f"Bearer {AINVEST_API_KEY}"}
    gap_lookup: dict[str, str] = {}
    fetched = 0

    for ticker in list(tickers):  # Process all tickers
        try:
            resp = requests.get(
                AINVEST_URL,
                params={"ticker": ticker, "size": 20},
                headers=headers,
                timeout=15,
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            for item in data.get("data", {}).get("data", []):
                name = (item.get("name") or "").lower().strip()
                trade_date = item.get("trade_date", "")
                gap = item.get("reporting_gap", "")
                if name and trade_date and gap:
                    gap_lookup[f"{name}:{trade_date}"] = gap
            fetched += 1
            time.sleep(0.5)  # Rate limit
        except Exception as e:
            log.debug(f"AInvest error for {ticker}: {e}")
            continue

    log.info(f"AInvest: fetched reporting gaps for {fetched} tickers ({len(gap_lookup)} entries)")
    return gap_lookup


def main():
    parser = argparse.ArgumentParser(description="Sync Congressional stock trades from Quiver Quantitative")
    parser.add_argument("--person-id", type=str, help="Only sync for this person_id")
    parser.add_argument("--chamber", choices=["house", "senate"], help="Only sync one chamber")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    session = Session()

    # Build lookup: bioguide_id → TrackedMember
    query = session.query(TrackedMember).filter_by(is_active=1)
    if args.person_id:
        query = query.filter_by(person_id=args.person_id)
    if args.chamber:
        query = query.filter_by(chamber=args.chamber)

    members = query.all()
    bioguide_map = {m.bioguide_id: m for m in members if m.bioguide_id}
    name_map = {}  # fallback: last_name → list of members (handles collisions)
    for m in members:
        last = m.display_name.split()[-1].lower()
        name_map.setdefault(last, []).append(m)

    log.info(f"Loaded {len(members)} tracked members ({len(bioguide_map)} with BioGuide IDs)")

    # Fetch trades from Quiver (live endpoint)
    trades = fetch_quiver_trades()

    # Also fetch from historical endpoint if available
    if QUIVER_API_KEY and QUIVER_HISTORICAL_URL:
        try:
            headers = {
                "accept": "application/json",
                "Authorization": f"Bearer {QUIVER_API_KEY}",
            }
            resp = requests.get(QUIVER_HISTORICAL_URL, headers=headers, timeout=60)
            if resp.status_code == 200:
                historical = resp.json()
                if isinstance(historical, list):
                    log.info(f"Quiver historical API returned {len(historical)} trades")
                    # Merge, avoiding duplicates by checking key fields
                    live_keys = set()
                    for t in trades:
                        key = f"{t.get('BioGuideID')}:{t.get('Ticker')}:{t.get('TransactionDate')}:{t.get('Transaction')}"
                        live_keys.add(key)
                    added = 0
                    for t in historical:
                        key = f"{t.get('BioGuideID')}:{t.get('Ticker')}:{t.get('TransactionDate')}:{t.get('Transaction')}"
                        if key not in live_keys:
                            trades.append(t)
                            live_keys.add(key)
                            added += 1
                    log.info(f"Added {added} unique historical trades")
            else:
                log.info(f"Quiver historical API returned status {resp.status_code}, skipping")
        except Exception as e:
            log.warning(f"Quiver historical fetch failed: {e}")

    if not trades:
        log.info("No trades to process")
        session.close()
        return

    # Enrich with AInvest reporting gaps
    unique_tickers = {t.get("Ticker", "") for t in trades if t.get("Ticker")}
    gap_lookup = fetch_ainvest_reporting_gaps(unique_tickers)

    count = 0
    skipped_no_member = 0
    skipped_dupe = 0

    for trade in trades:
        bioguide = trade.get("BioGuideID", "")
        ticker = trade.get("Ticker", "")
        txn_type_raw = trade.get("Transaction", "")
        amount_range = trade.get("Range", "")
        report_date = trade.get("ReportDate")
        txn_date = trade.get("TransactionDate")
        representative = trade.get("Representative", "")
        house = trade.get("House", "")

        # Skip trades without a ticker
        if not ticker:
            continue

        # Match to tracked member by BioGuide ID first, then by name
        member = bioguide_map.get(bioguide)
        if not member and representative:
            last_name = representative.split()[-1].lower()
            candidates = name_map.get(last_name, [])
            if len(candidates) == 1:
                member = candidates[0]
            elif len(candidates) > 1:
                # Multiple members share last name — try full name match
                rep_lower = representative.lower().strip()
                for c in candidates:
                    if c.display_name.lower() == rep_lower:
                        member = c
                        break
                if not member:
                    # Try first+last match
                    rep_parts = rep_lower.split()
                    for c in candidates:
                        c_parts = c.display_name.lower().split()
                        if rep_parts and c_parts and rep_parts[0] == c_parts[0]:
                            member = c
                            break

        if not member:
            skipped_no_member += 1
            continue

        # Filter by chamber if requested
        if args.chamber and member.chamber != args.chamber:
            continue

        txn_type = normalize_transaction_type(txn_type_raw)

        # Dedupe on: person + ticker + transaction date + type + amount
        dedupe = md5(f"{member.person_id}:{ticker}:{txn_date}:{txn_type}:{amount_range}")

        if session.query(CongressionalTrade).filter_by(dedupe_hash=dedupe).first():
            skipped_dupe += 1
            continue

        # Look up reporting gap from AInvest
        gap_key = f"{representative.lower().strip()}:{txn_date}"
        reporting_gap = gap_lookup.get(gap_key)

        session.add(CongressionalTrade(
            person_id=member.person_id,
            ticker=ticker,
            asset_name=trade.get("Description") or ticker,
            transaction_type=txn_type,
            amount_range=amount_range if amount_range else None,
            disclosure_date=parse_date_str(report_date),
            transaction_date=parse_date_str(txn_date),
            owner="Self",
            source_url=f"https://www.quiverquant.com/congresstrading/politician/{representative.replace(' ', '%20')}",
            reporting_gap=reporting_gap,
            dedupe_hash=dedupe,
        ))
        count += 1

    if count:
        session.commit()

    log.info(f"Done! {count} new trades inserted, {skipped_dupe} dupes skipped, {skipped_no_member} trades had no matching tracked member")
    session.close()


if __name__ == "__main__":
    main()
