"""
Congressional Stock Trades Sync

Fetches STOCK Act financial disclosure data for members of Congress.
Parses actual transaction data — no placeholders.

Senate source: efdsearch.senate.gov (EFD search → individual report HTML pages)
House source: disclosures-clerk.house.gov (PTR XML index → report HTML pages)

Usage:
    python jobs/sync_congressional_trades.py
    python jobs/sync_congressional_trades.py --person-id pelosi
    python jobs/sync_congressional_trades.py --limit 500
    python jobs/sync_congressional_trades.py --chamber senate
"""

import os
import sys
import hashlib
import argparse
import logging
import re
import time
import html as html_mod
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

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})
Session = sessionmaker(bind=engine)

# Rate limiting
REQUEST_DELAY = 1.5  # seconds between requests


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def parse_date_str(val: Optional[str]) -> Optional[date]:
    """Parse various date formats into a date object."""
    if not val:
        return None
    val = val.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%b %d, %Y"):
        try:
            return datetime.strptime(val, fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def clean_text(text: str) -> str:
    """Strip HTML tags and normalize whitespace."""
    text = re.sub(r'<[^>]+>', '', text)
    text = html_mod.unescape(text)
    return re.sub(r'\s+', ' ', text).strip()


def extract_ticker(asset_name: str) -> Optional[str]:
    """Try to extract a stock ticker from an asset description."""
    # Common patterns: "Apple Inc. (AAPL)", "AAPL - Apple Inc", "(AAPL)"
    match = re.search(r'\(([A-Z]{1,5})\)', asset_name)
    if match:
        return match.group(1)
    # "TICKER - Company Name" pattern
    match = re.match(r'^([A-Z]{1,5})\s*[-–—]\s', asset_name)
    if match:
        return match.group(1)
    return None


def normalize_transaction_type(raw: str) -> Optional[str]:
    """Normalize transaction type to purchase/sale/exchange."""
    raw = raw.lower().strip()
    if "purchase" in raw or "buy" in raw:
        return "purchase"
    elif "sale" in raw:
        if "partial" in raw:
            return "sale_partial"
        elif "full" in raw:
            return "sale_full"
        return "sale"
    elif "exchange" in raw:
        return "exchange"
    return raw if raw else None


# ─── Senate E-Filings ─────────────────────────────────────────

SENATE_SEARCH_URL = "https://efdsearch.senate.gov/search/report/data/"
SENATE_BASE = "https://efdsearch.senate.gov"


def get_senate_session() -> requests.Session:
    """Create a requests session with proper headers for Senate EFD."""
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; WeThePeople/1.0; civic transparency)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    # Visit the search page first to get cookies/CSRF
    try:
        s.get(f"{SENATE_BASE}/search/", timeout=15)
    except Exception:
        pass
    return s


def parse_senate_report_page(session: requests.Session, report_url: str) -> list[dict]:
    """
    Fetch and parse a Senate PTR report page for individual transactions.
    Returns a list of transaction dicts with real data.
    """
    transactions = []
    try:
        time.sleep(REQUEST_DELAY)
        resp = session.get(report_url, timeout=30)
        if resp.status_code != 200:
            log.debug(f"  Report page returned {resp.status_code}: {report_url}")
            return []
    except Exception as e:
        log.debug(f"  Failed to fetch report: {e}")
        return []

    page_html = resp.text

    # Senate PTR pages have a table with class "table" or id "grid"
    # Each row has: Transaction Date | Owner | Ticker | Asset Name | Type | Amount
    # Try to find the transaction table
    table_patterns = [
        r'<table[^>]*class="[^"]*table[^"]*"[^>]*>(.*?)</table>',
        r'<table[^>]*id="[^"]*grid[^"]*"[^>]*>(.*?)</table>',
        r'<table[^>]*>(.*?)</table>',
    ]

    table_html = None
    for pattern in table_patterns:
        match = re.search(pattern, page_html, re.DOTALL | re.IGNORECASE)
        if match:
            candidate = match.group(1)
            # Check if this table has transaction-like content
            if any(kw in candidate.lower() for kw in ["transaction", "asset", "purchase", "sale", "amount"]):
                table_html = candidate
                break

    if not table_html:
        return []

    # Parse rows
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL | re.IGNORECASE)

    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
        if len(cells) < 4:
            continue

        cells = [clean_text(c) for c in cells]

        # Skip header rows
        if any(h in cells[0].lower() for h in ["transaction", "date", "owner", "#"]):
            continue

        # Try to map columns — Senate PTR format varies but typically:
        # [transaction_date, owner, ticker, asset_name, asset_type, type, amount, comment]
        # or [#, transaction_date, owner, ticker, asset_name, type, amount]
        txn = _parse_senate_row(cells)
        if txn and txn.get("asset_name"):
            txn["source_url"] = report_url
            transactions.append(txn)

    return transactions


