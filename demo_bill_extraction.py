"""
Demo: Bill reference extraction from sample press release.
Shows how bill_refs_json will be populated on next ingest.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.ingest_claims import extract_bill_references
import json

# Sample press release text (truncated Wyden example)
sample_text = """
February 02, 2026

Wyden, Merkley Introduce Bills to Ban Taxpayer Payouts for January 6 Insurrectionists

Washington, DC – Senators Ron Wyden and Jeff Merkley (both D-Ore.) said today they have 
introduced a pair of bills that would prevent January 6 rioters from receiving 
taxpayer-funded payouts from the federal government.

The first bill, S. 1123, would prohibit the payment of back pay or other compensation 
to federal employees who participated in the January 6 attack. The second bill, 
H.R. 3562, would prevent convicted rioters from receiving Social Security benefits 
while incarcerated.

"January 6 insurrectionists should not profit from their crimes," Wyden said. 
"These bills ensure taxpayers aren't footing the bill for those who attacked our democracy."

The legislation has been referred to committee. Wyden and Merkley also cosponsored 
S. 789 last session addressing similar issues.
"""

print("=" * 80)
print("BILL REFERENCE EXTRACTION DEMO")
print("=" * 80)

print("\nSample Press Release:")
print("-" * 80)
print(sample_text)
print("-" * 80)

# Extract bill references
bill_refs = extract_bill_references(sample_text)
bill_refs_json = json.dumps(bill_refs) if bill_refs else None

print("\nExtracted Bill References:")
print(f"  Count: {len(bill_refs)}")
print(f"  Bills: {bill_refs}")
print(f"  JSON: {bill_refs_json}")

print("\n" + "=" * 80)
print("HOW THIS WORKS IN PRODUCTION:")
print("=" * 80)
print("""
1. Ingestion job fetches press release article
2. extract_bill_references() scans FULL article text
3. Finds: ["H.R. 3562", "S. 1123", "S. 789"]
4. Stores as JSON in claim.bill_refs_json for ALL claims from this article

5. Claim sentence extraction (existing logic):
   - "introduced a pair of bills that would prevent..." (no bill numbers in sentence)
   
6. Database record:
   text: "Senators Ron Wyden and Jeff Merkley said today they have introduced..."
   bill_refs_json: '["H.R. 3562", "S. 1123", "S. 789"]'
   
7. Future matching enhancements can:
   - Boost match scores when claim.bill_refs_json contains matched bill
   - Show bill references in matchability analysis
   - Filter claims with known bill references
""")

print("\n✅ Bill extraction captures bills even when sentence doesn't mention them")
print("=" * 80)
