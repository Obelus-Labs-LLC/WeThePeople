import sqlite3
import json

c = sqlite3.connect('wethepeople.db')

print("=" * 80)
print("BILL_REFS_JSON VERIFICATION")
print("=" * 80)

# Check Schumer claims
print("\nSCHUMER CLAIMS:")
cursor = c.execute("""
    SELECT id, text, bill_refs_json, claim_source_url 
    FROM claims 
    WHERE person_id='chuck_schumer' 
    LIMIT 5
""")

for cid, text, bill_refs_json, url in cursor.fetchall():
    print(f"\nClaim #{cid}:")
    print(f"  Text: {text[:80]}...")
    print(f"  URL: {url[:80]}...")
    if bill_refs_json:
        refs = json.loads(bill_refs_json)
        print(f"  Bill refs (display): {refs.get('display', [])}")
        print(f"  Bill refs (normalized): {refs.get('normalized', [])}")
    else:
        print(f"  Bill refs: NULL")

# Count bills extracted
cursor = c.execute("SELECT COUNT(*) FROM claims WHERE person_id='chuck_schumer' AND bill_refs_json IS NOT NULL")
with_refs = cursor.fetchone()[0]
cursor = c.execute("SELECT COUNT(*) FROM claims WHERE person_id='chuck_schumer'")
total = cursor.fetchone()[0]

print(f"\nSchumer claims with bill_refs: {with_refs}/{total}")

# Check Wyden
print("\n" + "=" * 80)
print("WYDEN CLAIMS:")
cursor = c.execute("""
    SELECT id, text, bill_refs_json
    FROM claims
    WHERE person_id='ron_wyden' AND bill_refs_json IS NOT NULL
    LIMIT 3
""")

for cid, text, bill_refs_json in cursor.fetchall():
    refs = json.loads(bill_refs_json)
    print(f"\nClaim #{cid}:")
    print(f"  Text: {text[:80]}...")
    print(f"  Bill refs (display): {refs.get('display', [])}")
    print(f"  Bill refs (normalized): {refs.get('normalized', [])}")

c.close()
