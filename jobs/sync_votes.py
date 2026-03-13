"""
Vote Sync Job

Fetches and stores roll call votes from both House and Senate
for the specified Congress. Builds a bioguide->person_id mapping
from TrackedMembers so that member_votes link to our people.

Usage:
    python jobs/sync_votes.py
    python jobs/sync_votes.py --congress 119 --limit 100
    python jobs/sync_votes.py --chamber house --limit 50
    python jobs/sync_votes.py --chamber senate --limit 50
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


def fetch_votes_list(congress: int, chamber: str, limit: int = 250) -> List[Dict[str, Any]]:
    """Fetch vote list for a chamber."""
    url = f"{BASE_URL}/vote/{congress}/{chamber}"
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

        votes = data.get("votes", [])
        if not votes:
            break

        all_votes.extend(votes)
        offset += len(votes)

        if len(votes) < params["limit"]:
            break

        time.sleep(RATE_LIMIT_DELAY)

    return all_votes[:limit]


def fetch_vote_detail(congress: int, chamber: str, roll_number: int) -> Optional[Dict[str, Any]]:
    """Fetch detailed vote info including member positions."""
    url = f"{BASE_URL}/vote/{congress}/{chamber}/{roll_number}"
    params = {"api_key": CONGRESS_API_KEY, "format": "json"}

    response = requests.get(url, params=params)
    response.raise_for_status()
    return response.json().get("vote")


def ingest_vote(congress: int, chamber: str, roll_number: int,
                bioguide_map: Dict[str, str]) -> Optional[int]:
    """Ingest a single vote with member positions."""
    db = SessionLocal()
    try:
        # Skip if already exists
        existing = db.query(Vote).filter(
            Vote.congress == congress,
            Vote.chamber == chamber.lower(),
            Vote.roll_number == roll_number,
        ).first()
        if existing:
            return existing.id

        vote_data = fetch_vote_detail(congress, chamber, roll_number)
        if not vote_data:
            return None

        # Parse date
        vote_date = None
        if vote_data.get("date"):
            try:
                vote_date = datetime.fromisoformat(
                    vote_data["date"].replace("Z", "+00:00")
                ).date()
            except Exception:
                pass

        # Parse totals
        totals = vote_data.get("totals", {})
        # Congress.gov API is inconsistent with capitalization
        def _get_total(key, *alts):
            for k in [key] + list(alts):
                v = totals.get(k)
                if v is not None:
                    return v
            return None

        # Parse bill fields
        related_bill_congress = None
        related_bill_type = None
        related_bill_number = None
        if vote_data.get("bill"):
            bi = vote_data["bill"]
            related_bill_congress = bi.get("congress")
            related_bill_type = (bi.get("type") or "").upper() or None
            try:
                related_bill_number = int(bi.get("number")) if bi.get("number") else None
            except (ValueError, TypeError):
                related_bill_number = None

        vote = Vote(
            congress=congress,
            chamber=chamber.lower(),
            roll_number=roll_number,
            session=vote_data.get("session"),
            question=vote_data.get("question"),
            vote_date=vote_date,
            related_bill_congress=related_bill_congress,
            related_bill_type=related_bill_type,
            related_bill_number=related_bill_number,
            result=vote_data.get("result"),
            yea_count=_get_total("Yea", "yea"),
            nay_count=_get_total("Nay", "nay", "No", "no"),
            present_count=_get_total("Present", "present"),
            not_voting_count=_get_total("Not Voting", "notVoting"),
            source_url=vote_data.get("url"),
            metadata_json=vote_data,
        )
        db.add(vote)
        db.flush()

        # Ingest member votes
        member_count = 0
        for member in vote_data.get("members", []):
            bioguide_id = member.get("bioguideId")
            position = member.get("vote")
            if not bioguide_id or not position:
                continue

            mv = MemberVote(
                vote_id=vote.id,
                person_id=bioguide_map.get(bioguide_id),
                bioguide_id=bioguide_id,
                position=position,
                member_name=member.get("name"),
                party=member.get("party"),
                state=member.get("state"),
            )
            db.add(mv)
            member_count += 1

        db.commit()
        logger.info(f"Ingested vote {congress}/{chamber}/{roll_number} ({member_count} members)",
                     extra={"job": "sync_votes"})
        return vote.id

    except Exception as e:
        db.rollback()
        logger.error(f"Failed vote {congress}/{chamber}/{roll_number}: {e}",
                      extra={"job": "sync_votes", "error_type": type(e).__name__})
        return None
    finally:
        db.close()


def sync_chamber_votes(congress: int, chamber: str, limit: int,
                       bioguide_map: Dict[str, str]) -> Dict[str, int]:
    """Sync votes for one chamber. Returns stats."""
    logger.info(f"Fetching {chamber} vote list (congress={congress}, limit={limit})")
    votes = fetch_votes_list(congress, chamber, limit)
    logger.info(f"Found {len(votes)} {chamber} votes to process")

    ingested = 0
    skipped = 0
    failed = 0

    for v in votes:
        roll_number = v.get("rollCall") or v.get("number")
        if not roll_number:
            skipped += 1
            continue

        result = ingest_vote(congress, chamber, int(roll_number), bioguide_map)
        if result is not None:
            ingested += 1
        else:
            failed += 1

        time.sleep(RATE_LIMIT_DELAY)

    return {"total": len(votes), "ingested": ingested, "skipped": skipped, "failed": failed}


def main():
    parser = argparse.ArgumentParser(description="Sync roll call votes from Congress.gov")
    parser.add_argument("--congress", type=int, default=119)
    parser.add_argument("--chamber", choices=["house", "senate", "both"], default="both")
    parser.add_argument("--limit", type=int, default=100, help="Max votes per chamber")
    args = parser.parse_args()

    if not CONGRESS_API_KEY:
        logger.error("API_KEY_CONGRESS not set")
        sys.exit(1)

    bioguide_map = build_bioguide_map()

    chambers = ["house", "senate"] if args.chamber == "both" else [args.chamber]
    total_stats = {"ingested": 0, "skipped": 0, "failed": 0}

    for chamber in chambers:
        stats = sync_chamber_votes(args.congress, chamber, args.limit, bioguide_map)
        logger.info(f"{chamber.upper()} results: {stats}")
        for k in total_stats:
            total_stats[k] += stats.get(k, 0)

    logger.info(f"Vote sync complete: {total_stats}")


if __name__ == "__main__":
    main()
