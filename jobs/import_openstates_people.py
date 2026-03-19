"""
Bulk import of state legislators from the openstates/people GitHub repo.

This bypasses the OpenStates API entirely (which has a 250 req/day limit)
by reading the YAML files directly from a local clone of:
    https://github.com/openstates/people

The data is CC0 public domain.

Usage:
    # First, clone the repo somewhere outside WeThePeople:
    git clone --depth 1 https://github.com/openstates/people /tmp/openstates-people

    # Import all 50 states:
    python jobs/import_openstates_people.py --data-dir /tmp/openstates-people

    # Import a single state:
    python jobs/import_openstates_people.py --data-dir /tmp/openstates-people --state NY

    # Dry run (no DB writes):
    python jobs/import_openstates_people.py --data-dir /tmp/openstates-people --dry-run

    # Include retired legislators (marked is_active=False):
    python jobs/import_openstates_people.py --data-dir /tmp/openstates-people --include-retired
"""

import os
import sys
import glob
import hashlib
import argparse
import logging

from dotenv import load_dotenv

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML is required. Install it with: pip install pyyaml")
    sys.exit(1)

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.database import Base
from models.state_models import StateLegislator

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("import_openstates_people")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

# All 50 US states (lowercase, matching openstates directory names)
ALL_STATES = [
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
    "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
    "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
    "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
    "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
]

# Map full party names from openstates YAML to short codes
PARTY_MAP = {
    "democratic": "D",
    "democrat": "D",
    "republican": "R",
    "independent": "I",
    "libertarian": "L",
    "green": "G",
    "progressive": "P",
    "nonpartisan": "I",
    "no party preference": "I",
}


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def normalize_party(party_list):
    """
    Extract short party code from the openstates party list.
    The YAML has: party: [{name: "Democratic"}, ...]
    We take the most recent (last) party entry.
    Also handles compound parties like "Democratic/Working Families".
    """
    if not party_list:
        return None
    # Take the last (most recent) party entry
    party_name = party_list[-1].get("name", "") if isinstance(party_list[-1], dict) else str(party_list[-1])
    # Handle compound parties — take the first part
    primary = party_name.split("/")[0].strip().lower()
    return PARTY_MAP.get(primary, party_name[:1].upper() if party_name else None)


def extract_chamber_and_district(roles):
    """
    Extract the current chamber and district from the roles list.
    Roles have: type (upper/lower), district, jurisdiction, start_date, end_date.
    We pick the most recent role without an end_date, or the last role.
    """
    if not roles:
        return None, None

    # Prefer roles without an end_date (current roles)
    current_roles = [r for r in roles if not r.get("end_date")]
    if current_roles:
        role = current_roles[-1]
    else:
        role = roles[-1]

    chamber = role.get("type")  # "upper" or "lower"
    district = role.get("district")
    return chamber, district


def extract_state_from_jurisdiction(roles):
    """
    Extract two-letter state code from jurisdiction field.
    Jurisdiction looks like: ocd-jurisdiction/country:us/state:ny/government
    """
    if not roles:
        return None
    for role in roles:
        jurisdiction = role.get("jurisdiction", "")
        if "state:" in jurisdiction:
            # Extract "ny" from "ocd-jurisdiction/country:us/state:ny/government"
            parts = jurisdiction.split("state:")
            if len(parts) > 1:
                state_code = parts[1].split("/")[0].upper()
                if len(state_code) == 2:
                    return state_code
    return None


