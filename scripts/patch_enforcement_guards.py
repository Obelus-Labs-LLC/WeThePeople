"""
Apply the Federal-Register rulemaking guard to every sector enforcement sync
job. Adds two filters:
  1. classify_enforcement_type() returns None (not "Regulatory Action") when
     the document has none of the enforcement keywords.
  2. The ingestion loop skips any Federal Register document whose `type` is
     'Rule' or 'Proposed Rule', and skips any row whose classified type
     came back as None.

This is idempotent — running it twice is a no-op.
"""

import re
from pathlib import Path

TARGETS = [
    "sync_finance_enforcement.py",
    "sync_health_enforcement.py",
    "sync_energy_enforcement.py",
    "sync_transportation_enforcement.py",
    "sync_defense_enforcement.py",
    "sync_chemicals_enforcement.py",
    "sync_agriculture_enforcement.py",
    "sync_telecom_enforcement.py",
    "sync_education_enforcement.py",
]

JOBS_DIR = Path(__file__).resolve().parent.parent / "jobs"


RULEMAKING_GUARD = (
    "            # Federal Register 'Rule' and 'Proposed Rule' types are rulemakings,\n"
    "            # not enforcement actions — reject them outright so dollar\n"
    "            # thresholds inside the rule text aren't mis-stored as penalties.\n"
    "            doc_type = (doc.get(\"type\") or \"\").strip()\n"
    "            if doc_type in (\"Rule\", \"Proposed Rule\"):\n"
    "                continue\n"
    "\n"
)


def patch(path: Path) -> tuple[bool, list[str]]:
    src = path.read_text(encoding="utf-8")
    orig = src
    changes: list[str] = []

    # 1. classify_enforcement_type: replace the final "Regulatory Action" branch.
    new_src, n = re.subn(
        r'return "Regulatory Action"',
        "return None  # Federal Register rulemaking — not a real enforcement action",
        src,
        count=1,
    )
    if n:
        src = new_src
        changes.append('classify returns None for "Regulatory Action" case')

    # 2. Add rulemaking-type guard right after `seen_doc_numbers.add(doc_num)`
    if "doc_type in (\"Rule\", \"Proposed Rule\")" not in src:
        new_src, n = re.subn(
            r"(seen_doc_numbers\.add\(doc_num\)\n)\n",
            r"\1" + RULEMAKING_GUARD,
            src,
            count=1,
        )
        if n:
            src = new_src
            changes.append("added Rule / Proposed Rule type-guard")

    # 3. In the inner dict-append, skip rows where classify returned None.
    # Pattern:
    #     "enforcement_type": classify_enforcement_type(title, abstract),
    # wrap into a variable set earlier, test, then use. We'll rewrite the
    # whole list-append call to a pre-classified conditional.
    if '"enforcement_type": classify_enforcement_type(title, abstract),' in src:
        src = src.replace(
            '"enforcement_type": classify_enforcement_type(title, abstract),',
            '"enforcement_type": _etype,',
        )
        # Add the _etype assignment and skip-if-None right before the append.
        # We find the "all_results.append({" block opener and precede it with
        # the classify call.
        # Target:
        #     all_results.append({
        src = re.sub(
            r"(\n)(\s+)(all_results\.append\(\{\n)",
            r"""\1\2_etype = classify_enforcement_type(title, abstract)
\2if _etype is None:
\2    continue
\2\3""",
            src,
            count=1,
        )
        changes.append("skip rows where classify returns None")

    # 4. Make extract_penalty reject absurd values that slipped through (sanity).
    if "def extract_penalty" in src and "# sanity: reject > 5e10" not in src:
        src = re.sub(
            r"(def extract_penalty\([^)]*\)[^:]*:\n    \"\"\"[^\"]+\"\"\"\n)",
            r"""\1    # sanity: reject > 5e10 — any penalty >$50B is essentially never a real penalty
    # (the largest ever was ~$20B BofA 2014); values that high are almost always
    # capital thresholds or market-size figures from rulemaking text.
""",
            src,
            count=1,
        )
        # Wrap the return statements to apply the sanity cap
        if "MAX_REAL_PENALTY" not in src:
            src = re.sub(
                r"(def extract_penalty\([^)]*\)[^:]*:\n(?:    [^\n]*\n)+?)",
                lambda m: m.group(1).replace(
                    '    # sanity: reject > 5e10',
                    '    MAX_REAL_PENALTY = 5e10  # $50B cap\n    # sanity: reject > 5e10',
                ),
                src,
                count=1,
            )
            # After the final return None, inject a helper that callers won't need,
            # but we'll instead guard the returned values inline.
            src = re.sub(
                r"(\n            if i == 0:  # billion\n                return amount \* 1_000_000_000\n)",
                r"\n            if i == 0:  # billion\n                val = amount * 1_000_000_000\n                return val if val <= MAX_REAL_PENALTY else None\n",
                src, count=1,
            )
            src = re.sub(
                r"(\n            elif i == 1:  # million\n                return amount \* 1_000_000\n)",
                r"\n            elif i == 1:  # million\n                val = amount * 1_000_000\n                return val if val <= MAX_REAL_PENALTY else None\n",
                src, count=1,
            )
            src = re.sub(
                r"(            else:\n                return amount\n)",
                r"            else:\n                return amount if amount <= MAX_REAL_PENALTY else None\n",
                src, count=1,
            )
        changes.append("added $50B sanity cap on extract_penalty")

    if src != orig:
        path.write_text(src, encoding="utf-8")
        return True, changes
    return False, changes


def main() -> int:
    total = 0
    for name in TARGETS:
        p = JOBS_DIR / name
        if not p.exists():
            print(f"MISSING: {name}")
            continue
        changed, changes = patch(p)
        if changed:
            total += 1
            print(f"PATCHED {name}: {', '.join(changes) or 'no-op'}")
        else:
            print(f"unchanged {name}")
    print(f"\n{total}/{len(TARGETS)} files modified")
    return 0 if total > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
