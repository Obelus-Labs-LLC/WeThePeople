"""
Congressional Trade Sync from House Financial Disclosure PDFs

Fetches Periodic Transaction Report (PTR) filings from the House Clerk's
public disclosure system, downloads the PDF reports, and parses individual
stock transactions using pdfplumber.

Inspired by the parsing approach in ivanma9/CongressionalTrading (MIT licensed).
All code is original.

Data source:
    https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/
    https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip (XML index)

Usage:
    python jobs/sync_trades_from_disclosures.py
    python jobs/sync_trades_from_disclosures.py --year 2024
    python jobs/sync_trades_from_disclosures.py --limit 10 --dry-run
"""

import os
import sys
import re
import io
import hashlib
import zipfile
import argparse
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, date
from typing import Optional

import requests
import pdfplumber
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base, TrackedMember, CongressionalTrade

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_trades_from_disclosures")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

# ---------------------------------------------------------------------------
# House Clerk disclosure URLs
# ---------------------------------------------------------------------------
HOUSE_DISC_BASE = "https://disclosures-clerk.house.gov/public_disc"
FD_ZIP_URL = HOUSE_DISC_BASE + "/financial-pdfs/{year}FD.zip"
PTR_PDF_URL = HOUSE_DISC_BASE + "/ptr-pdfs/{year}/{doc_id}.pdf"

USER_AGENT = "WeThePeople/1.0 (civic transparency project; contact: github.com/Obelus-Labs-LLC/WeThePeople)"
PDF_MAX_BYTES = 10 * 1024 * 1024  # 10 MB safety limit
REQUEST_TIMEOUT = 60
RATE_LIMIT_DELAY = 1.0  # seconds between PDF downloads

# ---------------------------------------------------------------------------
# Regex patterns for parsing PTR PDF text
# ---------------------------------------------------------------------------
# Ticker in parentheses, e.g. "(AAPL)", "(MSFT)"
TICKER_RE = re.compile(r"\(([A-Z]{1,6})\)")

# Asset type in brackets, e.g. "[ST]" for stock, "[OP]" for option
ASSET_TYPE_RE = re.compile(r"\[([A-Z]{2})\]")

# Date in MM/DD/YYYY format
DATE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})")

# Dollar amount ranges, e.g. "$1,001 - $15,000"
AMOUNT_RE = re.compile(r"\$([0-9,]+)\s*-\s*\$([0-9,]+)")
AMOUNT_OVER_RE = re.compile(r"Over\s+\$([0-9,]+)", re.IGNORECASE)

# Transaction type: single letter P/S/E surrounded by whitespace
TRANSACTION_TYPE_RE = re.compile(r"(?:^|\s)([PSE])(?:\s|$)")

# Partial sale indicator
PARTIAL_SALE_RE = re.compile(r"S\s*\(partial\)", re.IGNORECASE)

# Owner codes
OWNER_MAP = {
    "SP": "Spouse",
    "JT": "Joint",
    "DC": "Dependent",
}

# Transaction type map
TRANSACTION_TYPE_MAP = {
    "P": "purchase",
    "S": "sale",
    "E": "exchange",
}

# Known amount brackets for validation
AMOUNT_BRACKETS = [
    (1_001, 15_000),
    (15_001, 50_000),
    (50_001, 100_000),
    (100_001, 250_000),
    (250_001, 500_000),
    (500_001, 1_000_000),
    (1_000_001, 5_000_000),
    (5_000_001, 25_000_000),
    (25_000_001, 50_000_000),
]

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})
Session = sessionmaker(bind=engine)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def parse_date_mdy(val: str) -> Optional[date]:
    """Parse MM/DD/YYYY date string."""
    try:
        return datetime.strptime(val.strip(), "%m/%d/%Y").date()
    except (ValueError, TypeError):
        return None


def parse_date_iso(val: str) -> Optional[date]:
    """Parse YYYY-MM-DD or M/D/YYYY date string."""
    if not val:
        return None
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(val[:10], fmt).date()
        except (ValueError, TypeError):
            continue
    return None


def is_reasonable_date(d: Optional[date], filing_year: int) -> bool:
    """Check that a date is plausible for a congressional disclosure."""
    if d is None:
        return False
    # Must be after STOCK Act (2012) and not more than 2 years before filing
    if d.year < 2012:
        return False
    if d.year > filing_year + 1:
        return False
    if d.year < filing_year - 2:
        return False
    return True


