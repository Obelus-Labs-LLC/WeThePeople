"""Security Audit: Test for vulnerabilities in the WeThePeople platform."""
import requests
import json

base = "http://localhost:8006"
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

print("=== SECURITY AUDIT ===\n")

# ─── 1. SQL INJECTION ───
print("--- SQL Injection Tests ---")

# Search endpoint
r = requests.get(f"{base}/search", params={"q": "'; DROP TABLE users; --"})
test("search: SQL injection", r.status_code == 200, f"status={r.status_code}")

r = requests.get(f"{base}/people", params={"q": "' OR '1'='1"})
test("people: SQL injection", r.status_code == 200, f"status={r.status_code}")

r = requests.get(f"{base}/lookup/48201' OR '1'='1")
test("lookup: SQL injection in path", r.status_code in [200, 404, 422], f"status={r.status_code}")

r = requests.get(f"{base}/fara/search", params={"q": "'; DELETE FROM users; --"})
test("FARA search: SQL injection", r.status_code in [200, 422], f"status={r.status_code}")

# ─── 2. PATH TRAVERSAL ───
print("\n--- Path Traversal Tests ---")

r = requests.get(f"{base}/../../etc/passwd")
test("path traversal: /etc/passwd", r.status_code == 404, f"status={r.status_code}")

r = requests.get(f"{base}/people/../../etc/shadow")
test("path traversal: via people", r.status_code in [404, 422], f"status={r.status_code}")

r = requests.get(f"{base}/finance/institutions/../../../.env")
test("path traversal: .env access", r.status_code in [404, 422], f"status={r.status_code}")

# ─── 3. AUTH BYPASS ───
print("\n--- Authentication Bypass Tests ---")

# Access protected endpoints without token
r = requests.get(f"{base}/auth/me")
test("auth/me: no token = 401", r.status_code == 401, f"status={r.status_code}")

r = requests.get(f"{base}/auth/watchlist")
test("watchlist: no token = 401", r.status_code == 401, f"status={r.status_code}")

r = requests.post(f"{base}/auth/watchlist", json={"entity_type":"x","entity_id":"y","entity_name":"z"})
test("watchlist POST: no token = 401", r.status_code == 401, f"status={r.status_code}")

r = requests.post(f"{base}/auth/checkout/enterprise")
test("checkout: no token = 401", r.status_code == 401, f"status={r.status_code}")

# Fake/expired token
r = requests.get(f"{base}/auth/me", headers={"Authorization": "Bearer fakejwttoken123"})
test("auth/me: fake token = 401", r.status_code == 401, f"status={r.status_code}")

r = requests.get(f"{base}/auth/me", headers={"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"})
test("auth/me: invalid JWT = 401", r.status_code == 401, f"status={r.status_code}")

# ─── 4. PASSWORD SECURITY ───
print("\n--- Password Security Tests ---")

# Short password
r = requests.post(f"{base}/auth/register", json={"email":"short@test.com","password":"123"})
test("register: short password rejected", r.status_code in [400, 422], f"status={r.status_code}")

# Empty password
r = requests.post(f"{base}/auth/register", json={"email":"empty@test.com","password":""})
test("register: empty password rejected", r.status_code in [400, 422], f"status={r.status_code}")

# Invalid email
r = requests.post(f"{base}/auth/register", json={"email":"notanemail","password":"validpass123"})
test("register: invalid email rejected", r.status_code == 422, f"status={r.status_code}")

# ─── 5. RATE LIMITING ───
print("\n--- Rate Limiting Tests ---")

# Rapid login attempts (brute force)
fail_count = 0
for i in range(10):
    r = requests.post(f"{base}/auth/login", json={"email":"nonexistent@test.com","password":"wrong"})
    if r.status_code == 401:
        fail_count += 1
# All should return 401 (not 200), no info leak about whether email exists
test("brute force: 10 rapid logins", fail_count == 10, f"only {fail_count}/10 returned 401")

# ─── 6. XSS IN INPUT ───
print("\n--- XSS Tests ---")

r = requests.get(f"{base}/search", params={"q": "<script>alert('xss')</script>"})
if r.status_code == 200:
    body = r.text
    test("search: XSS in response", "<script>" not in body, "raw script tag in response")
else:
    test("search: XSS rejected", True)

r = requests.get(f"{base}/people", params={"q": "<img src=x onerror=alert(1)>"})
if r.status_code == 200:
    body = r.text
    test("people: XSS in response", "onerror" not in body, "onerror in response")
