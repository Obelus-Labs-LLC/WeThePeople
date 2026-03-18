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
from datetime import datetime, date
from typing import Optional

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base, TrackedMember, CongressionalTrade

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_congressional_trades")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
QUIVER_API_KEY = os.getenv("QUIVER_API_KEY", "")

QUIVER_LIVE_URL = "https://api.quiverquant.com/beta/live/congresstrading"
QUIVER_HISTORICAL_URL = "https://api.quiverquant.com/beta/historical/congresstrading"

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})
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
        "Authorization": f"Token {QUIVER_API_KEY}",
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
        log.error(f"Quiver API error: {e}")
        return []


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
    name_map = {}  # fallback: last_name → member
    for m in members:
        last = m.display_name.split()[-1].lower()
        name_map[last] = m

    log.info(f"Loaded {len(members)} tracked members ({len(bioguide_map)} with BioGuide IDs)")

    # Fetch trades from Quiver
    trades = fetch_quiver_trades()
    if not trades:
        log.info("No trades to process")
        session.close()
        return

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
        if not member:
            last_name = representative.split()[-1].lower() if representative else ""
            member = name_map.get(last_name)

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
            dedupe_hash=dedupe,
        ))
        count += 1

    if count:
        session.commit()

    log.info(f"Done! {count} new trades inserted, {skipped_dupe} dupes skipped, {skipped_no_member} trades had no matching tracked member")
    session.close()


if __name__ == "__main__":
    main()
