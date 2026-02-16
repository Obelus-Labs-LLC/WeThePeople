import re

sentence = "U.S. Senators Elizabeth Warren (D-Mass.), Richard Blumenthal (D-Conn.), along with Representative Dan Goldman (D-N.Y.) led 27 lawmakers in writing to the Inspectors General"

triggers = [
    r'\bWarren led\b',
    r'\bWarren.*led\b',
    r'\bSenator.*led\b',
]

print("Testing sentence:")
print(sentence)
print()

for pattern in triggers:
    match = re.search(pattern, sentence, re.IGNORECASE)
    print(f"Pattern: {pattern:<30} Match: {match is not None}")
    if match:
        print(f"  Matched text: {match.group()[:100]}")
