#!/usr/bin/env python3
"""
Apply approved retraction patches to the stories table.

Reads:
    .planning/STORY_RETRACTION_PATCHES.json

For every patch with `approved: true`:
  * Logs a row in `story_corrections` (one per patch)
  * Updates the story's `status` to the proposed status
  * Sets `retraction_reason` when the proposed status is `retracted`
  * Skips if the current row already matches the target status

Idempotent. Re-running after a partial apply finishes the rest.
Always runs in a transaction per patch — a failure on one row
doesn't poison the rest.

Dry-run by default. Use `--apply` to actually write.

Usage
-----
    python scripts/apply_retraction_patches.py --dry-run
    python scripts/apply_retraction_patches.py --apply
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.stories_models import Story, StoryCorrection  # noqa: E402

load_dotenv()

DEFAULT_PATCHES = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".planning",
    "STORY_RETRACTION_PATCHES.json",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--patches", default=DEFAULT_PATCHES,
                        help=f"Patches JSON path (default: {DEFAULT_PATCHES})")
    parser.add_argument("--apply", action="store_true",
                        help="Actually write changes (default is dry-run)")
    parser.add_argument("--corrected-by", default="editorial-rebuild",
                        help="story_corrections.corrected_by value (default: editorial-rebuild)")
    args = parser.parse_args()

    patches_path = Path(args.patches)
    if not patches_path.exists():
        print(f"Patches file not found: {patches_path}")
        return 2

    payload = json.loads(patches_path.read_text(encoding="utf-8"))
    patches = payload.get("patches", [])
    approved = [p for p in patches if p.get("approved") is True]
    print(f"Patches loaded: {len(patches)}")
    print(f"Approved:       {len(approved)}")

    if not approved:
        print("No patches marked approved. Edit the patches file (approved: true) "
              "and re-run.")
        return 0

    db_url = os.getenv("DATABASE_URL") or os.getenv("WTP_DB_URL") or "sqlite:///./wethepeople.db"
    print(f"DB: {db_url.split('@')[-1]}")
    print(f"Mode: {'APPLY' if args.apply else 'DRY-RUN'}")
    print()

    engine = create_engine(db_url, echo=False)
    Session = sessionmaker(bind=engine)

    applied = 0
    skipped = 0
    errors = 0

    for p in approved:
        story_id = p.get("story_id")
        proposed_status = p.get("proposed_status")
        slug = p.get("slug") or "?"

        if not story_id or not proposed_status:
            print(f"[skip] missing story_id or proposed_status: {p}")
            skipped += 1
            continue

        session = Session()
        try:
            story = session.query(Story).filter(Story.id == story_id).first()
            if story is None:
                print(f"[skip] story {story_id} ({slug}) not found")
                skipped += 1
                session.close()
                continue

            if story.status == proposed_status:
                print(f"[noop] story {story_id} ({slug}) already at status={proposed_status}")
                skipped += 1
                session.close()
                continue

            if not args.apply:
                print(f"[dry-run] would transition story {story_id} ({slug}): "
                      f"{story.status} → {proposed_status}")
                applied += 1
                session.close()
                continue

            # Log the correction row first.
            correction = StoryCorrection(
                story_id=story.id,
                correction_type=p.get("proposed_correction_type") or "retraction",
                description=(
                    p.get("proposed_retraction_reason")
                    or f"Status transition {story.status} → {proposed_status} "
                       f"under May 2026 editorial-standards rebuild. "
                       f"Audit findings: {', '.join(p.get('audit_finding_codes', []))}."
                ),
                corrected_at=datetime.utcnow(),
                corrected_by=args.corrected_by,
            )
            session.add(correction)

            # Apply the status transition.
            story.status = proposed_status
            if proposed_status == "retracted":
                story.retraction_reason = p.get("proposed_retraction_reason")

            session.commit()
            applied += 1
            print(f"[applied] story {story_id} ({slug}): → {proposed_status}")
        except Exception as e:
            print(f"[error] story {story_id} ({slug}): {e}")
            errors += 1
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()

    print()
    print(f"Done. applied={applied} skipped={skipped} errors={errors}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
