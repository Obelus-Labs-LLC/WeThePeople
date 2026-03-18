"""
Congressional Stock Trades Sync

Fetches STOCK Act financial disclosure data for members of Congress.

Primary source: House/Senate periodic transaction reports via
the efdsearch.senate.gov and disclosures.house.gov APIs.

Usage:
    python jobs/sync_congressional_trades.py
    python jobs/sync_congressional_trades.py --person-id pelosi
    python jobs/sync_congressional_trades.py --limit 500
"""

import os
import sys
import hashlib
import argparse
import logging
import json
from datetime import datetime

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

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})
Session = sessionmaker(bind=engine)


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


# ─── Senate E-Filings ─────────────────────────────────────────

SENATE_SEARCH_URL = "https://efdsearch.senate.gov/search/report/data/"

def fetch_senate_trades(session, member: TrackedMember, limit: int = 50) -> int:
    """
    Fetch Senate periodic transaction reports from efdsearch.senate.gov.
    Note: The Senate's e-filing system uses POST with form data.
    """
    if member.chamber != "senate":
        return 0

    # Search by last name
    last_name = member.display_name.split()[-1]

    try:
        payload = {
            "start": "01/01/2023",
            "end": datetime.now().strftime("%m/%d/%Y"),
            "first_name": "",
            "last_name": last_name,
            "report_type": "11",  # Periodic Transaction Report
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Origin": "https://efdsearch.senate.gov",
            "Referer": "https://efdsearch.senate.gov/search/",
        }

        resp = requests.post(SENATE_SEARCH_URL, data=payload, headers=headers, timeout=30)
        if resp.status_code != 200:
            log.warning(f"  [{member.person_id}] Senate EFD returned {resp.status_code}")
            return 0

        data = resp.json()
        results = data.get("data", [])[:limit]
    except Exception as e:
        log.warning(f"  [{member.person_id}] Senate EFD error: {e}")
        return 0

    count = 0
    for row in results:
        # Each row is typically [first, last, office, report_type, date, link]
        if len(row) < 5:
            continue

        disclosure_date_str = row[4] if len(row) > 4 else None
        report_link = row[5] if len(row) > 5 else None

        # We create a placeholder trade entry — full parsing requires
        # downloading the actual PDF/HTML report
        dedupe = md5(f"{member.person_id}:senate:{disclosure_date_str}:{report_link}")
        if session.query(CongressionalTrade).filter_by(dedupe_hash=dedupe).first():
            continue

        source_url = None
        if report_link and "href" in str(report_link):
            # Extract URL from anchor tag if present
            import re
            match = re.search(r'href="([^"]+)"', str(report_link))
            if match:
                source_url = f"https://efdsearch.senate.gov{match.group(1)}"

        session.add(CongressionalTrade(
            person_id=member.person_id,
            ticker=None,  # Requires parsing the actual report
            asset_name=f"Periodic Transaction Report ({disclosure_date_str})",
            transaction_type="purchase",  # Placeholder
            amount_range=None,
            disclosure_date=disclosure_date_str,
            transaction_date=None,
            owner="Self",
            source_url=source_url,
            dedupe_hash=dedupe,
        ))
        count += 1

    if count:
        session.commit()
    log.info(f"  [{member.person_id}] {count} new Senate trade reports")
    return count


# ─── House Financial Disclosures ──────────────────────────────

HOUSE_API_URL = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/"

def fetch_house_trades(session, member: TrackedMember, limit: int = 50) -> int:
    """
    Fetch House periodic transaction reports.
    The House uses a different disclosure system — XML index files by year.
    """
    if member.chamber != "house":
        return 0

    # House publishes XML indexes: FD/PTR/{YEAR}Ptr.xml
    year = datetime.now().year
    index_url = f"https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.xml"

    try:
        resp = requests.get(index_url, timeout=30)
        if resp.status_code != 200:
            log.warning(f"  [{member.person_id}] House disclosure index returned {resp.status_code}")
            return 0
    except Exception as e:
        log.warning(f"  [{member.person_id}] House disclosure error: {e}")
        return 0

    # Parse XML for member name matches
    # For now, just log that the source is available
    last_name = member.display_name.split()[-1].upper()

    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(resp.text)
    except ET.ParseError:
        log.warning(f"  [{member.person_id}] House XML parse error")
        return 0

    count = 0
    for member_elem in root.iter("Member"):
        last = (member_elem.findtext("Last") or "").upper()
        if last != last_name:
            continue

        doc_id = member_elem.findtext("DocID") or ""
        filing_date = member_elem.findtext("FilingDate") or ""
        filing_type = member_elem.findtext("FilingType") or ""

        if "PTR" not in filing_type.upper() and "Periodic" not in filing_type:
            continue

        dedupe = md5(f"{member.person_id}:house:{doc_id}")
        if session.query(CongressionalTrade).filter_by(dedupe_hash=dedupe).first():
            continue

        source_url = f"https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.pdf" if doc_id else None

        session.add(CongressionalTrade(
            person_id=member.person_id,
            ticker=None,
            asset_name=f"Periodic Transaction Report ({filing_date})",
            transaction_type="purchase",  # Placeholder
            amount_range=None,
            disclosure_date=filing_date,
            transaction_date=None,
            owner="Self",
            source_url=source_url,
            dedupe_hash=dedupe,
        ))
        count += 1

        if count >= limit:
            break

    if count:
        session.commit()
    log.info(f"  [{member.person_id}] {count} new House trade reports")
    return count


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Congressional stock trades")
    parser.add_argument("--person-id", type=str, help="Sync only this person_id")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--chamber", choices=["house", "senate"], help="Only sync one chamber")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    session = Session()

    try:
        query = session.query(TrackedMember).filter_by(is_active=1)
        if args.person_id:
            query = query.filter_by(person_id=args.person_id)
        if args.chamber:
            query = query.filter_by(chamber=args.chamber)

        members = query.all()
        log.info(f"Syncing Congressional trades for {len(members)} members")

        totals = {"senate": 0, "house": 0}

        for m in members:
            log.info(f"── {m.display_name} ({m.person_id}, {m.chamber}) ──")

            if m.chamber == "senate":
                totals["senate"] += fetch_senate_trades(session, m, args.limit)
            else:
                totals["house"] += fetch_house_trades(session, m, args.limit)

        log.info(f"Done. Senate: {totals['senate']} new, House: {totals['house']} new")
    finally:
        session.close()


if __name__ == "__main__":
    main()
