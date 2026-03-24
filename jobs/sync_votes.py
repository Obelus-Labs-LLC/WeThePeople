"""
Vote Sync Job

Fetches and stores House roll call votes from the Congress.gov API v3.
Builds a bioguide->person_id mapping from TrackedMembers so that
member_votes link to our people.

Senate votes are not yet available in the Congress.gov API v3.

Usage:
    python jobs/sync_votes.py
    python jobs/sync_votes.py --congress 119 --limit 100
    python jobs/sync_votes.py --session 1 --limit 50
"""

import argparse
import os
import sys
import time
import requests
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional, List, Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal, TrackedMember, Vote, MemberVote
from utils.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)

CONGRESS_API_KEY = os.getenv("API_KEY_CONGRESS")
BASE_URL = "https://api.congress.gov/v3"
RATE_LIMIT_DELAY = 0.5  # seconds between API calls


def build_bioguide_map() -> Dict[str, str]:
    """Build bioguide_id -> person_id mapping from TrackedMembers."""
    db = SessionLocal()
    try:
        members = db.query(TrackedMember).filter(
            TrackedMember.is_active == 1,
            TrackedMember.bioguide_id.isnot(None),
        ).all()
        mapping = {m.bioguide_id: m.person_id for m in members}
        logger.info(f"Built bioguide map: {len(mapping)} members")
        return mapping
    finally:
        db.close()


def fetch_house_votes_list(congress: int, session: int, limit: int = 250) -> List[Dict[str, Any]]:
    """Fetch House roll call vote list from Congress.gov API v3."""
    url = f"{BASE_URL}/house-vote/{congress}/{session}"
    params = {
        "api_key": CONGRESS_API_KEY,
        "format": "json",
        "limit": min(limit, 250),
    }

    all_votes = []
    offset = 0

    while len(all_votes) < limit:
        params["offset"] = offset
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        votes = data.get("houseRollCallVotes", [])
        if not votes:
            break

        all_votes.extend(votes)
        offset += len(votes)

        if len(votes) < params["limit"]:
            break

        time.sleep(RATE_LIMIT_DELAY)

    return all_votes[:limit]


def fetch_vote_detail(congress: int, session: int, roll_number: int) -> Optional[Dict[str, Any]]:
    """Fetch detailed vote info from Congress.gov API v3."""
    url = f"{BASE_URL}/house-vote/{congress}/{session}/{roll_number}"
    params = {"api_key": CONGRESS_API_KEY, "format": "json"}

    response = requests.get(url, params=params)
    response.raise_for_status()
    return response.json().get("houseRollCallVote")


def fetch_vote_members(congress: int, session: int, roll_number: int) -> List[Dict[str, Any]]:
    """Fetch member vote positions for a specific roll call vote.
    The API returns all members in a single response (no pagination needed).
    """
    url = f"{BASE_URL}/house-vote/{congress}/{session}/{roll_number}/members"
    params = {
        "api_key": CONGRESS_API_KEY,
        "format": "json",
        "limit": 500,  # All House members fit in one request
    }

    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()

    member_data = data.get("houseRollCallVoteMemberVotes", {})
    return member_data.get("results", [])


