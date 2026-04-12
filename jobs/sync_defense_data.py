"""
Defense sector data ingestion job.

Fetches data from:
- SEC EDGAR (10-K, 10-Q, 8-K filings)
- USASpending.gov (government contracts — DOD agencies)
- Senate LDA (lobbying disclosures)

Usage:
    python jobs/sync_defense_data.py [--company COMPANY_ID] [--skip-sec] [--skip-contracts] [--skip-lobbying]
"""

import os
from connectors.sec_edgar import SEC_BROWSE_BASE
from connectors.senate_lda import LDA_BASE
from connectors.usaspending import USASPENDING_BASE
import sys
import time
import hashlib
import argparse
import logging
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.defense_models import (
    TrackedDefenseCompany,
    SECDefenseFiling,
    DefenseGovernmentContract,
    DefenseLobbyingRecord,
)
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_defense")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
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


# --- Seed Companies ---

DEFENSE_COMPANIES = [
    # ── Defense Primes ──
    {"company_id": "lockheed-martin", "display_name": "Lockheed Martin Corporation", "ticker": "LMT", "sector_type": "defense_prime", "sec_cik": "0000936468", "headquarters": "Bethesda, MD", "usaspending_recipient_name": "LOCKHEED MARTIN"},
    {"company_id": "rtx", "display_name": "RTX Corporation", "ticker": "RTX", "sector_type": "defense_prime", "sec_cik": "0000101829", "headquarters": "Arlington, VA", "usaspending_recipient_name": "RTX CORPORATION"},
    {"company_id": "boeing-defense", "display_name": "The Boeing Company", "ticker": "BA", "sector_type": "defense_prime", "sec_cik": "0000012927", "headquarters": "Arlington, VA", "usaspending_recipient_name": "BOEING COMPANY"},
    {"company_id": "northrop-grumman", "display_name": "Northrop Grumman Corporation", "ticker": "NOC", "sector_type": "defense_prime", "sec_cik": "0001133421", "headquarters": "Falls Church, VA", "usaspending_recipient_name": "NORTHROP GRUMMAN"},
    {"company_id": "general-dynamics", "display_name": "General Dynamics Corporation", "ticker": "GD", "sector_type": "defense_prime", "sec_cik": "0000040533", "headquarters": "Reston, VA", "usaspending_recipient_name": "GENERAL DYNAMICS"},
    {"company_id": "l3harris", "display_name": "L3Harris Technologies Inc.", "ticker": "LHX", "sector_type": "defense_prime", "sec_cik": "0000202058", "headquarters": "Melbourne, FL", "usaspending_recipient_name": "L3HARRIS TECHNOLOGIES"},
    {"company_id": "bae-systems", "display_name": "BAE Systems plc", "ticker": "BAESY", "sector_type": "defense_prime", "sec_cik": None, "headquarters": "London, UK", "usaspending_recipient_name": "BAE SYSTEMS"},
    {"company_id": "leidos", "display_name": "Leidos Holdings Inc.", "ticker": "LDOS", "sector_type": "defense_prime", "sec_cik": "0001336920", "headquarters": "Reston, VA", "usaspending_recipient_name": "LEIDOS"},
    {"company_id": "huntington-ingalls", "display_name": "Huntington Ingalls Industries Inc.", "ticker": "HII", "sector_type": "defense_prime", "sec_cik": "0001501585", "headquarters": "Newport News, VA", "usaspending_recipient_name": "HUNTINGTON INGALLS"},
    {"company_id": "textron", "display_name": "Textron Inc.", "ticker": "TXT", "sector_type": "defense_prime", "sec_cik": "0000217346", "headquarters": "Providence, RI", "usaspending_recipient_name": "TEXTRON"},
    # ── Defense Subs / Specialists ──
    {"company_id": "caci", "display_name": "CACI International Inc.", "ticker": "CACI", "sector_type": "defense_sub", "sec_cik": "0000016058", "headquarters": "Reston, VA", "usaspending_recipient_name": "CACI INTERNATIONAL"},
    {"company_id": "booz-allen", "display_name": "Booz Allen Hamilton Holding Corp.", "ticker": "BAH", "sector_type": "defense_sub", "sec_cik": "0001443646", "headquarters": "McLean, VA", "usaspending_recipient_name": "BOOZ ALLEN HAMILTON"},
    {"company_id": "mantech", "display_name": "ManTech International Corporation", "ticker": None, "sector_type": "defense_sub", "sec_cik": "0001058290", "headquarters": "Herndon, VA", "usaspending_recipient_name": "MANTECH INTERNATIONAL"},
    {"company_id": "saic", "display_name": "Science Applications International Corp.", "ticker": "SAIC", "sector_type": "defense_sub", "sec_cik": "0001571123", "headquarters": "Reston, VA", "usaspending_recipient_name": "SCIENCE APPLICATIONS INTERNATIONAL"},
    {"company_id": "parsons", "display_name": "Parsons Corporation", "ticker": "PSN", "sector_type": "defense_sub", "sec_cik": "0001665650", "headquarters": "Chantilly, VA", "usaspending_recipient_name": "PARSONS CORPORATION"},
    {"company_id": "kbr", "display_name": "KBR Inc.", "ticker": "KBR", "sector_type": "defense_sub", "sec_cik": "0001357615", "headquarters": "Houston, TX", "usaspending_recipient_name": "KBR"},
    {"company_id": "amentum", "display_name": "Amentum Holdings Inc.", "ticker": "AMTM", "sector_type": "defense_sub", "sec_cik": "0001989548", "headquarters": "Chantilly, VA", "usaspending_recipient_name": "AMENTUM"},
    {"company_id": "vectrus", "display_name": "V2X Inc.", "ticker": "VVX", "sector_type": "defense_sub", "sec_cik": "0001601548", "headquarters": "Colorado Springs, CO", "usaspending_recipient_name": "V2X"},
    {"company_id": "bwx-technologies", "display_name": "BWX Technologies Inc.", "ticker": "BWXT", "sector_type": "defense_sub", "sec_cik": "0000071328", "headquarters": "Lynchburg, VA", "usaspending_recipient_name": "BWX TECHNOLOGIES"},
    {"company_id": "maxar", "display_name": "Maxar Technologies", "ticker": None, "sector_type": "defense_sub", "sec_cik": "0001121142", "headquarters": "Westminster, CO", "usaspending_recipient_name": "MAXAR TECHNOLOGIES"},
    # ── Cybersecurity / Intelligence ──
    {"company_id": "palantir", "display_name": "Palantir Technologies Inc.", "ticker": "PLTR", "sector_type": "cybersecurity", "sec_cik": "0001321655", "headquarters": "Denver, CO", "usaspending_recipient_name": "PALANTIR TECHNOLOGIES"},
    {"company_id": "anduril", "display_name": "Anduril Industries Inc.", "ticker": None, "sector_type": "cybersecurity", "sec_cik": None, "headquarters": "Costa Mesa, CA", "usaspending_recipient_name": "ANDURIL INDUSTRIES"},
    {"company_id": "shield-ai", "display_name": "Shield AI Inc.", "ticker": None, "sector_type": "cybersecurity", "sec_cik": None, "headquarters": "San Diego, CA", "usaspending_recipient_name": "SHIELD AI"},
    {"company_id": "bigbear-ai", "display_name": "BigBear.ai Holdings Inc.", "ticker": "BBAI", "sector_type": "intelligence", "sec_cik": "0001836981", "headquarters": "Columbia, MD", "usaspending_recipient_name": "BIGBEAR.AI"},
    {"company_id": "spire-global", "display_name": "Spire Global Inc.", "ticker": "SPIR", "sector_type": "intelligence", "sec_cik": "0001815317", "headquarters": "Vienna, VA", "usaspending_recipient_name": "SPIRE GLOBAL"},
    # ── Munitions / Weapons ──
    {"company_id": "general-atomics", "display_name": "General Atomics", "ticker": None, "sector_type": "munitions", "sec_cik": None, "headquarters": "San Diego, CA", "usaspending_recipient_name": "GENERAL ATOMICS"},
    {"company_id": "olin-corp", "display_name": "Olin Corporation", "ticker": "OLN", "sector_type": "munitions", "sec_cik": "0000074303", "headquarters": "Clayton, MO", "usaspending_recipient_name": "OLIN CORPORATION"},
    {"company_id": "vista-outdoor", "display_name": "Vista Outdoor Inc.", "ticker": "VSTO", "sector_type": "munitions", "sec_cik": "0001616318", "headquarters": "Anoka, MN", "usaspending_recipient_name": "VISTA OUTDOOR"},
    # ── Shipbuilding ──
    {"company_id": "austal-usa", "display_name": "Austal USA LLC", "ticker": None, "sector_type": "shipbuilding", "sec_cik": None, "headquarters": "Mobile, AL", "usaspending_recipient_name": "AUSTAL USA"},
    {"company_id": "philly-shipyard", "display_name": "Philly Shipyard ASA", "ticker": None, "sector_type": "shipbuilding", "sec_cik": None, "headquarters": "Philadelphia, PA", "usaspending_recipient_name": "PHILLY SHIPYARD"},
    {"company_id": "bollinger-shipyards", "display_name": "Bollinger Shipyards LLC", "ticker": None, "sector_type": "shipbuilding", "sec_cik": None, "headquarters": "Lockport, LA", "usaspending_recipient_name": "BOLLINGER SHIPYARDS"},
    # ── Aerospace Defense ──
    {"company_id": "kratos", "display_name": "Kratos Defense & Security Solutions", "ticker": "KTOS", "sector_type": "aerospace_defense", "sec_cik": "0001069974", "headquarters": "San Diego, CA", "usaspending_recipient_name": "KRATOS DEFENSE"},
    {"company_id": "mercury-systems", "display_name": "Mercury Systems Inc.", "ticker": "MRCY", "sector_type": "aerospace_defense", "sec_cik": "0000867840", "headquarters": "Andover, MA", "usaspending_recipient_name": "MERCURY SYSTEMS"},
    {"company_id": "curtiss-wright", "display_name": "Curtiss-Wright Corporation", "ticker": "CW", "sector_type": "aerospace_defense", "sec_cik": "0000026535", "headquarters": "Davidson, NC", "usaspending_recipient_name": "CURTISS-WRIGHT"},
    {"company_id": "heico", "display_name": "HEICO Corporation", "ticker": "HEI", "sector_type": "aerospace_defense", "sec_cik": "0000046619", "headquarters": "Hollywood, FL", "usaspending_recipient_name": "HEICO CORPORATION"},
    {"company_id": "howmet-aerospace", "display_name": "Howmet Aerospace Inc.", "ticker": "HWM", "sector_type": "aerospace_defense", "sec_cik": "0000004281", "headquarters": "Pittsburgh, PA", "usaspending_recipient_name": "HOWMET AEROSPACE"},
    {"company_id": "transdigm", "display_name": "TransDigm Group Inc.", "ticker": "TDG", "sector_type": "aerospace_defense", "sec_cik": "0001260221", "headquarters": "Cleveland, OH", "usaspending_recipient_name": "TRANSDIGM"},
    {"company_id": "spirit-aerosystems", "display_name": "Spirit AeroSystems Holdings", "ticker": "SPR", "sector_type": "aerospace_defense", "sec_cik": "0001364885", "headquarters": "Wichita, KS", "usaspending_recipient_name": "SPIRIT AEROSYSTEMS"},
    {"company_id": "rocket-lab", "display_name": "Rocket Lab USA Inc.", "ticker": "RKLB", "sector_type": "aerospace_defense", "sec_cik": "0001819994", "headquarters": "Long Beach, CA", "usaspending_recipient_name": "ROCKET LAB"},
    {"company_id": "aerovironment", "display_name": "AeroVironment Inc.", "ticker": "AVAV", "sector_type": "aerospace_defense", "sec_cik": "0000091142", "headquarters": "Arlington, VA", "usaspending_recipient_name": "AEROVIRONMENT"},
    # ── Logistics / Defense IT ──
    {"company_id": "dxc-technology", "display_name": "DXC Technology Company", "ticker": "DXC", "sector_type": "logistics_defense", "sec_cik": "0001688568", "headquarters": "Ashburn, VA", "usaspending_recipient_name": "DXC TECHNOLOGY"},
    {"company_id": "fluor-corp", "display_name": "Fluor Corporation", "ticker": "FLR", "sector_type": "logistics_defense", "sec_cik": "0001124198", "headquarters": "Irving, TX", "usaspending_recipient_name": "FLUOR CORPORATION"},
    {"company_id": "jacobs-engineering", "display_name": "Jacobs Solutions Inc.", "ticker": "J", "sector_type": "logistics_defense", "sec_cik": "0000049826", "headquarters": "Dallas, TX", "usaspending_recipient_name": "JACOBS"},
]


