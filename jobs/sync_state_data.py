"""
State-level data ingestion job.

Fetches state legislators and bills from OpenStates API v3.

Usage:
    python jobs/sync_state_data.py --state ny
    python jobs/sync_state_data.py --state ca --dry-run
    python jobs/sync_state_data.py --state ny --legislators-only
    python jobs/sync_state_data.py --state ny --bills-only
"""

import os
import sys
import json
import hashlib
import argparse
import logging
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.state_models import StateLegislator, StateBill
from connectors.openstates import fetch_state_legislators, fetch_state_bills
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_state_data")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

engine = create_engine(DB_PATH, echo=False)

if is_sqlite():
    @sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()

Session = sessionmaker(bind=engine)


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def parse_date(val):
    """Parse YYYY-MM-DD string to date object, or return None."""
    if val is None:
        return None
    from datetime import date as date_type
    if isinstance(val, date_type):
        return val
    s = str(val).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def sync_legislators(session, state: str, dry_run: bool = False) -> int:
    """Fetch and upsert state legislators."""
    log.info(f"Fetching legislators for {state.upper()}...")
    legislators = fetch_state_legislators(state)

    if not legislators:
        log.warning(f"No legislators found for {state.upper()}")
        return 0

    if dry_run:
        log.info(f"[DRY RUN] Would sync {len(legislators)} legislators for {state.upper()}")
        return len(legislators)

    count_new = 0
    count_updated = 0

    for leg in legislators:
        ocd_id = leg["ocd_id"]
        dedupe = md5(ocd_id)

        existing = session.query(StateLegislator).filter_by(ocd_id=ocd_id).first()
        if existing:
            # Update fields
            existing.name = leg["name"]
            existing.state = leg["state"]
            existing.chamber = leg["chamber"]
            existing.party = leg["party"]
            existing.district = leg["district"]
            existing.photo_url = leg["photo_url"]
            existing.is_active = leg["is_active"]
            count_updated += 1
        else:
            session.add(StateLegislator(
                ocd_id=ocd_id,
                name=leg["name"],
                state=leg["state"],
                chamber=leg["chamber"],
                party=leg["party"],
                district=leg["district"],
                photo_url=leg["photo_url"],
                is_active=leg["is_active"],
                dedupe_hash=dedupe,
            ))
            count_new += 1

    session.commit()
    log.info(f"  [{state.upper()}] {count_new} new, {count_updated} updated legislators")
    return count_new + count_updated


def sync_bills(session, state: str, dry_run: bool = False, max_pages: int = 10) -> int:
    """Fetch and upsert state bills."""
    log.info(f"Fetching bills for {state.upper()}...")

    total_synced = 0

    for page in range(1, max_pages + 1):
        bills = fetch_state_bills(state, page=page, per_page=50)

        if not bills:
            break

        if dry_run:
            total_synced += len(bills)
            continue

        count_new = 0
        for bill in bills:
            bill_id = bill["bill_id"]
            dedupe = md5(bill_id)

            existing = session.query(StateBill).filter_by(bill_id=bill_id).first()
            if existing:
                # Update mutable fields
                existing.title = bill["title"]
                existing.latest_action = bill["latest_action"]
                existing.latest_action_date = parse_date(bill["latest_action_date"])
                existing.sponsor_name = bill["sponsor_name"]
                existing.source_url = bill["source_url"]
                existing.subjects = json.dumps(bill["subjects"]) if bill["subjects"] else None
            else:
                session.add(StateBill(
                    bill_id=bill_id,
                    state=bill["state"],
                    session=bill["session"],
                    identifier=bill["identifier"],
                    title=bill["title"],
                    subjects=json.dumps(bill["subjects"]) if bill["subjects"] else None,
                    latest_action=bill["latest_action"],
                    latest_action_date=parse_date(bill["latest_action_date"]),
                    sponsor_name=bill["sponsor_name"],
                    source_url=bill["source_url"],
                    dedupe_hash=dedupe,
                ))
                count_new += 1

        session.commit()
        total_synced += len(bills)
        log.info(f"  [{state.upper()}] Page {page}: {count_new} new bills ({len(bills)} fetched)")

        # If we got fewer than a full page, we're done
        if len(bills) < 50:
            break

    if dry_run:
        log.info(f"[DRY RUN] Would sync ~{total_synced} bills for {state.upper()}")

    return total_synced


def main():
    parser = argparse.ArgumentParser(description="Sync state legislature data from OpenStates")
    parser.add_argument("--state", type=str, required=True, help="Two-letter state code (e.g., ny, ca)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write to DB")
    parser.add_argument("--legislators-only", action="store_true", help="Only sync legislators")
    parser.add_argument("--bills-only", action="store_true", help="Only sync bills")
    parser.add_argument("--max-pages", type=int, default=10, help="Max pages of bills to fetch (default: 10)")
    args = parser.parse_args()

    state = args.state.strip().upper()[:2]
    if len(state) != 2:
        log.error("Invalid state code. Use two-letter abbreviation (e.g., ny, ca).")
        sys.exit(1)

    # Create tables
    Base.metadata.create_all(engine)
    session = Session()

    try:
        leg_count = 0
        bill_count = 0

        if not args.bills_only:
            leg_count = sync_legislators(session, state, dry_run=args.dry_run)

        if not args.legislators_only:
            bill_count = sync_bills(session, state, dry_run=args.dry_run, max_pages=args.max_pages)

        log.info(f"\n{'='*50}")
        log.info(f"Summary for {state}:")
        log.info(f"  Legislators: {leg_count}")
        log.info(f"  Bills: {bill_count}")
        if args.dry_run:
            log.info("  (DRY RUN — no data written)")
        log.info(f"{'='*50}")

    finally:
        session.close()


if __name__ == "__main__":
    main()
