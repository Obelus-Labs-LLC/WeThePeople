"""
Member Management CLI
Manage tracked officials for accountability monitoring.

Usage:
  python manage_members.py list
  python manage_members.py add --person-id alexandria_ocasio_cortez --bioguide O000172 --name "Alexandria Ocasio-Cortez" --chamber house
  python manage_members.py bulk-load --preset high_impact_50
  python manage_members.py deactivate --person-id <id>
  python manage_members.py set-sources --person-id alexandria_ocasio_cortez --json-file data/aoc_sources.json
  python manage_members.py show-sources --all

Note: Aliases supported for common short handles (e.g., 'aoc' resolves to 'alexandria_ocasio_cortez')
"""
import argparse
import json
import sys
from models.database import SessionLocal, TrackedMember


# Person ID Aliases: Map short handles to canonical first_last person_ids
# Preserves CLI UX while maintaining DB consistency
PERSON_ID_ALIASES = {
    'aoc': 'alexandria_ocasio_cortez',
    # Add more common aliases as needed:
    # 'bernie': 'bernie_sanders',
    # 'warren': 'elizabeth_warren',
}

def resolve_person_id(person_id):
    """Resolve alias to canonical person_id if applicable."""
    canonical = PERSON_ID_ALIASES.get(person_id, person_id)
    if canonical != person_id:
        print(f"[ALIAS] Resolving '{person_id}' → '{canonical}'")
    return canonical


