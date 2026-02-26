import sqlite3

conn = sqlite3.connect('wethepeople.db')
cursor = conn.cursor()

print("=" * 80)
print("TEXT LENGTH ANALYSIS - Checking for truncation")
print("=" * 80)

for person_id in ['chuck_schumer', 'ron_wyden']:
    print(f"\n{person_id.upper().replace('_', ' ')}:")
    cursor.execute("""
        SELECT id, text, LENGTH(text) as len
        FROM claims
        WHERE person_id = ?
        ORDER BY id
        LIMIT 5
    """, (person_id,))
    
    for cid, text, length in cursor.fetchall():
        # Count words
        words = len(text.split())
        print(f"\nClaim #{cid}:")
        print(f"  Length: {length} chars, {words} words")
        print(f"  Text: {text}")

conn.close()
