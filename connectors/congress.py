import logging
import os
import requests
import time
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict
from models.database import SessionLocal, Action, SourceDocument, Bill, BillAction

logger = logging.getLogger(__name__)
from utils.normalization import (
    normalize_bill_id,
    compute_action_dedupe_hash,
    extract_chamber_from_action,
    extract_committee_from_action
)
from sqlalchemy import exists
from sqlalchemy.exc import IntegrityError
from dotenv import load_dotenv
from utils.congress_urls import congress_bill_url


def _safe_congress_bill_url(congress, bill_type, bill_number):
    """Wrap congress_bill_url so a missing field returns "" instead of None,
    matching the pre-helper fallback contract callers expected."""
    return congress_bill_url(congress, bill_type, bill_number) or ""

load_dotenv()
API_KEY = os.getenv("API_KEY_CONGRESS") or os.getenv("CONGRESS_API_KEY", "")
HEADERS = {"X-API-Key": API_KEY} if API_KEY else {}

# Legacy MEMBERS dict (kept for reference/fallback)
MEMBERS = {
    "walkinshaw": "W000831",
    "tom_cole": "C001053",
    "kathy_castor": "C001066",
    "schumer": "S000148",
    "thune": "T000250",
    "sanders": "S000033",
    "aoc": "O000172",
    "chip_roy": "R000611",
    "richard_hudson": "H001067",
    "pramila_jayapal": "J000293"
}


def get_tracked_members():
    """
    Load members from TrackedMember table (the source of truth).
    Returns dict of {person_id: bioguide_id} for all active members with bioguide IDs.
    Falls back to MEMBERS dict if DB query fails.
    """
    try:
        from models.database import TrackedMember
        session = SessionLocal()
        try:
            members = session.query(TrackedMember).filter(
                TrackedMember.is_active == 1,
                TrackedMember.bioguide_id.isnot(None),
                TrackedMember.bioguide_id != ""
            ).all()
            result = {m.person_id: m.bioguide_id for m in members}
            if result:
                return result
        finally:
            session.close()
    except Exception as e:
        logger.warning("Could not load tracked members from DB: %s", e)
    return MEMBERS

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def robust_get(url, headers, params=None, retries=5):
    """Make HTTP GET with exponential backoff for rate limits and server errors."""
    r = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=headers, params=params, timeout=30)

            # Success
            if r.status_code == 200:
                return r

            # Rate limit — use longer backoff (Congress.gov 429s need real cooldown)
            if r.status_code == 429:
                wait_time = min((2 ** attempt) * 5, 120)  # 5s, 10s, 20s, 40s, 80s
                logger.warning("429 rate limited, retrying in %.1fs (attempt %d/%d)", wait_time, attempt + 1, retries)
                time.sleep(wait_time)
                continue

            # Server error — standard exponential backoff
            if r.status_code in [500, 502, 503, 504]:
                wait_time = (2 ** attempt) * 1.0  # 1s, 2s, 4s, 8s, 16s
                logger.warning("Status %d, retrying in %.1fs (attempt %d/%d)", r.status_code, wait_time, attempt + 1, retries)
                time.sleep(wait_time)
                continue

            # Other errors (4xx) - return immediately, no retry
            return r

        except requests.exceptions.RequestException as e:
            logger.error("Request exception (attempt %d/%d): %s", attempt + 1, retries, e)
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise

    return r  # Return last attempt


def fetch_paged(url, item_key, limit_pages=5):
    """Fetch paginated results from Congress.gov API"""
    all_items = []
    
    for page in range(limit_pages):
        offset = page * 20
        params = {"format": "json", "offset": offset}
        
        r = robust_get(url, HEADERS, params)
        if r.status_code != 200:
            logger.error("Pagination failed at offset %d: %d", offset, r.status_code)
            break
        
        data = r.json()
        items = data.get(item_key, [])
        
        if not items:
            break
        
        all_items.extend(items)
        time.sleep(0.3)  # Polite delay
    
    return all_items


# ============================================================================
# MEMBER-CENTRIC ENDPOINTS
# ============================================================================

