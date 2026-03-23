"""
Fuel Economy Data Sync Job

Fetches vehicle fuel economy data from FuelEconomy.gov for all
tracked transportation companies with sector_type 'motor_vehicle'.

Usage:
    python jobs/sync_fuel_economy.py
    python jobs/sync_fuel_economy.py --company-id ford
    python jobs/sync_fuel_economy.py --year-start 2020
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.database import SessionLocal
from models.transportation_models import (
    TrackedTransportationCompany,
    FuelEconomyVehicle,
)
from connectors.fueleconomy import fetch_vehicles_by_make
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


# Map company_id to FuelEconomy.gov make name
COMPANY_TO_MAKE = {
    "general-motors": ["Chevrolet", "Buick", "Cadillac", "GMC"],
    "ford": ["Ford", "Lincoln"],
    "stellantis": ["Chrysler", "Dodge", "Jeep", "Ram", "Fiat"],
    "toyota": ["Toyota", "Lexus"],
    "honda": ["Honda", "Acura"],
    "hyundai": ["Hyundai", "Genesis"],
    "kia": ["Kia"],
    "nissan": ["Nissan", "Infiniti"],
    "bmw": ["BMW"],
    "mercedes-benz": ["Mercedes-Benz"],
    "volkswagen": ["Volkswagen", "Audi", "Porsche"],
    "tesla": ["Tesla"],
    "subaru": ["Subaru"],
    "mazda": ["Mazda"],
    "volvo": ["Volvo"],
    "rivian": ["Rivian"],
    "lucid": ["Lucid"],
}


def sync_fuel_economy(company: TrackedTransportationCompany, db, year_start: int = 2015) -> int:
    """Sync fuel economy vehicle data for a company."""
    makes = COMPANY_TO_MAKE.get(company.company_id, [])
    if not makes:
        logger.info("Skipping fuel economy for %s (no make mapping)", company.company_id)
        return 0

    inserted = 0
    for make in makes:
        vehicles = fetch_vehicles_by_make(make, year_start=year_start)
        for vehicle_data in vehicles:
            # Dedupe check
            exists = db.query(FuelEconomyVehicle).filter_by(dedupe_hash=vehicle_data["dedupe_hash"]).first()
            if exists:
                continue

            try:
                record = FuelEconomyVehicle(
                    company_id=company.company_id,
                    vehicle_id=vehicle_data["vehicle_id"],
                    year=vehicle_data["year"],
                    make=vehicle_data["make"],
                    model=vehicle_data["model"],
                    mpg_city=vehicle_data["mpg_city"],
                    mpg_highway=vehicle_data["mpg_highway"],
                    mpg_combined=vehicle_data["mpg_combined"],
                    co2_tailpipe=vehicle_data["co2_tailpipe"],
                    fuel_type=vehicle_data["fuel_type"],
                    vehicle_class=vehicle_data["vehicle_class"],
                    ghg_score=vehicle_data["ghg_score"],
                    smog_rating=vehicle_data["smog_rating"],
                    dedupe_hash=vehicle_data["dedupe_hash"],
                )
                db.add(record)
                db.flush()
                inserted += 1
            except Exception as e:
                db.rollback()
                logger.error("Failed to insert fuel economy vehicle %s for %s: %s",
                             vehicle_data.get("vehicle_id"), company.company_id, e)
                continue

    if inserted > 0:
        db.commit()
    logger.info("Fuel economy for %s: %d new vehicles", company.company_id, inserted)
    return inserted


def main():
    parser = argparse.ArgumentParser(description="Sync fuel economy data for transportation companies")
    parser.add_argument("--company-id", type=str, help="Sync only this company (by company_id)")
    parser.add_argument("--year-start", type=int, default=2015, help="Earliest model year (default: 2015)")
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
        logger.info("Fuel economy sync: %d motor_vehicle companies to process", len(companies))

        total_vehicles = 0

        for i, company in enumerate(companies, 1):
            logger.info("Processing %d/%d: %s", i, len(companies), company.display_name)
            total_vehicles += sync_fuel_economy(company, db, year_start=args.year_start)

        logger.info(
            "Fuel economy sync complete: %d vehicles inserted across %d companies",
            total_vehicles, len(companies),
        )
    except Exception as e:
        logger.error("Fuel economy sync failed: %s", e, exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