def format_amount_range(low: int, high: int) -> str:
    """Format dollar range like '$1,001 - $15,000'."""
    return f"${low:,} - ${high:,}"


def http_get(url: str, stream: bool = False) -> requests.Response:
    """GET with proper headers and retry on 5xx."""
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(3):
        try:
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, stream=stream)
            if resp.status_code >= 500 and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            return resp
        except requests.RequestException:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise
    # Should not reach here, but satisfy type checker
    return requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, stream=stream)


# ---------------------------------------------------------------------------
# XML Index: fetch and parse the annual filing index
# ---------------------------------------------------------------------------

def fetch_filing_index(year: int) -> list[dict]:
    """
    Download the annual FD ZIP from House Clerk, extract the XML index,
    and return a list of filing metadata dicts.
    """
    url = FD_ZIP_URL.format(year=year)
    log.info(f"Downloading filing index: {url}")
    resp = http_get(url)
    if resp.status_code != 200:
        log.error(f"Failed to download index ZIP for {year}: HTTP {resp.status_code}")
        return []

    try:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            # Find the XML file inside the zip
            xml_name = None
            for name in zf.namelist():
                if name.lower().endswith(".xml"):
                    xml_name = name
                    break
            if not xml_name:
                log.error(f"No XML file found in {year}FD.zip")
                return []

            xml_bytes = zf.read(xml_name)
    except zipfile.BadZipFile:
        log.error(f"Bad ZIP file for {year}")
        return []

    return parse_xml_index(xml_bytes, year)


def parse_xml_index(xml_bytes: bytes, year: int) -> list[dict]:
    """Parse the House Clerk XML index into a list of filing dicts."""
    filings = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        log.error(f"XML parse error: {e}")
        return []

    for member in root.iter("Member"):
        filing = _parse_member_element(member, year)
        if filing:
            filings.append(filing)

    log.info(f"Parsed {len(filings)} total filings from {year} index")
    return filings


def _xml_text(elem, tag: str) -> Optional[str]:
    """Get text content of a child element by tag name."""
    child = elem.find(tag)
    if child is not None and child.text:
        return child.text.strip()
    return None


def _parse_member_element(member, year: int) -> Optional[dict]:
    """Extract filing metadata from a <Member> XML element."""
    doc_id = _xml_text(member, "DocID")
    if not doc_id:
        return None

    first = _xml_text(member, "First") or ""
    last = _xml_text(member, "Last") or ""
    prefix = _xml_text(member, "Prefix") or ""
    suffix = _xml_text(member, "Suffix") or ""
    filing_type = _xml_text(member, "FilingType") or ""
    filing_date_str = _xml_text(member, "FilingDate") or ""
    state_district = _xml_text(member, "StateDst") or ""
    filing_year_str = _xml_text(member, "Year") or str(year)

    filing_date = parse_date_iso(filing_date_str)

    return {
        "doc_id": doc_id,
        "prefix": prefix,
        "first": first,
        "last": last,
        "suffix": suffix,
        "filing_type": filing_type,
        "state_district": state_district,
        "filing_year": int(filing_year_str) if filing_year_str.isdigit() else year,
        "filing_date": filing_date,
    }


def filter_ptrs(filings: list[dict]) -> list[dict]:
    """Keep only Periodic Transaction Reports (filing_type == 'P')."""
    return [f for f in filings if f.get("filing_type") == "P"]


# ---------------------------------------------------------------------------
# PDF Download and Text Extraction
# ---------------------------------------------------------------------------

