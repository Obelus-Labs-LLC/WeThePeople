"""Deep probe: edge cases, data integrity, boundary testing, stress patterns."""
import requests
import json
import sqlite3
import time

base = "http://localhost:8006"
db_path = "/home/dshon/wethepeople-backend/wethepeople.db"
issues = []
tested = 0

def test(name, passed, detail=""):
    global tested
    tested += 1
    if passed:
        print(f"  PASS  {name}")
    else:
        issues.append(f"{name}: {detail}")
        print(f"  FAIL  {name} -- {detail}")

print("=== DEEP PROBE ===\n")

# ─── 1. EDGE CASE INPUTS ───
print("--- Edge Case Inputs ---")

# Empty search
r = requests.get(f"{base}/search", params={"q": ""})
test("search: empty query", r.status_code == 422, f"status={r.status_code}")

# Very long search
r = requests.get(f"{base}/search", params={"q": "A" * 500})
test("search: 500 char query", r.status_code in [200, 422], f"status={r.status_code}")

# Unicode search
r = requests.get(f"{base}/search", params={"q": "pfizer \u00e9\u00e8\u00ea \u4e2d\u6587"})
test("search: unicode query", r.status_code == 200, f"status={r.status_code}")

# Emoji in search
r = requests.get(f"{base}/search", params={"q": "\U0001f3db\ufe0f politics"})
test("search: emoji query", r.status_code == 200, f"status={r.status_code}")

# Null bytes
r = requests.get(f"{base}/search", params={"q": "test\x00null"})
test("search: null byte", r.status_code in [200, 400, 422], f"status={r.status_code}")

# Negative limit
r = requests.get(f"{base}/people", params={"limit": -1})
test("people: negative limit", r.status_code == 422, f"status={r.status_code}")

# Huge limit
r = requests.get(f"{base}/people", params={"limit": 999999})
test("people: huge limit", r.status_code == 422, f"status={r.status_code}")

# Zero limit
r = requests.get(f"{base}/people", params={"limit": 0})
test("people: zero limit", r.status_code == 422, f"status={r.status_code}")

# Non-existent person
r = requests.get(f"{base}/people/definitely_not_a_real_person_xyz")
test("nonexistent person", r.status_code == 404, f"status={r.status_code}")

# Non-existent company
r = requests.get(f"{base}/tech/companies/fake_company_xyz")
test("nonexistent company", r.status_code == 404, f"status={r.status_code}")

# Invalid ZIP
r = requests.get(f"{base}/lookup/00000")
test("lookup: invalid zip 00000", r.status_code in [200, 404, 422], f"status={r.status_code}")

r = requests.get(f"{base}/lookup/abc")
test("lookup: non-numeric zip", r.status_code in [200, 404, 422], f"status={r.status_code}")

r = requests.get(f"{base}/lookup/123456789")
test("lookup: too long zip", r.status_code in [200, 404, 422], f"status={r.status_code}")

# ─── 2. PAGINATION EDGE CASES ───
print("\n--- Pagination Edge Cases ---")

r = requests.get(f"{base}/people", params={"limit": 1, "offset": 9999})
test("people: offset beyond data", r.status_code == 200, f"status={r.status_code}")
if r.status_code == 200:
    d = r.json()
    test("people: offset beyond returns empty", len(d.get("people", [])) == 0, f"got {len(d.get('people', []))} results")

r = requests.get(f"{base}/congressional-trades", params={"limit": 1, "offset": 0})
test("trades: limit=1 works", r.status_code == 200, f"status={r.status_code}")

# ─── 3. CONCURRENT REQUEST SIMULATION ───
print("\n--- Concurrent Requests ---")
import concurrent.futures

def fetch_url(url):
    try:
        r = requests.get(url, timeout=15)
        return r.status_code
    except:
        return 0

urls = [
    f"{base}/health",
    f"{base}/influence/stats",
    f"{base}/people?limit=5",
    f"{base}/stories/latest?limit=5",
    f"{base}/anomalies?limit=5",
    f"{base}/finance/dashboard/stats",
    f"{base}/tech/dashboard/stats",
    f"{base}/search?q=pfizer",
    f"{base}/lookup/48201",
    f"{base}/fara/stats",
] * 3  # 30 concurrent requests

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    results = list(executor.map(fetch_url, urls))

success_count = sum(1 for r in results if r == 200)
test(f"30 concurrent requests", success_count >= 28, f"{success_count}/30 succeeded")

# ─── 4. DATA INTEGRITY ───
print("\n--- Data Integrity ---")

conn = sqlite3.connect(db_path)

# Check for orphaned records
orphaned_votes = conn.execute("""
    SELECT COUNT(*) FROM member_votes mv
    WHERE mv.vote_id NOT IN (SELECT id FROM votes)
""").fetchone()[0]
test("no orphaned member_votes", orphaned_votes == 0, f"{orphaned_votes} orphaned")

# Check for duplicate person_ids
dupe_members = conn.execute("""
    SELECT person_id, COUNT(*) as cnt FROM tracked_members
    GROUP BY person_id HAVING cnt > 1
""").fetchall()
test("no duplicate tracked_members", len(dupe_members) == 0, f"{len(dupe_members)} dupes: {dupe_members[:3]}")

# Check for stories with null titles
null_title_stories = conn.execute("SELECT COUNT(*) FROM stories WHERE title IS NULL OR title = ''").fetchone()[0]
test("no null title stories", null_title_stories == 0, f"{null_title_stories} with null title")