def _parse_senate_row(cells: list[str]) -> Optional[dict]:
    """Try to parse a Senate PTR table row into a transaction dict."""
    # Different Senate reports have different column layouts
    # We try to identify columns by content patterns

    txn_date = None
    owner = None
    ticker = None
    asset_name = None
    txn_type = None
    amount = None

    for i, cell in enumerate(cells):
        cell_lower = cell.lower()

        # Date detection (MM/DD/YYYY or YYYY-MM-DD)
        if not txn_date and re.match(r'\d{1,2}/\d{1,2}/\d{2,4}', cell):
            txn_date = parse_date_str(cell)
        elif not txn_date and re.match(r'\d{4}-\d{2}-\d{2}', cell):
            txn_date = parse_date_str(cell)

        # Owner detection
        elif not owner and cell_lower in ("self", "spouse", "child", "joint", "dependent"):
            owner = cell.capitalize()

        # Transaction type detection
        elif not txn_type and any(t in cell_lower for t in ("purchase", "sale", "exchange", "buy")):
            txn_type = normalize_transaction_type(cell)

        # Amount range detection ($1,001 - $15,000 pattern)
        elif not amount and re.search(r'\$[\d,]+', cell):
            amount = cell

        # Ticker detection (1-5 uppercase letters, standalone)
        elif not ticker and re.match(r'^[A-Z]{1,5}$', cell):
            ticker = cell

        # Asset name (longer text, not matching other patterns)
        elif not asset_name and len(cell) > 5 and not re.match(r'^[\d/\-]+$', cell):
            # Could be asset name — check if it has a ticker embedded
            if not ticker:
                ticker = extract_ticker(cell)
            asset_name = cell

    # Only return if we have enough real data
    if not asset_name:
        return None
    if not txn_type:
        return None

    return {
        "transaction_date": txn_date,
        "owner": owner or "Self",
        "ticker": ticker,
        "asset_name": asset_name[:500],
        "transaction_type": txn_type,
        "amount_range": amount,
    }


def fetch_senate_trades(db_session, member: TrackedMember, http_session: requests.Session, limit: int = 50) -> int:
    """Fetch and parse real Senate trade data."""
    if member.chamber != "senate":
        return 0

    last_name = member.display_name.split()[-1]
    first_name = member.display_name.split()[0]

    try:
        payload = {
            "start": "01/01/2020",
            "end": datetime.now().strftime("%m/%d/%Y"),
            "first_name": first_name,
            "last_name": last_name,
            "report_type": "11",  # Periodic Transaction Report
        }
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Origin": SENATE_BASE,
            "Referer": f"{SENATE_BASE}/search/",
        }

        time.sleep(REQUEST_DELAY)
        resp = http_session.post(SENATE_SEARCH_URL, data=payload, headers=headers, timeout=30)
        if resp.status_code != 200:
            log.warning(f"  [{member.person_id}] Senate EFD returned {resp.status_code}")
            return 0

        data = resp.json()
        results = data.get("data", [])[:limit]
    except Exception as e:
        log.warning(f"  [{member.person_id}] Senate EFD error: {e}")
        return 0

    if not results:
        log.info(f"  [{member.person_id}] No Senate PTR filings found")
        return 0

    log.info(f"  [{member.person_id}] Found {len(results)} Senate PTR filings, parsing reports...")
    count = 0

    for row in results:
        if len(row) < 6:
            continue

        report_link = row[5] if len(row) > 5 else None
        disclosure_date_str = row[4] if len(row) > 4 else None

        # Extract report URL from anchor tag
        report_url = None
        if report_link and "href" in str(report_link):
            match = re.search(r'href="([^"]+)"', str(report_link))
            if match:
                path = match.group(1)
                report_url = f"{SENATE_BASE}{path}" if path.startswith("/") else path

        if not report_url:
            continue

        # Parse the actual report page for individual transactions
        transactions = parse_senate_report_page(http_session, report_url)

        disclosure_date = parse_date_str(disclosure_date_str)

        for txn in transactions:
            dedupe = md5(
                f"{member.person_id}:senate:{txn['asset_name']}:{txn.get('transaction_date', '')}:"
                f"{txn.get('transaction_type', '')}:{txn.get('amount_range', '')}"
            )

            if db_session.query(CongressionalTrade).filter_by(dedupe_hash=dedupe).first():
                continue

            db_session.add(CongressionalTrade(
                person_id=member.person_id,
                ticker=txn.get("ticker"),
                asset_name=txn["asset_name"],
                transaction_type=txn.get("transaction_type", "unknown"),
                amount_range=txn.get("amount_range"),
                disclosure_date=disclosure_date,
                transaction_date=txn.get("transaction_date"),
                owner=txn.get("owner", "Self"),
                source_url=txn.get("source_url"),
                dedupe_hash=dedupe,
            ))
            count += 1

    if count:
        db_session.commit()
    log.info(f"  [{member.person_id}] {count} new Senate trade transactions")
    return count