# High-impact 50: Curated list of current federal officials
# Mix of leadership, committee chairs, and high-visibility members
# IMPORTANT: Verify bioguide IDs are current (use validate_members.py)
HIGH_IMPACT_50 = [
    # House Leadership
    {"person_id": "mike_johnson", "bioguide": "J000299", "name": "Mike Johnson", "chamber": "house", "state": "LA", "party": "R"},  # Speaker
    {"person_id": "hakeem_jeffries", "bioguide": "J000294", "name": "Hakeem Jeffries", "chamber": "house", "state": "NY", "party": "D"},  # Minority Leader
    {"person_id": "steve_scalise", "bioguide": "S001176", "name": "Steve Scalise", "chamber": "house", "state": "LA", "party": "R"},  # Majority Leader
    {"person_id": "katherine_clark", "bioguide": "C001101", "name": "Katherine Clark", "chamber": "house", "state": "MA", "party": "D"},  # Minority Whip
    {"person_id": "tom_emmer", "bioguide": "E000294", "name": "Tom Emmer", "chamber": "house", "state": "MN", "party": "R"},  # Majority Whip
    
    # Senate Leadership
    {"person_id": "john_thune", "bioguide": "T000250", "name": "John Thune", "chamber": "senate", "state": "SD", "party": "R"},  # Majority Leader
    {"person_id": "chuck_schumer", "bioguide": "S000148", "name": "Chuck Schumer", "chamber": "senate", "state": "NY", "party": "D"},  # Minority Leader
    {"person_id": "john_barrasso", "bioguide": "B001261", "name": "John Barrasso", "chamber": "senate", "state": "WY", "party": "R"},  # Majority Whip
    {"person_id": "dick_durbin", "bioguide": "D000563", "name": "Dick Durbin", "chamber": "senate", "state": "IL", "party": "D"},  # Minority Whip
    
    # House Committee Chairs (Key)
    {"person_id": "jason_smith", "bioguide": "S001195", "name": "Jason Smith", "chamber": "house", "state": "MO", "party": "R"},  # Ways and Means
    {"person_id": "tom_cole", "bioguide": "C001053", "name": "Tom Cole", "chamber": "house", "state": "OK", "party": "R"},  # Appropriations
    {"person_id": "james_comer", "bioguide": "C001108", "name": "James Comer", "chamber": "house", "state": "KY", "party": "R"},  # Oversight
    {"person_id": "mike_rogers_al", "bioguide": "R000575", "name": "Mike Rogers", "chamber": "house", "state": "AL", "party": "R"},  # Armed Services
    {"person_id": "michael_mccaul", "bioguide": "M001157", "name": "Michael McCaul", "chamber": "house", "state": "TX", "party": "R"},  # Foreign Affairs
    {"person_id": "cathy_mcmorris_rodgers", "bioguide": "M001159", "name": "Cathy McMorris Rodgers", "chamber": "house", "state": "WA", "party": "R"},  # Energy & Commerce
    
    # House Ranking Members (Key)
    {"person_id": "richard_neal", "bioguide": "N000015", "name": "Richard Neal", "chamber": "house", "state": "MA", "party": "D"},  # Ways and Means
    {"person_id": "rosa_delauro", "bioguide": "D000216", "name": "Rosa DeLauro", "chamber": "house", "state": "CT", "party": "D"},  # Appropriations
    {"person_id": "jamie_raskin", "bioguide": "R000606", "name": "Jamie Raskin", "chamber": "house", "state": "MD", "party": "D"},  # Oversight
    {"person_id": "adam_smith", "bioguide": "S000510", "name": "Adam Smith", "chamber": "house", "state": "WA", "party": "D"},  # Armed Services
    {"person_id": "gregory_meeks", "bioguide": "M001137", "name": "Gregory Meeks", "chamber": "house", "state": "NY", "party": "D"},  # Foreign Affairs
    {"person_id": "frank_pallone", "bioguide": "P000034", "name": "Frank Pallone", "chamber": "house", "state": "NJ", "party": "D"},  # Energy & Commerce
    
    # Senate Committee Chairs (Key)
    {"person_id": "mike_crapo", "bioguide": "C000880", "name": "Mike Crapo", "chamber": "senate", "state": "ID", "party": "R"},  # Finance
    {"person_id": "susan_collins", "bioguide": "C001035", "name": "Susan Collins", "chamber": "senate", "state": "ME", "party": "R"},  # Appropriations
    {"person_id": "ron_johnson", "bioguide": "J000293", "name": "Ron Johnson", "chamber": "senate", "state": "WI", "party": "R"},  # Homeland Security
    {"person_id": "roger_wicker", "bioguide": "W000437", "name": "Roger Wicker", "chamber": "senate", "state": "MS", "party": "R"},  # Armed Services
    {"person_id": "jim_risch", "bioguide": "R000584", "name": "Jim Risch", "chamber": "senate", "state": "ID", "party": "R"},  # Foreign Relations
    {"person_id": "bill_cassidy", "bioguide": "C001075", "name": "Bill Cassidy", "chamber": "senate", "state": "LA", "party": "R"},  # HELP
    
    # Senate Ranking Members (Key)
    {"person_id": "ron_wyden", "bioguide": "W000779", "name": "Ron Wyden", "chamber": "senate", "state": "OR", "party": "D"},  # Finance
    {"person_id": "patty_murray", "bioguide": "M001111", "name": "Patty Murray", "chamber": "senate", "state": "WA", "party": "D"},  # Appropriations
    {"person_id": "gary_peters", "bioguide": "P000595", "name": "Gary Peters", "chamber": "senate", "state": "MI", "party": "D"},  # Homeland Security
    {"person_id": "jack_reed", "bioguide": "R000122", "name": "Jack Reed", "chamber": "senate", "state": "RI", "party": "D"},  # Armed Services
    {"person_id": "jeanne_shaheen", "bioguide": "S001181", "name": "Jeanne Shaheen", "chamber": "senate", "state": "NH", "party": "D"},  # Foreign Relations
    {"person_id": "bernie_sanders", "bioguide": "S000033", "name": "Bernie Sanders", "chamber": "senate", "state": "VT", "party": "I"},  # HELP
    
    # High-Visibility Progressive Voices
    {"person_id": "aoc", "bioguide": "O000172", "name": "Alexandria Ocasio-Cortez", "chamber": "house", "state": "NY", "party": "D"},
    {"person_id": "ilhan_omar", "bioguide": "O000173", "name": "Ilhan Omar", "chamber": "house", "state": "MN", "party": "D"},
    {"person_id": "rashida_tlaib", "bioguide": "T000481", "name": "Rashida Tlaib", "chamber": "house", "state": "MI", "party": "D"},
    {"person_id": "ayanna_pressley", "bioguide": "P000617", "name": "Ayanna Pressley", "chamber": "house", "state": "MA", "party": "D"},
    {"person_id": "pramila_jayapal", "bioguide": "J000298", "name": "Pramila Jayapal", "chamber": "house", "state": "WA", "party": "D"},
    {"person_id": "elizabeth_warren", "bioguide": "W000817", "name": "Elizabeth Warren", "chamber": "senate", "state": "MA", "party": "D"},
    
    # High-Visibility Conservative Voices
    {"person_id": "marjorie_taylor_greene", "bioguide": "G000596", "name": "Marjorie Taylor Greene", "chamber": "house", "state": "GA", "party": "R"},
    {"person_id": "matt_gaetz", "bioguide": "G000578", "name": "Matt Gaetz", "chamber": "house", "state": "FL", "party": "R"},
    {"person_id": "lauren_boebert", "bioguide": "B000825", "name": "Lauren Boebert", "chamber": "house", "state": "CO", "party": "R"},
    {"person_id": "chip_roy", "bioguide": "R000614", "name": "Chip Roy", "chamber": "house", "state": "TX", "party": "R"},
    {"person_id": "jim_jordan", "bioguide": "J000289", "name": "Jim Jordan", "chamber": "house", "state": "OH", "party": "R"},
    {"person_id": "ted_cruz", "bioguide": "C001098", "name": "Ted Cruz", "chamber": "senate", "state": "TX", "party": "R"},
    {"person_id": "josh_hawley", "bioguide": "H001089", "name": "Josh Hawley", "chamber": "senate", "state": "MO", "party": "R"},
    {"person_id": "rand_paul", "bioguide": "P000603", "name": "Rand Paul", "chamber": "senate", "state": "KY", "party": "R"},
    
    # Swing/Moderate Voices
    {"person_id": "lisa_murkowski", "bioguide": "M001153", "name": "Lisa Murkowski", "chamber": "senate", "state": "AK", "party": "R"},
    {"person_id": "joe_manchin", "bioguide": "M001183", "name": "Joe Manchin", "chamber": "senate", "state": "WV", "party": "D"},
    {"person_id": "kyrsten_sinema", "bioguide": "S001191", "name": "Kyrsten Sinema", "chamber": "senate", "state": "AZ", "party": "I"},
    {"person_id": "mitt_romney", "bioguide": "R000615", "name": "Mitt Romney", "chamber": "senate", "state": "UT", "party": "R"},
]


