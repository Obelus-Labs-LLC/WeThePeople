"""
Agriculture sector data ingestion job.

Fetches data from:
- SEC EDGAR (10-K, 10-Q, 8-K filings)
- USASpending.gov (government contracts)
- Senate LDA (lobbying disclosures)

Usage:
    python jobs/sync_agriculture_data.py [--company COMPANY_ID] [--skip-sec] [--skip-contracts] [--skip-lobbying] [--seed-only]
"""

import os
from connectors.sec_edgar import SEC_BROWSE_BASE
from connectors.senate_lda import LDA_BASE
from connectors.usaspending import USASPENDING_BASE, filter_contracts_by_recipient
import sys
import time
import hashlib
import argparse
import logging
from datetime import datetime, date
from typing import Optional, List, Dict, Any

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.agriculture_models import (
    TrackedAgricultureCompany,
    SECAgricultureFiling,
    AgricultureGovernmentContract,
    AgricultureLobbyingRecord,
)
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_agriculture")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
CONGRESS_API_KEY = os.getenv("CONGRESS_API_KEY", "")
SEC_USER_AGENT = os.getenv("SEC_USER_AGENT", "WeThePeople/1.0 (civic-transparency-project)")

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


def parse_date(val):
    """Parse YYYY-MM-DD string to date object, or return None."""
    if val is None:
        return None
    from datetime import date as date_type
    if isinstance(val, date_type):
        return val
    s = str(val).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


# ─── Seed Companies ───────────────────────────────────────────

