import requests
from bs4 import BeautifulSoup
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.ingest_claims import extract_main_text, extract_claim_sentences

url = 'https://www.warren.senate.gov/newsroom/press-releases/warren-calls-for-trump-administration-to-act-as-new-start-expires-warns-of-nuclear-arms-race'
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')

print("=== Extracting main text ===")
text = extract_main_text(soup)
print(f"Text length: {len(text)} characters")
print(f"\nFirst 500 characters:")
print(text[:500])

print("\n\n=== Extracting claim sentences ===")
claims = extract_claim_sentences(text)
print(f"Claims found: {len(claims)}")
for i, claim in enumerate(claims, 1):
    print(f"\n[{i}] {claim}")
