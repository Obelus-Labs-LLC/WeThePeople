"""
Congress.gov Vote Connector
Fetches House and Senate roll call votes from Congress.gov API.

Primary source for vote evidence (Phase 2).
Docs: https://github.com/LibraryOfCongress/api.congress.gov/
"""

import logging
import os
import requests
from datetime import datetime
from typing import Optional, List, Dict, Any
from models.database import SessionLocal, Vote, MemberVote

logger = logging.getLogger(__name__)

CONGRESS_API_KEY = os.getenv("API_KEY_CONGRESS")
BASE_URL = "https://api.congress.gov/v3"


def fetch_house_votes(congress: int = 119, limit: int = 250) -> List[Dict[str, Any]]:
    """
    Fetch House roll call votes for a given Congress.
    
    Args:
        congress: Congress number (118, 119, etc.)
        limit: Max number of votes to fetch
        
    Returns:
        List of vote dictionaries from API
    """
    url = f"{BASE_URL}/vote/{congress}/house"
    params = {
        "api_key": CONGRESS_API_KEY,
        "format": "json",
        "limit": limit,
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    
    return data.get("votes", [])


def fetch_vote_detail(congress: int, chamber: str, roll_number: int) -> Optional[Dict[str, Any]]:
    """
    Fetch detailed vote information including member positions.
    
    Args:
        congress: Congress number
        chamber: "house" or "senate"
        roll_number: Roll call number
        
    Returns:
        Vote detail dictionary with member positions
    """
    url = f"{BASE_URL}/vote/{congress}/{chamber}/{roll_number}"
    params = {
        "api_key": CONGRESS_API_KEY,
        "format": "json",
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    
    return data.get("vote")


def ingest_vote_with_members(congress: int, chamber: str, roll_number: int, person_id_map: Optional[Dict[str, str]] = None) -> Optional[int]:
    """
    Ingest a vote and all member positions into the database.
    
    Args:
        congress: Congress number
        chamber: "house" or "senate"
        roll_number: Roll call number
        person_id_map: Optional mapping of bioguide_id -> person_id
        
    Returns:
        vote_id if successful, None otherwise
    """
    db = SessionLocal()
    
    try:
        # Check if vote already exists
        existing = db.query(Vote).filter(
            Vote.congress == congress,
            Vote.chamber == chamber.lower(),
            Vote.roll_number == roll_number
        ).first()
        
        if existing:
            logger.info("Vote %s/%s/%s already exists (id=%s)", congress, chamber, roll_number, existing.id)
            db.close()
            return existing.id
        
        # Fetch vote detail
        vote_data = fetch_vote_detail(congress, chamber, roll_number)
        if not vote_data:
            db.close()
            return None
        
        # Extract vote metadata
        vote_date = None
        if vote_data.get("date"):
            try:
                vote_date = datetime.fromisoformat(vote_data["date"].replace("Z", "+00:00")).date()
            except (ValueError, TypeError):
                logger.warning("Could not parse vote date: %s", vote_data.get("date"))
        
        # Extract related bill info
        bill_congress = None
        bill_type = None
        bill_number = None
        if vote_data.get("bill"):
            bill_info = vote_data["bill"]
            bill_congress = bill_info.get("congress")
            bill_type = bill_info.get("type")
            bill_number = bill_info.get("number")
        
        # Extract totals
        totals = vote_data.get("totals", {})
        yea_count = totals.get("Yea") or totals.get("yea")
        nay_count = totals.get("Nay") or totals.get("nay") or totals.get("No")
        present_count = totals.get("Present") or totals.get("present")
        not_voting_count = totals.get("Not Voting") or totals.get("notVoting")
        
        # Create vote record
        vote = Vote(
            congress=congress,
            chamber=chamber.lower(),
            roll_number=roll_number,
            session=vote_data.get("session"),
            question=vote_data.get("question"),
            vote_date=vote_date,
            related_bill_congress=bill_congress,
            related_bill_type=bill_type,
            related_bill_number=bill_number,
            result=vote_data.get("result"),
            yea_count=yea_count,
            nay_count=nay_count,
            present_count=present_count,
            not_voting_count=not_voting_count,
            source_url=vote_data.get("url"),
            metadata_json=vote_data,
        )
        db.add(vote)
        db.flush()  # Get vote.id
        
        # Ingest member votes
        members = vote_data.get("members", [])
        member_count = 0
        
        for member in members:
            bioguide_id = member.get("bioguideId")
            position = member.get("vote")
            
            if not bioguide_id or not position:
                continue
            
            # Map bioguide_id to person_id if mapping provided
            person_id = None
            if person_id_map and bioguide_id in person_id_map:
                person_id = person_id_map[bioguide_id]
            
            member_vote = MemberVote(
                vote_id=vote.id,
                person_id=person_id,  # May be None if not in our system yet
                position=position,
                bioguide_id=bioguide_id,
                member_name=member.get("name"),
                party=member.get("party"),
                state=member.get("state"),
            )
            db.add(member_vote)
            member_count += 1
        
        db.commit()
        logger.info("Ingested vote %s/%s/%s (id=%s) with %d member votes", congress, chamber, roll_number, vote.id, member_count)
        return vote.id
        
    except Exception as e:
        logger.error("Failed to ingest vote %s/%s/%s: %s", congress, chamber, roll_number, e)
        db.rollback()
        return None
    finally:
        db.close()


def ingest_recent_house_votes(congress: int = 119, limit: int = 50, person_id_map: Optional[Dict[str, str]] = None) -> int:
    """
    Ingest recent House votes with member positions.
    
    Args:
        congress: Congress number
        limit: Max votes to ingest
        person_id_map: Optional bioguide_id -> person_id mapping
        
    Returns:
        Number of votes successfully ingested
    """
    votes = fetch_house_votes(congress, limit)
    count = 0
    
    for vote_summary in votes:
        # Extract roll number from vote summary
        roll_number = vote_summary.get("rollCall")
        if not roll_number:
            continue
        
        vote_id = ingest_vote_with_members(congress, "house", roll_number, person_id_map)
        if vote_id:
            count += 1
    
    return count


if __name__ == "__main__":
    # Test ingestion
    logger.info("Testing Congress.gov vote connector...")
    
    # Example: AOC's bioguide ID is O000172
    # You can add more mappings as needed
    test_map = {
        "O000172": "aoc",
    }
    
    count = ingest_recent_house_votes(congress=119, limit=10, person_id_map=test_map)
    logger.info("Ingested %d votes", count)
