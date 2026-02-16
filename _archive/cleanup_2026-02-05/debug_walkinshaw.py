import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("API_KEY_CONGRESS")
HEADERS = {"X-API-Key": API_KEY}

def fetch_recent_bills():
    url = "https://api.congress.gov/v3/bill"
    params = {"format": "json", "offset": 0}
    r = requests.get(url, headers=HEADERS, params=params)
    print(f"[List] Status: {r.status_code}")
    data = r.json()
    bills = data.get("bills", [])
    for b in bills:
        print(f"{b['number']} - {b['title']} ({b['congress']})")
        print(f"  URL: {b['url']}")
    return bills

def fetch_details_for(bill_url):
    r = requests.get(bill_url + "?format=json", headers=HEADERS)
    print(f"[Detail] Status: {r.status_code}")
    data = r.json()
    bill = data.get("bill", {})
    print("\n=== BILL DETAILS ===")
    print("Title:", bill.get("title"))
    print("Congress:", bill.get("congress"))
    print("Sponsors:", bill.get("sponsors"))
    print("Cosponsors:", bill.get("cosponsors"))
    print("Congress.gov URL:", bill.get("congressdotgov_url"))
    print("Bioguide IDs found:")
    for s in bill.get("sponsors", []):
        print("  -", s.get("bioguideId"))
    print("=====================\n")

bills = fetch_recent_bills()

# Try to extract one known Walkinshaw bill from the list
for b in bills:
    if b["number"] == "7322":  # or any other known bill
        fetch_details_for(b["url"])
