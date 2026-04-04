"""MEGA PROBE: Test the entire WeThePeople platform."""
import requests
import json
import sqlite3
import random
import sys

base = "http://localhost:8006"
db_path = "/home/dshon/wethepeople-backend/wethepeople.db"
issues = []
tested = 0

def check(name, url, expect=200):
    global tested
    tested += 1
    try:
        r = requests.get(f"{base}{url}", timeout=15)
        if r.status_code != expect:
            issues.append(f"{name}: {r.status_code} (expected {expect})")
            return False
        return True
    except Exception as e:
        issues.append(f"{name}: EXCEPTION {str(e)[:40]}")
        return False

def check_json(name, url, required_keys=None):
    global tested
    tested += 1
    try:
        r = requests.get(f"{base}{url}", timeout=15)
        if r.status_code != 200:
            issues.append(f"{name}: HTTP {r.status_code}")
            return
        d = r.json()
        if required_keys:
            for k in required_keys:
                if k not in d:
                    issues.append(f"{name}: missing key '{k}'")
    except Exception as e:
        issues.append(f"{name}: {str(e)[:40]}")

print("=== MEGA PROBE ===\n")

# 1. All sector dashboards + recent activity
print("--- Sector Dashboards ---")
for s in ["finance","health","tech","energy","transportation","defense","chemicals","agriculture"]:
    check(f"{s} dashboard", f"/{s}/dashboard/stats")
    check(f"{s} recent", f"/{s}/dashboard/recent-activity")

# 2. Random company profiles (5 per sector)
print("--- Random Company Profiles ---")
conn = sqlite3.connect(db_path)
sector_tables = [
    ("finance", "tracked_institutions", "institution_id", "institutions"),
    ("health", "tracked_companies", "company_id", "companies"),
    ("tech", "tracked_tech_companies", "company_id", "companies"),
    ("energy", "tracked_energy_companies", "company_id", "companies"),
    ("transportation", "tracked_transportation_companies", "company_id", "companies"),
    ("defense", "tracked_defense_companies", "company_id", "companies"),
    ("chemicals", "tracked_chemical_companies", "company_id", "companies"),
    ("agriculture", "tracked_agriculture_companies", "company_id", "companies"),
]
for sector, table, id_col, path in sector_tables:
    ids = [r[0] for r in conn.execute(f"SELECT {id_col} FROM {table} ORDER BY RANDOM() LIMIT 5").fetchall()]
    for cid in ids:
        check(f"{sector}/{cid}", f"/{sector}/{path}/{cid}")

# 3. Random politicians
print("--- Random Politicians ---")
pids = [r[0] for r in conn.execute("SELECT person_id FROM tracked_members WHERE is_active=1 ORDER BY RANDOM() LIMIT 15").fetchall()]
for pid in pids:
    check(f"politician/{pid}", f"/people/{pid}")

# 4. /full endpoints
print("--- Politician /full ---")
full_pids = [r[0] for r in conn.execute("SELECT person_id FROM tracked_members WHERE is_active=1 ORDER BY RANDOM() LIMIT 5").fetchall()]
for pid in full_pids:
    check_json(f"full/{pid}", f"/people/{pid}/full", ["person_id","person","votes","committees"])

# 5. Company data depth
print("--- Company Data Depth ---")
for sector, table, id_col, path in sector_tables[:4]:
    cid = conn.execute(f"SELECT {id_col} FROM {table} ORDER BY RANDOM() LIMIT 1").fetchone()[0]
    check(f"{sector}/{cid}/lobbying", f"/{sector}/{path}/{cid}/lobbying")
    check(f"{sector}/{cid}/contracts", f"/{sector}/{path}/{cid}/contracts")
    check(f"{sector}/{cid}/enforcement", f"/{sector}/{path}/{cid}/enforcement")

# 6. Influence
print("--- Influence ---")
check_json("influence/stats", "/influence/stats", ["total_lobbying_spend","by_sector"])
check_json("influence/top-lobbying", "/influence/top-lobbying?limit=5", ["leaders"])
check_json("influence/top-contracts", "/influence/top-contracts?limit=5", ["leaders"])
check("influence/spending-by-state", "/influence/spending-by-state")
check("influence/money-flow", "/influence/money-flow?limit=5")
check("influence/closed-loops", "/influence/closed-loops?limit=5")
random_pid = conn.execute("SELECT person_id FROM tracked_members ORDER BY RANDOM() LIMIT 1").fetchone()[0]
check("influence/network", f"/influence/network?entity_type=person&entity_id={random_pid}&depth=1&limit=10")

