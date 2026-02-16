"""
One-time job: Fetch Wikipedia thumbnail photos for all tracked members.

Stores the photo URL directly in the tracked_members table so the
/people endpoint can serve it without hitting Wikipedia on every request.

Usage:
    python -m jobs.fetch_photos
"""

import time
from models.database import SessionLocal, TrackedMember
from connectors.wikipedia import get_page_summary, find_politician_page
from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# Polite delay between Wikipedia requests
DELAY = 1.5  # seconds


def fetch_all_photos(force: bool = False):
    """
    Fetch Wikipedia thumbnails for all tracked members.

    Args:
        force: If True, re-fetch even if photo_url is already set
    """
    db = SessionLocal()
    try:
        members = db.query(TrackedMember).filter(TrackedMember.is_active == 1).all()
        total = len(members)
        updated = 0
        skipped = 0
        failed = 0

        for i, member in enumerate(members, 1):
            if member.photo_url and not force:
                logger.info("[%d/%d] %s — already has photo, skipping", i, total, member.display_name)
                skipped += 1
                continue

            logger.info("[%d/%d] Fetching photo for %s...", i, total, member.display_name)

            try:
                # First find the Wikipedia page
                title = find_politician_page(member.display_name)
                if not title:
                    logger.warning("  No Wikipedia page found for %s", member.display_name)
                    failed += 1
                    time.sleep(DELAY)
                    continue

                time.sleep(DELAY)

                # Get page summary which includes thumbnail
                summary = get_page_summary(title)
                if not summary:
                    logger.warning("  No summary found for %s", member.display_name)
                    failed += 1
                    time.sleep(DELAY)
                    continue

                thumbnail = summary.get("thumbnail", {})
                photo_url = thumbnail.get("source") if thumbnail else None

                if photo_url:
                    member.photo_url = photo_url
                    db.commit()
                    updated += 1
                    logger.info("  Got photo: %s", photo_url[:80])
                else:
                    logger.warning("  No thumbnail available for %s", member.display_name)
                    failed += 1

            except Exception as e:
                logger.error("  Error fetching photo for %s: %s", member.display_name, e)
                failed += 1

            time.sleep(DELAY)

        logger.info(
            "Photo fetch complete: %d updated, %d skipped, %d failed out of %d total",
            updated, skipped, failed, total,
        )

    finally:
        db.close()


if __name__ == "__main__":
    setup_logging("INFO")
    fetch_all_photos()
