"""
Import congressional committees and memberships from unitedstates/congress-legislators.

Data source (CC0 public domain):
  https://github.com/unitedstates/congress-legislators

Parses:
  - committees-current.yaml    → Committee table
  - committee-membership-current.yaml → CommitteeMembership table

Cross-references members by bioguide_id to existing TrackedMember records.

Usage:
    # Clone the data repo first:
    git clone https://github.com/unitedstates/congress-legislators /tmp/congress-legislators

    # Run the import:
    python jobs/import_congress_legislators.py --data-dir /tmp/congress-legislators

    # Dry run (no DB writes):
    python jobs/import_congress_legislators.py --data-dir /tmp/congress-legislators --dry-run

    # Also update TrackedMember fields (name, party, state, chamber) from legislators-current.yaml:
    python jobs/import_congress_legislators.py --data-dir /tmp/congress-legislators --update-members
"""

import os
import sys
import argparse
import logging
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is required. Install it with: pip install pyyaml")
    sys.exit(1)

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from models.database import Base
from models.committee_models import Committee, CommitteeMembership
from models.database import TrackedMember

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("import_congress_legislators")

DB_PATH = os.getenv("WTP_DB_URL") or os.getenv("DATABASE_URL") or "sqlite:///wethepeople.db"


def get_engine():
    kwargs = {}
    if DB_PATH.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 60}
    engine = create_engine(DB_PATH, echo=False, **kwargs)
    if DB_PATH.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=60000")
            cursor.close()
    return engine


