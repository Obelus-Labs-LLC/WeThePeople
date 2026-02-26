text = """Washington, D.C. —U.S. Senators Elizabeth Warren (D-Mass.), Richard Blumenthal (D-Conn.), along with Representative Dan Goldman (D-N.Y.) led 27 lawmakers in writing to the Inspectors General for the Department of Justice (DOJ), Federal Trade Commission (FTC), and Securities and Exchange Commission (SEC), calling for investigations into whether the Trump Administration's reorganization of white-collar crime enforcement divisions is compromising the agencies capability to protect American consumers."""

words = text.split()
print(f"Word count: {len(words)}")
print(f"Over 60? {len(words) > 60}")