def seed_companies(session):
    """Insert or update tracked defense companies."""
    count = 0
    for data in DEFENSE_COMPANIES:
        existing = session.query(TrackedDefenseCompany).filter_by(company_id=data["company_id"]).first()
        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
        else:
            session.add(TrackedDefenseCompany(**data))
            count += 1
    session.commit()
    log.info(f"Seeded {count} new defense companies ({len(DEFENSE_COMPANIES)} total)")


# --- SEC EDGAR ---

def fetch_sec_filings(session, company: TrackedDefenseCompany, limit: int = 10000):
    """Fetch recent SEC filings for a defense company."""
    if not company.sec_cik:
        log.info(f"  [{company.company_id}] No SEC CIK -- skipping filings")
        return 0

    cik = company.sec_cik.lstrip("0")  # noqa: F841
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
        if session.query(SECDefenseFiling).filter_by(accession_number=acc).first():
            continue

        acc_no_dash = acc.replace("-", "")
        filing_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_no_dash}/{docs[i]}" if i < len(docs) and docs[i] else None

        session.add(SECDefenseFiling(
            company_id=company.company_id,
            accession_number=acc,
            form_type=forms[i],
            filing_date=parse_date(dates[i]) if i < len(dates) else None,
            primary_doc_url=filing_url,
            filing_url=f"{SEC_BROWSE_BASE}?action=getcompany&CIK={cik}&type={forms[i]}&dateb=&owner=include&count=10",
            description=descs[i] if i < len(descs) else None,
            dedupe_hash=dedupe,
        ))
        count += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new SEC filings")
    return count


