"""
IT Dashboard Sync Job — Federal IT Investment Data

Downloads CIO ratings and investment data from itdashboard.gov CSV feeds.
Matches vendor names to tracked companies using fuzzy substring matching.

Rate limit: None (CSV downloads).

Usage:
    python jobs/sync_it_dashboard.py
    python jobs/sync_it_dashboard.py --dry-run
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal
from models.government_data_models import ITInvestment
from models.defense_models import TrackedDefenseCompany
from models.tech_models import TrackedTechCompany
from connectors.it_dashboard import fetch_cio_ratings
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _build_company_lookup(db) -> dict:
    """Build a lookup dict for fuzzy matching vendor names to tracked companies."""
    lookup = {}

    for co in db.query(TrackedDefenseCompany).filter(TrackedDefenseCompany.is_active == 1).all():
        lookup[co.display_name.lower()] = co.company_id
        if co.ticker:
            lookup[co.ticker.lower()] = co.company_id

    for co in db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1).all():
        lookup[co.display_name.lower()] = co.company_id
        if co.ticker:
            lookup[co.ticker.lower()] = co.company_id

    return lookup


def _match_vendor(vendor_name: str, lookup: dict) -> str:
    """Fuzzy match a vendor name to a tracked company ID."""
    if not vendor_name:
        return ""

    vn_lower = vendor_name.lower().strip()

    # Exact match
    if vn_lower in lookup:
        return lookup[vn_lower]

    # Substring match — check if any tracked company name is IN the vendor name
    for company_name, company_id in lookup.items():
        if len(company_name) >= 4 and company_name in vn_lower:
            return company_id

    # Check if vendor name is IN any tracked company name
    for company_name, company_id in lookup.items():
        if len(vn_lower) >= 4 and vn_lower in company_name:
            return company_id

    return ""


def main():
    parser = argparse.ArgumentParser(description="Sync IT Dashboard investment data")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't insert")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        # Build company lookup for vendor matching
        lookup = _build_company_lookup(db)
        logger.info("Company lookup built: %d entries", len(lookup))

        # Fetch CIO ratings
        records = fetch_cio_ratings()
        if not records:
            logger.warning("No CIO ratings data received")
            return

        inserted = 0
        matched = 0

        for rec in records:
            exists = db.query(ITInvestment).filter_by(dedupe_hash=rec["dedupe_hash"]).first()
            if exists:
                continue

            if args.dry_run:
                inserted += 1
                continue

            # Try to match vendor name (IT Dashboard doesn't always have vendor in CIO CSV)
            vendor_name = rec.get("vendor_name", "")
            matched_id = _match_vendor(vendor_name, lookup) if vendor_name else ""
            if matched_id:
                matched += 1

            try:
                inv = ITInvestment(
                    agency_code=rec["agency_code"],
                    agency_name=rec["agency_name"],
                    investment_title=rec["investment_title"],
                    unique_investment_id=rec["unique_investment_id"],
                    cio_rating=rec["cio_rating"],
                    total_it_spending=rec["total_it_spending"],
                    lifecycle_cost=rec["lifecycle_cost"],
                    schedule_variance=rec["schedule_variance"],
                    cost_variance=rec["cost_variance"],
                    vendor_name=vendor_name,
                    matched_company_id=matched_id,
                    dedupe_hash=rec["dedupe_hash"],
                )
                db.add(inv)
                db.flush()
                inserted += 1
            except Exception as e:
                db.rollback()
                logger.error("Failed to insert IT investment: %s", e)
                continue

        if not args.dry_run and inserted > 0:
            db.commit()

        prefix = "[DRY-RUN] " if args.dry_run else ""
        logger.info(
            "%sIT Dashboard sync complete: %d new investments, %d matched to tracked companies",
            prefix, inserted, matched,
        )
    except Exception as e:
        logger.error("IT Dashboard sync failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
