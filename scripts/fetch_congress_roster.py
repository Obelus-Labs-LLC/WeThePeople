"""
Fetch the full current Congress roster from Congress.gov API v3.
Generates data/congress_119_seed.json for bulk-loading into TrackedMember.

Usage:
  python scripts/fetch_congress_roster.py
"""
import os
import sys
import json
import time
import unicodedata
import re
from pathlib import Path
from collections import Counter

# Add project root to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from connectors.congress import robust_get, HEADERS
from models.database import SessionLocal, TrackedMember
from dotenv import load_dotenv

load_dotenv()

# Full state name → abbreviation mapping
STATE_ABBREVS = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
    # Territories / non-voting delegates
    "District of Columbia": "DC", "Puerto Rico": "PR", "Guam": "GU",
    "American Samoa": "AS", "U.S. Virgin Islands": "VI",
    "Northern Mariana Islands": "MP",
}

PARTY_MAP = {
    "Democratic": "D",
    "Republican": "R",
    "Independent": "I",
    "Libertarian": "L",
}

SUFFIX_PATTERN = re.compile(
    r",?\s*(Jr\.?|Sr\.?|III|IV|II|I|V|Esq\.?|M\.?D\.?|Ph\.?D\.?)$",
    re.IGNORECASE
)


def strip_diacritics(text):
    """Remove accented characters: André → Andre"""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def generate_person_id(display_name):
    """
    Generate a person_id slug from a display name.

    Rules:
      1. Strip suffixes (Jr., III, etc.)
      2. Remove diacritics
      3. Lowercase, replace hyphens/spaces with underscores
      4. Remove punctuation (periods, commas, apostrophes, quotes)
      5. Collapse multiple underscores
    """
    name = display_name.strip()
    # Strip suffixes
    name = SUFFIX_PATTERN.sub("", name).strip()
    # Remove diacritics
    name = strip_diacritics(name)
    # Remove nicknames in quotes: Robert "Bobby" Scott → Robert Scott
    name = re.sub(r'"[^"]*"', "", name).strip()
    name = re.sub(r"'[^']*'", "", name).strip()
    # Lowercase
    name = name.lower()
    # Replace hyphens and spaces with underscores
    name = name.replace("-", "_").replace(" ", "_")
    # Remove punctuation
    name = re.sub(r"[^a-z0-9_]", "", name)
    # Collapse multiple underscores
    name = re.sub(r"_+", "_", name).strip("_")
    return name


def parse_name_from_api(member_data):
    """
    Extract display name from Congress.gov API member data.
    API may return name as "Last, First" or provide firstName/lastName fields.
    """
    # Try direct fields first
    first = member_data.get("firstName", "")
    last = member_data.get("lastName", "")
    if first and last:
        return f"{first} {last}"

    # Try directOrderName
    direct = member_data.get("directOrderName", "")
    if direct:
        return direct.strip()

    # Fall back to "Last, First" format in name field
    name = member_data.get("name", "")
    if "," in name:
        parts = name.split(",", 1)
        return f"{parts[1].strip()} {parts[0].strip()}"

    return name.strip()


def get_chamber_from_terms(member_data):
    """Extract current chamber from the member's terms."""
    terms = member_data.get("terms", {})
    items = terms.get("item", [])
    if not items:
        return "house"  # Default fallback

    # Get the most recent term (last in list)
    latest = items[-1]
    chamber_raw = latest.get("chamber", "")

    if "Senate" in chamber_raw:
        return "senate"
    return "house"


def fetch_all_current_members():
    """Fetch all current members from Congress.gov API v3."""
    base_url = "https://api.congress.gov/v3/member"
    all_members = []
    limit = 250
    offset = 0

    print("Fetching current Congress roster from Congress.gov API...")

    while True:
        params = {
            "format": "json",
            "currentMember": "true",
            "limit": limit,
            "offset": offset,
        }

        r = robust_get(base_url, HEADERS, params)
        if not r or r.status_code != 200:
            print(f"  ERROR: API returned {r.status_code if r else 'None'} at offset {offset}")
            break

        data = r.json()
        members = data.get("members", [])

        if not members:
            break

        all_members.extend(members)
        print(f"  Fetched {len(all_members)} members so far...")

        # Check for more pages
        pagination = data.get("pagination", {})
        next_url = pagination.get("next")
        if not next_url or len(members) < limit:
            break

        offset += limit
        time.sleep(0.5)  # Polite delay

    print(f"  Total fetched: {len(all_members)} members")
    return all_members


def load_existing_members():
    """Load existing TrackedMember bioguide_id → person_id mapping."""
    db = SessionLocal()
    try:
        members = db.query(TrackedMember).all()
        return {m.bioguide_id: m.person_id for m in members}
    except Exception as e:
        print(f"  Warning: Could not load existing members: {e}")
        return {}
    finally:
        db.close()


