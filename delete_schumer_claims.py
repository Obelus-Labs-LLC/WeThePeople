import sqlite3

c = sqlite3.connect('wethepeople.db')

# Delete evaluations first (foreign key)
evals_deleted = c.execute("DELETE FROM claim_evaluations WHERE claim_id IN (SELECT id FROM claims WHERE person_id='chuck_schumer')").rowcount
c.commit()

# Delete claims
claims_deleted = c.execute("DELETE FROM claims WHERE person_id='chuck_schumer'").rowcount
c.commit()

print(f'Deleted {evals_deleted} evaluations')
print(f'Deleted {claims_deleted} Schumer claims')

# Verify
remaining = c.execute("SELECT COUNT(*) FROM claims WHERE person_id='chuck_schumer'").fetchone()[0]
print(f'Remaining Schumer claims: {remaining}')

c.close()