# ─── House Financial Disclosures ──────────────────────────────

HOUSE_PTR_XML = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}Ptr.xml"
HOUSE_FD_XML = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.xml"


def fetch_house_trades(db_session, member: TrackedMember, limit: int = 100) -> int:
    """Fetch House trades from PTR XML index."""
    if member.chamber != "house":
        return 0

    last_name = member.display_name.split()[-1].upper()
    first_name = member.display_name.split()[0].upper()

    import xml.etree.ElementTree as ET

    count = 0
    current_year = datetime.now().year

    # Check current year and previous year
    for year in range(current_year, max(current_year - 3, 2019), -1):
        ptr_url = HOUSE_PTR_XML.format(year=year)

        try:
            time.sleep(REQUEST_DELAY)
            resp = requests.get(ptr_url, timeout=30)
            if resp.status_code != 200:
                log.debug(f"  [{member.person_id}] House PTR XML {year} returned {resp.status_code}")
                continue
        except Exception as e:
            log.debug(f"  [{member.person_id}] House PTR XML {year} error: {e}")
            continue

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError:
            log.warning(f"  [{member.person_id}] House PTR XML {year} parse error")
            continue

        for member_elem in root.iter("Member"):
            last = (member_elem.findtext("Last") or "").upper().strip()
            first = (member_elem.findtext("First") or "").upper().strip()

            if last != last_name:
                continue
            # Check first name loosely (handle middle names, nicknames)
            if first_name[:3] not in first[:3] and first[:3] not in first_name[:3]:
                continue

            doc_id = member_elem.findtext("DocID") or ""
            filing_date = member_elem.findtext("FilingDate") or ""
            filing_type = member_elem.findtext("FilingType") or ""

            if not doc_id:
                continue

            # Only PTR filings
            if "PTR" not in filing_type.upper() and "Periodic" not in filing_type:
                continue

            # The PTR XML has some transaction fields in newer formats
            # Try to extract: Asset, TransactionType, Amount, TransactionDate
            asset = member_elem.findtext("Asset") or member_elem.findtext("AssetName") or ""
            txn_type_raw = member_elem.findtext("TransactionType") or member_elem.findtext("Type") or ""
            amount_raw = member_elem.findtext("Amount") or member_elem.findtext("Range") or ""
            txn_date_raw = member_elem.findtext("TransactionDate") or ""

            ticker = extract_ticker(asset) if asset else None
            txn_type = normalize_transaction_type(txn_type_raw) if txn_type_raw else None

            # Build source URL for the filing
            source_url = f"https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.pdf" if doc_id else None

            # If PTR XML has transaction-level data, use it
            if asset and txn_type:
                dedupe = md5(f"{member.person_id}:house:{doc_id}:{asset}:{txn_type}")

                if db_session.query(CongressionalTrade).filter_by(dedupe_hash=dedupe).first():
                    continue

                db_session.add(CongressionalTrade(
                    person_id=member.person_id,
                    ticker=ticker,
                    asset_name=asset[:500] if asset else f"PTR Filing {doc_id}",
                    transaction_type=txn_type,
                    amount_range=amount_raw if amount_raw else None,
                    disclosure_date=parse_date_str(filing_date),
                    transaction_date=parse_date_str(txn_date_raw),
                    owner="Self",
                    source_url=source_url,
                    dedupe_hash=dedupe,
                ))
                count += 1

            # If XML doesn't have transaction-level data, try to parse the HTML report
            elif doc_id:
                # Some House filings have HTML versions
                html_url = f"https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.htm"
                txns = _parse_house_report_html(html_url)

                for txn in txns:
                    if not txn.get("asset_name") or not txn.get("transaction_type"):
                        continue

                    dedupe = md5(
                        f"{member.person_id}:house:{doc_id}:{txn['asset_name']}:"
                        f"{txn.get('transaction_type', '')}:{txn.get('amount_range', '')}"
                    )

                    if db_session.query(CongressionalTrade).filter_by(dedupe_hash=dedupe).first():
                        continue

                    db_session.add(CongressionalTrade(
                        person_id=member.person_id,
                        ticker=txn.get("ticker"),
                        asset_name=txn["asset_name"][:500],
                        transaction_type=txn["transaction_type"],
                        amount_range=txn.get("amount_range"),
                        disclosure_date=parse_date_str(filing_date),
                        transaction_date=txn.get("transaction_date"),
                        owner=txn.get("owner", "Self"),
                        source_url=source_url,
                        dedupe_hash=dedupe,
                    ))
                    count += 1

            if count >= limit:
                break

    if count:
        db_session.commit()
    log.info(f"  [{member.person_id}] {count} new House trade transactions")
    return count


