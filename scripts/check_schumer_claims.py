import sqlite3

c = sqlite3.connect('wethepeople.db')

print('Schumer claims total:', c.execute("SELECT COUNT(*) FROM claims WHERE person_id='chuck_schumer'").fetchone()[0])
print('Schumer claims with bill_refs_json:', c.execute("SELECT COUNT(*) FROM claims WHERE person_id='chuck_schumer' AND bill_refs_json IS NOT NULL").fetchone()[0])
print('Sample urls:')
for url in c.execute("SELECT claim_source_url FROM claims WHERE person_id='chuck_schumer' LIMIT 5").fetchall():
    print('  ', url[0])

c.close()
