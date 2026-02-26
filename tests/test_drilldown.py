import json
import urllib.request
import urllib.parse

base = 'http://127.0.0.1:8002'

# Get people with ledger entries
response = json.loads(urllib.request.urlopen(
    f"{base}/people?active_only=1&has_ledger=1&limit=10&offset=0"
).read())

people = response['people']
total = response['total']

print(f"Found {total} people with ledger entries")

# Search for a claim with matched_bill_id
found_bill = None
found_claim = None
found_person = None

for person in people[:5]:
    pid = person['person_id']
    print(f"Checking {pid}...")
    
    ledger = json.loads(urllib.request.urlopen(
        f"{base}/ledger/person/{urllib.parse.quote(pid)}?limit=5&offset=0"
    ).read())
    
    for entry in ledger['entries']:
        if entry.get('matched_bill_id'):
            found_bill = entry['matched_bill_id']
            found_claim = entry['claim_id']
            found_person = pid
            print(f"PASS: FOUND: person={pid}, claim={found_claim}, bill={found_bill}")
            break
    
    if found_bill:
        break

if not found_bill:
    print("\n❌ No claims with matched_bill_id found in first 5 people")
    exit(1)

print(f"\n=== Testing Full Drilldown ===")
print(f"1. Person: {found_person}")

# Test claim detail
claim = json.loads(urllib.request.urlopen(
    f"{base}/ledger/claim/{found_claim}"
).read())
print(f"2. Claim: {found_claim}")
print(f"   - matched_bill_id: {claim.get('matched_bill_id')}")

# Test bill summary
bill = json.loads(urllib.request.urlopen(
    f"{base}/bills/{urllib.parse.quote(found_bill)}"
).read())
print(f"3. Bill: {found_bill}")
print(f"   - keys: {list(bill.keys())}")

# Test bill timeline
timeline = json.loads(urllib.request.urlopen(
    f"{base}/bills/{urllib.parse.quote(found_bill)}/timeline"
).read())
print(f"4. Timeline: {len(timeline.get('actions', []))} actions")

print("\n✅ ALL DRILLDOWN PATHS WORK END-TO-END")
