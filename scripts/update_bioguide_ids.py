"""
Bioguide ID Mapping for Tracked Members

Updates tracked_members with bioguide_ids for existing members.
Bioguide IDs are from Congress.gov - the canonical source.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from models.database import SessionLocal, TrackedMember

# Bioguide ID mappings (from Congress.gov)
BIOGUIDE_MAP = {
    'alexandria_ocasio_cortez': 'O000172',
    'bernie_sanders': 'S000033',
    'chuck_schumer': 'S000148',
    'elizabeth_warren': 'W000817',
    'ron_wyden': 'W000779',
    'amy_klobuchar': 'K000367',
    'pramila_jayapal': 'J000298',
    'ilhan_omar': 'O000173',
    'rashida_tlaib': 'T000481',
    'ayanna_pressley': 'P000617',
    # Add more as needed
}

db = SessionLocal()

print("Updating bioguide_ids for tracked members...")
print()

updated = 0
missing = []

members = db.query(TrackedMember).all()

for member in members:
    if member.person_id in BIOGUIDE_MAP:
        bioguide = BIOGUIDE_MAP[member.person_id]
        if member.bioguide_id != bioguide:
            print(f"✓ {member.person_id}: {member.bioguide_id or 'NULL'} → {bioguide}")
            member.bioguide_id = bioguide
            updated += 1
    else:
        if not member.bioguide_id:
            print(f"⚠️  {member.person_id}: No bioguide_id in map")
            missing.append(member.person_id)

if updated > 0:
    db.commit()
    print(f"\n✓ Updated {updated} members")
else:
    print("No updates needed")

if missing:
    print(f"\n⚠️  {len(missing)} members missing bioguide_id:")
    for pid in missing:
        print(f"  - {pid}")
    print("\nFind bioguide IDs at: https://bioguide.congress.gov/")

db.close()