# --- USASpending.gov Contracts ---

# DOD-related awarding agencies for filtering
DOD_AGENCIES = [
    "Department of Defense",
    "Department of the Army",
    "Department of the Navy",
    "Department of the Air Force",
    "Defense Logistics Agency",
    "Defense Advanced Research Projects Agency",
    "Missile Defense Agency",
    "Defense Information Systems Agency",
    "Defense Contract Management Agency",
    "Defense Threat Reduction Agency",
    "National Security Agency",
    "Defense Intelligence Agency",
]

def fetch_contracts(session, company: TrackedDefenseCompany):
    """Fetch government contracts from USASpending.gov with pagination."""
    search_name = company.usaspending_recipient_name or company.display_name
    url = f"{USASPENDING_BASE}/search/spending_by_award/"
    page_size = 100
    page = 1
    count = 0

    while True:
        payload = {
            "filters": {
                "recipient_search_text": [search_name],
                "award_type_codes": ["A", "B", "C", "D"],
                "time_period": [{"start_date": "2015-01-01", "end_date": datetime.now().strftime("%Y-%m-%d")}],
                "agencies": [{"type": "awarding", "tier": "toptier", "name": name} for name in DOD_AGENCIES],
            },
            "fields": ["Award ID", "Award Amount", "Awarding Agency", "Description", "Start Date", "End Date", "Award Type"],
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

        for r in results:
            award_id = r.get("Award ID") or r.get("generated_internal_id", "")
            dedupe = md5(f"{company.company_id}:usa:{award_id}")
            if session.query(DefenseGovernmentContract).filter_by(dedupe_hash=dedupe).first():
                continue

            session.add(DefenseGovernmentContract(
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


# --- Senate LDA Lobbying ---

def _safe_float(val):
    """Convert value to float, preserving None for nullable fields."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def fetch_lobbying(session, company: TrackedDefenseCompany):
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
                "page_size": 25,
            }

            try:
                time.sleep(2)  # 2s delay to avoid Senate LDA rate limiting
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
                if session.query(DefenseLobbyingRecord).filter_by(dedupe_hash=dedupe).first():
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

                session.add(DefenseLobbyingRecord(
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


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Sync defense sector data")
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
        query = session.query(TrackedDefenseCompany).filter(TrackedDefenseCompany.is_active == 1)
        if args.company:
            query = query.filter(TrackedDefenseCompany.company_id == args.company)
        companies = query.all()

        log.info(f"Syncing {len(companies)} defense companies...")

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