def list_members(active_only=True):
    """List all tracked members."""
    db = SessionLocal()
    try:
        query = db.query(TrackedMember)
        if active_only:
            query = query.filter(TrackedMember.is_active == 1)
        
        members = query.order_by(TrackedMember.chamber, TrackedMember.display_name).all()
        
        if not members:
            print("No tracked members found.")
            return
        
        print("=" * 100)
        print("TRACKED MEMBERS")
        print("=" * 100)
        print(f"{'ID':<25} {'Name':<30} {'Chamber':<10} {'State':<6} {'Party':<6} {'Bioguide':<12} {'Active'}")
        print("-" * 100)
        
        for member in members:
            active_str = "Y" if member.is_active else "N"
            print(f"{member.person_id:<25} {member.display_name:<30} {member.chamber:<10} {member.state or 'N/A':<6} {member.party or 'N/A':<6} {member.bioguide_id:<12} {active_str}")
        
        print("-" * 100)
        print(f"Total: {len(members)} members")
        print("=" * 100)
        
    finally:
        db.close()


def add_member(person_id, bioguide_id, name, chamber, state=None, party=None):
    """Add a single member."""
    db = SessionLocal()
    try:
        # Check if already exists
        existing = db.query(TrackedMember).filter(
            (TrackedMember.person_id == person_id) | (TrackedMember.bioguide_id == bioguide_id)
        ).first()
        
        if existing:
            print(f"[SKIP] Member already exists: {existing.display_name} ({existing.person_id})")
            return False
        
        member = TrackedMember(
            person_id=person_id,
            bioguide_id=bioguide_id,
            display_name=name,
            chamber=chamber.lower(),
            state=state,
            party=party,
            is_active=1
        )
        db.add(member)
        db.commit()
        
        print(f"[OK] Added: {name} ({person_id})")
        return True
        
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error adding member: {e}")
        return False
    finally:
        db.close()


