"""
GSA Site Scanning Sync Job — Government Website Tech Footprint

Downloads the daily CSV of all federal website scans from GSA,
maps third-party service domains to tracked tech companies,
and stores results for cross-referencing with lobbying and contracts.

Rate limit: None (public CSV download).

Usage:
    python jobs/sync_site_scanning.py
    python jobs/sync_site_scanning.py --dry-run
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal
from models.government_data_models import GovernmentWebsiteScan
from connectors.gsa_site_scanning import fetch_site_scanning_csv
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Sync GSA Site Scanning data")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't insert")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        records = fetch_site_scanning_csv()
        if not records:
            logger.warning("No site scanning data received")
            return

        inserted = 0
        skipped = 0

        for rec in records:
            exists = db.query(GovernmentWebsiteScan).filter_by(dedupe_hash=rec["dedupe_hash"]).first()
            if exists:
                skipped += 1
                continue

            if args.dry_run:
                inserted += 1
                continue

            try:
                scan = GovernmentWebsiteScan(
                    target_url=rec["target_url"],
                    final_url=rec["final_url"],
                    agency=rec["agency"],
                    bureau=rec["bureau"],
                    status_code=rec["status_code"],
                    third_party_domains=rec["third_party_domains"],
                    third_party_count=rec.get("third_party_count", 0),
                    matched_company_ids=rec["matched_company_ids"],
                    scan_date=rec["scan_date"],
                    dedupe_hash=rec["dedupe_hash"],
                )
                db.add(scan)
                db.flush()
                inserted += 1
            except Exception as e:
                db.rollback()
                logger.error("Failed to insert site scan for %s: %s", rec["target_url"], e)
                continue

        if not args.dry_run and inserted > 0:
            db.commit()

        prefix = "[DRY-RUN] " if args.dry_run else ""
        logger.info(
            "%sSite Scanning sync complete: %d new scans, %d skipped (already exists)",
            prefix, inserted, skipped,
        )
    except Exception as e:
        logger.error("Site Scanning sync failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
