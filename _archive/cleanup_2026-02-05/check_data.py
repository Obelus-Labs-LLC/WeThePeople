import sqlite3

c = sqlite3.connect('wethepeople.db')

# Check AOC actions
aoc_count = c.execute("SELECT COUNT(*) FROM actions WHERE person_id='aoc'").fetchone()[0]
print(f'AOC actions: {aoc_count}')

# Check claim categories
claims = c.execute('SELECT id, category, person_id FROM claims').fetchall()
print(f'\nClaims:')
for claim_id, cat, person in claims:
    print(f'  Claim {claim_id}: category={cat}, person={person}')

c.close()
