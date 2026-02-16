"""Check actual DEFIANCE Act action data structure."""

import sqlite3

c = sqlite3.connect('wethepeople.db')

print("="*70)
print("AOC DEFIANCE ACT ACTION - FULL DETAILS")
print("="*70)

result = c.execute("""
    SELECT id, person_id, title, date, bill_congress, bill_type, bill_number, 
           metadata_json, latest_action_text, latest_action_date
    FROM actions
    WHERE person_id='aoc' AND title LIKE '%DEFIANCE%'
""").fetchall()

print(f"Found {len(result)} actions")
for r in result:
    print(f"\nAction ID: {r[0]}")
    print(f"Person ID: {r[1]}")
    print(f"Title: {r[2]}")
    print(f"Date: {r[3]}")
    print(f"Bill Congress: {r[4]}")
    print(f"Bill Type: {r[5]}")
    print(f"Bill Number: {r[6]}")
    print(f"Metadata JSON: {r[7][:200] if r[7] else 'None'}...")
    print(f"Latest Action Text: {r[8]}")
    print(f"Latest Action Date: {r[9]}")
    
    # Check if this constructs correctly
    if r[4] and r[5] and r[6]:
        bill_id = f"{r[5]}{r[6]}-{r[4]}"
        print(f"Constructed Bill ID: {bill_id}")

print("\n" + "="*70)
print("VERIFY BILL EXISTS")
print("="*70)

result = c.execute("SELECT bill_id, title, latest_action_date FROM bills WHERE bill_id='hr3562-119'").fetchall()
if result:
    print(f"Bill ID: {result[0][0]}")
    print(f"Title: {result[0][1]}")
    print(f"Latest Action: {result[0][2]}")

print("\n" + "="*70)
print("CHECK IF MATCHING SERVICE CAN SEE THIS")
print("="*70)
print("The matching service should:")
print("1. Find all actions for person_id='aoc'")
print("2. Construct bill_ids from (bill_type + bill_number + '-' + bill_congress)")
print("3. Query bills table with those bill_ids")
print("4. Score each bill against the claim")

c.close()