def bulk_load_preset(preset_name):
    """Bulk load a preset list of members."""
    if preset_name == "high_impact_50":
        members_data = HIGH_IMPACT_50
    else:
        print(f"[ERROR] Unknown preset: {preset_name}")
        print("Available presets: high_impact_50")
        return
    
    print("=" * 70)
    print(f"BULK LOADING PRESET: {preset_name}")
    print("=" * 70)
    print(f"Members to load: {len(members_data)}")
    print()
    
    added = 0
    skipped = 0
    
    for data in members_data:
        success = add_member(
            person_id=data["person_id"],
            bioguide_id=data["bioguide"],
            name=data["name"],
            chamber=data["chamber"],
            state=data.get("state"),
            party=data.get("party")
        )
        if success:
            added += 1
        else:
            skipped += 1
    
    print()
    print("=" * 70)
    print(f"SUMMARY:")
    print(f"  Added: {added}")
    print(f"  Skipped (already exists): {skipped}")
    print(f"  Total: {len(members_data)}")
    print("=" * 70)


def deactivate_member(person_id):
    """Deactivate a member (soft delete)."""
    person_id = resolve_person_id(person_id)
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        
        if not member:
            print(f"[ERROR] Member not found: {person_id}")
            return False
        
        if member.is_active == 0:
            print(f"[INFO] Member already inactive: {member.display_name}")
            return False
        
        member.is_active = 0
        db.commit()
        
        print(f"[OK] Deactivated: {member.display_name} ({person_id})")
        return True
        
    finally:
        db.close()


def activate_member(person_id):
    """Reactivate a member."""
    person_id = resolve_person_id(person_id)
    db = SessionLocal()
    try:
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        
        if not member:
            print(f"[ERROR] Member not found: {person_id}")
            return False
        
        if member.is_active == 1:
            print(f"[INFO] Member already active: {member.display_name}")
            return False
        
        member.is_active = 1
        db.commit()
        
        print(f"[OK] Activated: {member.display_name} ({person_id})")
        return True
        
    finally:
        db.close()


def set_sources(person_id: str, json_file: str):
    """Set claim sources from JSON file."""
    person_id = resolve_person_id(person_id)
    db = SessionLocal()
    
    try:
        # Load JSON file
        try:
            with open(json_file, 'r') as f:
                sources = json.load(f)
        except FileNotFoundError:
            print(f"[!] Error: File not found: {json_file}")
            return False
        except json.JSONDecodeError as e:
            print(f"[!] Error: Invalid JSON: {e}")
            return False
        
        # Validate JSON structure
        if not isinstance(sources, list):
            print("[!] Error: JSON must be a list of source objects")
            return False
        
        for source in sources:
            if not isinstance(source, dict) or 'url' not in source:
                print("[!] Error: Each source must be an object with 'url' field")
                return False
        
        # Find member
        member = db.query(TrackedMember).filter(TrackedMember.person_id == person_id).first()
        if not member:
            print(f"[!] Error: Member not found: {person_id}")
            return False
        
        # Update sources
        member.claim_sources_json = json.dumps(sources)
        db.commit()
        
        print(f"[OK] Updated claim sources for {member.display_name} ({person_id})")
        print(f"     Sources: {len(sources)}")
        for source in sources:
            print(f"     - [{source.get('type', 'unknown')}] {source['url']}")
        
        return True
        
    finally:
        db.close()