def parse_yaml_file(filepath):
    """Parse a single YAML legislator file and return a dict."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except Exception as e:
        log.warning(f"Failed to parse {filepath}: {e}")
        return None

    if not data or not isinstance(data, dict):
        return None

    ocd_id = data.get("id", "")
    name = data.get("name", "")
    if not ocd_id or not name:
        return None

    roles = data.get("roles", [])
    chamber, district = extract_chamber_and_district(roles)
    party = normalize_party(data.get("party", []))
    image = data.get("image", None)

    return {
        "ocd_id": ocd_id,
        "name": name,
        "chamber": chamber,
        "district": str(district) if district is not None else None,
        "party": party,
        "photo_url": image,
        "roles": roles,
    }


def import_state(session, data_dir, state_code, dry_run=False, include_retired=False):
    """
    Import legislators for a single state from YAML files.
    Returns (new_count, updated_count).
    """
    state_lower = state_code.lower()
    state_upper = state_code.upper()

    # Collect YAML files from legislature/ and optionally retired/
    dirs_to_scan = []

    legislature_dir = os.path.join(data_dir, "data", state_lower, "legislature")
    if os.path.isdir(legislature_dir):
        dirs_to_scan.append((legislature_dir, True))  # (path, is_active)
    else:
        log.warning(f"No legislature directory found for {state_upper} at {legislature_dir}")

    if include_retired:
        retired_dir = os.path.join(data_dir, "data", state_lower, "retired")
        if os.path.isdir(retired_dir):
            dirs_to_scan.append((retired_dir, False))

    if not dirs_to_scan:
        return 0, 0

    count_new = 0
    count_updated = 0
    count_skipped = 0

    for scan_dir, is_active in dirs_to_scan:
        yaml_files = glob.glob(os.path.join(scan_dir, "*.yml"))
        label = "active" if is_active else "retired"
        log.info(f"  [{state_upper}] Found {len(yaml_files)} {label} YAML files in {os.path.basename(scan_dir)}/")

        for filepath in yaml_files:
            parsed = parse_yaml_file(filepath)
            if not parsed:
                count_skipped += 1
                continue

            ocd_id = parsed["ocd_id"]
            dedupe = md5(ocd_id)

            # Try to get state from jurisdiction, fall back to directory name
            state_from_data = extract_state_from_jurisdiction(parsed.get("roles", []))
            final_state = state_from_data or state_upper

            if dry_run:
                count_new += 1
                continue

            existing = session.query(StateLegislator).filter_by(ocd_id=ocd_id).first()
            if existing:
                existing.name = parsed["name"]
                existing.state = final_state
                existing.chamber = parsed["chamber"]
                existing.party = parsed["party"]
                existing.district = parsed["district"]
                existing.photo_url = parsed["photo_url"]
                existing.is_active = is_active
                count_updated += 1
            else:
                session.add(StateLegislator(
                    ocd_id=ocd_id,
                    name=parsed["name"],
                    state=final_state,
                    chamber=parsed["chamber"],
                    party=parsed["party"],
                    district=parsed["district"],
                    photo_url=parsed["photo_url"],
                    is_active=is_active,
                    dedupe_hash=dedupe,
                ))
                count_new += 1

    if not dry_run:
        session.commit()

    if count_skipped:
        log.info(f"  [{state_upper}] Skipped {count_skipped} unparseable files")

    return count_new, count_updated


def main():
    parser = argparse.ArgumentParser(
        description="Bulk import state legislators from openstates/people YAML repo"
    )
    parser.add_argument(
        "--data-dir", type=str, required=True,
        help="Path to cloned openstates/people repo (e.g., /tmp/openstates-people)"
    )
    parser.add_argument(
        "--state", type=str, default=None,
        help="Two-letter state code to import (e.g., NY). Omit for all 50 states."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse files but don't write to database"
    )
    parser.add_argument(
        "--include-retired", action="store_true",
        help="Also import retired legislators (marked is_active=False)"
    )
    args = parser.parse_args()

    # Validate data-dir
    data_root = os.path.join(args.data_dir, "data")
    if not os.path.isdir(data_root):
        log.error(f"Data directory not found: {data_root}")
        log.error("Make sure --data-dir points to the cloned openstates/people repo root.")
        sys.exit(1)

    # Determine which states to import
    if args.state:
        states = [args.state.strip().upper()[:2]]
        if states[0].lower() not in ALL_STATES:
            log.warning(f"{states[0]} is not in the standard 50 states list, proceeding anyway...")
    else:
        states = [s.upper() for s in ALL_STATES]

    # Set up database
    engine = create_engine(DB_PATH, echo=False)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    log.info(f"Importing legislators from: {args.data_dir}")
    log.info(f"States to process: {len(states)}")
    if args.dry_run:
        log.info("DRY RUN — no data will be written")
    if args.include_retired:
        log.info("Including retired legislators")
    log.info("")

    # Track results per state
    results = {}
    total_new = 0
    total_updated = 0

    try:
        for state in sorted(states):
            new, updated = import_state(
                session, args.data_dir, state,
                dry_run=args.dry_run,
                include_retired=args.include_retired,
            )
            results[state] = (new, updated)
            total_new += new
            total_updated += updated
            log.info(f"  [{state}] {new} new, {updated} updated")

    except KeyboardInterrupt:
        log.warning("\nInterrupted! Committing what we have so far...")
        if not args.dry_run:
            session.commit()
    except Exception as e:
        log.error(f"Error during import: {e}")
        session.rollback()
        raise
    finally:
        session.close()

    # Print summary
    print("\n" + "=" * 60)
    print("IMPORT SUMMARY")
    print("=" * 60)
    print(f"{'State':<8} {'New':>8} {'Updated':>8} {'Total':>8}")
    print("-" * 60)
    for state in sorted(results.keys()):
        new, updated = results[state]
        if new + updated > 0:
            print(f"{state:<8} {new:>8} {updated:>8} {new + updated:>8}")
    print("-" * 60)
    print(f"{'TOTAL':<8} {total_new:>8} {total_updated:>8} {total_new + total_updated:>8}")
    print("=" * 60)

    if args.dry_run:
        print("\n(DRY RUN — no data was written to the database)")

    print(f"\nStates processed: {len(results)}")
    states_with_data = sum(1 for v in results.values() if v[0] + v[1] > 0)
    print(f"States with data: {states_with_data}")


if __name__ == "__main__":
    main()
