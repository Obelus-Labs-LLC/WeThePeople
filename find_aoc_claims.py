import sqlite3

c = sqlite3.connect('wethepeople.db')
rows = c.execute("SELECT id, substr(text,1,120), claim_source_url FROM claims WHERE person_id='alexandria_ocasio_cortez' ORDER BY id").fetchall()

print("AOC Claims:")
for r in rows:
    print(f"{r[0]} | {r[1]}... | ...{r[2][-60:]}")

c.close()