def download_pdf(doc_id: str, year: int) -> Optional[bytes]:
    """Download a PTR PDF from House Clerk. Returns raw bytes or None."""
    url = PTR_PDF_URL.format(year=year, doc_id=doc_id)
    resp = http_get(url)
    if resp.status_code != 200:
        log.debug(f"PDF download failed for {doc_id}: HTTP {resp.status_code}")
        return None

    content = resp.content
    if len(content) > PDF_MAX_BYTES:
        log.warning(f"PDF {doc_id} exceeds size limit ({len(content)} bytes), skipping")
        return None

    # Validate PDF magic bytes
    if not content[:5] == b"%PDF-":
        log.warning(f"PDF {doc_id} has invalid header, skipping")
        return None

    return content


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF using pdfplumber with layout preservation.
    Falls back to OCR (pytesseract) for scanned image PDFs."""
    text_parts = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text(
                    layout=True,
                    x_density=3,
                    y_density=6,
                )
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        log.warning(f"pdfplumber extraction error: {e}")

    combined = "\n".join(text_parts)

    # OCR fallback for scanned image PDFs
    if not combined.strip():
        try:
            from pdf2image import convert_from_bytes
            import pytesseract

            log.info("pdfplumber returned empty text, attempting OCR fallback...")
            images = convert_from_bytes(pdf_bytes, dpi=300)
            ocr_parts = []
            for img in images:
                page_text = pytesseract.image_to_string(img, config="--psm 6")
                if page_text:
                    ocr_parts.append(page_text)
            combined = "\n".join(ocr_parts)
            if combined.strip():
                log.info(f"OCR extracted {len(combined)} chars from {len(images)} pages")
            else:
                log.warning("OCR also returned empty text")
        except ImportError:
            log.warning("OCR dependencies not installed (pip install pytesseract pdf2image; apt install tesseract-ocr poppler-utils)")
        except Exception as e:
            log.warning(f"OCR extraction error: {e}")

    return combined


# ---------------------------------------------------------------------------
# Transaction Parsing
# ---------------------------------------------------------------------------

def parse_transactions(text: str, filing_year: int) -> list[dict]:
    """
    Parse PTR PDF text into a list of transaction dicts.

    Each transaction has:
      - ticker: str or None
      - asset_name: str
      - transaction_type: 'purchase', 'sale', 'sale_partial', 'exchange'
      - transaction_date: date or None
      - amount_range: str like '$1,001 - $15,000'
      - owner: 'Self', 'Spouse', 'Joint', 'Dependent'
      - cap_gains_over_200k: bool
    """
    blocks = _split_transaction_blocks(text)
    transactions = []

    for block in blocks:
        txn = _parse_block(block, filing_year)
        if txn:
            transactions.append(txn)

    return transactions


def _split_transaction_blocks(text: str) -> list[str]:
    """
    Split PDF text into individual transaction blocks.

    House PTR PDFs have a tabular layout. We look for the header row
    containing 'Owner' and 'Asset' to identify the transaction section,
    then split on blank lines or row boundaries.
    """
    # Remove form-feed characters
    text = text.replace("\f", "\n")

    lines = text.split("\n")
    blocks = []
    current_block = []
    in_transactions = False

    for line in lines:
        stripped = line.strip()

        # Detect the start of the transaction table
        if not in_transactions:
            if ("Owner" in stripped and "Asset" in stripped) or \
               ("ID" in stripped and "Owner" in stripped and "Asset" in stripped):
                in_transactions = True
                continue
            continue

        # End markers: page footers, signature lines, etc.
        if any(marker in stripped.lower() for marker in [
            "* for the complete list",
            "filing id #",
            "clerk of the house",
            "financial disclosure",
            "this report is required",
        ]):
            if current_block:
                blocks.append("\n".join(current_block))
                current_block = []
            continue

        # Blank line = block boundary
        if not stripped:
            if current_block:
                blocks.append("\n".join(current_block))
                current_block = []
            continue

        # Metadata continuation lines (description, sub-holding, etc.)
        # These belong to the previous block if they start with special prefixes
        if stripped.startswith(("D :", "F S :", "C :", "S :")):
            if current_block:
                current_block.append(line)
            elif blocks:
                # Append to previous block
                blocks[-1] = blocks[-1] + "\n" + line
            continue

        current_block.append(line)

    if current_block:
        blocks.append("\n".join(current_block))

    return blocks


def _parse_block(block: str, filing_year: int) -> Optional[dict]:
    """Parse a single transaction block into a structured dict."""
    if not block.strip():
        return None

    lines = block.split("\n")
    full_text = " ".join(lines)

    # --- Extract ticker ---
    ticker = None
    ticker_match = TICKER_RE.search(full_text)
    if ticker_match:
        ticker = ticker_match.group(1)

    # --- Extract asset type code ---
    asset_type = None
    asset_type_match = ASSET_TYPE_RE.search(full_text)
    if asset_type_match:
        asset_type = asset_type_match.group(1)

    # --- Extract asset description ---
    # The asset name is typically the text before the ticker or in the first data area
    asset_name = _extract_asset_name(full_text, ticker_match)

    # --- Extract owner ---
    owner = _extract_owner(lines[0] if lines else "")

    # --- Extract transaction type ---
    txn_type = _extract_transaction_type(full_text)
    if txn_type is None:
        # No recognizable transaction type = probably not a valid transaction row
        return None

    # --- Extract dates ---
    dates = DATE_RE.findall(full_text)
    transaction_date = None
    notification_date = None
    parsed_dates = []

    for d_str in dates:
        d = parse_date_mdy(d_str)
        if d and is_reasonable_date(d, filing_year):
            parsed_dates.append(d)

    if len(parsed_dates) >= 1:
        transaction_date = parsed_dates[0]
    if len(parsed_dates) >= 2:
        notification_date = parsed_dates[1]

    # Validate date ordering: transaction should be before or equal to notification
    if transaction_date and notification_date and transaction_date > notification_date:
        # Swap if reversed (some PDFs have notification first)
        transaction_date, notification_date = notification_date, transaction_date

    # --- Extract amount range ---
    amount_range = _extract_amount(full_text)

    # --- Cap gains over $200k ---
    cap_gains = None
    if "Yes" in full_text and ("200" in full_text or "cap" in full_text.lower()):
        cap_gains = True
    elif "No" in full_text:
        cap_gains = False

    # Must have at least an asset name or ticker to be valid
    if not ticker and not asset_name:
        return None

    return {
        "ticker": ticker,
        "asset_name": asset_name or (ticker if ticker else "Unknown"),
        "asset_type": asset_type,
        "transaction_type": txn_type,
        "transaction_date": transaction_date,
        "notification_date": notification_date,
        "amount_range": amount_range,
        "owner": owner,
        "cap_gains_over_200k": cap_gains,
    }


def _extract_asset_name(full_text: str, ticker_match) -> Optional[str]:
    """Extract the asset/company name from transaction text."""
    # Try to get text before the ticker
    if ticker_match:
        before_ticker = full_text[:ticker_match.start()].strip()
        # Remove leading ID numbers, owner codes, etc.
        # Common pattern: "SP  Microsoft Corporation (MSFT) [ST]"
        cleaned = re.sub(r"^\s*\d+\s*", "", before_ticker)  # Strip leading row ID
        cleaned = re.sub(r"^(SP|JT|DC)\s+", "", cleaned, flags=re.IGNORECASE)  # Strip owner code
        cleaned = cleaned.strip()
        if cleaned and len(cleaned) > 1:
            return cleaned

    # Fall back to looking for text before asset type bracket
    bracket_match = ASSET_TYPE_RE.search(full_text)
    if bracket_match:
        before = full_text[:bracket_match.start()].strip()
        cleaned = re.sub(r"^\s*\d+\s*", "", before)
        cleaned = re.sub(r"^(SP|JT|DC)\s+", "", cleaned, flags=re.IGNORECASE)
        cleaned = cleaned.strip()
        if cleaned and len(cleaned) > 1:
            return cleaned

    return None


def _extract_owner(first_line: str) -> str:
    """Extract owner from the first line of a transaction block."""
    stripped = first_line.strip()
    # Owner codes typically appear at the start: "SP  ...", "JT  ...", "DC ..."
    for code, label in OWNER_MAP.items():
        if stripped.upper().startswith(code + " ") or stripped.upper().startswith(code + "\t"):
            return label
    return "Self"


def _extract_transaction_type(text: str) -> Optional[str]:
    """
    Identify the transaction type from the text.

    PTR PDFs use single-letter codes: P (Purchase), S (Sale), E (Exchange).
    They can appear in various positions relative to other fields.
    """
    # Check for partial sale first (more specific)
    if PARTIAL_SALE_RE.search(text):
        return "sale_partial"

    # Look for the P/S/E code.
    # It's typically between the asset info and the dates, surrounded by whitespace.
    # We search for it in a region that's likely the transaction type column.
    matches = TRANSACTION_TYPE_RE.findall(text)
    if matches:
        # If multiple matches, prefer the one that's NOT part of a word.
        # Take the last match before any date, or the first match.
        for m in matches:
            if m in TRANSACTION_TYPE_MAP:
                txn = TRANSACTION_TYPE_MAP[m]
                return txn

    # Also check for full words as fallback
    text_lower = text.lower()
    if "purchase" in text_lower:
        return "purchase"
    if "sale" in text_lower:
        return "sale"
    if "exchange" in text_lower:
        return "exchange"

    return None


def _extract_amount(text: str) -> Optional[str]:
    """Extract dollar amount range from text."""
    # Standard range: "$1,001 - $15,000"
    match = AMOUNT_RE.search(text)
    if match:
        low_str = match.group(1).replace(",", "")
        high_str = match.group(2).replace(",", "")
        try:
            low = int(low_str)
            high = int(high_str)
            return format_amount_range(low, high)
        except ValueError:
            pass

    # Over $X format
    over_match = AMOUNT_OVER_RE.search(text)
    if over_match:
        val_str = over_match.group(1).replace(",", "")
        try:
            val = int(val_str)
            return f"Over ${val:,}"
        except ValueError:
            pass

    return None


# ---------------------------------------------------------------------------
# Name Matching
# ---------------------------------------------------------------------------

def build_name_index(members: list) -> dict:
    """
    Build multiple lookup indices for matching filer names to TrackedMembers.

    Returns a dict with:
      - 'by_last': {last_name_lower: member}
      - 'by_full': {full_name_lower: member}
      - 'by_last_first': {(last_lower, first_lower): member}
    """
    by_last = {}
    by_full = {}
    by_last_first = {}

    for m in members:
        name = m.display_name
        parts = name.split()
        if not parts:
            continue

        full_lower = name.lower()
        last_lower = parts[-1].lower()
        first_lower = parts[0].lower() if parts else ""

        by_full[full_lower] = m
        by_last[last_lower] = m
        by_last_first[(last_lower, first_lower)] = m

    return {
        "by_last": by_last,
        "by_full": by_full,
        "by_last_first": by_last_first,
    }


def match_filer_to_member(first: str, last: str, state_district: str, name_index: dict) -> Optional[object]:
    """
    Match a filing's first/last name to a TrackedMember.

    Tries multiple strategies:
      1. Exact last + first match
      2. Full name match
      3. Last name only (if unique)
    """
    first_lower = first.lower().strip()
    last_lower = last.lower().strip()

    # Strategy 1: last + first
    member = name_index["by_last_first"].get((last_lower, first_lower))
    if member:
        return member

    # Strategy 2: full name (try both orderings)
    member = name_index["by_full"].get(f"{first_lower} {last_lower}")
    if member:
        return member
    member = name_index["by_full"].get(f"{last_lower} {first_lower}")
    if member:
        return member

    # Strategy 3: last name only
    member = name_index["by_last"].get(last_lower)
    if member:
        # Verify state matches if we have state_district info
        if state_district and member.state:
            filing_state = state_district[:2].upper()
            if filing_state == member.state:
                return member
            # State mismatch — could be a different person with same last name
            return None
        return member

    return None


# ---------------------------------------------------------------------------
# Main Sync Logic
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Sync congressional trades from House Clerk financial disclosure PDFs"
    )
    parser.add_argument("--year", type=int, default=None,
                        help="Filing year to process (default: current year and previous year)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Limit number of PDFs to process (for testing)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and display results without writing to database")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Verbose logging")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    Base.metadata.create_all(engine)
    session = Session()

    # Determine which years to process
    current_year = datetime.now().year
    if args.year:
        years = [args.year]
    else:
        # Process current year and previous year
        years = [current_year, current_year - 1]

    # Load tracked members for name matching
    members = session.query(TrackedMember).filter_by(is_active=1, chamber="house").all()
    name_index = build_name_index(members)
    log.info(f"Loaded {len(members)} tracked House members for name matching")

    total_new = 0
    total_dupes = 0
    total_no_match = 0
    total_parse_fail = 0
    total_pdfs = 0

    for year in years:
        log.info(f"=== Processing year {year} ===")

        # Fetch and parse the XML filing index
        filings = fetch_filing_index(year)
        if not filings:
            log.warning(f"No filings found for {year}")
            continue

        # Filter to Periodic Transaction Reports only
        ptrs = filter_ptrs(filings)
        log.info(f"Found {len(ptrs)} PTR filings out of {len(filings)} total for {year}")

        if args.limit and args.limit > 0:
            ptrs = ptrs[:args.limit]
            log.info(f"Limited to {len(ptrs)} filings (--limit {args.limit})")

        for i, filing in enumerate(ptrs):
            doc_id = filing["doc_id"]
            first = filing["first"]
            last = filing["last"]
            filing_date = filing["filing_date"]
            filing_year = filing["filing_year"]
            state_district = filing["state_district"]

            # Match filer to tracked member
            member = match_filer_to_member(first, last, state_district, name_index)
            if not member:
                total_no_match += 1
                log.debug(f"No member match for {first} {last} ({state_district})")
                continue

            log.info(f"[{i+1}/{len(ptrs)}] Processing {first} {last} → {member.display_name} (doc {doc_id})")

            # Download PDF
            pdf_bytes = download_pdf(doc_id, year)
            if not pdf_bytes:
                total_parse_fail += 1
                continue

            total_pdfs += 1

            # Extract text
            text = extract_text_from_pdf(pdf_bytes)
            if not text.strip():
                log.warning(f"Empty text extraction for {doc_id}")
                total_parse_fail += 1
                continue

            # Parse transactions
            transactions = parse_transactions(text, filing_year)
            if not transactions:
                log.debug(f"No transactions parsed from {doc_id}")
                continue

            pdf_url = PTR_PDF_URL.format(year=year, doc_id=doc_id)

            for txn in transactions:
                ticker = txn["ticker"]
                txn_type = txn["transaction_type"]
                txn_date = txn["transaction_date"]
                amount = txn["amount_range"]
                owner = txn["owner"]
                asset_name = txn["asset_name"]

                # Build dedupe hash
                dedupe_str = f"{member.person_id}:{ticker or asset_name}:{txn_date}:{txn_type}:{amount}"
                dedupe = md5(dedupe_str)

                if not args.dry_run:
                    existing = session.query(CongressionalTrade).filter_by(dedupe_hash=dedupe).first()
                    if existing:
                        total_dupes += 1
                        continue

                if args.dry_run:
                    log.info(
                        f"  [DRY-RUN] {member.display_name} | {txn_type} | "
                        f"{ticker or 'N/A'} ({asset_name}) | {amount or 'N/A'} | "
                        f"{txn_date} | owner={owner}"
                    )
                    total_new += 1
                    continue

                # Compute reporting gap
                reporting_gap = None
                if txn_date and filing_date:
                    gap_days = (filing_date - txn_date).days
                    if 0 <= gap_days <= 365:
                        reporting_gap = f"{gap_days} Days"

                session.add(CongressionalTrade(
                    person_id=member.person_id,
                    ticker=ticker,
                    asset_name=asset_name,
                    transaction_type=txn_type,
                    amount_range=amount,
                    disclosure_date=filing_date,
                    transaction_date=txn_date,
                    owner=owner,
                    source_url=pdf_url,
                    reporting_gap=reporting_gap,
                    dedupe_hash=dedupe,
                ))
                total_new += 1

            # Commit in batches per filing to avoid huge transactions
            if not args.dry_run and total_new > 0:
                try:
                    session.commit()
                except Exception as e:
                    log.error(f"Commit error: {e}")
                    session.rollback()

            # Rate limit between downloads
            time.sleep(RATE_LIMIT_DELAY)

    if not args.dry_run and total_new > 0:
        try:
            session.commit()
        except Exception as e:
            log.error(f"Final commit error: {e}")
            session.rollback()

    session.close()

    log.info("=" * 60)
    log.info(f"Sync complete!")
    log.info(f"  PDFs downloaded:     {total_pdfs}")
    log.info(f"  New trades inserted:  {total_new}")
    log.info(f"  Duplicates skipped:  {total_dupes}")
    log.info(f"  No member match:     {total_no_match}")
    log.info(f"  Parse failures:      {total_parse_fail}")
    log.info(f"  Years processed:     {years}")


if __name__ == "__main__":
    main()