def show_sources(person_id: str = None, show_all: bool = False):
    """Display claim sources for member(s)."""
    if person_id:
        person_id = resolve_person_id(person_id)
    
    db = SessionLocal()
    
    try:
        # Build query
        query = db.query(TrackedMember).filter(TrackedMember.is_active == 1)
        if person_id:
            query = query.filter(TrackedMember.person_id == person_id)
        
        members = query.all()
        
        if not members:
            print(f"[!] No members found")
            return
        
        print("=" * 70)
        print("CLAIM SOURCES")
        print("=" * 70)
        print()
        
        for member in members:
            print(f"[{member.person_id}] {member.display_name}")
            
            if member.claim_sources_json:
                try:
                    sources = json.loads(member.claim_sources_json)
                    print(f"  Sources: {len(sources)}")
                    for source in sources:
                        print(f"    - [{source.get('type', 'unknown')}] {source.get('url')}")
                except json.JSONDecodeError:
                    print("  [!] Invalid JSON")
            else:
                print("  No sources configured")
            
            print()
        
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage tracked members")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # list command
    list_parser = subparsers.add_parser("list", help="List all tracked members")
    list_parser.add_argument("--all", action="store_true", help="Include inactive members")
    
    # add command
    add_parser = subparsers.add_parser("add", help="Add a single member")
    add_parser.add_argument("--person-id", required=True, help="Internal person ID (e.g., 'aoc')")
    add_parser.add_argument("--bioguide", required=True, help="Bioguide ID (e.g., 'O000172')")
    add_parser.add_argument("--name", required=True, help="Display name")
    add_parser.add_argument("--chamber", required=True, choices=["house", "senate"], help="Chamber")
    add_parser.add_argument("--state", help="State (e.g., 'NY')")
    add_parser.add_argument("--party", help="Party (D/R/I)")
    
    # bulk-load command
    bulk_parser = subparsers.add_parser("bulk-load", help="Bulk load a preset")
    bulk_parser.add_argument("--preset", required=True, help="Preset name (e.g., 'high_impact_50')")
    
    # deactivate command
    deactivate_parser = subparsers.add_parser("deactivate", help="Deactivate a member")
    deactivate_parser.add_argument("--person-id", required=True, help="Person ID to deactivate")
    
    # activate command
    activate_parser = subparsers.add_parser("activate", help="Activate a member")
    activate_parser.add_argument("--person-id", required=True, help="Person ID to activate")
    
    # set-sources command
    sources_parser = subparsers.add_parser("set-sources", help="Set claim sources from JSON file")
    sources_parser.add_argument("--person-id", required=True, help="Person ID")
    sources_parser.add_argument("--json-file", required=True, help="Path to JSON file with sources")
    
    # show-sources command
    show_sources_parser = subparsers.add_parser("show-sources", help="Show claim sources")
    show_sources_parser.add_argument("--person-id", help="Show sources for specific person")
    show_sources_parser.add_argument("--all", action="store_true", help="Show all members")
    
    args = parser.parse_args()
    
    if args.command == "list":
        list_members(active_only=not args.all)
    
    elif args.command == "add":
        add_member(
            person_id=args.person_id,
            bioguide_id=args.bioguide,
            name=args.name,
            chamber=args.chamber,
            state=args.state,
            party=args.party
        )
    
    elif args.command == "bulk-load":
        bulk_load_preset(args.preset)
    
    elif args.command == "deactivate":
        deactivate_member(args.person_id)
    
    elif args.command == "activate":
        activate_member(args.person_id)
    
    elif args.command == "set-sources":
        set_sources(args.person_id, args.json_file)
    
    elif args.command == "show-sources":
        if not args.person_id and not args.all:
            print("[!] Error: Must specify --person-id or --all")
        else:
            show_sources(person_id=args.person_id, show_all=args.all)
    
    else:
        parser.print_help()
