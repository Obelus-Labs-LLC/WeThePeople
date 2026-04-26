"""Quick post-correction sanity check.

Verifies that every story we corrected via
`jobs/correct_lobby_double_count_stories.py` has the new dollar value
appearing in the title AND the lead paragraph (after the correction
notice). Prints any mismatch so we can spot stories where the
substitution did the wrong thing.
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal  # noqa: E402
from models.stories_models import Story  # noqa: E402


CORRECTED_IDS = [125, 127, 128, 143, 166, 220, 226, 228]
MONEY_PAT = re.compile(r"\$[\d.,]+(?:[BMK])?")


def main():
    db = SessionLocal()
    for sid in CORRECTED_IDS:
        s = db.get(Story, sid)
        if not s:
            print(f"#{sid}  MISSING")
            continue
        title_nums = MONEY_PAT.findall(s.title)
        body = s.body or ""
        # Skip the correction-notice block (starts with > **Correction).
        if body.lstrip().startswith(">"):
            after_notice = body.split("\n\n", 1)[1] if "\n\n" in body else body
        else:
            after_notice = body
        body_nums = MONEY_PAT.findall(after_notice[:1500])

        flag = ""
        if title_nums:
            t = title_nums[-1]  # last money in title (lobby figure if multi)
            if t not in (after_notice[:1500] or ""):
                flag = "  ⚠ title-figure not in body"
        print(f"#{sid:3d} title={title_nums} body[:1500]={body_nums[:6]}{flag}")
    db.close()


if __name__ == "__main__":
    main()
