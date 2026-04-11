"""
Senate Vote Sync Job

Fetches Senate roll call votes directly from senate.gov XML feeds.
The Congress.gov API v3 does NOT have a /senate-vote/ endpoint, so we
scrape the official Senate roll call XML instead (public government data).

Sources:
  - Vote index: https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_{congress}_{session}.xml
  - Individual: https://www.senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{number}.xml

Approach inspired by https://github.com/unitedstates/congress (CC0 public domain).

Usage:
    python jobs/sync_senate_votes.py
    python jobs/sync_senate_votes.py --congress 119 --session 1
    python jobs/sync_senate_votes.py --congress 119 --session 1 --start 1 --end 50
"""

import argparse
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal, TrackedMember, Vote, MemberVote
from utils.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)

SENATE_BASE = "https://www.senate.gov/legislative/LIS"
REQUEST_DELAY = 1.0  # polite 1-second delay between requests
REQUEST_TIMEOUT = 30  # seconds

# Headers to mimic a real browser (senate.gov sometimes blocks bare requests)
HEADERS = {
    "User-Agent": "WeThePeople/1.0 (civic transparency; https://wethepeopleforus.com)",
    "Accept": "application/xml, text/xml, */*",
}


# ---------------------------------------------------------------------------
# Name-matching helpers
# ---------------------------------------------------------------------------

def _normalize_name(name: str) -> str:
    """Lowercase, strip suffixes, collapse whitespace for fuzzy matching."""
    name = name.lower().strip()
    # Remove common suffixes
    for suffix in [" jr.", " jr", " sr.", " sr", " iii", " ii", " iv"]:
        if name.endswith(suffix):
            name = name[: -len(suffix)].strip()
    # Remove punctuation
    name = re.sub(r"[^a-z\s]", "", name)
    return " ".join(name.split())


def _last_name(full_name: str) -> str:
    """Extract last name from a full name string."""
    parts = full_name.strip().split()
    if not parts:
        return ""
    return parts[-1].lower()


def build_senator_map(db) -> Dict[Tuple[str, str], str]:
    """
    Build a lookup map for matching senators from XML to TrackedMember.

    Returns dict of (normalized_last_name, state) -> person_id.
    Also builds a secondary map of (full_normalized_name,) -> person_id for fallback.
    """
    members = db.query(TrackedMember).filter(
        TrackedMember.is_active == 1,
        TrackedMember.chamber == "senate",
    ).all()

    by_last_state = {}
    by_full_name = {}
    by_bioguide = {}

    for m in members:
        last = _last_name(m.display_name)
        if m.state:
            by_last_state[(last, m.state.upper())] = m.person_id
        norm = _normalize_name(m.display_name)
        by_full_name[norm] = m.person_id
        if m.bioguide_id:
            by_bioguide[m.bioguide_id] = m.person_id

    logger.info(f"Built senator map: {len(by_last_state)} by last+state, "
                f"{len(by_full_name)} by full name, {len(by_bioguide)} by bioguide")

    return by_last_state, by_full_name, by_bioguide


def match_senator(last_name: str, state: str, full_name: str, lis_member_id: str,
                  by_last_state: dict, by_full_name: dict, by_bioguide: dict) -> Optional[str]:
    """
    Try to match a senator from XML data to a TrackedMember person_id.
    Strategy: last_name+state first, then full name fuzzy match.
    """
    # Strategy 1: last name + state (most reliable)
    key = (_normalize_name(last_name), state.upper() if state else "")
    if key in by_last_state:
        return by_last_state[key]

    # Strategy 2: full normalized name
    norm = _normalize_name(full_name)
    if norm in by_full_name:
        return by_full_name[norm]

    # Strategy 3: last name only — only if unambiguous (single match)
    norm_last = _normalize_name(last_name)
    matches = [pid for (ln, st), pid in by_last_state.items() if ln == norm_last]
    if len(matches) == 1:
        return matches[0]

    return None


# ---------------------------------------------------------------------------
# Senate.gov XML fetchers
# ---------------------------------------------------------------------------

