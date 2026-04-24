"""
Senate Vote Sync Job (GovTrack-backed)

The senate.gov LIS XML feeds block datacenter IPs (Hetzner returns HTTP 403
regardless of User-Agent). The Congress.gov API v3 does NOT expose a Senate
roll call endpoint. GovTrack.us ingests the same upstream Senate LIS XML and
republishes it through a public JSON API that works from any network.

Sources:
  - Vote list:  https://www.govtrack.us/api/v2/vote?congress=N&chamber=senate&session=YYYY
  - Vote page:  https://www.govtrack.us/congress/votes/{congress}-{year}/s{number}
                (scraped for GovTrack internal vote-id; not exposed in the JSON API)
  - Voters:     https://www.govtrack.us/api/v2/vote_voter?vote={govtrack_id}&limit=120

Schema written:
  Vote rows use congress/chamber/roll_number (unique), vote_session=1|2 (odd/even year),
  source_url points at the GovTrack page. metadata_json records {"source": "govtrack.us",
  "govtrack_id": ..., "senate_source_url": ...} for provenance.

Usage:
    python jobs/sync_senate_votes.py
    python jobs/sync_senate_votes.py --congress 119 --session 1
    python jobs/sync_senate_votes.py --congress 119 --session 1 --start 1 --end 50
    python jobs/sync_senate_votes.py --incremental          # only new votes (default)
    python jobs/sync_senate_votes.py --refresh-existing     # re-fetch voters for existing rows
"""

import argparse
import re
import sys
import time
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

GOVTRACK_API = "https://www.govtrack.us/api/v2"
GOVTRACK_WEB = "https://www.govtrack.us/congress/votes"
REQUEST_DELAY = 0.5   # polite delay between GovTrack requests
REQUEST_TIMEOUT = 30  # seconds
MAX_RETRIES = 3

HEADERS = {
    "User-Agent": "WeThePeople/1.0 (civic transparency; https://wethepeopleforus.com; wethepeopleforus@gmail.com)",
    "Accept": "application/json",
}
HTML_HEADERS = {
    "User-Agent": HEADERS["User-Agent"],
    "Accept": "text/html,application/xhtml+xml",
}

# Capture <... vote-id="12345" ...> on the vote detail page
VOTE_ID_RE = re.compile(r'vote-id=["\'](\d+)["\']')


# ---------------------------------------------------------------------------
# Congress ↔ session ↔ year helpers
# ---------------------------------------------------------------------------

def congress_start_year(congress: int) -> int:
    """A congress starts in an odd-numbered year. 1st = 1789, so start = 1787 + 2C."""
    return 1787 + 2 * congress


def session_to_year(congress: int, session: int) -> int:
    """Session 1 = first (odd) year of the congress; session 2 = second (even) year."""
    return congress_start_year(congress) + (session - 1)


def year_to_session(congress: int, year: int) -> int:
    """Inverse of session_to_year. Returns 1 or 2 (rarely 3 for special sessions; treated as 2)."""
    diff = year - congress_start_year(congress)
    if diff <= 0:
        return 1
    if diff >= 2:
        return 2
    return 1 + diff  # 1 or 2


# ---------------------------------------------------------------------------
# Name-matching helpers (retained from previous implementation as fallback
# when bioguide_id match fails)
# ---------------------------------------------------------------------------

def _normalize_name(name: str) -> str:
    """Lowercase, strip suffixes, collapse whitespace for fuzzy matching."""
    name = name.lower().strip()
    for suffix in [" jr.", " jr", " sr.", " sr", " iii", " ii", " iv"]:
        if name.endswith(suffix):
            name = name[: -len(suffix)].strip()
    name = re.sub(r"[^a-z\s]", "", name)
    return " ".join(name.split())


def _last_name(full_name: str) -> str:
    parts = full_name.strip().split()
    if not parts:
        return ""
    return parts[-1].lower()


def build_senator_map(db) -> Tuple[dict, dict, dict]:
    """
    Build lookup maps for matching senators to TrackedMember person_ids.

    Returns (by_last_state, by_full_name, by_bioguide).
    """
    members = db.query(TrackedMember).filter(
        TrackedMember.is_active == 1,
        TrackedMember.chamber == "senate",
    ).all()

    by_last_state: Dict[Tuple[str, str], str] = {}
    by_full_name: Dict[str, str] = {}
    by_bioguide: Dict[str, str] = {}

    for m in members:
        last = _last_name(m.display_name)
        if m.state:
            by_last_state[(last, m.state.upper())] = m.person_id
        by_full_name[_normalize_name(m.display_name)] = m.person_id
        if m.bioguide_id:
            by_bioguide[m.bioguide_id] = m.person_id

    logger.info(
        f"Built senator map: {len(by_last_state)} by last+state, "
        f"{len(by_full_name)} by full name, {len(by_bioguide)} by bioguide"
    )
    return by_last_state, by_full_name, by_bioguide


