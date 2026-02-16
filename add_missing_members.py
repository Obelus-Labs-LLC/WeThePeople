import sqlite3

# Members to add (from actions data but not in tracked_members)
members_to_add = [
    ('kathy_castor', 'C001066', 'Kathy Castor', 'house', 'FL', 'D'),
    ('richard_hudson', 'H001067', 'Richard Hudson', 'house', 'NC', 'R'),
    ('walkinshaw', 'W000000', 'Walkinshaw', 'house', None, None)  # Placeholder bioguide
]

conn = sqlite3.connect('wethepeople.db')
cursor = conn.cursor()

print("Adding missing members to tracked_members...")
for person_id, bioguide_id, display_name, chamber, state, party in members_to_add:
    # Check if already exists
    cursor.execute("SELECT person_id FROM tracked_members WHERE person_id = ?", (person_id,))
    if cursor.fetchone():
        print(f"  {person_id}: already exists")
    else:
        cursor.execute("""
            INSERT INTO tracked_members (person_id, bioguide_id, display_name, chamber, state, party, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        """, (person_id, bioguide_id, display_name, chamber, state, party))
        print(f"  {person_id}: added (inactive)")

conn.commit()
print("\nValidating...")
cursor.execute("SELECT COUNT(*) FROM tracked_members")
total = cursor.fetchone()[0]
print(f"Total tracked_members: {total}")

conn.close()
