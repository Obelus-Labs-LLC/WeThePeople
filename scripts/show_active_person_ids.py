"""Print active tracked_members person_id values for copy/paste.

Designed for operators configuring PILOT_PERSON_IDS.

Usage:
  python scripts/show_active_person_ids.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow running as: python scripts/show_active_person_ids.py
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from models.database import SessionLocal, TrackedMember


def main() -> int:
    db = SessionLocal()
    try:
        rows = (
            db.query(TrackedMember.person_id)
            .filter(TrackedMember.is_active == 1)
            .order_by(TrackedMember.person_id.asc())
            .all()
        )
    finally:
        db.close()

    ids = [r[0] for r in rows if r and r[0]]
    print(f"ACTIVE_TRACKED_MEMBERS: {len(ids)}")
    for pid in ids:
        print(pid)
    print("\nNOTE: This is a discovery list of ALL active tracked_members.")
    print("Do NOT paste it directly into PILOT_PERSON_IDS without manually selecting pilots.")
    print("\nALL_ACTIVE_PERSON_IDS (comma-separated):")
    print(",".join(ids))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BrokenPipeError:
        import os

        try:
            sys.stdout = open(os.devnull, "w")
        except Exception:
            pass
        raise SystemExit(0)
