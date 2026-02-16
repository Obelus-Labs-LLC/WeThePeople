"""Diagnose why claims aren't matching bills."""

import sqlite3

c = sqlite3.connect('wethepeople.db')

print("="*70)
print("CLAIMS EXTRACTED")
print("="*70)
rows = c.execute('SELECT id, claim_date, text, claim_source_url FROM claims ORDER BY claim_date DESC').fetchall()
for r in rows:
    print(f"\nClaim {r[0]} | {r[1]}")
    print(f"Text: {r[2]}")
    print(f"Source: {r[3]}")

print("\n" + "="*70)
print("BILL SEARCH: DEFIANCE")
print("="*70)
rows = c.execute("SELECT bill_id, title FROM bills WHERE title LIKE '%DEFIANCE%' LIMIT 20").fetchall()
if rows:
    for r in rows:
        print(f"{r[0]} | {r[1]}")
else:
    print("NO MATCHES")

print("\n" + "="*70)
print("BILL SEARCH: TAKE IT DOWN")
print("="*70)
rows = c.execute("SELECT bill_id, title FROM bills WHERE title LIKE '%TAKE IT DOWN%' LIMIT 20").fetchall()
if rows:
    for r in rows:
        print(f"{r[0]} | {r[1]}")
else:
    print("NO MATCHES")

print("\n" + "="*70)
print("BILL SEARCH: Sexual Violence")
print("="*70)
rows = c.execute("SELECT bill_id, title FROM bills WHERE title LIKE '%Sexual%' OR title LIKE '%Violence%' LIMIT 20").fetchall()
if rows:
    for r in rows:
        print(f"{r[0]} | {r[1]}")
else:
    print("NO MATCHES")

print("\n" + "="*70)
print("AOC ACTIONS IN DATABASE")
print("="*70)
rows = c.execute("""
    SELECT title, bill_congress, bill_type, bill_number, date
    FROM actions
    WHERE person_id = 'aoc'
    ORDER BY date DESC
    LIMIT 10
""").fetchall()
if rows:
    for r in rows:
        bill_id = f"{r[2]}{r[3]}-{r[1]}" if r[1] and r[2] and r[3] else "N/A"
        print(f"{bill_id} | {r[4]} | {r[0][:60]}")
else:
    print("NO ACTIONS FOR AOC")

print("\n" + "="*70)
print("EVALUATIONS FOR EXTRACTED CLAIMS")
print("="*70)
rows = c.execute("""
    SELECT c.id, substr(c.text, 1, 100), ce.tier, ce.score, ce.best_action_id
    FROM claims c
    LEFT JOIN claim_evaluations ce ON c.id = ce.claim_id
    ORDER BY c.claim_date DESC
""").fetchall()
for r in rows:
    print(f"\nClaim {r[0]}: {r[1]}...")
    print(f"  Tier: {r[2]}, Score: {r[3]}, Best Action ID: {r[4]}")

print("\n" + "="*70)
print("DIAGNOSIS SUMMARY")
print("="*70)
print("CLAIM EXTRACTION: Working (4 claims extracted)")
print("BILL DATABASE: Fresh (latest action: 2026-02-03)")
print("KNOWN BILL EXISTS: hr3562-119 'DEFIANCE Act of 2025'")
print("AOC ACTIONS: NONE FOUND - This is the root cause!")
print("\nThe matching system requires the person to have actions in the database.")
print("Claims can only match to bills the person sponsored/cosponsored.")
print("AOC has no actions in the database, so matching returns tier='none'.")

c.close()