def search_bills(query: str, congress: int = 119, limit: int = 25) -> Dict[str, Any]:
    """
    Search congressional bills via Congress.gov API.

    Args:
        query: Search term (lobbying issue, industry term, etc.)
        congress: Congress number (default 119)
        limit: Max results

    Returns:
        Dict with 'total_bills' and 'bills' list
    """
    if not API_KEY:
        raise ValueError("Congress.gov API key not configured")

    url = "https://api.congress.gov/v3/bill"
    params = {
        "query": query.strip(),
        "limit": limit,
        "api_key": API_KEY,
        "format": "json",
    }
    if congress:
        params["congress"] = congress

    try:
        r = robust_get(url, HEADERS, params=params)
        if r.status_code != 200:
            logger.warning("Congress.gov bill search error %d: %s", r.status_code, r.text[:200])
            return {"total_bills": 0, "bills": []}
        data = r.json()
    except Exception as e:
        logger.warning("Congress.gov bill search request error: %s", e)
        return {"total_bills": 0, "bills": []}

    total_bills = data.get("pagination", {}).get("count", 0)
    bills = []

    for b in data.get("bills", []):
        bill_type = b.get("type", "").lower()
        bill_number = b.get("number", "")
        bill_congress = b.get("congress", congress)
        latest = b.get("latestAction", {})

        bills.append({
            "bill_id": f"{bill_type}{bill_number}-{bill_congress}",
            "title": b.get("title", ""),
            "policy_area": b.get("policyArea", {}).get("name", "") if isinstance(b.get("policyArea"), dict) else b.get("policyArea", ""),
            "latest_action": latest.get("text", "") if isinstance(latest, dict) else str(latest),
            "latest_action_date": latest.get("actionDate", "") if isinstance(latest, dict) else "",
            "sponsor": b.get("sponsor", {}).get("fullName", "") if isinstance(b.get("sponsor"), dict) else "",
            "url": b.get("url") or _safe_congress_bill_url(bill_congress, bill_type, bill_number),
        })

    return {"total_bills": total_bills, "bills": bills}


def fetch_member_sponsored(bioguide_id, limit_pages=5):
    """Fetch bills sponsored by a specific member"""
    url = f"https://api.congress.gov/v3/member/{bioguide_id}/sponsored-legislation"
    logger.info("Fetching sponsored legislation for %s", bioguide_id)

    items = fetch_paged(url, "sponsoredLegislation", limit_pages)
    logger.info("Found %d sponsored bills for %s", len(items), bioguide_id)
    return items


def fetch_member_cosponsored(bioguide_id, limit_pages=5):
    """Fetch bills cosponsored by a specific member"""
    url = f"https://api.congress.gov/v3/member/{bioguide_id}/cosponsored-legislation"
    logger.info("Fetching cosponsored legislation for %s", bioguide_id)

    items = fetch_paged(url, "cosponsoredLegislation", limit_pages)
    logger.info("Found %d cosponsored bills for %s", len(items), bioguide_id)
    return items


# ============================================================================
# MAIN INGESTION FUNCTION
# ============================================================================

def ingest_member_legislation(limit_pages=5, person_ids=None):
    """
    Member-centric ingestion: fetch sponsored + cosponsored bills for each tracked member.

    Args:
        limit_pages: Max pages to fetch per endpoint (20 results per page)
        person_ids: Optional list of person_ids to process. If None, processes all tracked members.
    """
    session = SessionLocal()
    total_added = 0

    try:
        all_members = get_tracked_members()

        # Filter to specific members if requested
        if person_ids:
            members_to_process = {k: v for k, v in all_members.items() if k in person_ids}
            missing = set(person_ids) - set(members_to_process.keys())
            if missing:
                logger.warning("These person_ids not found in tracked members: %s", missing)
        else:
            members_to_process = all_members

        logger.info("Processing %d members...", len(members_to_process))

        for person_name, bioguide_id in members_to_process.items():
            logger.info("Processing: %s (%s)", person_name.upper(), bioguide_id)

            member_added = 0

            # Fetch sponsored bills
            sponsored = fetch_member_sponsored(bioguide_id, limit_pages)
            for bill in sponsored:
                if process_bill_item(session, person_name, bill, "Sponsored"):
                    member_added += 1

            # Fetch cosponsored bills
            cosponsored = fetch_member_cosponsored(bioguide_id, limit_pages)
            for bill in cosponsored:
                if process_bill_item(session, person_name, bill, "Cosponsored"):
                    member_added += 1

            total_added += member_added
            logger.info("Added %d new actions for %s", member_added, person_name)

        logger.info("Ingestion complete — %d total new legislative actions", total_added)
    finally:
        session.close()


# ============================================================================
# BILL ENRICHMENT ENDPOINTS
# ============================================================================

