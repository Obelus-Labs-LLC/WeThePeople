"""
NHTSA Data Sync Job

Fetches recall campaigns and complaint records from NHTSA for all
tracked transportation companies with sector_type 'motor_vehicle'.

Usage:
    python jobs/sync_nhtsa_data.py
    python jobs/sync_nhtsa_data.py --company-id ford
    python jobs/sync_nhtsa_data.py --skip-recalls
    python jobs/sync_nhtsa_data.py --skip-complaints
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal
from models.transportation_models import (
    TrackedTransportationCompany,
    NHTSARecall,
    NHTSAComplaint,
)
from connectors.nhtsa import fetch_recalls, fetch_complaints
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# Map company display_name / company_id to NHTSA make name
# NHTSA uses common make names, not corporate names
COMPANY_TO_MAKE = {
    "general-motors": "GM",
    "ford": "Ford",
    "stellantis": "Chrysler",  # Stellantis brands: Chrysler, Dodge, Jeep, Ram
    "toyota": "Toyota",
    "honda": "Honda",
    "hyundai": "Hyundai",
    "kia": "Kia",
    "nissan": "Nissan",
    "bmw": "BMW",
    "mercedes-benz": "Mercedes-Benz",
    "volkswagen": "Volkswagen",
    "tesla": "Tesla",
    "subaru": "Subaru",
    "mazda": "Mazda",
    "volvo": "Volvo",
    "rivian": "Rivian",
    "lucid": "Lucid",
}

# Additional makes for multi-brand companies (Stellantis, GM, etc.)
COMPANY_EXTRA_MAKES = {
    "stellantis": ["Dodge", "Jeep", "Ram", "Fiat"],
    "general-motors": ["Chevrolet", "Buick", "Cadillac", "GMC"],
    "ford": ["Lincoln"],
    "toyota": ["Lexus"],
    "honda": ["Acura"],
    "hyundai": ["Genesis"],
    "nissan": ["Infiniti"],
    "volkswagen": ["Audi", "Porsche"],
}


def _get_makes_for_company(company_id: str) -> list[str]:
    """Return list of NHTSA make names for a company."""
    primary = COMPANY_TO_MAKE.get(company_id)
    if not primary:
        return []
    makes = [primary]
    extras = COMPANY_EXTRA_MAKES.get(company_id, [])
    makes.extend(extras)
    return makes


def sync_recalls(company: TrackedTransportationCompany, db) -> int:
    """Sync NHTSA recall campaigns for a company."""
    makes = _get_makes_for_company(company.company_id)
    if not makes:
        logger.info("Skipping NHTSA recalls for %s (no make mapping)", company.company_id)
        return 0

    inserted = 0
    for make in makes:
        recalls = fetch_recalls(make)
        for recall_data in recalls:
            # Dedupe check
            exists = db.query(NHTSARecall).filter_by(dedupe_hash=recall_data["dedupe_hash"]).first()
            if exists:
                continue

            try:
                record = NHTSARecall(
                    company_id=company.company_id,
                    recall_number=recall_data["recall_number"],
                    make=recall_data["make"],
                    model=recall_data["model"],
                    model_year=recall_data["model_year"],
                    recall_date=recall_data["recall_date"],
                    component=recall_data["component"],
                    summary=recall_data["summary"],
                    consequence=recall_data["consequence"],
                    remedy=recall_data["remedy"],
                    manufacturer=recall_data["manufacturer"],
                    dedupe_hash=recall_data["dedupe_hash"],
                )
                db.add(record)
                db.flush()
                inserted += 1
            except Exception as e:
                db.rollback()
                logger.error("Failed to insert NHTSA recall %s for %s: %s",
                             recall_data.get("recall_number"), company.company_id, e)
                continue

    if inserted > 0:
        db.commit()
    logger.info("NHTSA recalls for %s: %d new records", company.company_id, inserted)
    return inserted


def sync_complaints(company: TrackedTransportationCompany, db) -> int:
    """Sync NHTSA complaint records for a company."""
    makes = _get_makes_for_company(company.company_id)
    if not makes:
        logger.info("Skipping NHTSA complaints for %s (no make mapping)", company.company_id)
        return 0

    inserted = 0
    for make in makes:
        complaints = fetch_complaints(make)
        for complaint_data in complaints:
            # Dedupe check
            exists = db.query(NHTSAComplaint).filter_by(dedupe_hash=complaint_data["dedupe_hash"]).first()
            if exists:
                continue

            try:
                record = NHTSAComplaint(
                    company_id=company.company_id,
                    odi_number=complaint_data["odi_number"],
                    make=complaint_data["make"],
                    model=complaint_data["model"],
                    model_year=complaint_data["model_year"],
                    date_of_complaint=complaint_data["date_of_complaint"],
                    crash=complaint_data["crash"],
                    fire=complaint_data["fire"],
                    injuries=complaint_data["injuries"],
                    deaths=complaint_data["deaths"],
                    component=complaint_data["component"],
                    summary=complaint_data["summary"],
                    dedupe_hash=complaint_data["dedupe_hash"],
                )
                db.add(record)
                db.flush()
                inserted += 1
            except Exception as e:
                db.rollback()
                logger.error("Failed to insert NHTSA complaint %s for %s: %s",
                             complaint_data.get("odi_number"), company.company_id, e)
                continue

    if inserted > 0:
        db.commit()
    logger.info("NHTSA complaints for %s: %d new records", company.company_id, inserted)
    return inserted


def main():
    parser = argparse.ArgumentParser(description="Sync NHTSA data for transportation companies")
    parser.add_argument("--company-id", type=str, help="Sync only this company (by company_id)")
    parser.add_argument("--skip-recalls", action="store_true", help="Skip recall sync")
    parser.add_argument("--skip-complaints", action="store_true", help="Skip complaint sync")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        # Get companies to sync — only motor_vehicle sector
        query = db.query(TrackedTransportationCompany).filter(
            TrackedTransportationCompany.is_active == 1,
            TrackedTransportationCompany.sector_type == "motor_vehicle",
        )
        if args.company_id:
            query = query.filter(TrackedTransportationCompany.company_id == args.company_id)

        companies = query.all()
        logger.info("NHTSA sync: %d motor_vehicle companies to process", len(companies))

        total_recalls = 0
        total_complaints = 0

        for i, company in enumerate(companies, 1):
            logger.info("Processing %d/%d: %s", i, len(companies), company.display_name)

            if not args.skip_recalls:
                total_recalls += sync_recalls(company, db)

            if not args.skip_complaints:
                total_complaints += sync_complaints(company, db)

        logger.info(
            "NHTSA sync complete: %d recalls, %d complaints inserted across %d companies",
            total_recalls, total_complaints, len(companies),
        )
    except Exception as e:
        logger.error("NHTSA sync failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
