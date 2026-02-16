"""Diagnose whether DEFIANCE Act is linked to AOC in database."""

import sqlite3

c = sqlite3.connect('wethepeople.db')

print("="*70)
print("1. BILL EXISTS CHECK")
print("="*70)
result = c.execute("SELECT bill_id, title FROM bills WHERE bill_id='hr3562-119'").fetchall()
print(f"Bill exists: {len(result) > 0}")
if result:
    print(f"  {result[0][0]} | {result[0][1]}")

print("\n" + "="*70)
print("2. AOC BIOGUIDE MAPPING")
print("="*70)
result = c.execute("SELECT person_id, bioguide_id, display_name FROM tracked_members WHERE person_id='aoc'").fetchall()
if result:
    print(f"Person ID: {result[0][0]}")
    print(f"Bioguide ID: {result[0][1]}")
    print(f"Display Name: {result[0][2]}")

print("\n" + "="*70)
print("3. AOC ACTIONS FOR DEFIANCE ACT")
print("="*70)
result = c.execute("""
    SELECT id, title, date, bill_congress, bill_type, bill_number
    FROM actions
    WHERE person_id='aoc' 
    AND bill_congress=119 
    AND bill_type='hr' 
    AND bill_number=3562
""").fetchall()
print(f"Actions linking AOC to hr3562-119: {len(result)}")
for r in result:
    print(f"  Action {r[0]} | {r[2]} | {r[1][:80]}")

print("\n" + "="*70)
print("4. ALL AOC ACTIONS (sample)")
print("="*70)
result = c.execute("""
    SELECT id, title, date, bill_congress, bill_type, bill_number
    FROM actions
    WHERE person_id='aoc'
    ORDER BY date DESC
    LIMIT 10
""").fetchall()
print(f"Total AOC actions: {c.execute('SELECT COUNT(*) FROM actions WHERE person_id=\"aoc\"').fetchone()[0]}")
print(f"\nMost recent 10:")
for r in result:
    bill_id = f"{r[4]}{r[5]}-{r[3]}" if r[3] and r[4] and r[5] else "N/A"
    print(f"  {bill_id} | {r[2]} | {r[1][:60]}")

print("\n" + "="*70)
print("5. SEARCH FOR DEFIANCE IN BILL TITLES")
print("="*70)
result = c.execute("SELECT bill_id, title FROM bills WHERE title LIKE '%DEFIANCE%'").fetchall()
print(f"Bills containing 'DEFIANCE': {len(result)}")
for r in result:
    print(f"  {r[0]} | {r[1]}")

print("\n" + "="*70)
print("6. SEARCH FOR DEFIANCE IN ACTION TITLES")
print("="*70)
result = c.execute("""
    SELECT person_id, bill_congress, bill_type, bill_number, title
    FROM actions
    WHERE title LIKE '%DEFIANCE%'
    LIMIT 10
""").fetchall()
print(f"Actions containing 'DEFIANCE': {len(result)}")
for r in result:
    bill_id = f"{r[2]}{r[3]}-{r[1]}" if r[1] and r[2] and r[3] else "N/A"
    print(f"  {r[0]} | {bill_id} | {r[4][:80]}")

print("\n" + "="*70)
print("DIAGNOSIS")
print("="*70)

bill_exists = len(c.execute("SELECT 1 FROM bills WHERE bill_id='hr3562-119'").fetchall()) > 0
aoc_has_actions = c.execute("SELECT COUNT(*) FROM actions WHERE person_id='aoc'").fetchone()[0] > 0
aoc_linked_to_defiance = len(c.execute("""
    SELECT 1 FROM actions 
    WHERE person_id='aoc' AND bill_congress=119 AND bill_type='hr' AND bill_number=3562
""").fetchall()) > 0

print(f"Bill hr3562-119 exists: {bill_exists}")
print(f"AOC has actions in DB: {aoc_has_actions}")
print(f"AOC linked to hr3562-119: {aoc_linked_to_defiance}")

if bill_exists and not aoc_linked_to_defiance:
    print("\n[!] CANDIDATE GENERATION PROBLEM (Type B)")
    print("The bill exists but AOC is not linked to it via actions table.")
    print("The matcher can only evaluate bills the person sponsored/cosponsored.")
    print("Fix: Re-run congress ingestion or check if AOC actually sponsored/cosponsored this bill.")
elif bill_exists and aoc_linked_to_defiance:
    print("\n[!] SCORING PROBLEM (Type C)")
    print("The bill exists AND is linked to AOC, but matcher scored it poorly.")
    print("Fix: Improve matching algorithm scoring/filtering.")
else:
    print("\n[!] BILL MISSING FROM DATABASE")
    print("hr3562-119 does not exist in bills table.")

c.close()