def fetch_bill_summary(congress: int, bill_type: str, bill_number: int) -> dict | None:
    """
    Fetch CRS summary for a bill from Congress.gov API.
    Returns {"text": "...", "date": "YYYY-MM-DD"} or None.
    """
    bt = bill_type.lower()
    url = f"https://api.congress.gov/v3/bill/{congress}/{bt}/{bill_number}/summaries"
    r = robust_get(url, HEADERS, params={"format": "json"})
    if not r or r.status_code != 200:
        return None

    data = r.json()
    summaries = data.get("summaries", [])
    if not summaries:
        return None

    # Pick the latest/most detailed summary (last in list is usually most recent)
    best = summaries[-1]
    text = best.get("text", "")
    # Strip HTML tags from CRS summaries (they come as HTML)
    import re
    text = re.sub(r"<[^>]+>", "", text).strip()
    if not text:
        return None

    return {
        "text": text,
        "date": best.get("updateDate") or best.get("actionDate"),
    }


def fetch_bill_text_url(congress: int, bill_type: str, bill_number: int) -> str | None:
    """
    Fetch URL to the latest text version of a bill from Congress.gov API.
    Returns a congress.gov URL string or None.
    """
    bt = bill_type.lower()
    url = f"https://api.congress.gov/v3/bill/{congress}/{bt}/{bill_number}/text"
    r = robust_get(url, HEADERS, params={"format": "json"})
    if not r or r.status_code != 200:
        return None

    data = r.json()
    text_versions = data.get("textVersions", [])
    if not text_versions:
        return None

    # Pick the latest text version (last in list)
    latest = text_versions[-1]
    formats = latest.get("formats", [])

    # Prefer HTML format for readability, then PDF
    for fmt in formats:
        if fmt.get("type") == "Formatted Text":
            return fmt.get("url")
    for fmt in formats:
        if fmt.get("type") == "PDF":
            return fmt.get("url")
    # Fallback: any URL
    if formats:
        return formats[0].get("url")
    return None


def find_or_create_source(session, url):
    """Find existing SourceDocument or create new one.

    Handles TOCTOU race: if concurrent insert wins, catch IntegrityError
    and return the existing record.
    """
    source = session.query(SourceDocument).filter(SourceDocument.url == url).first()
    if not source:
        source = SourceDocument(
            url=url,
            publisher="Congress.gov",
            retrieved_at=datetime.now(timezone.utc),
            content_hash=None
        )
        session.add(source)
        try:
            session.flush()  # Get the ID without committing
        except IntegrityError:
            session.rollback()
            source = session.query(SourceDocument).filter(SourceDocument.url == url).first()
    return source


def write_raw_log(person_id, match_type, bill, source_url, status):
    """Write raw bill JSON to disk for audit trail"""
    root = Path(__file__).resolve().parents[1]  # project root
    out_dir = root / "data" / "raw" / "congress" / person_id / status
    out_dir.mkdir(parents=True, exist_ok=True)
    
    # Build filename
    congress = bill.get("congress")
    bill_type = bill.get("type")
    bill_number = bill.get("number")
    filename = f"{congress}_{bill_type}_{bill_number}.json"
    out_path = out_dir / filename
    
    # print("🧾 RAW LOG ->", out_path)  # Commented out to reduce verbosity
    
    # Prepare audit data
    audit_data = {
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "person_id": person_id,
        "match_type": match_type,
        "source_url": source_url,
        "status": status,
        "raw_bill": bill
    }
    
    # Write to disk
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(audit_data, f, indent=2)
    except OSError as e:
        logger.error(
            "RAW LOG FAILED for %s/%s (path=%s): %s",
            person_id, filename, out_path, e,
        )


