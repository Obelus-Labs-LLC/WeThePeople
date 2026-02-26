import sqlite3

c = sqlite3.connect('wethepeople.db')

print('Non-none evals:', c.execute("SELECT COUNT(*) FROM claim_evaluations WHERE tier != 'none'").fetchone()[0])
print('Latest eval updated_at:', c.execute("SELECT MAX(updated_at) FROM claim_evaluations").fetchone()[0])
print('AOC non-none:', c.execute("SELECT COUNT(*) FROM claim_evaluations ce JOIN claims c ON ce.claim_id=c.id WHERE c.person_id='alexandria_ocasio_cortez' AND ce.tier!='none'").fetchone()[0])

c.close()
