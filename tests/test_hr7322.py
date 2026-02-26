import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("API_KEY_CONGRESS")

headers = {"X-API-Key": API_KEY}

url = "https://api.congress.gov/v3/bill/119/hr/7322?format=json"
r = requests.get(url, headers=headers)
data = r.json()

print("Status Code:", r.status_code)
print("\n=== SPONSOR ===")
print(data['bill'].get('sponsor'))
print("\n=== COSPONSORS ===")
print(data['bill'].get('cosponsors'))
