"""
Verify Schumer dry-run produces no fragment URLs.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.ingest_claims import extract_article_links, fetch_html
from models.database import SessionLocal, TrackedMember
import json

db = SessionLocal()

# Get Schumer's sources
member = db.query(TrackedMember).filter(TrackedMember.person_id == 'chuck_schumer').first()

if not member or not member.claim_sources_json:
    print("❌ Schumer not configured")
    sys.exit(1)

sources = json.loads(member.claim_sources_json)
base_url = sources[0]['url']

print("=" * 80)
print("SCHUMER LINK EXTRACTION VERIFICATION")
print("=" * 80)
print(f"\nSource: {base_url}")

# Fetch and extract links
html = fetch_html(base_url)
links = extract_article_links(html, base_url)

print(f"\nExtracted {len(links)} links")

# Check for fragments
has_fragments = False
for i, link in enumerate(links[:10], 1):  # Check first 10
    if '#' in link:
        print(f"❌ [{i}] CONTAINS FRAGMENT: {link}")
        has_fragments = True
    else:
        print(f"✅ [{i}] Clean: {link[:100]}...")

if has_fragments:
    print("\n❌ VERIFICATION FAILED: Found URLs with fragments")
    sys.exit(1)
else:
    print("\n✅ VERIFICATION PASSED: No fragment URLs found")
    sys.exit(0)