def process_bill_item(session, person_name, bill, action_type):
    """Process a single bill item and create Action + SourceDocument records"""
    
    # Extract bill identifiers
    congress = bill.get("congress")
    bill_type = bill.get("type")
    bill_number = bill.get("number")
    
    if not (congress and bill_type and bill_number):
        return False
    
    # Normalize bill_id using deterministic format
    bill_id = normalize_bill_id(congress, bill_type, bill_number)
    
    # Get title and URL
    raw_title = (bill.get("title") or "").strip()
    if len(raw_title) > 500:
        logger.warning("Bill %s/%s/%s title truncated from %d to 500 chars", congress, bill_type, bill_number, len(raw_title))
        title = raw_title[:500]
    else:
        title = raw_title
    title = title or f"{bill_type.upper()} {bill_number}"
    source_url = bill.get("url")  # API URL or congress.gov URL

    # Try to get congress.gov URL if available
    if not source_url or "api.congress.gov" in source_url:
        # Construct the canonical congress.gov URL. Use the shared
        # helper so we get the long-form bill type slug (house-bill,
        # senate-bill, house-joint-resolution, etc.) instead of the
        # broken {bill_type}-bill format that congress.gov rejects.
        from utils.congress_urls import congress_bill_url
        source_url = congress_bill_url(congress, bill_type, bill_number) or ""
    
    # Find or create SourceDocument
    source = find_or_create_source(session, source_url)
    
    # Check if Action already exists using bill identifiers + action_type (true identity)
    exists_action = session.query(Action).filter(
        Action.person_id == person_name,
        Action.bill_congress == congress,
        Action.bill_type == bill_type,
        Action.bill_number == bill_number,
        Action.action_type == action_type,
    ).first()

    if exists_action:
        write_raw_log(person_name, action_type, bill, source_url, "skipped")
        return False
    
    # Get date — store None if unparseable rather than silently defaulting to now()
    date_str = bill.get("introducedDate") or bill.get("latestAction", {}).get("actionDate")
    action_date = None
    if date_str:
        try:
            action_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass  # Store None — logged at query time if needed
    
    # Build metadata from bill item
    metadata = {
        "congress": congress,
        "type": bill_type,
        "number": bill_number,
        "introducedDate": bill.get("introducedDate"),
        "latestAction": bill.get("latestAction"),
        "sponsor_bioguide": person_name,
        "cosponsors_count": bill.get("cosponsorsCount"),
        "committees": bill.get("committees"),
        "policyArea": bill.get("policyArea"),
        "subjects": bill.get("subjects")
    }
    
    # Extract enrichment fields directly during ingestion
    policy_area = None
    policy_area_obj = bill.get("policyArea")
    if policy_area_obj and isinstance(policy_area_obj, dict):
        policy_area = policy_area_obj.get("name")
    
    latest_action_text = None
    latest_action_date_str = None
    latest_action_obj = bill.get("latestAction")
    if latest_action_obj and isinstance(latest_action_obj, dict):
        latest_action_text = latest_action_obj.get("text")
        latest_action_date_str = latest_action_obj.get("actionDate")
    
    # Create Action record with enrichment columns populated
    action = Action(
        person_id=person_name,
        title=title,
        summary=f"{action_type} bill: {bill_type.upper()} {bill_number}",
        date=action_date,
        action_type=action_type,
        source_id=source.id,
        metadata_json=metadata,
        bill_congress=congress,
        bill_type=bill_type,
        bill_number=bill_number,
        policy_area=policy_area,
        latest_action_text=latest_action_text,
        latest_action_date=latest_action_date_str,
    )
    session.add(action)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        write_raw_log(person_name, action_type, bill, source_url, "skipped")
        return False
    
    # Upsert Bill record (one row per bill, normalized)
    existing_bill = session.query(Bill).filter(Bill.bill_id == bill_id).first()

    if not existing_bill:
        # Create Bill record
        latest_action_date_dt = None
        if latest_action_date_str:
            try:
                latest_action_date_dt = datetime.strptime(latest_action_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except (ValueError, TypeError):
                pass

        bill_record = Bill(
            bill_id=bill_id,
            congress=congress,
            bill_type=bill_type.lower(),
            bill_number=bill_number,
            title=title,
            policy_area=policy_area,
            latest_action_text=latest_action_text,
            latest_action_date=latest_action_date_dt,
            metadata_json=bill
        )
        session.add(bill_record)
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            # Concurrent insert won - reload the existing record
            existing_bill = session.query(Bill).filter(Bill.bill_id == bill_id).first()
        
        # If we have latest action, add it to BillAction timeline
        if latest_action_text and latest_action_date_str:
            # Compute dedupe hash for latest action
            dedupe_hash = compute_action_dedupe_hash(bill_id, latest_action_date_str, latest_action_text)
            
            # Check if this action already exists
            existing_bill_action = session.query(BillAction).filter(
                BillAction.dedupe_hash == dedupe_hash
            ).first()
            
            if not existing_bill_action:
                # Extract chamber/committee (conservative - only if explicit)
                action_code = latest_action_obj.get("actionCode") if latest_action_obj else None
                chamber = extract_chamber_from_action(action_code, latest_action_text)
                committee = extract_committee_from_action(latest_action_text, latest_action_obj)

                bill_action = BillAction(
                    bill_id=bill_id,
                    action_date=latest_action_date_dt or action_date,
                    action_text=latest_action_text,
                    action_code=action_code,
                    chamber=chamber,
                    committee=committee,
                    raw_json=latest_action_obj,
                    dedupe_hash=dedupe_hash
                )
                session.add(bill_action)
                try:
                    session.flush()
                except IntegrityError:
                    session.rollback()  # BillAction already exists, safe to skip
    
    try:
        session.commit()
        
        # Audit logging: write raw bill JSON to disk
        write_raw_log(person_name, action_type, bill, source_url, "added")
        
        return True
    except Exception as e:
        session.rollback()
        logger.warning("Failed to save %s %s: %s", bill_type, bill_number, e)
        return False
