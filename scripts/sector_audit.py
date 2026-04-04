"""Full sector + influence page audit."""
import requests
import json

base = "http://localhost:8006"

sectors = ["finance", "health", "tech", "energy", "transportation", "defense", "chemicals", "agriculture"]

print("=== SECTOR DASHBOARD CHECKS ===")
for s in sectors:
    r = requests.get(f"{base}/{s}/dashboard/stats", timeout=10)
    d = r.json() if r.status_code == 200 else {}
    cos = d.get("total_companies") or d.get("total_institutions") or 0
    lobby = d.get("total_lobbying_filings") or d.get("total_lobbying") or 0
    contracts = d.get("total_contracts") or 0
    enforce = d.get("total_enforcement") or 0
    print(f"  {s:<14} {r.status_code} cos={cos} lobby={lobby} contracts={contracts} enforce={enforce}")

print("\n=== SAMPLE COMPANY DATA DEPTH (3 per sector) ===")
for s in sectors:
    path = "institutions" if s == "finance" else "companies"
    r = requests.get(f"{base}/{s}/{path}", params={"limit": 5}, timeout=10)
    d = r.json()
    companies = d.get("companies") or d.get("institutions") or []
    for c in companies[:3]:
        cid = c.get("company_id") or c.get("institution_id")
        lobby_r = requests.get(f"{base}/{s}/{path}/{cid}/lobbying", params={"limit": 1}, timeout=5)
        contract_r = requests.get(f"{base}/{s}/{path}/{cid}/contracts", params={"limit": 1}, timeout=5)
        enforce_r = requests.get(f"{base}/{s}/{path}/{cid}/enforcement", params={"limit": 1}, timeout=5)
        lt = lobby_r.json().get("total", 0) if lobby_r.status_code == 200 else f"ERR:{lobby_r.status_code}"
        ct = contract_r.json().get("total", 0) if contract_r.status_code == 200 else f"ERR:{contract_r.status_code}"
        et = enforce_r.json().get("total", 0) if enforce_r.status_code == 200 else f"ERR:{enforce_r.status_code}"
        print(f"  {s}/{cid}: lobby={lt} contracts={ct} enforce={et}")

print("\n=== INFLUENCE PAGES ===")
influence_pages = [
    "/influence/stats",
    "/influence/top-lobbying",
    "/influence/top-contracts",
    "/influence/spending-by-state",
    "/influence/network",
    "/influence/money-flow",
    "/influence/closed-loops",
    "/anomalies/stats",
    "/stories/stats",
    "/fara/stats",
    "/fara/countries",
]
for p in influence_pages:
    params = {}
    if "network" in p:
        params = {"entity_type": "person", "entity_id": "nancy_pelosi", "depth": 1, "limit": 10}
    elif "top" in p:
        params = {"limit": 3}
    elif "money" in p or "closed" in p:
        params = {"limit": 5}
    r = requests.get(f"{base}{p}", params=params, timeout=10)
    print(f"  {p}: {r.status_code}")
