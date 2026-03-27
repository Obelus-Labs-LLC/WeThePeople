"""
Sync EPA Greenhouse Gas Reporting Program (GHGRP) emissions data
for all tracked energy companies.

Pulls facility-level emissions from EPA Envirofacts API and stores
them in the energy_emissions table.

Usage:
    python jobs/sync_emissions.py [--company-id COMPANY_ID]
"""

import os
import sys
import time
import hashlib
import argparse
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.energy_models import TrackedEnergyCompany, EnergyEmission
from connectors.epa_ghgrp import (
    search_facilities_by_parent,
    get_facility_total_emissions,
    _compute_hash,
    _safe_float,
)
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_emissions")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

engine = create_engine(DB_PATH, echo=False)


if is_sqlite():
    @sa_event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.close()


Session = sessionmaker(bind=engine)


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


# Map display_name to likely EPA parent company search terms.
# Some companies need adjusted search names (e.g., "ExxonMobil Corporation" -> "ExxonMobil").
def _epa_search_name(display_name: str) -> str:
    """Derive a search-friendly name for EPA parent company lookup."""
    # Strip common suffixes
    suffixes = [
        " Corporation", " Corp.", " Corp", " Inc.", " Inc",
        " LLC", " L.L.C.", " Ltd.", " Ltd", " LP", " L.P.",
        " Co.", " Co", " Group", " Holdings", " Holding",
        " Energy", " Resources", " Power", " Services",
    ]
    name = display_name
    for suffix in suffixes:
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name.strip()


def sync_company_emissions(db_session, company: TrackedEnergyCompany) -> int:
    """Sync emissions for a single company. Returns count of new records inserted."""
    company_id = company.company_id
    display_name = company.display_name
    search_name = _epa_search_name(display_name)

    log.info(f"[{company_id}] Searching EPA GHGRP for '{search_name}'...")
    facilities = search_facilities_by_parent(search_name, rows=200)

    if not facilities:
        # Try with full display name
        log.info(f"[{company_id}] No results for '{search_name}', trying '{display_name}'...")
        facilities = search_facilities_by_parent(display_name, rows=200)

    if not facilities:
        log.info(f"[{company_id}] No facilities found in EPA GHGRP.")
        return 0

    log.info(f"[{company_id}] Found {len(facilities)} facilities.")

    new_count = 0
    for facility in facilities:
        fac_id = facility.get("facility_id")
        if not fac_id:
            continue

        emissions = get_facility_total_emissions(int(fac_id), rows=200)
        if not emissions:
            continue

        for em in emissions:
            year = em.get("reporting_year")
            total = em.get("total_reported_emissions")
            if year is None:
                continue

            dedupe = _compute_hash(
                str(company_id),
                str(fac_id),
                str(year),
                str(facility.get("facility_name", "")),
            )

            # Check if already exists
            existing = db_session.query(EnergyEmission).filter_by(dedupe_hash=dedupe).first()
            if existing:
                continue

            record = EnergyEmission(
                company_id=company_id,
                facility_name=facility.get("facility_name"),
                facility_id_epa=str(fac_id),
                facility_city=facility.get("city"),
                facility_state=facility.get("state"),
                reporting_year=int(year),
                total_emissions=_safe_float(total),
                emission_type="Total GHG",
                industry_type=em.get("sector") or facility.get("industry_type"),
                source_url=f"https://ghgdata.epa.gov/ghgp/main.do#/facilityDetail?FacilityId={fac_id}",
                dedupe_hash=dedupe,
            )
            db_session.add(record)
            new_count += 1

        # Commit per facility to avoid large transactions
        try:
            db_session.commit()
        except Exception as e:
            log.error(f"[{company_id}] Error committing facility {fac_id}: {e}")
            db_session.rollback()

    log.info(f"[{company_id}] Inserted {new_count} new emission records.")
    return new_count


def main():
    parser = argparse.ArgumentParser(description="Sync EPA GHGRP emissions data")
    parser.add_argument("--company-id", type=str, help="Sync only this company ID")
    args = parser.parse_args()

    db = Session()
    try:
        if args.company_id:
            company = db.query(TrackedEnergyCompany).filter_by(
                company_id=args.company_id, is_active=1
            ).first()
            if not company:
                log.error(f"Company not found: {args.company_id}")
                return
            companies = [company]
        else:
            companies = db.query(TrackedEnergyCompany).filter_by(is_active=1).order_by(
                TrackedEnergyCompany.display_name
            ).all()

        log.info(f"Syncing emissions for {len(companies)} energy companies...")
        total_new = 0
        for i, company in enumerate(companies, 1):
            log.info(f"[{i}/{len(companies)}] {company.display_name}")
            try:
                count = sync_company_emissions(db, company)
                total_new += count
            except Exception as e:
                log.error(f"[{company.company_id}] Error: {e}")
                db.rollback()
                continue

        log.info(f"Done. Total new emission records: {total_new}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