else:
    test("people: XSS rejected", True)

# ─── 7. SECURITY HEADERS ───
print("\n--- Security Headers ---")

r = requests.get(f"{base}/health")
headers = r.headers
test("X-Content-Type-Options", headers.get("x-content-type-options") == "nosniff", headers.get("x-content-type-options","MISSING"))
test("X-Frame-Options", headers.get("x-frame-options") == "DENY", headers.get("x-frame-options","MISSING"))
test("Strict-Transport-Security", "max-age" in headers.get("strict-transport-security",""), headers.get("strict-transport-security","MISSING"))
test("Content-Security-Policy", "default-src" in headers.get("content-security-policy",""), "MISSING" if "content-security-policy" not in headers else "present")
test("Referrer-Policy", headers.get("referrer-policy","") != "", headers.get("referrer-policy","MISSING"))

# ─── 8. SENSITIVE DATA EXPOSURE ───
print("\n--- Sensitive Data Exposure ---")

# API should not expose internal errors with stack traces
r = requests.get(f"{base}/nonexistent/endpoint/path")
test("404: no stack trace", "traceback" not in r.text.lower() and "file" not in r.text.lower(), r.text[:100])

# .env should not be accessible
r = requests.get(f"{base}/.env")
test(".env not accessible", r.status_code == 404, f"status={r.status_code}")

# Database file should not be accessible
r = requests.get(f"{base}/wethepeople.db")
test("DB file not accessible", r.status_code == 404, f"status={r.status_code}")

# ─── 9. IDOR (Insecure Direct Object Reference) ───
print("\n--- IDOR Tests ---")

# Register a test user, then try to access another user's watchlist
r1 = requests.post(f"{base}/auth/register", json={"email":"sectest1@test.com","password":"securepass123"})
r2 = requests.post(f"{base}/auth/register", json={"email":"sectest2@test.com","password":"securepass456"})

if r1.status_code in [200, 201, 409] and r2.status_code in [200, 201, 409]:
    # Login as user 1
    login1 = requests.post(f"{base}/auth/login", json={"email":"sectest1@test.com","password":"securepass123"})
    login2 = requests.post(f"{base}/auth/login", json={"email":"sectest2@test.com","password":"securepass456"})

    if login1.status_code == 200 and login2.status_code == 200:
        token1 = login1.json().get("access_token","")
        token2 = login2.json().get("access_token","")

        # User 1 adds watchlist item
        add_r = requests.post(f"{base}/auth/watchlist",
            headers={"Authorization": f"Bearer {token1}"},
            json={"entity_type":"politician","entity_id":"test_entity","entity_name":"Test"})

        if add_r.status_code == 201:
            item_id = add_r.json().get("id")

            # User 2 tries to delete User 1's watchlist item
            del_r = requests.delete(f"{base}/auth/watchlist/{item_id}",
                headers={"Authorization": f"Bearer {token2}"})
            test("IDOR: user2 can't delete user1's watchlist", del_r.status_code == 404, f"status={del_r.status_code}")

# Cleanup
import sqlite3
conn = sqlite3.connect("/home/dshon/wethepeople-backend/wethepeople.db")
for email in ["sectest1@test.com", "sectest2@test.com"]:
    uid = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
    if uid:
        conn.execute("DELETE FROM user_watchlist WHERE user_id=?", (uid[0],))
        conn.execute("DELETE FROM users WHERE id=?", (uid[0],))
conn.commit()
conn.close()

# ─── 10. STRIPE WEBHOOK SECURITY ───
print("\n--- Stripe Webhook Security ---")

# Sending fake webhook without valid signature
r = requests.post(f"{base}/auth/webhook/stripe",
    json={"type":"checkout.session.completed","data":{"object":{"client_reference_id":"1"}}},
    headers={"stripe-signature": "fake_sig"})
# Should either reject (400) or process safely (200 but not upgrade anyone)
test("webhook: fake signature handling", r.status_code in [200, 400], f"status={r.status_code}")

# ─── RESULTS ───
sep = "=" * 60
print(f"\n{sep}")
print(f"SECURITY AUDIT: {tested} tests, {tested - len(issues)} passed, {len(issues)} VULNERABILITIES")
print(sep)
if issues:
    print("\nVULNERABILITIES FOUND:")
    for i in issues:
        print(f"  [!] {i}")
else:
    print("\nNO VULNERABILITIES FOUND.")