# 7. Stories
print("--- Stories ---")
check_json("stories/latest", "/stories/latest?limit=10", ["stories"])
check_json("stories/stats", "/stories/stats", ["total_published"])
stories = conn.execute("SELECT slug FROM stories WHERE status='published' ORDER BY RANDOM() LIMIT 3").fetchall()
for s in stories:
    check(f"story/{s[0][:30]}", f"/stories/{s[0]}")

# 8. Research tools
print("--- Research Tools ---")
check("food-recalls", "/research/food-recalls?search=milk&limit=3")
check("drug-recalls", "/research/drug-recalls?search=aspirin&limit=3")
check("device-recalls", "/research/device-recalls?search=pump&limit=3")
check("toxic-releases", "/research/toxic-releases?search=benzene&limit=3")
check("world-politicians", "/research/world-politicians")
check("earmarks", "/research/earmarks?state=MI&limit=3")
check("bill-text-search", "/research/bill-text-search?query=healthcare&limit=3")
check("company-lookup", "/research/company-lookup?query=Apple")

# 9. FARA
print("--- FARA ---")
check_json("fara/stats", "/fara/stats", ["total_registrants"])
check("fara/countries", "/fara/countries")
check("fara/registrants", "/fara/registrants?limit=5")
check("fara/search", "/fara/search?q=japan&limit=5")

# 10. States
print("--- States ---")
for st in ["MI","NY","CA","TX","FL","OH","PA","GA","SC","WA"]:
    check(f"states/{st}", f"/states/{st}")

# 11. ZIP lookups
print("--- ZIP Lookups ---")
for z in ["48201","10001","90210","29201","77001","60601","30301","98101"]:
    check(f"lookup/{z}", f"/lookup/{z}")

# 12. Misc
print("--- Misc ---")
check("committees", "/committees")
check("congressional-trades", "/congressional-trades?limit=3")
check("anomalies", "/anomalies?limit=3")
check("anomalies/stats", "/anomalies/stats")
check("search/pfizer", "/search?q=pfizer")
check("search/pelosi", "/search?q=pelosi")
check("search/lobbying", "/search?q=lobbying")
check("news/politics", "/news/politics")
check("news/lobbying", "/news/lobbying")
check("chat/remaining", "/chat/remaining")
check("representatives", "/representatives?zip=48201")
check("votes", "/votes?limit=3")
check("health", "/health")
check("dashboard/stats", "/dashboard/stats")

# 13. Compare endpoints
print("--- Compare ---")
for sector in ["tech","finance","health","energy"]:
    path = "institutions" if sector == "finance" else "companies"
    ids_raw = conn.execute(f"SELECT {'institution_id' if sector=='finance' else 'company_id'} FROM {'tracked_institutions' if sector=='finance' else f'tracked_{sector}_companies' if sector != 'health' else 'tracked_companies'} LIMIT 2").fetchall()
    if len(ids_raw) >= 2:
        ids_str = f"{ids_raw[0][0]},{ids_raw[1][0]}"
        check(f"{sector}/compare", f"/{sector}/compare?ids={ids_str}")

# 14. Data quality
print("--- Data Quality ---")
r = requests.get(f"{base}/influence/stats").json()
sectors_count = len(r.get("by_sector", {}))
if sectors_count != 8:
    issues.append(f"influence/stats: {sectors_count} sectors (expected 8)")

empty_body = conn.execute("SELECT COUNT(*) FROM stories WHERE body IS NULL OR body = ''").fetchone()[0]
if empty_body > 0:
    issues.append(f"stories: {empty_body} with empty body")

pol_count = r.get("politicians_connected", 0)
actual = conn.execute("SELECT COUNT(*) FROM tracked_members WHERE is_active=1").fetchone()[0]
if pol_count != actual:
    issues.append(f"politician count: API={pol_count} DB={actual}")

# Check for senators with 0 votes
zero_vote_senators = conn.execute("""
    SELECT COUNT(*) FROM tracked_members tm
    WHERE tm.is_active=1 AND tm.chamber='senate'
    AND NOT EXISTS (SELECT 1 FROM member_votes mv WHERE mv.person_id=tm.person_id)
""").fetchone()[0]
if zero_vote_senators > 1:
    issues.append(f"senators with 0 votes: {zero_vote_senators}")

conn.close()

sep = "=" * 60
print(f"\n{sep}")
print(f"RESULTS: {tested} tests, {tested - len(issues)} passed, {len(issues)} failed")
print(sep)
if issues:
    print("\nISSUES:")
    for i in issues:
        print(f"  {i}")
else:
    print("\nZERO ISSUES FOUND.")
