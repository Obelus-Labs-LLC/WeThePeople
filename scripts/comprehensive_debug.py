import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import requests
from bs4 import BeautifulSoup
from jobs.ingest_claims import extract_main_text, extract_claim_sentences, CLAIM_TRIGGERS
import re

url = 'https://www.warren.senate.gov/newsroom/press-releases/warren-blumenthal-goldman-and-27-members-of-congress-urge-agency-watchdogs-to-investigate-trump-administrations-retreat-from-white-collar-crime-enforcement'

print("=== Step 1: Fetch and parse ===")
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')
print(f"Fetched {len(r.content)} bytes")

print("\n=== Step 2: Extract main text ===")
text = extract_main_text(soup)
print(f"Extracted text length: {len(text)} characters")
print(f"First 300 chars: {text[:300]}")

print("\n=== Step 3: Extract claim sentences ===")
claims = extract_claim_sentences(text, max_claims=10)
print(f"Claims found: {len(claims)}")

if not claims:
    print("\n=== DEBUG: Why no claims? ===")
    
    # Split manually
    text_norm = re.sub(r'\s+', ' ', text)
    sentences = re.split(r'[.!?]+(?:\s+|$)', text_norm)
    sentences_clean = [s.strip() for s in sentences if s.strip()]
    
    print(f"Total raw sentences: {len(sentences_clean)}")
    
    # Filter by length
    valid_length = [s for s in sentences_clean if 10 <= len(s.split()) <= 100]
    print(f"Sentences with 10-100 words: {len(valid_length)}")
    
    # Check for trigger matches
    triggered = []
    for sentence in valid_length:
        for trigger in CLAIM_TRIGGERS:
            if re.search(trigger, sentence, re.IGNORECASE):
                triggered.append((sentence, trigger))
                break
    
    print(f"Sentences with trigger matches: {len(triggered)}")
    
    if triggered:
        print("\nFirst 3 triggered sentences:")
        for i, (sent, trig) in enumerate(triggered[:3], 1):
            print(f"\n[{i}] Trigger: {trig}")
            print(f"    Sentence ({len(sent.split())} words): {sent[:150]}...")
    else:
        print("\n!!! NO TRIGGERS MATCHED !!!")
        print("\nChecking first 5 valid-length sentences for 'Warren' or 'led':")
        for i, sent in enumerate(valid_length[:5], 1):
            has_warren = 'warren' in sent.lower()
            has_led = 'led' in sent.lower()
            has_called = 'called' in sent.lower()
            print(f"\n[{i}] ({len(sent.split())} words) Warren:{has_warren} Led:{has_led} Called:{has_called}")
            print(f"    {sent[:200]}")
else:
    print("\nClaims:")
    for i, claim in enumerate(claims, 1):
        print(f"\n[{i}] {claim}")
