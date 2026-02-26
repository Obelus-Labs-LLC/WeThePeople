import requests
from bs4 import BeautifulSoup
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.ingest_claims import extract_main_text, extract_bill_references

# Test the "introduced bipartisan legislation" article
url = "https://www.schumer.senate.gov/newsroom/press-releases/gillibrand-schumer-deliver-nearly-90-million-in-federal-funding-to-support-west-valley-demonstration-project-cleanup-efforts-announce-new-bipartisan-legislation-to-clean-up-nuclear-waste-protect-western-new-yorkers"

print("Fetching article...")
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')

text = extract_main_text(soup)
print(f"\nExtracted text ({len(text)} chars):")
print("=" * 80)
print(text[:1000])
print("=" * 80)

bill_refs = extract_bill_references(text)
print(f"\nExtracted bill refs:")
print(f"  Display: {bill_refs['display']}")
print(f"  Normalized: {bill_refs['normalized']}")

# Search for bill patterns manually
if 'H.R.' in text or 'S.' in text:
    print("\n✅ Text contains 'H.R.' or 'S.'")
    # Find context
    for i, line in enumerate(text.split('.')[:20]):
        if 'H.R.' in line or 'S.' in line:
            print(f"  Line {i}: {line.strip()}")
else:
    print("\n❌ Text does NOT contain 'H.R.' or 'S.'")