def match_senator(
    bioguide_id: Optional[str],
    last_name: str,
    state: str,
    full_name: str,
    by_last_state: dict,
    by_full_name: dict,
    by_bioguide: dict,
) -> Optional[str]:
    """Resolve a voter row to a TrackedMember.person_id. Bioguide wins."""
    if bioguide_id and bioguide_id in by_bioguide:
        return by_bioguide[bioguide_id]

    key = (_normalize_name(last_name), state.upper() if state else "")
    if key in by_last_state:
        return by_last_state[key]

    norm = _normalize_name(full_name)
    if norm in by_full_name:
        return by_full_name[norm]

    norm_last = _normalize_name(last_name)
    matches = [pid for (ln, _), pid in by_last_state.items() if ln == norm_last]
    if len(matches) == 1:
        return matches[0]

    return None


# ---------------------------------------------------------------------------
# GovTrack HTTP layer
# ---------------------------------------------------------------------------

_session = requests.Session()


def _get_json(url: str, params: Optional[dict] = None) -> Optional[Any]:
    """GET JSON with retries and honest error logging."""
    last_err: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = _session.get(url, headers=HEADERS, params=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 502:
                # GovTrack occasionally returns 502; backoff and retry
                raise requests.HTTPError(f"502 Bad Gateway from {url}")
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as e:
            last_err = e
            if attempt < MAX_RETRIES:
                sleep_for = 2 ** attempt
                logger.warning(f"GET {url} failed (attempt {attempt}/{MAX_RETRIES}): {e}; sleeping {sleep_for}s")
                time.sleep(sleep_for)
    logger.error(f"GET {url} gave up after {MAX_RETRIES} attempts: {last_err}")
    return None


def _get_text(url: str) -> Optional[str]:
    """GET HTML/text with retries."""
    last_err: Optional[Exception] = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = _session.get(url, headers=HTML_HEADERS, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as e:
            last_err = e
            if attempt < MAX_RETRIES:
                sleep_for = 2 ** attempt
                logger.warning(f"GET {url} (text) failed (attempt {attempt}/{MAX_RETRIES}): {e}; sleeping {sleep_for}s")
                time.sleep(sleep_for)
    logger.error(f"GET {url} (text) gave up after {MAX_RETRIES} attempts: {last_err}")
    return None


def fetch_vote_list(congress: int, session: int) -> List[Dict[str, Any]]:
    """
    List every Senate vote for a congress+session. Paginated; returns all rows.

    GovTrack's `session` field is the year, so we map our 1|2 to the year.
    """
    year = session_to_year(congress, session)
    all_votes: List[Dict[str, Any]] = []
    offset = 0
    page_size = 200

    while True:
        params = {
            "congress": congress,
            "chamber": "senate",
            "session": year,
            "limit": page_size,
            "offset": offset,
            "sort": "created",
        }
        data = _get_json(f"{GOVTRACK_API}/vote", params=params)
        if not data:
            break
        objects = data.get("objects", []) or []
        all_votes.extend(objects)
        total = (data.get("meta") or {}).get("total_count", 0)
        offset += len(objects)
        if not objects or offset >= total:
            break
        time.sleep(REQUEST_DELAY)

    logger.info(
        f"GovTrack: {len(all_votes)} Senate votes for Congress {congress} Session {session} (year {year})"
    )
    return all_votes


def extract_govtrack_vote_id(congress: int, year: int, roll: int) -> Optional[int]:
    """
    GovTrack exposes its internal vote ID only on the HTML page, as
    `<... vote-id="12345" ...>`. Scrape it. ~600ms per call, so we only call
    this for votes we actually need to ingest voters for.
    """
    url = f"{GOVTRACK_WEB}/{congress}-{year}/s{roll}"
    html = _get_text(url)
    if not html:
        return None
    m = VOTE_ID_RE.search(html)
    if not m:
        logger.warning(f"No vote-id found on {url}")
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def fetch_voters(govtrack_vote_id: int) -> List[Dict[str, Any]]:
    """Fetch every voter for a GovTrack vote (Senate = up to ~100)."""
    all_voters: List[Dict[str, Any]] = []
    offset = 0
    page_size = 200

    while True:
        params = {"vote": govtrack_vote_id, "limit": page_size, "offset": offset}
        data = _get_json(f"{GOVTRACK_API}/vote_voter", params=params)
        if not data:
            break
        objects = data.get("objects", []) or []
        all_voters.extend(objects)
        total = (data.get("meta") or {}).get("total_count", 0)
        offset += len(objects)
        if not objects or offset >= total:
            break
        time.sleep(REQUEST_DELAY)

    return all_voters


# ---------------------------------------------------------------------------
# Parsing
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
    if not raw:
        return "Not Voting"
    return POSITION_MAP.get(raw.strip().lower(), raw.strip())


def parse_vote_date(raw: Optional[str]) -> Optional[date]:
    """GovTrack `created` comes ISO-formatted, e.g. '2026-04-16T13:36:00'."""
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    logger.warning(f"Could not parse vote date: {raw!r}")
    return None


def map_gt_vote_to_schema(gt_vote: Dict[str, Any], congress: int) -> Dict[str, Any]:
    """
    Convert a GovTrack vote dict to the dict shape our ingestion expects.
    Does NOT resolve voters — that requires a separate API call.
    """
    roll = int(gt_vote.get("number") or 0)
    year = int(gt_vote.get("session") or session_to_year(congress, 1))
    sess = year_to_session(congress, year)

    # Question: GovTrack `question` tends to be descriptive; `vote_type` is the parliamentary label
    question_parts = []
    if gt_vote.get("vote_type"):
        question_parts.append(gt_vote["vote_type"])
    if gt_vote.get("question"):
        question_parts.append(gt_vote["question"])
    question = ": ".join(question_parts) if question_parts else "Roll call vote"

    # Related bill
    related_bill_type = None
    related_bill_number = None
    related_bill_congress: Optional[int] = None
    rb = gt_vote.get("related_bill")
    if isinstance(rb, dict):
        # GovTrack returns nested bill dict when requested, or just the id
        if rb.get("bill_type"):
            related_bill_type = str(rb["bill_type"]).upper()
        if rb.get("number"):
            try:
                related_bill_number = int(rb["number"])
            except (TypeError, ValueError):
                related_bill_number = None
        if rb.get("congress"):
            try:
                related_bill_congress = int(rb["congress"])
            except (TypeError, ValueError):
                related_bill_congress = None
    elif isinstance(rb, int):
        # Just the GovTrack bill id — we cannot derive bill_type/number without another call
        pass

    if related_bill_congress is None:
        related_bill_congress = congress

    # Result counts
    return {
        "vote_number": roll,
        "session": sess,
        "year": year,
        "question": question,
        "vote_date": parse_vote_date(gt_vote.get("created")),
        "result": gt_vote.get("result"),
        "majority_requirement": gt_vote.get("required"),
        "yea_count": gt_vote.get("total_plus"),
        "nay_count": gt_vote.get("total_minus"),
        "present_count": None,  # GovTrack lumps Present into total_other
        "not_voting_count": gt_vote.get("total_other"),
        "related_bill_congress": related_bill_congress,
        "related_bill_type": related_bill_type,
        "related_bill_number": related_bill_number,
        "govtrack_link": gt_vote.get("link"),
        "source_url": (
            f"https://www.senate.gov/legislative/LIS/roll_call_votes/"
            f"vote{congress}{sess}/vote_{congress}_{sess}_{roll:05d}.htm"
        ),
    }


def parse_voter(voter: Dict[str, Any]) -> Dict[str, Any]:
    person = voter.get("person") or {}
    role = voter.get("person_role") or {}
    option = voter.get("option") or {}

    party_full = role.get("party") or ""
    party_short = {"Democrat": "D", "Republican": "R", "Independent": "I"}.get(party_full, party_full[:1] if party_full else "")

    first = (person.get("firstname") or "").strip()
    last = (person.get("lastname") or "").strip()
    full = (person.get("name") or f"{first} {last}").strip()

    return {
        "bioguide_id": person.get("bioguideid"),
        "last_name": last,
        "first_name": first,
        "member_full": full,
        "party": party_short or None,
        "state": role.get("state"),
        "vote_cast": option.get("value"),
    }


# ---------------------------------------------------------------------------
# DB ingestion
# ---------------------------------------------------------------------------

def ingest_senate_vote(
    congress: int,
    vote_schema: Dict[str, Any],
    voters: Optional[List[Dict[str, Any]]],
    govtrack_vote_id: Optional[int],
    by_last_state: dict,
    by_full_name: dict,
    by_bioguide: dict,
    refresh_existing: bool = False,
) -> Tuple[str, Optional[int]]:
    """
    Upsert a Vote and its MemberVote rows. Returns (action, vote.id) where action
    is one of {"inserted", "updated", "skipped", "failed"}.

    If `voters` is None, we only sync the Vote row (no member positions). That path
    exists so we can reuse the function for metadata-only refresh.
    """
    db = SessionLocal()
    try:
        roll = vote_schema["vote_number"]
        session = vote_schema["session"]

        # IMPORTANT: Senate roll numbers restart each session (1 and 2). The
        # existing unique constraint (congress, chamber, roll_number) does NOT
        # include session, so we must disambiguate by session in Python to
        # avoid clobbering session-1 rows with session-2 data (or vice versa).
        existing = db.query(Vote).filter(
            Vote.congress == congress,
            Vote.chamber == "senate",
            Vote.roll_number == roll,
            Vote.vote_session == session,
        ).first()

        if existing and not refresh_existing:
            # Already in DB. Update counts if we now have better data, but don't
            # re-ingest voters.
            changed = False
            for field in ("yea_count", "nay_count", "present_count", "not_voting_count", "result", "question"):
                new_val = vote_schema.get(field)
                if new_val is not None and getattr(existing, field) != new_val:
                    setattr(existing, field, new_val)
                    changed = True
            if changed:
                db.commit()
                return ("updated", existing.id)
            return ("skipped", existing.id)

        if existing and refresh_existing:
            # Wipe old member votes, re-ingest from GovTrack
            db.query(MemberVote).filter(MemberVote.vote_id == existing.id).delete()
            vote = existing
            # Refresh scalar fields too
            for field in ("yea_count", "nay_count", "present_count", "not_voting_count", "result", "question"):
                new_val = vote_schema.get(field)
                if new_val is not None:
                    setattr(vote, field, new_val)
            action = "updated"
        else:
            vote = Vote(
                congress=congress,
                chamber="senate",
                roll_number=roll,
                vote_session=session,
                question=vote_schema.get("question"),
                vote_date=vote_schema.get("vote_date"),
                related_bill_congress=vote_schema.get("related_bill_congress"),
                related_bill_type=vote_schema.get("related_bill_type"),
                related_bill_number=vote_schema.get("related_bill_number"),
                result=vote_schema.get("result"),
                yea_count=vote_schema.get("yea_count"),
                nay_count=vote_schema.get("nay_count"),
                present_count=vote_schema.get("present_count"),
                not_voting_count=vote_schema.get("not_voting_count"),
                source_url=vote_schema.get("source_url"),
                metadata_json={
                    "source": "govtrack.us",
                    "govtrack_id": govtrack_vote_id,
                    "govtrack_link": vote_schema.get("govtrack_link"),
                    "majority_requirement": vote_schema.get("majority_requirement"),
                    "senate_source_url": vote_schema.get("source_url"),
                },
            )
            db.add(vote)
            action = "inserted"

        db.flush()  # need vote.id for member rows

        if voters is not None:
            member_count = 0
            matched_count = 0
            for voter_raw in voters:
                v = parse_voter(voter_raw)
                position = normalize_position(v.get("vote_cast"))
                person_id = match_senator(
                    v.get("bioguide_id"),
                    v.get("last_name", ""),
                    v.get("state") or "",
                    v.get("member_full", ""),
                    by_last_state, by_full_name, by_bioguide,
                )
                member_name = f"{v.get('first_name','')} {v.get('last_name','')}".strip() or v.get("member_full")

                mv = MemberVote(
                    vote_id=vote.id,
                    person_id=person_id,
                    bioguide_id=v.get("bioguide_id"),
                    position=position,
                    member_name=member_name,
                    party=v.get("party") or None,
                    state=v.get("state") or None,
                )
                db.add(mv)
                member_count += 1
                if person_id:
                    matched_count += 1

            logger.info(
                f"Senate {congress}/{session}/roll {roll}: "
                f"{action}, {member_count} voters ({matched_count} matched)",
                extra={"job": "sync_senate_votes"},
            )
        else:
            logger.info(
                f"Senate {congress}/{session}/roll {roll}: {action} (no voter payload)",
                extra={"job": "sync_senate_votes"},
            )

        db.commit()
        return (action, vote.id)

    except Exception as e:
        db.rollback()
        logger.error(
            f"Failed senate vote {congress}/roll {vote_schema.get('vote_number')}: {e}",
            extra={"job": "sync_senate_votes", "error_type": type(e).__name__},
        )
        return ("failed", None)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def sync_senate_votes(
    congress: int,
    session: int,
    start: Optional[int] = None,
    end: Optional[int] = None,
    refresh_existing: bool = False,
) -> Dict[str, int]:
    """Sync all Senate votes for a given congress/session via GovTrack."""
    db = SessionLocal()
    try:
        by_last_state, by_full_name, by_bioguide = build_senator_map(db)
    finally:
        db.close()

    gt_votes = fetch_vote_list(congress, session)
    if not gt_votes:
        logger.info(f"No Senate votes returned from GovTrack for {congress}/{session}")
        return {"total": 0, "inserted": 0, "updated": 0, "skipped": 0, "failed": 0}

    # Pre-filter by roll range
    if start is not None:
        gt_votes = [v for v in gt_votes if (v.get("number") or 0) >= start]
    if end is not None:
        gt_votes = [v for v in gt_votes if (v.get("number") or 0) <= end]

    if not gt_votes:
        logger.info("No Senate votes to process after range filter")
        return {"total": 0, "inserted": 0, "updated": 0, "skipped": 0, "failed": 0}

    # Pre-compute which rolls we already have so we can skip the HTML scrape
    # and voter fetch on those (unless --refresh-existing).
    rolls = [int(v.get("number")) for v in gt_votes if v.get("number") is not None]
    existing_rolls: set = set()
    if not refresh_existing and rolls:
        db = SessionLocal()
        try:
            existing = db.query(Vote.roll_number).filter(
                Vote.congress == congress,
                Vote.chamber == "senate",
                Vote.vote_session == session,
                Vote.roll_number.in_(rolls),
            ).all()
            existing_rolls = {r for (r,) in existing}
        finally:
            db.close()

    stats = {"total": len(gt_votes), "inserted": 0, "updated": 0, "skipped": 0, "failed": 0}

    for i, gt_vote in enumerate(gt_votes):
        schema = map_gt_vote_to_schema(gt_vote, congress)
        roll = schema["vote_number"]
        year = schema["year"]

        if i > 0 and i % 10 == 0:
            logger.info(
                f"Progress: {i}/{len(gt_votes)} "
                f"(inserted={stats['inserted']}, updated={stats['updated']}, "
                f"skipped={stats['skipped']}, failed={stats['failed']})"
            )

        is_new = roll not in existing_rolls

        # Only scrape vote-id + fetch voters if we're going to write voter rows
        govtrack_id: Optional[int] = None
        voters: Optional[List[Dict[str, Any]]] = None
        if is_new or refresh_existing:
            govtrack_id = extract_govtrack_vote_id(congress, year, roll)
            time.sleep(REQUEST_DELAY)
            if govtrack_id is None:
                logger.warning(f"Cannot resolve GovTrack vote-id for {congress}/{year}/s{roll}; "
                               f"inserting vote row without voters")
                voters = []
            else:
                voters = fetch_voters(govtrack_id)
                time.sleep(REQUEST_DELAY)

        action, _vote_id = ingest_senate_vote(
            congress=congress,
            vote_schema=schema,
            voters=voters,
            govtrack_vote_id=govtrack_id,
            by_last_state=by_last_state,
            by_full_name=by_full_name,
            by_bioguide=by_bioguide,
            refresh_existing=refresh_existing,
        )
        stats[action] = stats.get(action, 0) + 1

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync Senate roll call votes via GovTrack.us API"
    )
    parser.add_argument("--congress", type=int, default=119,
                        help="Congress number (default: 119)")
    parser.add_argument("--session", type=int, default=None,
                        help="Session number 1 or 2 (default: both)")
    parser.add_argument("--start", type=int, default=None,
                        help="Start roll number (inclusive)")
    parser.add_argument("--end", type=int, default=None,
                        help="End roll number (inclusive)")
    parser.add_argument("--refresh-existing", action="store_true",
                        help="Re-fetch voters for rolls already in DB (slow)")
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("Senate Vote Sync — GovTrack API backend")
    logger.info(f"Congress: {args.congress}, Session: {args.session or 'both'}, "
                f"refresh_existing={args.refresh_existing}")
    logger.info("=" * 60)

    sessions = [args.session] if args.session else [1, 2]

    total_stats = {"total": 0, "inserted": 0, "updated": 0, "skipped": 0, "failed": 0}

    for session in sessions:
        logger.info(f"\n--- Session {session} (year {session_to_year(args.congress, session)}) ---")
        stats = sync_senate_votes(
            congress=args.congress,
            session=session,
            start=args.start,
            end=args.end,
            refresh_existing=args.refresh_existing,
        )
        logger.info(f"Session {session} results: {stats}")
        for k in total_stats:
            total_stats[k] += stats.get(k, 0)

    logger.info("=" * 60)
    logger.info(f"FINAL SUMMARY: {total_stats}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
