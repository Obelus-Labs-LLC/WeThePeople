"""Retry-sweep job for missing Internet Archive snapshots.

The story-approve flow fires a synchronous Save Page Now request to
the Wayback Machine and persists the resulting URL on
`story.evidence.wayback_url`. The IA service rate-limits and is
occasionally slow, so a non-trivial fraction of attempts will fail
or time out at publish time.

This job sweeps published stories that don't yet have a snapshot URL
and retries each one. Designed to run from a daily cron:

    0 4 * * *  cd /home/dshon/wethepeople-backend && \
                 .venv/bin/python -m jobs.retry_wayback_snapshots

CLI flags:
    --max-stories N   process at most N stories per run (default 50)
    --dry-run         report what would be retried without firing
    --since DAYS      only consider stories published in the last
                      DAYS days (default 365)

The job is idempotent: a successful retry writes the snapshot URL to
the story row, so the next run skips it. Failures are silent (logged)
so a single retry run can chew through a backlog without bailing on
one bad URL.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow running as `python -m jobs.retry_wayback_snapshots`.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from models.database import SessionLocal  # noqa: E402
from models.stories_models import Story  # noqa: E402
from services.wayback_archive import archive_published_story  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("retry_wayback_snapshots")

# Inter-request delay. Save Page Now can rate-limit when hammered;
# 6 seconds between requests keeps us well under their public limit.
INTER_REQUEST_DELAY_SEC = 6


def _has_wayback_url(story: Story) -> bool:
    if not isinstance(story.evidence, dict):
        return False
    val = story.evidence.get("wayback_url")
    return bool(val and isinstance(val, str) and val.strip())


def _candidates(db, *, since_days: int, max_stories: int):
    """Return a queryset of published stories that need a snapshot.

    We can't filter on `evidence->>'wayback_url'` portably across
    SQLite and PostgreSQL with our SQLAlchemy version, so we pull a
    bounded window of recent published stories and filter in Python.
    The window is capped at max_stories * 4 so a single run doesn't
    iterate the entire archive.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
    rows = (
        db.query(Story)
        .filter(
            Story.status == "published",
            Story.published_at >= cutoff,
        )
        .order_by(Story.published_at.desc())
        .limit(max_stories * 4)
        .all()
    )
    out = []
    for s in rows:
        if not s.slug:
            continue
        if _has_wayback_url(s):
            continue
        out.append(s)
        if len(out) >= max_stories:
            break
    return out


def _persist_snapshot(db, story: Story, snapshot_url: str) -> None:
    evidence = dict(story.evidence) if isinstance(story.evidence, dict) else {}
    evidence["wayback_url"] = snapshot_url
    evidence["wayback_archived_at"] = datetime.now(timezone.utc).isoformat()
    story.evidence = evidence
    flag_modified(story, "evidence")
    db.commit()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Retry Wayback Machine snapshots for published stories with no archived URL."
    )
    parser.add_argument("--max-stories", type=int, default=50,
                        help="Max stories to retry in one run (default 50)")
    parser.add_argument("--since", type=int, default=365,
                        help="Only consider stories published in the last N days (default 365)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would be retried without firing")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        candidates = _candidates(
            db, since_days=args.since, max_stories=args.max_stories,
        )
    finally:
        # Re-open for the per-row commits below; the candidate scan
        # is read-only.
        db.close()

    if not candidates:
        logger.info("No published stories without Wayback snapshots in the window.")
        return 0

    logger.info(
        "Retrying Wayback snapshot for %d stories (since=%dd, max=%d, dry_run=%s).",
        len(candidates), args.since, args.max_stories, args.dry_run,
    )

    succeeded = 0
    failed = 0
    for i, story in enumerate(candidates, start=1):
        logger.info("[%d/%d] %s", i, len(candidates), story.slug)
        if args.dry_run:
            continue
        try:
            url = archive_published_story(story.slug)
        except Exception as e:
            logger.warning("  errored: %s", e)
            failed += 1
            continue
        if not url:
            logger.warning("  no snapshot URL returned")
            failed += 1
            continue

        # Reopen a session per row so a single transaction failure
        # doesn't poison the whole sweep.
        db = SessionLocal()
        try:
            fresh = db.query(Story).filter(Story.id == story.id).first()
            if fresh is None:
                logger.warning("  story disappeared between scan and persist")
                failed += 1
                continue
            _persist_snapshot(db, fresh, url)
            logger.info("  ok -> %s", url)
            succeeded += 1
        except Exception as e:
            try:
                db.rollback()
            except Exception:
                pass
            logger.warning("  persist failed: %s", e)
            failed += 1
        finally:
            db.close()

        if i < len(candidates):
            time.sleep(INTER_REQUEST_DELAY_SEC)

    logger.info("Done. succeeded=%d failed=%d", succeeded, failed)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
