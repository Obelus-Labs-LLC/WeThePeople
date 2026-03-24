"""
SAM.gov Sync Job — Exclusions + Entity Data

Syncs debarment/suspension data and entity registrations from SAM.gov
for all tracked companies across all 7 sectors. Defense companies are
prioritized since they're most relevant for procurement exclusions.

Rate limit: 10 requests/day (personal API key).
Budget system: --budget N controls how many companies to process per run.
At 5 companies/day (2 calls each), defense sector (60 companies) takes 12 days.

Usage:
    python jobs/sync_samgov.py
    python jobs/sync_samgov.py --budget 10
    python jobs/sync_samgov.py --company-id lockheed-martin
    python jobs/sync_samgov.py --skip-exclusions
    python jobs/sync_samgov.py --skip-entities
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
from models.government_data_models import SAMExclusion, SAMEntity
from connectors.samgov import fetch_exclusions, fetch_entity
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# Priority order: defense first (most relevant for SAM exclusions)
SECTOR_MODELS = [
    ("defense", TrackedDefenseCompany),
    ("energy", TrackedEnergyCompany),
    ("transportation", TrackedTransportationCompany),
    ("tech", TrackedTechCompany),
    ("health", TrackedHealthCompany),
    ("finance", TrackedInstitution),
]


def sync_exclusions(company_id: str, display_name: str, api_key: str, db) -> int:
    """Sync SAM.gov exclusions for a single company."""
    records = fetch_exclusions(display_name, api_key)
    inserted = 0

    for rec in records:
        exists = db.query(SAMExclusion).filter_by(dedupe_hash=rec["dedupe_hash"]).first()
        if exists:
            continue

        try:
            excl = SAMExclusion(
                company_id=company_id,
                sam_number=rec["sam_number"],
                entity_name=rec["entity_name"],
                exclusion_type=rec["exclusion_type"],
                exclusion_program=rec["exclusion_program"],
                excluding_agency=rec["excluding_agency"],
                activation_date=rec["activation_date"],
                termination_date=rec["termination_date"],
                description=rec["description"],
                classification=rec["classification"],
                city=rec.get("city", ""),
                state=rec.get("state", ""),
                dedupe_hash=rec["dedupe_hash"],
            )
            db.add(excl)
            db.flush()
            inserted += 1
        except Exception as e:
            db.rollback()
            logger.error("Failed to insert SAM exclusion for %s: %s", company_id, e)
            continue

    if inserted > 0:
        db.commit()
    logger.info("SAM exclusions for %s: %d new records", company_id, inserted)
    return inserted


def sync_entities(company_id: str, display_name: str, api_key: str, db) -> int:
    """Sync SAM.gov entity registration data for a single company."""
    records = fetch_entity(display_name, api_key)
    inserted = 0

    for rec in records:
        exists = db.query(SAMEntity).filter_by(dedupe_hash=rec["dedupe_hash"]).first()
        if exists:
            continue

        try:
            ent = SAMEntity(
                company_id=company_id,
                uei=rec["uei"],
                cage_code=rec["cage_code"],
                legal_business_name=rec["legal_business_name"],
                dba_name=rec["dba_name"],
                physical_address=rec["physical_address"],
                naics_codes=rec["naics_codes"],
                parent_uei=rec["parent_uei"],
                parent_name=rec["parent_name"],
                registration_status=rec["registration_status"],
                registration_date=rec.get("registration_date"),
                exclusion_status_flag=rec.get("exclusion_status_flag", ""),
                dedupe_hash=rec["dedupe_hash"],
            )
            db.add(ent)
            db.flush()
            inserted += 1
        except Exception as e:
            db.rollback()
            logger.error("Failed to insert SAM entity for %s: %s", company_id, e)
            continue

    if inserted > 0:
        db.commit()
    logger.info("SAM entities for %s: %d new records", company_id, inserted)
    return inserted


def main():
    parser = argparse.ArgumentParser(description="Sync SAM.gov exclusions + entities")
    parser.add_argument("--company-id", type=str, help="Sync only this company")
    parser.add_argument("--budget", type=int, default=5, help="Max companies to process (default 5, each costs 2 API calls)")
    parser.add_argument("--skip-exclusions", action="store_true", help="Skip exclusions sync")
    parser.add_argument("--skip-entities", action="store_true", help="Skip entity sync")
    args = parser.parse_args()

    api_key = os.getenv("SAM_GOV_API_KEY", "")
    if not api_key:
        logger.error("SAM_GOV_API_KEY not set. Exiting.")
        sys.exit(1)

    db = SessionLocal()
    try:
        # Build company list across all sectors, defense first
        companies = []

        if args.company_id:
            # Search across all sector tables
            for sector_name, model in SECTOR_MODELS:
                id_col = "company_id" if hasattr(model, "company_id") else "institution_id"
                col = getattr(model, id_col, None)
                if col is None:
                    continue
                match = db.query(model).filter(col == args.company_id).first()
                if match:
                    companies.append((args.company_id, match.display_name, sector_name))
                    break
            if not companies:
                logger.error("Company '%s' not found in any sector", args.company_id)
                sys.exit(1)
        else:
            # Gather all active companies, defense first
            for sector_name, model in SECTOR_MODELS:
                query = db.query(model).filter(model.is_active == 1)
                for co in query.all():
                    cid = getattr(co, "company_id", None) or getattr(co, "institution_id", None)
                    if cid:
                        # Skip if already synced (has SAM entity record)
                        already = db.query(SAMEntity).filter_by(company_id=cid).first()
                        if not already:
                            companies.append((cid, co.display_name, sector_name))

        # Apply budget
        budget = min(args.budget, len(companies))
        companies = companies[:budget]

        logger.info("SAM.gov sync: %d companies to process (budget: %d)", len(companies), args.budget)

        total_exclusions = 0
        total_entities = 0

        for i, (cid, name, sector) in enumerate(companies, 1):
            logger.info("Processing %d/%d: %s (%s)", i, len(companies), name, sector)

            if not args.skip_exclusions:
                total_exclusions += sync_exclusions(cid, name, api_key, db)

            if not args.skip_entities:
                total_entities += sync_entities(cid, name, api_key, db)

        logger.info(
            "SAM.gov sync complete: %d exclusions, %d entities inserted across %d companies",
            total_exclusions, total_entities, len(companies),
        )
    except Exception as e:
        logger.error("SAM.gov sync failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
