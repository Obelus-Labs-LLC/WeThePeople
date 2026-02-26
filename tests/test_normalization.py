"""Test normalization utilities"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.normalization import (
    normalize_bill_id,
    compute_action_dedupe_hash,
    normalize_action_text,
    extract_chamber_from_action,
    extract_committee_from_action
)

print("="*60)
print("NORMALIZATION UTILITIES TEST")
print("="*60)

# Test 1: normalize_bill_id
print("\n1. Bill ID Normalization:")
print(f"   HR 2670 (118th) → {normalize_bill_id(118, 'HR', 2670)}")
print(f"   S 42 (117th) → {normalize_bill_id(117, 'S', 42)}")
print(f"   HJRES 5 (119th) → {normalize_bill_id(119, 'HJRES', 5)}")
print(f"   Mixed case: Hr 123 → {normalize_bill_id(118, 'Hr', 123)}")

# Test 2: normalize_action_text
print("\n2. Action Text Normalization:")
test_texts = [
    "Introduced in House",
    "Introduced in House.",
    "INTRODUCED IN HOUSE",
    "  Introduced   in    House  ",
]
for text in test_texts:
    print(f"   '{text}' → '{normalize_action_text(text)}'")

# Test 3: compute_action_dedupe_hash
print("\n3. Dedupe Hash:")
hash1 = compute_action_dedupe_hash("hr2670-118", "2024-01-15", "Introduced in House")
hash2 = compute_action_dedupe_hash("hr2670-118", "2024-01-15", "Introduced in House.")
hash3 = compute_action_dedupe_hash("hr2670-118", "2024-01-15", "INTRODUCED IN HOUSE")
hash4 = compute_action_dedupe_hash("hr2670-118", "2024-01-16", "Introduced in House")

print(f"   Same action (different punctuation): {hash1 == hash2}")
print(f"   Same action (different case): {hash1 == hash3}")
print(f"   Different date: {hash1 == hash4}")
print(f"   Sample hash: {hash1}")

# Test 4: extract_chamber_from_action
print("\n4. Chamber Extraction:")
test_cases = [
    ("Intro-H", "Introduced in House"),
    ("Intro-S", "Introduced in Senate"),
    (None, "Introduced in House"),
    (None, "Passed House"),
    (None, "Some generic action"),
    ("H11100", "Referred to Committee"),
]
for code, text in test_cases:
    chamber = extract_chamber_from_action(code, text)
    print(f"   code={code}, text='{text[:30]}...' → {chamber}")

# Test 5: extract_committee_from_action
print("\n5. Committee Extraction:")
test_cases = [
    ("Referred to the Committee on Ways and Means", None),
    ("Referred to the Committee on Energy and Commerce", None),
    ("Some generic action", None),
    ("Referred to Ways and Means", None),
]
for text, raw_json in test_cases:
    committee = extract_committee_from_action(text, raw_json)
    print(f"   '{text[:40]}...' → {committee}")

print("\n" + "="*60)
print("✅ All normalization tests complete")
print("="*60)