def fetch_vote_menu(congress: int, session: int) -> Optional[ET.Element]:
    """
    Fetch the Senate vote menu XML listing all votes for a congress/session.
    URL: .../roll_call_lists/vote_menu_{congress}_{session}.xml
    """
    url = f"{SENATE_BASE}/roll_call_lists/vote_menu_{congress}_{session}.xml"
    logger.info(f"Fetching vote menu: {url}")

    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return ET.fromstring(resp.content)
    except requests.RequestException as e:
        logger.error(f"Failed to fetch vote menu: {e}")
        return None
    except ET.ParseError as e:
        logger.error(f"Failed to parse vote menu XML: {e}")
        return None


def get_vote_numbers_from_menu(root: ET.Element) -> List[int]:
    """
    Extract vote numbers from the vote menu XML.
    The menu XML has <vote> elements containing <vote_number>.
    """
    vote_numbers = []
    # The menu structure has <vote> elements with child <vote_number>
    for vote_elem in root.iter("vote"):
        num_elem = vote_elem.find("vote_number")
        if num_elem is not None and num_elem.text:
            try:
                vote_numbers.append(int(num_elem.text.strip()))
            except ValueError:
                continue

    vote_numbers.sort()
    return vote_numbers


def fetch_vote_xml(congress: int, session: int, vote_number: int) -> Optional[ET.Element]:
    """
    Fetch a single Senate roll call vote XML.
    URL: .../roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{number:05d}.xml
    """
    url = (
        f"{SENATE_BASE}/roll_call_votes/vote{congress}{session}/"
        f"vote_{congress}_{session}_{vote_number:05d}.xml"
    )

    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        return ET.fromstring(resp.content)
    except requests.RequestException as e:
        logger.warning(f"Failed to fetch vote {vote_number}: {e}")
        return None
    except ET.ParseError as e:
        logger.warning(f"Failed to parse vote {vote_number} XML: {e}")
        return None


# ---------------------------------------------------------------------------
# XML parsing helpers
# ---------------------------------------------------------------------------

def _text(elem: Optional[ET.Element]) -> Optional[str]:
    """Safely extract text from an XML element."""
    if elem is not None and elem.text:
        return elem.text.strip()
    return None


def _int(elem: Optional[ET.Element]) -> Optional[int]:
    """Safely extract integer from an XML element."""
    t = _text(elem)
    if t:
        try:
            return int(t)
        except ValueError:
            return None
    return None


def parse_vote_date(date_str: Optional[str]) -> Optional[date]:
    """
    Parse Senate vote date. Common formats:
      - "January 3, 2025"
      - "March 19, 2026"
    """
    if not date_str:
        return None

    # Try common Senate date format
    for fmt in ["%B %d, %Y", "%b %d, %Y", "%Y-%m-%d"]:
        try:
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue

    # Try to extract date with regex
    match = re.search(r"(\w+ \d{1,2}, \d{4})", date_str)
    if match:
        try:
            return datetime.strptime(match.group(1), "%B %d, %Y").date()
        except ValueError:
            pass

    logger.warning(f"Could not parse vote date: {date_str}")
    return None