def build_seed(api_members, existing_map):
    """Transform API response into seed JSON entries."""
    seed = []

    for m in api_members:
        bioguide = m.get("bioguideId", "")
        if not bioguide:
            continue

        display_name = parse_name_from_api(m)
        if not display_name:
            print(f"  WARNING: No name for {bioguide}, skipping")
            continue

        # State
        state_full = m.get("state", "")
        state = STATE_ABBREVS.get(state_full, state_full[:2].upper() if state_full else None)

        # Party
        party_full = m.get("partyName", "")
        party = PARTY_MAP.get(party_full, party_full[:1] if party_full else None)

        # Chamber
        chamber = get_chamber_from_terms(m)

        # Person ID: use existing if this bioguide is already tracked
        if bioguide in existing_map:
            person_id = existing_map[bioguide]
        else:
            person_id = generate_person_id(display_name)

        # Photo URL from official bioguide
        photo_url = f"https://bioguide.congress.gov/bioguide/photo/{bioguide[0]}/{bioguide}.jpg"

        seed.append({
            "person_id": person_id,
            "bioguide_id": bioguide,
            "display_name": display_name,
            "chamber": chamber,
            "state": state,
            "party": party,
            "photo_url": photo_url,
        })

    return seed


def resolve_collisions(seed):
    """Detect and resolve person_id collisions by appending state code."""
    id_counts = Counter(entry["person_id"] for entry in seed)
    duplicates = {pid for pid, count in id_counts.items() if count > 1}

    if not duplicates:
        print("  No person_id collisions detected.")
        return seed

    print(f"  Resolving {len(duplicates)} person_id collisions:")
    for pid in sorted(duplicates):
        colliders = [e for e in seed if e["person_id"] == pid]
        print(f"    {pid}: {', '.join(e['display_name'] + ' (' + (e['state'] or '?') + ')' for e in colliders)}")
        for entry in colliders:
            state = entry.get("state", "").lower()
            if state:
                entry["person_id"] = f"{pid}_{state}"
            else:
                entry["person_id"] = f"{pid}_{entry['bioguide_id'].lower()}"

    # Check for any remaining collisions (extremely unlikely)
    id_counts2 = Counter(entry["person_id"] for entry in seed)
    still_duped = {pid for pid, count in id_counts2.items() if count > 1}
    if still_duped:
        print(f"  WARNING: Still have collisions after state resolution: {still_duped}")
        # Last resort: append bioguide_id
        for pid in still_duped:
            for entry in seed:
                if entry["person_id"] == pid:
                    entry["person_id"] = f"{pid}_{entry['bioguide_id'].lower()}"

    return seed


def main():
    # Step 1: Load existing members from DB
    print("\n" + "=" * 60)
    print("STEP 1: Loading existing tracked members")
    print("=" * 60)
    existing_map = load_existing_members()
    print(f"  Found {len(existing_map)} existing members in DB")

    # Step 2: Fetch all current members from Congress.gov
    print("\n" + "=" * 60)
    print("STEP 2: Fetching current Congress roster")
    print("=" * 60)
    api_members = fetch_all_current_members()

    if not api_members:
        print("ERROR: No members fetched. Check API key and connectivity.")
        sys.exit(1)

    # Step 3: Build seed entries
    print("\n" + "=" * 60)
    print("STEP 3: Building seed file")
    print("=" * 60)
    seed = build_seed(api_members, existing_map)
    print(f"  Generated {len(seed)} seed entries")

    # Step 4: Resolve collisions
    print("\n" + "=" * 60)
    print("STEP 4: Resolving person_id collisions")
    print("=" * 60)
    seed = resolve_collisions(seed)

    # Step 5: Final validation
    print("\n" + "=" * 60)
    print("STEP 5: Validation")
    print("=" * 60)

    # Check uniqueness
    person_ids = [e["person_id"] for e in seed]
    bioguide_ids = [e["bioguide_id"] for e in seed]

    pid_dupes = [pid for pid, count in Counter(person_ids).items() if count > 1]
    bio_dupes = [bid for bid, count in Counter(bioguide_ids).items() if count > 1]

    if pid_dupes:
        print(f"  ERROR: Duplicate person_ids: {pid_dupes}")
        sys.exit(1)
    if bio_dupes:
        print(f"  ERROR: Duplicate bioguide_ids: {bio_dupes}")
        sys.exit(1)

    print(f"  All {len(seed)} person_ids are unique")
    print(f"  All {len(seed)} bioguide_ids are unique")

    # Stats
    chambers = Counter(e["chamber"] for e in seed)
    parties = Counter(e["party"] for e in seed)
    existing_count = sum(1 for e in seed if e["bioguide_id"] in existing_map)
    new_count = len(seed) - existing_count

    print(f"\n  Chambers: {dict(chambers)}")
    print(f"  Parties:  {dict(parties)}")
    print(f"  Existing members (will be skipped): {existing_count}")
    print(f"  New members to add: {new_count}")

    # Step 6: Write seed file
    out_path = ROOT / "data" / "congress_119_seed.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Sort by chamber then display_name for readability
    seed.sort(key=lambda e: (e["chamber"], e["display_name"]))

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(seed, f, indent=2, ensure_ascii=False)

    print(f"\n  Seed file written to: {out_path}")
    print(f"  Total entries: {len(seed)}")
    print("\nDone! Run: python manage_members.py bulk-load --seed-file data/congress_119_seed.json")


if __name__ == "__main__":
    main()