AGRICULTURE_COMPANIES = [
    # Crop Production / Grain Trading
    {"company_id": "adm", "display_name": "Archer-Daniels-Midland Company", "ticker": "ADM", "sector_type": "crop_production", "headquarters": "Chicago, IL", "sec_cik": "0000007084"},
    {"company_id": "bunge", "display_name": "Bunge Global SA", "ticker": "BG", "sector_type": "crop_production", "headquarters": "Chesterfield, MO", "sec_cik": "0001144519"},
    {"company_id": "ingredion", "display_name": "Ingredion Incorporated", "ticker": "INGR", "sector_type": "crop_production", "headquarters": "Westchester, IL", "sec_cik": "0001046257"},
    {"company_id": "andersons", "display_name": "The Andersons, Inc.", "ticker": "ANDE", "sector_type": "crop_production", "headquarters": "Maumee, OH", "sec_cik": "0000821026"},
    {"company_id": "mgp-ingredients", "display_name": "MGP Ingredients, Inc.", "ticker": "MGPI", "sector_type": "crop_production", "headquarters": "Atchison, KS", "sec_cik": "0000835011"},
    {"company_id": "dole", "display_name": "Dole plc", "ticker": "DOLE", "sector_type": "crop_production", "headquarters": "Dublin, Ireland", "sec_cik": "0001857475"},
    {"company_id": "fresh-del-monte", "display_name": "Fresh Del Monte Produce Inc.", "ticker": "FDP", "sector_type": "crop_production", "headquarters": "Coral Gables, FL", "sec_cik": "0001047340"},
    {"company_id": "calavo-growers", "display_name": "Calavo Growers, Inc.", "ticker": "CVGW", "sector_type": "crop_production", "headquarters": "Santa Paula, CA", "sec_cik": "0001133470"},
    # Livestock / Meat Processing
    {"company_id": "tyson", "display_name": "Tyson Foods, Inc.", "ticker": "TSN", "sector_type": "livestock", "headquarters": "Springdale, AR", "sec_cik": "0000100493"},
    {"company_id": "hormel", "display_name": "Hormel Foods Corporation", "ticker": "HRL", "sector_type": "livestock", "headquarters": "Austin, MN", "sec_cik": "0000048465"},
    {"company_id": "pilgrims-pride", "display_name": "Pilgrim's Pride Corporation", "ticker": "PPC", "sector_type": "livestock", "headquarters": "Greeley, CO", "sec_cik": "0000802481"},
    {"company_id": "sanderson-farms", "display_name": "Sanderson Farms, Inc.", "ticker": "SAFM", "sector_type": "livestock", "headquarters": "Laurel, MS", "sec_cik": "0000812128"},
    {"company_id": "cal-maine", "display_name": "Cal-Maine Foods, Inc.", "ticker": "CALM", "sector_type": "livestock", "headquarters": "Ridgeland, MS", "sec_cik": "0000016160"},
    {"company_id": "seaboard", "display_name": "Seaboard Corporation", "ticker": "SEB", "sector_type": "livestock", "headquarters": "Merriam, KS", "sec_cik": "0000088121"},
    # Food Processing
    {"company_id": "general-mills", "display_name": "General Mills, Inc.", "ticker": "GIS", "sector_type": "food_processing", "headquarters": "Minneapolis, MN", "sec_cik": "0000040704"},
    {"company_id": "kellanova", "display_name": "Kellanova", "ticker": "K", "sector_type": "food_processing", "headquarters": "Chicago, IL", "sec_cik": "0000055067"},
    {"company_id": "conagra", "display_name": "Conagra Brands, Inc.", "ticker": "CAG", "sector_type": "food_processing", "headquarters": "Chicago, IL", "sec_cik": "0000023217"},
    {"company_id": "kraft-heinz", "display_name": "The Kraft Heinz Company", "ticker": "KHC", "sector_type": "food_processing", "headquarters": "Chicago, IL", "sec_cik": "0001637459"},
    {"company_id": "mondelez", "display_name": "Mondelez International, Inc.", "ticker": "MDLZ", "sector_type": "food_processing", "headquarters": "Chicago, IL", "sec_cik": "0001103982"},
    {"company_id": "campbell", "display_name": "Campbell Soup Company", "ticker": "CPB", "sector_type": "food_processing", "headquarters": "Camden, NJ", "sec_cik": "0000016732"},
    {"company_id": "smucker", "display_name": "The J.M. Smucker Company", "ticker": "SJM", "sector_type": "food_processing", "headquarters": "Orrville, OH", "sec_cik": "0000091419"},
    {"company_id": "mccormick", "display_name": "McCormick & Company, Incorporated", "ticker": "MKC", "sector_type": "food_processing", "headquarters": "Hunt Valley, MD", "sec_cik": "0000063754"},
    {"company_id": "hershey", "display_name": "The Hershey Company", "ticker": "HSY", "sector_type": "food_processing", "headquarters": "Hershey, PA", "sec_cik": "0000047111"},
    {"company_id": "post-holdings", "display_name": "Post Holdings, Inc.", "ticker": "POST", "sector_type": "food_processing", "headquarters": "St. Louis, MO", "sec_cik": "0001530950"},
    {"company_id": "treehouse", "display_name": "TreeHouse Foods, Inc.", "ticker": "THS", "sector_type": "food_processing", "headquarters": "Oak Brook, IL", "sec_cik": "0001370946"},
    {"company_id": "lamb-weston", "display_name": "Lamb Weston Holdings, Inc.", "ticker": "LW", "sector_type": "food_processing", "headquarters": "Eagle, ID", "sec_cik": "0001679273"},
    {"company_id": "flowers-foods", "display_name": "Flowers Foods, Inc.", "ticker": "FLO", "sector_type": "food_processing", "headquarters": "Thomasville, GA", "sec_cik": "0001041657"},
    {"company_id": "coca-cola", "display_name": "The Coca-Cola Company", "ticker": "KO", "sector_type": "food_processing", "headquarters": "Atlanta, GA", "sec_cik": "0000021344"},
    {"company_id": "pepsico", "display_name": "PepsiCo, Inc.", "ticker": "PEP", "sector_type": "food_processing", "headquarters": "Purchase, NY", "sec_cik": "0000077476"},
    {"company_id": "constellation-brands", "display_name": "Constellation Brands, Inc.", "ticker": "STZ", "sector_type": "food_processing", "headquarters": "Victor, NY", "sec_cik": "0000016918"},
    {"company_id": "molson-coors", "display_name": "Molson Coors Beverage Company", "ticker": "TAP", "sector_type": "food_processing", "headquarters": "Chicago, IL", "sec_cik": "0000024545"},
    # Farm Equipment
    {"company_id": "deere", "display_name": "Deere & Company", "ticker": "DE", "sector_type": "farm_equipment", "headquarters": "Moline, IL", "sec_cik": "0000315189"},
    {"company_id": "agco", "display_name": "AGCO Corporation", "ticker": "AGCO", "sector_type": "farm_equipment", "headquarters": "Duluth, GA", "sec_cik": "0000880266"},
    {"company_id": "cnh-industrial", "display_name": "CNH Industrial N.V.", "ticker": "CNHI", "sector_type": "farm_equipment", "headquarters": "Basildon, UK", "sec_cik": "0001567094"},
    {"company_id": "tractor-supply", "display_name": "Tractor Supply Company", "ticker": "TSCO", "sector_type": "farm_equipment", "headquarters": "Brentwood, TN", "sec_cik": "0000916365"},
    {"company_id": "titan-machinery", "display_name": "Titan Machinery Inc.", "ticker": "TITN", "sector_type": "farm_equipment", "headquarters": "West Fargo, ND", "sec_cik": "0001409171"},
    {"company_id": "lindsay", "display_name": "Lindsay Corporation", "ticker": "LNN", "sector_type": "farm_equipment", "headquarters": "Omaha, NE", "sec_cik": "0000836157"},
    {"company_id": "valmont", "display_name": "Valmont Industries, Inc.", "ticker": "VMI", "sector_type": "farm_equipment", "headquarters": "Omaha, NE", "sec_cik": "0000102426"},
    # Seed / Biotech
    {"company_id": "corteva-ag", "display_name": "Corteva Agriscience", "ticker": "CTVA", "sector_type": "seed_biotech", "headquarters": "Indianapolis, IN", "sec_cik": "0001755672"},
    {"company_id": "scotts-ag", "display_name": "The Scotts Miracle-Gro Company", "ticker": "SMG", "sector_type": "seed_biotech", "headquarters": "Marysville, OH", "sec_cik": "0000825542"},
    {"company_id": "fmc-ag", "display_name": "FMC Corporation", "ticker": "FMC", "sector_type": "seed_biotech", "headquarters": "Philadelphia, PA", "sec_cik": "0000037996"},
    {"company_id": "american-vanguard-ag", "display_name": "American Vanguard Corporation", "ticker": "AVV", "sector_type": "seed_biotech", "headquarters": "Newport Beach, CA", "sec_cik": "0000005765"},
    # Fertilizer / Agricultural Services
    {"company_id": "nutrien-ag", "display_name": "Nutrien Ltd.", "ticker": "NTR", "sector_type": "agricultural_services", "headquarters": "Saskatoon, Canada", "sec_cik": "0001725964"},
    {"company_id": "mosaic-ag", "display_name": "The Mosaic Company", "ticker": "MOS", "sector_type": "agricultural_services", "headquarters": "Tampa, FL", "sec_cik": "0001285785"},
    {"company_id": "cf-industries-ag", "display_name": "CF Industries Holdings, Inc.", "ticker": "CF", "sector_type": "agricultural_services", "headquarters": "Deerfield, IL", "sec_cik": "0001324404"},
    {"company_id": "intrepid-ag", "display_name": "Intrepid Potash, Inc.", "ticker": "IPI", "sector_type": "agricultural_services", "headquarters": "Denver, CO", "sec_cik": "0001421461"},
    {"company_id": "farmer-mac", "display_name": "Federal Agricultural Mortgage Corporation", "ticker": "AGM", "sector_type": "agricultural_services", "headquarters": "Washington, DC", "sec_cik": "0000845877"},
]