# Check watchlist table integrity
watchlist_orphans = conn.execute("""
    SELECT COUNT(*) FROM user_watchlist w
    WHERE w.user_id NOT IN (SELECT id FROM users)
""").fetchone()[0]
test("no orphaned watchlist items", watchlist_orphans == 0, f"{watchlist_orphans} orphaned")

# Check for negative amounts
neg_lobbying = conn.execute("SELECT COUNT(*) FROM finance_lobbying_records WHERE income < 0").fetchone()[0]
test("no negative lobbying amounts", neg_lobbying == 0, f"{neg_lobbying} negative")

neg_contracts = conn.execute("SELECT COUNT(*) FROM finance_government_contracts WHERE award_amount < 0").fetchone()[0]
test("no negative contract amounts", neg_contracts == 0, f"{neg_contracts} negative")

# Check for future dates
from datetime import date
today = date.today().isoformat()
future_trades = conn.execute(f"SELECT COUNT(*) FROM congressional_trades WHERE transaction_date > '{today}'").fetchone()[0]
test("no future trade dates", future_trades == 0, f"{future_trades} future trades")

# ─── 5. API RESPONSE CONSISTENCY ───
print("\n--- API Response Consistency ---")

# Check all sector dashboards return same shape
sector_keys = set()
for s in ["finance","health","tech","energy","transportation","defense","chemicals","agriculture"]:
    r = requests.get(f"{base}/{s}/dashboard/stats")
    if r.status_code == 200:
        keys = sorted(r.json().keys())
        sector_keys.add(tuple(keys))

test("sector dashboards: consistent shape", len(sector_keys) <= 3, f"{len(sector_keys)} different shapes")

# Check /people/X/full returns all expected keys
r = requests.get(f"{base}/people/nancy_pelosi/full")
if r.status_code == 200:
    d = r.json()
    expected = ["person_id","person","profile","stats","performance","committees","activity","votes","finance","trends","trades","donors","graph"]
    missing = [k for k in expected if k not in d]
    test("/full: all 13 sections present", len(missing) == 0, f"missing: {missing}")

# Check influence stats has all 8 sectors
r = requests.get(f"{base}/influence/stats")
if r.status_code == 200:
    d = r.json()
    sectors = list(d.get("by_sector", {}).keys())
    test("influence: all 8 sectors", len(sectors) == 8, f"only {len(sectors)}: {sectors}")

# ─── 6. RESPONSE TIME CHECKS ───
print("\n--- Response Times ---")

slow_endpoints = []
fast_endpoints = [
    ("/health", 1.0),
    ("/search?q=pfizer", 2.0),
    ("/people?limit=10", 2.0),
    ("/influence/stats", 3.0),
    ("/stories/latest?limit=5", 1.0),
    ("/lookup/48201", 5.0),
]
for path, max_time in fast_endpoints:
    start = time.time()
    r = requests.get(f"{base}{path}", timeout=15)
    elapsed = time.time() - start
    if elapsed > max_time:
        slow_endpoints.append(f"{path}: {elapsed:.1f}s (max {max_time}s)")
    test(f"speed: {path} < {max_time}s", elapsed <= max_time, f"took {elapsed:.1f}s")

# ─── 7. HEADER INJECTION ───
print("\n--- Header Injection ---")

r = requests.get(f"{base}/health", headers={"X-Forwarded-For": "127.0.0.1\r\nInjected-Header: evil"})
test("header injection: CRLF blocked", "Injected-Header" not in str(r.headers), "CRLF injection succeeded")

# ─── 8. JWT TOKEN EDGE CASES ───
print("\n--- JWT Edge Cases ---")

# Expired-looking token
r = requests.get(f"{base}/auth/me", headers={"Authorization": "Bearer "})
test("empty bearer token", r.status_code == 401, f"status={r.status_code}")

r = requests.get(f"{base}/auth/me", headers={"Authorization": "Basic dXNlcjpwYXNz"})
test("wrong auth scheme (Basic)", r.status_code == 401, f"status={r.status_code}")

r = requests.get(f"{base}/auth/me", headers={"Authorization": "Bearer null"})
test("bearer null", r.status_code == 401, f"status={r.status_code}")

# ─── 9. DOUBLE-SUBMIT / REPLAY ───
print("\n--- Double Submit ---")

# Register same email twice
r1 = requests.post(f"{base}/auth/register", json={"email":"doubletest@example.com","password":"testpass123"})
r2 = requests.post(f"{base}/auth/register", json={"email":"doubletest@example.com","password":"testpass456"})
test("double registration blocked", r2.status_code == 409, f"status={r2.status_code}")

# Cleanup
conn.execute("DELETE FROM users WHERE email='doubletest@example.com'")
conn.commit()

# ─── 10. CORS CHECK ───
print("\n--- CORS ---")

r = requests.options(f"{base}/health", headers={
    "Origin": "https://evil-site.com",
    "Access-Control-Request-Method": "GET",
})
# Should either block or not include evil origin in ACAO
acao = r.headers.get("access-control-allow-origin", "")
test("CORS: evil origin not allowed", acao != "https://evil-site.com", f"ACAO={acao}")

conn.close()

sep = "=" * 60
print(f"\n{sep}")
print(f"DEEP PROBE: {tested} tests, {tested - len(issues)} passed, {len(issues)} issues")
print(sep)
if issues:
    print("\nISSUES:")
    for i in issues:
        print(f"  [!] {i}")
else:
    print("\nZERO ISSUES FOUND.")
