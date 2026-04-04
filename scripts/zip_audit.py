"""Audit ZIP code prefix-to-state mapping against USPS standard."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
politics_path = ROOT / "routers" / "politics_people.py"

with open(politics_path, "r") as f:
    content = f.read()

# Extract our _ZIP_STATE dict
match = re.search(r"_ZIP_STATE.*?=\s*\{(.*?)\}", content, re.DOTALL)
if not match:
    print("Could not find _ZIP_STATE dict")
    exit()

entries = {}
for m in re.finditer(r'"(\d{3})":\s*"([A-Z]{2})"', match.group(1)):
    entries[m.group(1)] = m.group(2)

print(f"Total prefixes in our map: {len(entries)}")

# Authoritative USPS 3-digit prefix mapping (known correct)
# Source: https://pe.usps.com/archive/html/dmmarchive20050106/print/L002.htm
CORRECT = {}

# Build correct mapping for ALL states
state_ranges = {
    "CT": [(60, 69)],
    "MA": [(10, 27), (55, 55)],  # 055 is a special MA prefix
    "ME": [(39, 49)],
    "NH": [(30, 38)],
    "NJ": [(70, 89)],
    "PR": [(6, 9), (0, 0)],
    "RI": [(28, 29)],
    "VT": [(50, 54), (56, 59)],
    "NY": [(100, 149)],
    "PA": [(150, 196)],
    "DE": [(197, 199)],
    "DC": [(200, 200), (202, 203)],
    "VA": [(201, 201), (204, 204), (220, 246)],
    "WV": [(205, 205), (247, 268)],
    "MD": [(206, 219)],
    "NC": [(270, 289)],
    "SC": [(290, 299)],
    "GA": [(300, 319), (398, 399)],
    "FL": [(320, 349)],
    "AL": [(350, 369)],
    "TN": [(370, 385)],
    "MS": [(386, 397)],
    "KY": [(400, 427)],
    "OH": [(430, 458)],
    "IN": [(460, 479)],
    "MI": [(480, 499)],
    "IA": [(500, 528)],
    "WI": [(530, 549)],
    "MN": [(550, 567)],
    "SD": [(570, 577)],
    "ND": [(580, 588)],
    "MT": [(590, 599)],
    "IL": [(600, 629)],
    "MO": [(630, 658)],
    "KS": [(660, 679)],
    "NE": [(680, 693)],
    "LA": [(700, 714)],
    "AR": [(716, 729)],
    "OK": [(730, 749)],
    "TX": [(750, 799)],
    "CO": [(800, 816)],
    "WY": [(820, 831)],
    "ID": [(832, 838)],
    "UT": [(840, 847)],
    "AZ": [(850, 865)],
    "NM": [(870, 884)],
    "NV": [(889, 898)],
    "CA": [(900, 961)],
    "HI": [(967, 968)],
    "OR": [(970, 979)],
    "WA": [(980, 994)],
    "AK": [(995, 999)],
}

for state, ranges in state_ranges.items():
    for start, end in ranges:
        for p in range(start, end + 1):
            CORRECT[str(p).zfill(3)] = state

# Compare
errors = []
for prefix in sorted(entries.keys()):
    ours = entries[prefix]
    correct = CORRECT.get(prefix)
    if correct and ours != correct:
        errors.append(f"  {prefix}: ours={ours} should_be={correct}")

# Check for missing prefixes that should exist
missing = []
for prefix in sorted(CORRECT.keys()):
    if prefix not in entries:
        missing.append(f"  {prefix}: MISSING (should be {CORRECT[prefix]})")

print(f"\nERRORS (wrong state): {len(errors)}")
for e in errors:
    print(e)

print(f"\nMISSING PREFIXES: {len(missing)}")
for m in missing[:15]:
    print(m)
if len(missing) > 15:
    print(f"  ... +{len(missing) - 15} more")
