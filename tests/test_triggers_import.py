import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from jobs.ingest_claims import CLAIM_TRIGGERS
import re

sentence = "Senators Elizabeth Warren (D-Mass.), Richard Blumenthal (D-Conn.), along with Representative Dan Goldman (D-N.Y.) led 27 lawmakers in writing to the Inspectors General for the Department of Justice"

print("=== Testing trigger patterns ===")
print(f"\nSentence: {sentence}\n")

matched = []
for trigger in CLAIM_TRIGGERS:
    if re.search(trigger, sentence, re.IGNORECASE):
        matched.append(trigger)
        print(f"PASS: MATCH: {trigger}")

if not matched:
    print("!!! NO MATCHES FOUND !!!")
    print("\nTrigger patterns:")
    for t in CLAIM_TRIGGERS:
        print(f"  {t}")