def _parse_house_report_html(url: str) -> list[dict]:
    """Try to parse a House PTR HTML report for transaction data."""
    try:
        time.sleep(REQUEST_DELAY)
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            return []
    except Exception:
        return []

    page = resp.text
    transactions = []

    # House HTML reports have tables with transaction data
    # Look for rows with asset/ticker/amount/type info
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', page, re.DOTALL | re.IGNORECASE)

    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
        if len(cells) < 4:
            continue

        cells = [clean_text(c) for c in cells]

        # Skip header/empty rows
        if not any(c for c in cells):
            continue
        if any(h in cells[0].lower() for h in ["asset", "id", "owner", "#", "transaction"]):
            continue

        txn = _parse_house_row(cells)
        if txn and txn.get("asset_name") and txn.get("transaction_type"):
            transactions.append(txn)

    return transactions


def _parse_house_row(cells: list[str]) -> Optional[dict]:
    """Parse a House PTR HTML table row."""
    txn_date = None
    owner = None
    ticker = None
    asset_name = None
    txn_type = None
    amount = None

    for cell in cells:
        cell_lower = cell.lower().strip()

        if not cell_lower:
            continue

        # Date
        if not txn_date and re.match(r'\d{1,2}/\d{1,2}/\d{2,4}', cell):
            txn_date = parse_date_str(cell)

        # Owner
        elif not owner and cell_lower in ("self", "sp", "spouse", "dc", "child", "jt", "joint", "dependent"):
            owner_map = {"sp": "Spouse", "dc": "Child", "jt": "Joint"}
            owner = owner_map.get(cell_lower, cell.capitalize())

        # Transaction type
        elif not txn_type and any(t in cell_lower for t in ("purchase", "sale", "exchange", "buy", "p", "s")):
            if cell_lower in ("p", "p -"):
                txn_type = "purchase"
            elif cell_lower in ("s", "s -", "s (partial)", "s (full)"):
                txn_type = "sale"
            else:
                txn_type = normalize_transaction_type(cell)

        # Amount
        elif not amount and re.search(r'\$[\d,]+', cell):
            amount = cell

        # Ticker
        elif not ticker and re.match(r'^[A-Z]{1,5}$', cell):
            ticker = cell

        # Asset name
        elif not asset_name and len(cell) > 3:
            if not ticker:
                ticker = extract_ticker(cell)
            asset_name = cell

    if not asset_name or not txn_type:
        return None

    return {
        "transaction_date": txn_date,
        "owner": owner or "Self",
        "ticker": ticker,
        "asset_name": asset_name[:500],
        "transaction_type": txn_type,
        "amount_range": amount,
    }


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Congressional stock trades (real data only)")
    parser.add_argument("--person-id", type=str, help="Sync only this person_id")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--chamber", choices=["house", "senate"], help="Only sync one chamber")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db_session = Session()
    http_session = get_senate_session()

    try:
        query = db_session.query(TrackedMember).filter_by(is_active=1)
        if args.person_id:
            query = query.filter_by(person_id=args.person_id)
        if args.chamber:
            query = query.filter_by(chamber=args.chamber)

        members = query.all()
        log.info(f"Syncing Congressional trades for {len(members)} members (real data only, no placeholders)")

        totals = {"senate": 0, "house": 0}

        for m in members:
            log.info(f"── {m.display_name} ({m.person_id}, {m.chamber}) ──")

            if m.chamber == "senate":
                totals["senate"] += fetch_senate_trades(db_session, m, http_session, args.limit)
            else:
                totals["house"] += fetch_house_trades(db_session, m, args.limit)

        log.info(f"Done. Senate: {totals['senate']} new, House: {totals['house']} new")
    finally:
        db_session.close()


if __name__ == "__main__":
    main()