def load_yaml(filepath: str):
    """Load a YAML file and return parsed data."""
    log.info(f"Loading {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def classify_committee_type(thomas_id: str, chamber: str) -> str:
    """Infer committee type from thomas_id prefix and chamber."""
    if chamber == "joint":
        return "joint"
    # Select/special committees typically have 'SS' prefix for Senate select
    # or specific known IDs
    select_ids = {"SLIA", "JSEC", "JCSE", "SCNC"}  # Known select/special committees
    if thomas_id in select_ids:
        return "select"
    return "standing"


def normalize_role(title: str) -> str:
    """Normalize committee title to a standard role string."""
    if not title:
        return "member"
    title_lower = title.lower().strip()
    if "chairman" in title_lower or "chair" == title_lower:
        return "chair"
    if "vice chair" in title_lower:
        return "vice_chair"
    if "ranking" in title_lower:
        return "ranking_member"
    if "ex officio" in title_lower:
        return "ex_officio"
    return "member"


def import_committees(session, data_dir: str, dry_run: bool = False):
    """Import committees and subcommittees from committees-current.yaml."""
    filepath = os.path.join(data_dir, "committees-current.yaml")
    if not os.path.exists(filepath):
        log.error(f"File not found: {filepath}")
        return 0, 0

    committees = load_yaml(filepath)
    count_committees = 0
    count_subcommittees = 0

    for entry in committees:
        thomas_id = entry.get("thomas_id")
        if not thomas_id:
            continue

        chamber = entry.get("type", "").lower()  # 'house', 'senate', 'joint'
        committee_type = classify_committee_type(thomas_id, chamber)

        if dry_run:
            log.info(f"  [DRY RUN] Would import committee: {thomas_id} — {entry.get('name')}")
        else:
            existing = session.query(Committee).filter(Committee.thomas_id == thomas_id).first()
            if existing:
                existing.name = entry.get("name", existing.name)
                existing.chamber = chamber
                existing.committee_type = committee_type
                existing.url = entry.get("url", existing.url)
                existing.phone = entry.get("phone", existing.phone)
                existing.address = entry.get("address", existing.address)
                existing.jurisdiction = entry.get("jurisdiction", existing.jurisdiction)
                existing.house_committee_id = entry.get("house_committee_id", existing.house_committee_id)
                existing.senate_committee_id = entry.get("senate_committee_id", existing.senate_committee_id)
                existing.parent_thomas_id = None  # Top-level
            else:
                c = Committee(
                    thomas_id=thomas_id,
                    name=entry.get("name", ""),
                    chamber=chamber,
                    committee_type=committee_type,
                    url=entry.get("url"),
                    phone=entry.get("phone"),
                    address=entry.get("address"),
                    jurisdiction=entry.get("jurisdiction"),
                    house_committee_id=entry.get("house_committee_id"),
                    senate_committee_id=entry.get("senate_committee_id"),
                    parent_thomas_id=None,
                )
                session.add(c)
        count_committees += 1

        # Process subcommittees
        for sub in entry.get("subcommittees", []):
            sub_thomas_id_suffix = sub.get("thomas_id")
            if not sub_thomas_id_suffix:
                continue
            # Subcommittee thomas_id = parent thomas_id + sub suffix
            sub_thomas_id = f"{thomas_id}{sub_thomas_id_suffix}"

            if dry_run:
                log.info(f"  [DRY RUN] Would import subcommittee: {sub_thomas_id} — {sub.get('name')}")
            else:
                existing_sub = session.query(Committee).filter(Committee.thomas_id == sub_thomas_id).first()
                if existing_sub:
                    existing_sub.name = sub.get("name", existing_sub.name)
                    existing_sub.chamber = chamber
                    existing_sub.committee_type = "subcommittee"
                    existing_sub.phone = sub.get("phone", existing_sub.phone)
                    existing_sub.address = sub.get("address", existing_sub.address)
                    existing_sub.parent_thomas_id = thomas_id
                else:
                    sc = Committee(
                        thomas_id=sub_thomas_id,
                        name=sub.get("name", ""),
                        chamber=chamber,
                        committee_type="subcommittee",
                        phone=sub.get("phone"),
                        address=sub.get("address"),
                        parent_thomas_id=thomas_id,
                    )
                    session.add(sc)
            count_subcommittees += 1

    if not dry_run:
        session.commit()

    log.info(f"Committees: {count_committees} top-level, {count_subcommittees} subcommittees")
    return count_committees, count_subcommittees


def import_memberships(session, data_dir: str, dry_run: bool = False):
    """Import committee memberships from committee-membership-current.yaml."""
    filepath = os.path.join(data_dir, "committee-membership-current.yaml")
    if not os.path.exists(filepath):
        log.error(f"File not found: {filepath}")
        return 0, 0, 0

    membership_data = load_yaml(filepath)

    # Build bioguide → person_id lookup from TrackedMember
    tracked = {m.bioguide_id: m.person_id for m in session.query(TrackedMember).all()}
    log.info(f"Found {len(tracked)} tracked members for cross-referencing")

    count_total = 0
    count_linked = 0
    count_unlinked = 0

    for committee_id, members in membership_data.items():
        if not members:
            continue

        # Verify the committee exists in our DB
        committee = session.query(Committee).filter(Committee.thomas_id == committee_id).first()
        if not committee and not dry_run:
            log.warning(f"Committee {committee_id} not found in DB — skipping {len(members)} members")
            continue

        for member in members:
            bioguide = member.get("bioguide")
            if not bioguide:
                continue

            person_id = tracked.get(bioguide)
            role = normalize_role(member.get("title"))

            if dry_run:
                status = "LINKED" if person_id else "unlinked"
                log.debug(f"  [DRY RUN] {committee_id} ← {member.get('name')} ({bioguide}) [{status}]")
            else:
                existing = (
                    session.query(CommitteeMembership)
                    .filter(
                        CommitteeMembership.committee_thomas_id == committee_id,
                        CommitteeMembership.bioguide_id == bioguide,
                    )
                    .first()
                )
                if existing:
                    existing.person_id = person_id
                    existing.role = role
                    existing.rank = member.get("rank")
                    existing.party = member.get("party")
                    existing.member_name = member.get("name")
                else:
                    cm = CommitteeMembership(
                        committee_thomas_id=committee_id,
                        bioguide_id=bioguide,
                        person_id=person_id,
                        role=role,
                        rank=member.get("rank"),
                        party=member.get("party"),
                        member_name=member.get("name"),
                    )
                    session.add(cm)

            count_total += 1
            if person_id:
                count_linked += 1
            else:
                count_unlinked += 1

    if not dry_run:
        session.commit()

    log.info(f"Memberships: {count_total} total, {count_linked} linked to tracked members, {count_unlinked} unlinked")
    return count_total, count_linked, count_unlinked


def update_tracked_members(session, data_dir: str, dry_run: bool = False):
    """
    Optionally update TrackedMember records with fresh data from legislators-current.yaml.
    Updates: display_name, party, state, chamber, photo_url (if missing).
    Only updates members already in tracked_members (does NOT add new ones).
    """
    filepath = os.path.join(data_dir, "legislators-current.yaml")
    if not os.path.exists(filepath):
        log.error(f"File not found: {filepath}")
        return 0

    legislators = load_yaml(filepath)

    # Build bioguide → legislator lookup
    leg_by_bioguide = {}
    for leg in legislators:
        bio_id = leg.get("id", {}).get("bioguide")
        if bio_id:
            leg_by_bioguide[bio_id] = leg

    tracked = session.query(TrackedMember).all()
    count_updated = 0

    for member in tracked:
        leg = leg_by_bioguide.get(member.bioguide_id)
        if not leg:
            continue

        # Get current term (last in the terms list)
        terms = leg.get("terms", [])
        current_term = terms[-1] if terms else {}

        changed = False

        # Update party from current term
        party_raw = current_term.get("party", "")
        party_code = {"Democrat": "D", "Republican": "R", "Independent": "I"}.get(party_raw, party_raw[:1] if party_raw else None)
        if party_code and party_code != member.party:
            if not dry_run:
                member.party = party_code
            changed = True

        # Update state
        state = current_term.get("state")
        if state and state != member.state:
            if not dry_run:
                member.state = state
            changed = True

        # Update chamber
        term_type = current_term.get("type")
        chamber = {"sen": "senate", "rep": "house"}.get(term_type)
        if chamber and chamber != member.chamber:
            if not dry_run:
                member.chamber = chamber
            changed = True

        if changed:
            count_updated += 1
            if dry_run:
                log.info(f"  [DRY RUN] Would update: {member.display_name} ({member.bioguide_id})")

    if not dry_run:
        session.commit()

    log.info(f"Updated {count_updated} tracked member records")
    return count_updated


def main():
    parser = argparse.ArgumentParser(
        description="Import committees & memberships from unitedstates/congress-legislators"
    )
    parser.add_argument(
        "--data-dir", required=True,
        help="Path to cloned congress-legislators repo"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Preview changes without writing to DB"
    )
    parser.add_argument(
        "--update-members", action="store_true",
        help="Also update TrackedMember fields from legislators-current.yaml"
    )
    parser.add_argument(
        "--committees-only", action="store_true",
        help="Only import committees (skip memberships)"
    )
    parser.add_argument(
        "--memberships-only", action="store_true",
        help="Only import memberships (skip committees)"
    )
    args = parser.parse_args()

    if not os.path.isdir(args.data_dir):
        log.error(f"Data directory not found: {args.data_dir}")
        sys.exit(1)

    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    log.info(f"Database: {DB_PATH}")
    log.info(f"Data dir: {args.data_dir}")
    if args.dry_run:
        log.info("=== DRY RUN MODE ===")

    try:
        # Step 1: Import committees
        if not args.memberships_only:
            log.info("--- Importing committees ---")
            n_committees, n_subcommittees = import_committees(session, args.data_dir, args.dry_run)
        else:
            n_committees, n_subcommittees = 0, 0

        # Step 2: Import memberships
        if not args.committees_only:
            log.info("--- Importing memberships ---")
            n_memberships, n_linked, n_unlinked = import_memberships(session, args.data_dir, args.dry_run)
        else:
            n_memberships, n_linked, n_unlinked = 0, 0, 0

        # Step 3: Optionally update tracked members
        n_member_updates = 0
        if args.update_members:
            log.info("--- Updating tracked members ---")
            n_member_updates = update_tracked_members(session, args.data_dir, args.dry_run)

        # Summary
        log.info("=" * 60)
        log.info("IMPORT SUMMARY")
        log.info("=" * 60)
        log.info(f"  Committees:        {n_committees} top-level")
        log.info(f"  Subcommittees:     {n_subcommittees}")
        log.info(f"  Memberships:       {n_memberships} total")
        log.info(f"    Linked:          {n_linked} (matched to TrackedMember)")
        log.info(f"    Unlinked:        {n_unlinked} (bioguide not in tracked_members)")
        if args.update_members:
            log.info(f"  Members updated:   {n_member_updates}")
        log.info("=" * 60)

    finally:
        session.close()


if __name__ == "__main__":
    main()