def seed_companies(session):
    """Insert or update tracked agriculture companies."""
    count = 0
    for data in AGRICULTURE_COMPANIES:
        existing = session.query(TrackedAgricultureCompany).filter_by(company_id=data["company_id"]).first()
        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
        else:
            session.add(TrackedAgricultureCompany(**data))
            count += 1
    session.commit()
    log.info(f"Seeded {count} new agriculture companies ({len(AGRICULTURE_COMPANIES)} total)")


# ─── SEC EDGAR ────────────────────────────────────────────────

def fetch_sec_filings(session, company: TrackedAgricultureCompany, limit: int = 10000):
    """Fetch recent SEC filings for a agriculture company."""
    if not company.sec_cik:
        log.info(f"  [{company.company_id}] No SEC CIK — skipping filings")
        return 0

    cik = company.sec_cik.lstrip("0")
    # Use EDGAR company filings API
    url = f"https://data.sec.gov/submissions/CIK{company.sec_cik}.json"
    headers = {"User-Agent": SEC_USER_AGENT, "Accept": "application/json"}

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"  [{company.company_id}] SEC EDGAR error: {e}")
        return 0

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    accessions = recent.get("accessionNumber", [])
    dates = recent.get("filingDate", [])
    docs = recent.get("primaryDocument", [])
    descs = recent.get("primaryDocDescription", [])

    count = 0
    target_forms = {"10-K", "10-Q", "8-K", "DEF 14A", "S-1", "20-F", "6-K"}
    for i in range(min(len(forms), limit)):
        if forms[i] not in target_forms:
            continue

        acc = accessions[i]
        dedupe = md5(f"{company.company_id}:{acc}")
        if session.query(SECAgricultureFiling).filter_by(accession_number=acc).first():
            continue

        acc_no_dash = acc.replace("-", "")
        filing_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_no_dash}/{docs[i]}" if i < len(docs) and docs[i] else None

        session.add(SECAgricultureFiling(
            company_id=company.company_id,
            accession_number=acc,
            form_type=forms[i],
            filing_date=parse_date(dates[i]) if i < len(dates) else None,
            primary_doc_url=filing_url,
            # NOTE: Legacy EDGAR CGI URL still works via redirect to EFTS. Kept for compatibility.
            filing_url=f"{SEC_BROWSE_BASE}?action=getcompany&CIK={cik}&type={forms[i]}&dateb=&owner=include&count=10",
            description=descs[i] if i < len(descs) else None,
            dedupe_hash=dedupe,
        ))
        count += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new SEC filings")
    return count