def parse_vote_xml(root: ET.Element, congress: int, session: int) -> Optional[Dict[str, Any]]:
    """
    Parse a Senate roll call vote XML into a structured dict.

    Senate XML structure:
      <roll_call_vote>
        <congress>119</congress>
        <session>1</session>
        <congress_year>2025</congress_year>
        <vote_number>1</vote_number>
        <vote_date>January 6, 2025</vote_date>
        <modify_date>...</modify_date>
        <vote_question_text>On the Motion</vote_question_text>
        <vote_document_text>...</vote_document_text>
        <vote_result_text>Motion Agreed to</vote_result_text>
        <question>...</question>
        <vote_title>...</vote_title>
        <majority_requirement>1/2</majority_requirement>
        <vote_result>...</vote_result>
        <document>
          <document_type>PN</document_type>
          <document_number>1</document_number>
          <document_title>...</document_title>
        </document>
        <amendment>...</amendment>
        <count>
          <yeas>52</yeas>
          <nays>45</nays>
          <present>0</present>
          <absent>3</absent>
        </count>
        <tie_breaker>...</tie_breaker>
        <members>
          <member>
            <member_full>Sen. Name (R-ST)</member_full>
            <last_name>Name</last_name>
            <first_name>First</first_name>
            <party>R</party>
            <state>ST</state>
            <vote_cast>Yea</vote_cast>
            <lis_member_id>S001</lis_member_id>
          </member>
          ...
        </members>
      </roll_call_vote>
    """
    vote_number = _int(root.find("vote_number"))
    if vote_number is None:
        return None

    # Parse question — try multiple fields
    question = (
        _text(root.find("vote_question_text"))
        or _text(root.find("question"))
        or "Roll call vote"
    )

    # Get vote title for context (often contains bill info)
    vote_title = _text(root.find("vote_title"))
    if vote_title and question:
        question = f"{question}: {vote_title}"

    # Parse date
    vote_date = parse_vote_date(_text(root.find("vote_date")))

    # Parse result
    result = _text(root.find("vote_result_text")) or _text(root.find("vote_result"))

    # Parse majority requirement
    majority = _text(root.find("majority_requirement"))

    # Parse counts
    count_elem = root.find("count")
    yea_count = _int(count_elem.find("yeas")) if count_elem is not None else None
    nay_count = _int(count_elem.find("nays")) if count_elem is not None else None
    present_count = _int(count_elem.find("present")) if count_elem is not None else None
    absent_count = _int(count_elem.find("absent")) if count_elem is not None else None

    # Parse related bill/document info
    related_bill_type = None
    related_bill_number = None

    # Check <document> element
    doc_elem = root.find("document")
    if doc_elem is not None:
        doc_type = _text(doc_elem.find("document_type"))
        doc_num = _text(doc_elem.find("document_number"))
        if doc_type:
            related_bill_type = doc_type.upper()
        if doc_num:
            try:
                related_bill_number = int(doc_num)
            except ValueError:
                pass

    # Check <amendment> element
    amend_elem = root.find("amendment")
    if amend_elem is not None and related_bill_type is None:
        amend_num = _text(amend_elem.find("amendment_number"))
        if amend_num:
            related_bill_type = "AMDT"
            try:
                related_bill_number = int(re.sub(r"[^\d]", "", amend_num))
            except ValueError:
                pass

    # Source URL
    source_url = (
        f"https://www.senate.gov/legislative/LIS/roll_call_votes/"
        f"vote{congress}{session}/vote_{congress}_{session}_{vote_number:05d}.htm"
    )

    # Parse members
    members = []
    members_elem = root.find("members")
    if members_elem is not None:
        for member_elem in members_elem.findall("member"):
            member_data = {
                "member_full": _text(member_elem.find("member_full")),
                "last_name": _text(member_elem.find("last_name")) or "",
                "first_name": _text(member_elem.find("first_name")) or "",
                "party": _text(member_elem.find("party")),
                "state": _text(member_elem.find("state")),
                "vote_cast": _text(member_elem.find("vote_cast")),
                "lis_member_id": _text(member_elem.find("lis_member_id")),
            }
            members.append(member_data)

    return {
        "vote_number": vote_number,
        "question": question,
        "vote_date": vote_date,
        "result": result,
        "majority_requirement": majority,
        "yea_count": yea_count,
        "nay_count": nay_count,
        "present_count": present_count,
        "not_voting_count": absent_count,
        "related_bill_type": related_bill_type,
        "related_bill_number": related_bill_number,
        "source_url": source_url,
        "members": members,
    }


# ---------------------------------------------------------------------------
# Normalize vote position strings
# ---------------------------------------------------------------------------

POSITION_MAP = {
    "yea": "Yea",
    "aye": "Yea",
    "yes": "Yea",
    "nay": "Nay",
    "no": "Nay",
    "not voting": "Not Voting",
    "present": "Present",
    "present, giving a live pair": "Present",
    "guilty": "Yea",       # impeachment
    "not guilty": "Nay",   # impeachment
}


