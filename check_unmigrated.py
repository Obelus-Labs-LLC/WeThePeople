import sqlite3

conn = sqlite3.connect('wethepeople.db')
cursor = conn.cursor()

# Check for unmigrated IDs
unmigrated = ['kathy_castor', 'richard_hudson', 'walkinshaw']
print("Checking unmigrated person_ids in actions:")
for pid in unmigrated:
    cursor.execute("SELECT COUNT(*) FROM actions WHERE person_id = ?", (pid,))
    count = cursor.fetchone()[0]
    print(f"  {pid}: {count} actions")

# Check if they exist in tracked_members
print("\nChecking tracked_members:")
for pid in unmigrated:
    cursor.execute("SELECT person_id, bioguide_id FROM tracked_members WHERE person_id = ?", (pid,))
    result = cursor.fetchone()
    if result:
        print(f"  {pid}: EXISTS (bioguide: {result[1]})")
    else:
        print(f"  {pid}: NOT FOUND")

# Check for data directories
print("\nChecking data/raw/congress directories:")
import os
raw_dir = "data/raw/congress"
if os.path.exists(raw_dir):
    dirs = [d for d in os.listdir(raw_dir) if 'castor' in d or 'hudson' in d or 'walkinshaw' in d]
    print(f"  Found: {dirs}")

conn.close()