# ─── USASpending.gov Contracts ────────────────────────────────

def fetch_contracts(session, company: TrackedAgricultureCompany):
    """Fetch government contracts from USASpending.gov with pagination."""
    search_name = company.usaspending_recipient_name or company.display_name
    url = f"{USASPENDING_BASE}/search/spending_by_award/"
    page_size = 100  # API max per page
    page = 1
    count = 0

    while True:
        payload = {
            "filters": {
                "recipient_search_text": [search_name],
                "award_type_codes": ["A", "B", "C", "D"],
                "time_period": [{"start_date": "2015-01-01", "end_date": datetime.now().strftime("%Y-%m-%d")}],
            },
            "fields": ["Award ID", "Award Amount", "Awarding Agency", "Description", "Start Date", "End Date", "Award Type", "Recipient Name"],
            "limit": page_size,
            "page": page,
            "sort": "Award Amount",
            "order": "desc",
        }

        try:
            resp = requests.post(url, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning(f"  [{company.company_id}] USASpending error (page {page}): {e}")
            break

        results = data.get("results", [])
        if not results:
            break

        # Drop unrelated vendors — USASpending's recipient_search_text is a
        # substring match. See connectors/usaspending.py.
        results = filter_contracts_by_recipient(results, search_name)

        for r in results:
            award_id = r.get("Award ID") or r.get("generated_internal_id", "")
            dedupe = md5(f"{company.company_id}:usa:{award_id}")
            if session.query(AgricultureGovernmentContract).filter_by(dedupe_hash=dedupe).first():
                continue

            session.add(AgricultureGovernmentContract(
                company_id=company.company_id,
                award_id=award_id,
                award_amount=r.get("Award Amount"),
                awarding_agency=r.get("Awarding Agency"),
                description=r.get("Description"),
                start_date=parse_date(r.get("Start Date")),
                end_date=parse_date(r.get("End Date")),
                contract_type=r.get("Award Type"),
                dedupe_hash=dedupe,
            ))
            count += 1

        if len(results) < page_size:
            break
        page += 1
        time.sleep(1)  # polite delay

    session.commit()
    log.info(f"  [{company.company_id}] {count} new contracts")
    return count


# ─── Senate LDA Lobbying ─────────────────────────────────────

def _safe_float(val):
    """Convert value to float, preserving None for nullable fields."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def fetch_lobbying(session, company: TrackedAgricultureCompany):
    """Fetch lobbying disclosures from Senate LDA with full pagination."""
    search_name = company.display_name
    current_year = datetime.now().year
    years = list(range(current_year, 2019, -1))  # 2020-present
    count = 0

    for year in years:
        page_url = LDA_BASE
        page_num = 0
        headers = {"Accept": "application/json"}

        while page_url:
            params = {
                "client_name": search_name,
                "filing_year": year,
                "page_size": 25,  # API max
            }

            try:
                time.sleep(1)  # polite delay
                if page_num == 0:
                    resp = requests.get(page_url, params=params, headers=headers, timeout=30)
                else:
                    resp = requests.get(page_url, headers=headers, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                log.warning(f"  [{company.company_id}] Senate LDA error ({year}, page {page_num}): {e}")
                break

            results = data.get("results", [])
            for r in results:
                filing_uuid = r.get("filing_uuid", "")
                dedupe = md5(f"{company.company_id}:lda:{filing_uuid}")
                if session.query(AgricultureLobbyingRecord).filter_by(dedupe_hash=dedupe).first():
                    continue

                issues = []
                gov_entities = set()
                descriptions = []
                for activity in (r.get("lobbying_activities") or []):
                    issue_code = activity.get("general_issue_code_display")
                    if issue_code:
                        issues.append(issue_code)
                    desc = activity.get("description") or ""
                    if desc.strip():
                        descriptions.append(desc.strip())
                    for entity in (activity.get("government_entities") or []):
                        name = entity.get("name") if isinstance(entity, dict) else str(entity)
                        if name:
                            gov_entities.add(name)

                session.add(AgricultureLobbyingRecord(
                    company_id=company.company_id,
                    filing_uuid=filing_uuid,
                    filing_year=r.get("filing_year", 0),
                    filing_period=r.get("filing_period_display"),
                    income=_safe_float(r.get("income")),
                    expenses=_safe_float(r.get("expenses")),
                    registrant_name=(r.get("registrant") or {}).get("name"),
                    client_name=(r.get("client") or {}).get("name"),
                    lobbying_issues=", ".join(sorted(set(issues))) if issues else None,
                    government_entities=", ".join(sorted(gov_entities)) if gov_entities else None,
                    specific_issues=" || ".join(descriptions) if descriptions else None,
                    dedupe_hash=dedupe,
                ))
                count += 1

            # Commit after each page to avoid large transactions
            if count > 0:
                session.commit()

            page_url = data.get("next")
            page_num += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new lobbying filings")
    return count


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync agriculture sector data")
    parser.add_argument("--company", type=str, help="Sync only this company_id")
    parser.add_argument("--skip-sec", action="store_true", help="Skip SEC filings")
    parser.add_argument("--skip-contracts", action="store_true", help="Skip USASpending contracts")
    parser.add_argument("--skip-lobbying", action="store_true", help="Skip lobbying data")
    parser.add_argument("--seed-only", action="store_true", help="Only seed companies, skip data fetch")
    args = parser.parse_args()

    # Create tables
    Base.metadata.create_all(engine)
    session = Session()

    try:
        # Seed companies
        seed_companies(session)

        if args.seed_only:
            log.info("Seed-only mode — done.")
            return

        # Get companies to sync
        query = session.query(TrackedAgricultureCompany).filter(TrackedAgricultureCompany.is_active == 1)
        if args.company:
            query = query.filter(TrackedAgricultureCompany.company_id == args.company)
        companies = query.all()

        log.info(f"Syncing {len(companies)} agriculture companies...")

        for co in companies:
            log.info(f"\n{'='*60}")
            cid = co.company_id
            log.info(f"Processing: {co.display_name} ({cid})")
            try:
                if not args.skip_sec:
                    fetch_sec_filings(session, co)
                    time.sleep(0.5)  # SEC rate limit

                if not args.skip_contracts:
                    fetch_contracts(session, co)
                    time.sleep(0.5)

                if not args.skip_lobbying:
                    fetch_lobbying(session, co)
                    time.sleep(0.5)

                # Mark as synced
                co.needs_ingest = 0
                co.last_full_refresh_at = datetime.now(timezone.utc)
                session.commit()
            except Exception as e:
                log.error(f"FAILED {cid}: {e}", exc_info=True)
                session.rollback()

        log.info(f"\nDone! Synced {len(companies)} companies.")

    finally:
        session.close()


if __name__ == "__main__":
    main()