def ingest_vote(congress: int, session: int, roll_number: int,
                vote_summary: Dict[str, Any],
                bioguide_map: Dict[str, str]) -> Optional[int]:
    """Ingest a single House vote with member positions."""
    db = SessionLocal()
    try:
        # Skip if already exists
        existing = db.query(Vote).filter(
            Vote.congress == congress,
            Vote.chamber == "house",
            Vote.roll_number == roll_number,
        ).first()
        if existing:
            return ("existing", existing.id)

        # Get vote detail for totals
        vote_data = fetch_vote_detail(congress, session, roll_number)
        time.sleep(RATE_LIMIT_DELAY)

        # Parse date from startDate
        vote_date = None
        start_date = vote_summary.get("startDate") or (vote_data or {}).get("startDate")
        if start_date:
            try:
                vote_date = datetime.fromisoformat(start_date).date()
            except (ValueError, TypeError) as e:
                logger.warning("Failed to parse vote date '%s' for roll %s: %s", start_date, roll_number, e)

        # Parse totals from votePartyTotal
        yea_count = 0
        nay_count = 0
        present_count = 0
        not_voting_count = 0
        if vote_data and vote_data.get("votePartyTotal"):
            for party_total in vote_data["votePartyTotal"]:
                yea_count += party_total.get("yeaTotal", 0)
                nay_count += party_total.get("nayTotal", 0)
                present_count += party_total.get("presentTotal", 0)
                not_voting_count += party_total.get("notVotingTotal", 0)

        # Parse bill fields from legislation info
        related_bill_congress = congress
        related_bill_type = None
        related_bill_number = None
        leg_type = vote_summary.get("legislationType")
        leg_number = vote_summary.get("legislationNumber")
        if leg_type:
            related_bill_type = leg_type.upper()
        if leg_number:
            try:
                related_bill_number = int(leg_number)
            except (ValueError, TypeError):
                related_bill_number = None

        # Build source URL
        source_url = f"https://clerk.house.gov/Votes/{vote_date.year}{roll_number}" if vote_date else None

        question = (vote_data or {}).get("voteQuestion") or "Roll call vote"

        vote = Vote(
            congress=congress,
            chamber="house",
            roll_number=roll_number,
            session=session,
            question=question,
            vote_date=vote_date,
            related_bill_congress=related_bill_congress,
            related_bill_type=related_bill_type,
            related_bill_number=related_bill_number,
            result=vote_summary.get("result"),
            yea_count=yea_count or None,
            nay_count=nay_count or None,
            present_count=present_count or None,
            not_voting_count=not_voting_count or None,
            source_url=source_url,
            metadata_json=vote_data,
        )
        db.add(vote)
        db.flush()

        # Fetch and ingest member votes
        members = fetch_vote_members(congress, session, roll_number)
        time.sleep(RATE_LIMIT_DELAY)

        member_count = 0
        for member in members:
            bioguide_id = member.get("bioguideID")
            position = member.get("voteCast")
            if not bioguide_id or not position:
                continue

            first_name = member.get("firstName", "")
            last_name = member.get("lastName", "")
            member_name = f"{first_name} {last_name}".strip() or None

            mv = MemberVote(
                vote_id=vote.id,
                person_id=bioguide_map.get(bioguide_id),
                bioguide_id=bioguide_id,
                position=position,
                member_name=member_name,
                party=member.get("voteParty"),
                state=member.get("voteState"),
            )
            db.add(mv)
            member_count += 1

        db.commit()
        logger.info(f"Ingested vote 119/house/{roll_number} ({member_count} members)",
                     extra={"job": "sync_votes"})
        return ("new", vote.id)

    except Exception as e:
        db.rollback()
        logger.error(f"Failed vote {congress}/house/{roll_number}: {e}",
                      extra={"job": "sync_votes", "error_type": type(e).__name__})
        return None
    finally:
        db.close()


def sync_house_votes(congress: int, session: int, limit: int,
                     bioguide_map: Dict[str, str]) -> Dict[str, int]:
    """Sync House votes. Returns stats."""
    logger.info(f"Fetching House vote list (congress={congress}, session={session}, limit={limit})")
    votes = fetch_house_votes_list(congress, session, limit)
    logger.info(f"Found {len(votes)} House votes to process")

    new_count = 0
    existing_count = 0
    skipped = 0
    failed = 0

    for v in votes:
        roll_number = v.get("rollCallNumber")
        if not roll_number:
            skipped += 1
            continue

        result = ingest_vote(congress, session, int(roll_number), v, bioguide_map)
        if result is not None:
            status, _vote_id = result
            if status == "new":
                new_count += 1
            else:
                existing_count += 1
        else:
            failed += 1

        time.sleep(RATE_LIMIT_DELAY)

    return {"total": len(votes), "ingested": new_count, "existing": existing_count, "skipped": skipped, "failed": failed}


def main():
    parser = argparse.ArgumentParser(description="Sync House roll call votes from Congress.gov API v3")
    parser.add_argument("--congress", type=int, default=119)
    parser.add_argument("--session", type=int, default=1)
    parser.add_argument("--limit", type=int, default=2000, help="Max votes to sync (default 2000 for full coverage)")
    args = parser.parse_args()

    if not CONGRESS_API_KEY:
        logger.error("API_KEY_CONGRESS not set")
        sys.exit(1)

    bioguide_map = build_bioguide_map()

    # Sync session 1
    stats1 = sync_house_votes(args.congress, args.session, args.limit, bioguide_map)
    logger.info(f"Vote sync session {args.session} complete: {stats1}")

    # Also sync session 2 if we just did session 1 (Congress may be in session 2)
    if args.session == 1:
        logger.info("Also syncing session 2...")
        stats2 = sync_house_votes(args.congress, 2, args.limit, bioguide_map)
        logger.info(f"Vote sync session 2 complete: {stats2}")


if __name__ == "__main__":
    main()