def normalize_position(raw: Optional[str]) -> str:
    """Map Senate XML vote_cast values to our standard position strings."""
    if not raw:
        return "Not Voting"
    return POSITION_MAP.get(raw.strip().lower(), raw.strip())


# ---------------------------------------------------------------------------
# Ingest logic
# ---------------------------------------------------------------------------

def ingest_senate_vote(
    congress: int,
    session: int,
    vote_data: Dict[str, Any],
    by_last_state: dict,
    by_full_name: dict,
    by_bioguide: dict,
) -> Optional[int]:
    """
    Upsert a single Senate vote with member positions.
    Returns the Vote.id on success, None on failure.
    """
    db = SessionLocal()
    try:
        roll_number = vote_data["vote_number"]

        # Check if vote already exists (skip if so — idempotent)
        existing = db.query(Vote).filter(
            Vote.congress == congress,
            Vote.chamber == "senate",
            Vote.roll_number == roll_number,
        ).first()

        if existing:
            # Update counts if they changed (vote may have been partial before)
            changed = False
            for field in ["yea_count", "nay_count", "present_count", "not_voting_count", "result"]:
                new_val = vote_data.get(field)
                if new_val is not None and getattr(existing, field) != new_val:
                    setattr(existing, field, new_val)
                    changed = True

            if changed:
                db.commit()
                logger.info(f"Updated existing vote {congress}/senate/{roll_number}")

            return existing.id

        # Create new Vote record
        vote = Vote(
            congress=congress,
            chamber="senate",
            roll_number=roll_number,
            vote_session=session,
            question=vote_data.get("question"),
            vote_date=vote_data.get("vote_date"),
            related_bill_congress=congress,
            related_bill_type=vote_data.get("related_bill_type"),
            related_bill_number=vote_data.get("related_bill_number"),
            result=vote_data.get("result"),
            yea_count=vote_data.get("yea_count"),
            nay_count=vote_data.get("nay_count"),
            present_count=vote_data.get("present_count"),
            not_voting_count=vote_data.get("not_voting_count"),
            source_url=vote_data.get("source_url"),
            metadata_json={
                "majority_requirement": vote_data.get("majority_requirement"),
                "source": "senate.gov",
            },
        )
        db.add(vote)
        db.flush()  # Get vote.id

        # Ingest member votes
        member_count = 0
        matched_count = 0
        for m in vote_data.get("members", []):
            vote_cast = m.get("vote_cast")
            if not vote_cast:
                continue

            position = normalize_position(vote_cast)
            last_name = m.get("last_name", "")
            first_name = m.get("first_name", "")
            full_name = m.get("member_full") or f"{first_name} {last_name}"
            state = m.get("state", "")
            party = m.get("party", "")
            lis_id = m.get("lis_member_id", "")

            # Match to TrackedMember
            person_id = match_senator(
                last_name, state, full_name, lis_id,
                by_last_state, by_full_name, by_bioguide,
            )

            member_name = f"{first_name} {last_name}".strip() or None

            # Look up bioguide_id from tracked_members if we matched a person_id
            bio_id = None
            if person_id:
                member_obj = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
                if member_obj:
                    bio_id = member_obj.bioguide_id

            mv = MemberVote(
                vote_id=vote.id,
                person_id=person_id,
                bioguide_id=bio_id,
                position=position,
                member_name=member_name,
                party=party or None,
                state=state or None,
            )
            db.add(mv)
            member_count += 1
            if person_id:
                matched_count += 1

        db.commit()
        logger.info(
            f"Ingested vote {congress}/senate/{roll_number}: "
            f"{member_count} members ({matched_count} matched to tracked)",
            extra={"job": "sync_senate_votes"},
        )
        return vote.id

    except Exception as e:
        db.rollback()
        logger.error(
            f"Failed vote {congress}/senate/{vote_data.get('vote_number')}: {e}",
            extra={"job": "sync_senate_votes", "error_type": type(e).__name__},
        )
        return None
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Main sync orchestration
# ---------------------------------------------------------------------------

