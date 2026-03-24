"""
Regulations.gov Sync Job — Corporate Regulatory Comments

Searches for comments submitted by tracked companies on federal regulations.
Detects regulatory capture: companies that lobby AND comment on regulations
affecting their business.

Rate limit: 1,000 requests/hour (ample for all ~645 entities in one run).

Usage:
    python jobs/sync_regulatory_comments.py
    python jobs/sync_regulatory_comments.py --company-id pfizer
    python jobs/sync_regulatory_comments.py --sector health
    python jobs/sync_regulatory_comments.py --limit 50
"""

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal
from models.defense_models import TrackedDefenseCompany
from models.transportation_models import TrackedTransportationCompany
from models.energy_models import TrackedEnergyCompany
from models.tech_models import TrackedTechCompany
from models.health_models import TrackedCompany as TrackedHealthCompany
from models.finance_models import TrackedInstitution
from models.government_data_models import RegulatoryComment
from connectors.regulationsgov import fetch_comments_by_org
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Sector to agency mapping — focus searches on relevant agencies
SECTOR_AGENCIES = {
    "defense": ["DOD", "DARPA", "DLA"],
    "energy": ["EPA", "DOE", "FERC", "NRC"],
    "transportation": ["DOT", "FAA", "NHTSA", "FMCSA"],
    "tech": ["FTC", "FCC", "NTIA"],
    "health": ["FDA", "CMS", "HHS", "CDC"],
    "finance": ["SEC", "CFTC", "FDIC", "OCC", "CFPB"],
}

SECTOR_MODELS = [
    ("defense", TrackedDefenseCompany),
    ("energy", TrackedEnergyCompany),
    ("transportation", TrackedTransportationCompany),
    ("tech", TrackedTechCompany),
    ("health", TrackedHealthCompany),
    ("finance", TrackedInstitution),
]


def sync_comments(company_id: str, display_name: str, sector: str, api_key: str, db) -> int:
    """Sync regulatory comments for a single company."""
    agencies = SECTOR_AGENCIES.get(sector, [])
    inserted = 0

    # Search broadly first (no agency filter), then by relevant agencies
    searches = [None] + agencies  # None = broad search

    for agency_id in searches:
        records = fetch_comments_by_org(
            display_name, api_key, agency_id=agency_id, max_pages=3
        )

        for rec in records:
            exists = db.query(RegulatoryComment).filter_by(dedupe_hash=rec["dedupe_hash"]).first()
            if exists:
                continue

            try:
                comment = RegulatoryComment(
                    company_id=company_id,
                    comment_id=rec["comment_id"],
                    document_id=rec["document_id"],
                    docket_id=rec["docket_id"],
                    agency_id=rec["agency_id"],
                    title=rec["title"],
                    posted_date=rec["posted_date"],
                    commenter_name=rec["commenter_name"],
                    comment_text=rec["comment_text"],
                    dedupe_hash=rec["dedupe_hash"],
                )
                db.add(comment)
                db.flush()
                inserted += 1
            except Exception as e:
                db.rollback()
                logger.error("Failed to insert regulatory comment for %s: %s", company_id, e)
                continue

    if inserted > 0:
        db.commit()
    logger.info("Regulatory comments for %s: %d new records", company_id, inserted)
    return inserted


def main():
    parser = argparse.ArgumentParser(description="Sync regulatory comments from Regulations.gov")
    parser.add_argument("--company-id", type=str, help="Sync only this company")
    parser.add_argument("--sector", type=str, help="Sync only this sector (defense, energy, tech, health, finance, transportation)")
    parser.add_argument("--limit", type=int, default=0, help="Max companies to process (0 = all)")
    args = parser.parse_args()

    api_key = os.getenv("REGULATIONS_GOV_API_KEY", "")
    if not api_key:
        logger.error("REGULATIONS_GOV_API_KEY not set. Exiting.")
        sys.exit(1)

    db = SessionLocal()
    try:
        companies = []

        for sector_name, model in SECTOR_MODELS:
            if args.sector and sector_name != args.sector:
                continue

            query = db.query(model).filter(model.is_active == 1)

            if args.company_id:
                id_col = "company_id" if hasattr(model, "company_id") else "institution_id"
                query = query.filter(getattr(model, id_col) == args.company_id)

            for co in query.all():
                cid = getattr(co, "company_id", None) or getattr(co, "institution_id", None)
                if cid:
                    companies.append((cid, co.display_name, sector_name))

        if args.limit > 0:
            companies = companies[:args.limit]

        logger.info("Regulatory comments sync: %d companies to process", len(companies))

        total_comments = 0
        for i, (cid, name, sector) in enumerate(companies, 1):
            logger.info("Processing %d/%d: %s (%s)", i, len(companies), name, sector)
            total_comments += sync_comments(cid, name, sector, api_key, db)

        logger.info(
            "Regulatory comments sync complete: %d new comments across %d companies",
            total_comments, len(companies),
        )
    except Exception as e:
        logger.error("Regulatory comments sync failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