def sync_senate_votes(
    congress: int,
    session: int,
    start: Optional[int] = None,
    end: Optional[int] = None,
) -> Dict[str, int]:
    """
    Sync all Senate votes for a given congress/session.

    1. Fetch the vote menu to discover all vote numbers
    2. Optionally filter by --start / --end range
    3. Fetch each vote XML and ingest

    Returns stats dict.
    """
    # Build senator matching maps
    db = SessionLocal()
    try:
        by_last_state, by_full_name, by_bioguide = build_senator_map(db)
    finally:
        db.close()

    # Step 1: discover vote numbers from menu
    menu_root = fetch_vote_menu(congress, session)
    if menu_root is None:
        # Fallback: if menu fetch fails, try sequential numbers
        logger.warning("Vote menu fetch failed; falling back to sequential probe")
        vote_numbers = list(range(start or 1, (end or 500) + 1))
    else:
        vote_numbers = get_vote_numbers_from_menu(menu_root)
        logger.info(f"Found {len(vote_numbers)} votes in menu for Congress {congress} Session {session}")

    if not vote_numbers:
        logger.info("No votes found.")
        return {"total": 0, "ingested": 0, "updated": 0, "skipped": 0, "failed": 0}

    # Apply range filter
    if start is not None:
        vote_numbers = [v for v in vote_numbers if v >= start]
    if end is not None:
        vote_numbers = [v for v in vote_numbers if v <= end]

    if not vote_numbers:
        logger.info("No votes to process after filtering")
        return {"total": 0, "ingested": 0, "updated": 0, "skipped": 0, "failed": 0}

    logger.info(f"Processing {len(vote_numbers)} votes (range {vote_numbers[0]}-{vote_numbers[-1]})")

    stats = {"total": len(vote_numbers), "ingested": 0, "updated": 0, "skipped": 0, "failed": 0}

    for i, vote_num in enumerate(vote_numbers):
        # Progress logging every 10 votes
        if i > 0 and i % 10 == 0:
            logger.info(f"Progress: {i}/{len(vote_numbers)} votes processed "
                        f"(ingested={stats['ingested']}, failed={stats['failed']})")

        # Fetch vote XML
        vote_root = fetch_vote_xml(congress, session, vote_num)
        time.sleep(REQUEST_DELAY)

        if vote_root is None:
            # Could be a gap in vote numbering or 404 — not necessarily an error
            stats["skipped"] += 1
            continue

        # Parse the XML
        vote_data = parse_vote_xml(vote_root, congress, session)
        if vote_data is None:
            stats["failed"] += 1
            continue

        # Ingest
        result = ingest_senate_vote(
            congress, session, vote_data,
            by_last_state, by_full_name, by_bioguide,
        )

        if result is not None:
            stats["ingested"] += 1
        else:
            stats["failed"] += 1

    return stats


def main():
    parser = argparse.ArgumentParser(
        description="Sync Senate roll call votes from senate.gov XML"
    )
    parser.add_argument("--congress", type=int, default=119,
                        help="Congress number (default: 119)")
    parser.add_argument("--session", type=int, default=None,
                        help="Session number (default: both 1 and 2)")
    parser.add_argument("--start", type=int, default=None,
                        help="Start vote number (inclusive)")
    parser.add_argument("--end", type=int, default=None,
                        help="End vote number (inclusive)")
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("Senate Vote Sync — senate.gov XML scraper")
    logger.info(f"Congress: {args.congress}, Session: {args.session or 'both'}")
    logger.info("=" * 60)

    sessions = [args.session] if args.session else [1, 2]

    total_stats = {"total": 0, "ingested": 0, "updated": 0, "skipped": 0, "failed": 0}

    for session in sessions:
        logger.info(f"\n--- Session {session} ---")
        stats = sync_senate_votes(
            congress=args.congress,
            session=session,
            start=args.start,
            end=args.end,
        )
        logger.info(f"Session {session} results: {stats}")

        for k in total_stats:
            total_stats[k] += stats[k]

    logger.info("=" * 60)
    logger.info(f"FINAL SUMMARY: {total_stats}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
