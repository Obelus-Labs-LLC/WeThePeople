"""
Energy sector data ingestion job.

Fetches data from:
- SEC EDGAR (10-K, 10-Q, 8-K filings)
- USASpending.gov (government contracts)
- Senate LDA (lobbying disclosures)
- EPA GHGRP (greenhouse gas emissions) — via Envirofacts API

Usage:
    python jobs/sync_energy_data.py [--company COMPANY_ID] [--skip-sec] [--skip-contracts] [--skip-lobbying] [--skip-emissions]
"""

import os
import sys
import json
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
from models.energy_models import (
    TrackedEnergyCompany,
    SECEnergyFiling,
    EnergyEmission,
    EnergyGovernmentContract,
    EnergyLobbyingRecord,
    EnergyEnforcement,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_energy")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
CONGRESS_API_KEY = os.getenv("CONGRESS_API_KEY", "")
SEC_USER_AGENT = os.getenv("SEC_USER_AGENT", "WeThePeople/1.0 (civic-transparency-project)")

engine = create_engine(DB_PATH, echo=False)

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

ENERGY_COMPANIES = [
    # Oil & Gas Majors
    {"company_id": "exxonmobil", "display_name": "ExxonMobil Corporation", "ticker": "XOM", "sector_type": "oil_gas", "headquarters": "Spring, TX", "sec_cik": "0000034088"},
    {"company_id": "chevron", "display_name": "Chevron Corporation", "ticker": "CVX", "sector_type": "oil_gas", "headquarters": "San Ramon, CA", "sec_cik": "0000093410"},
    {"company_id": "conocophillips", "display_name": "ConocoPhillips", "ticker": "COP", "sector_type": "oil_gas", "headquarters": "Houston, TX", "sec_cik": "0001163165"},
    {"company_id": "phillips66", "display_name": "Phillips 66", "ticker": "PSX", "sector_type": "oil_gas", "headquarters": "Houston, TX", "sec_cik": "0001534701"},
    {"company_id": "marathon-petroleum", "display_name": "Marathon Petroleum Corporation", "ticker": "MPC", "sector_type": "oil_gas", "headquarters": "Findlay, OH", "sec_cik": "0001510295"},
    {"company_id": "valero", "display_name": "Valero Energy Corporation", "ticker": "VLO", "sector_type": "oil_gas", "headquarters": "San Antonio, TX", "sec_cik": "0001035002"},
    {"company_id": "eog-resources", "display_name": "EOG Resources Inc.", "ticker": "EOG", "sector_type": "oil_gas", "headquarters": "Houston, TX", "sec_cik": "0000821189"},
    {"company_id": "pioneer-natural", "display_name": "Pioneer Natural Resources", "ticker": "PXD", "sector_type": "oil_gas", "headquarters": "Irving, TX", "sec_cik": "0001038357"},
    {"company_id": "devon-energy", "display_name": "Devon Energy Corporation", "ticker": "DVN", "sector_type": "oil_gas", "headquarters": "Oklahoma City, OK", "sec_cik": "0000046619"},
    {"company_id": "hess", "display_name": "Hess Corporation", "ticker": "HES", "sector_type": "oil_gas", "headquarters": "New York, NY", "sec_cik": "0000004447"},
    {"company_id": "diamondback", "display_name": "Diamondback Energy Inc.", "ticker": "FANG", "sector_type": "oil_gas", "headquarters": "Midland, TX", "sec_cik": "0001539838"},
    {"company_id": "coterra", "display_name": "Coterra Energy Inc.", "ticker": "CTRA", "sector_type": "oil_gas", "headquarters": "Houston, TX", "sec_cik": "0000858470"},
    {"company_id": "occidental", "display_name": "Occidental Petroleum Corporation", "ticker": "OXY", "sector_type": "oil_gas", "headquarters": "Houston, TX", "sec_cik": "0000797468"},

    # International Majors (US-listed)
    {"company_id": "shell", "display_name": "Shell plc", "ticker": "SHEL", "sector_type": "oil_gas", "headquarters": "London, UK", "sec_cik": "0001306965"},
    {"company_id": "bp", "display_name": "BP p.l.c.", "ticker": "BP", "sector_type": "oil_gas", "headquarters": "London, UK", "sec_cik": "0000313807"},
    {"company_id": "totalenergies", "display_name": "TotalEnergies SE", "ticker": "TTE", "sector_type": "oil_gas", "headquarters": "Courbevoie, France", "sec_cik": "0000879764"},

    # Utilities
    {"company_id": "nextera", "display_name": "NextEra Energy Inc.", "ticker": "NEE", "sector_type": "utility", "headquarters": "Juno Beach, FL", "sec_cik": "0000753308"},
    {"company_id": "duke-energy", "display_name": "Duke Energy Corporation", "ticker": "DUK", "sector_type": "utility", "headquarters": "Charlotte, NC", "sec_cik": "0001326160"},
    {"company_id": "southern-company", "display_name": "The Southern Company", "ticker": "SO", "sector_type": "utility", "headquarters": "Atlanta, GA", "sec_cik": "0000092122"},
    {"company_id": "dominion-energy", "display_name": "Dominion Energy Inc.", "ticker": "D", "sector_type": "utility", "headquarters": "Richmond, VA", "sec_cik": "0000715957"},
    {"company_id": "american-electric", "display_name": "American Electric Power Co.", "ticker": "AEP", "sector_type": "utility", "headquarters": "Columbus, OH", "sec_cik": "0000004904"},
    {"company_id": "exelon", "display_name": "Exelon Corporation", "ticker": "EXC", "sector_type": "utility", "headquarters": "Chicago, IL", "sec_cik": "0001109357"},
    {"company_id": "sempra", "display_name": "Sempra", "ticker": "SRE", "sector_type": "utility", "headquarters": "San Diego, CA", "sec_cik": "0001032208"},
    {"company_id": "xcel-energy", "display_name": "Xcel Energy Inc.", "ticker": "XEL", "sector_type": "utility", "headquarters": "Minneapolis, MN", "sec_cik": "0000072903"},
    {"company_id": "entergy", "display_name": "Entergy Corporation", "ticker": "ETR", "sector_type": "utility", "headquarters": "New Orleans, LA", "sec_cik": "0000065580"},
    {"company_id": "wec-energy", "display_name": "WEC Energy Group Inc.", "ticker": "WEC", "sector_type": "utility", "headquarters": "Milwaukee, WI", "sec_cik": "0000783325"},

    # Renewables
    {"company_id": "first-solar", "display_name": "First Solar Inc.", "ticker": "FSLR", "sector_type": "renewable", "headquarters": "Tempe, AZ", "sec_cik": "0001274494"},
    {"company_id": "enphase", "display_name": "Enphase Energy Inc.", "ticker": "ENPH", "sector_type": "renewable", "headquarters": "Fremont, CA", "sec_cik": "0001463101"},
    {"company_id": "sunrun", "display_name": "Sunrun Inc.", "ticker": "RUN", "sector_type": "renewable", "headquarters": "San Francisco, CA", "sec_cik": "0001469367"},
    {"company_id": "plug-power", "display_name": "Plug Power Inc.", "ticker": "PLUG", "sector_type": "renewable", "headquarters": "Latham, NY", "sec_cik": "0001093691"},
    {"company_id": "brookfield-renewable", "display_name": "Brookfield Renewable Partners", "ticker": "BEP", "sector_type": "renewable", "headquarters": "Toronto, Canada", "sec_cik": "0001578318"},

    # Pipelines / Midstream
    {"company_id": "enbridge", "display_name": "Enbridge Inc.", "ticker": "ENB", "sector_type": "pipeline", "headquarters": "Calgary, Canada", "sec_cik": "0000895728"},
    {"company_id": "enterprise-products", "display_name": "Enterprise Products Partners", "ticker": "EPD", "sector_type": "pipeline", "headquarters": "Houston, TX", "sec_cik": "0000797468"},
    {"company_id": "kinder-morgan", "display_name": "Kinder Morgan Inc.", "ticker": "KMI", "sector_type": "pipeline", "headquarters": "Houston, TX", "sec_cik": "0001506307"},
    {"company_id": "williams-companies", "display_name": "The Williams Companies Inc.", "ticker": "WMB", "sector_type": "pipeline", "headquarters": "Tulsa, OK", "sec_cik": "0000107263"},
    {"company_id": "oneok", "display_name": "ONEOK Inc.", "ticker": "OKE", "sector_type": "pipeline", "headquarters": "Tulsa, OK", "sec_cik": "0000275880"},

    # Oilfield Services
    {"company_id": "schlumberger", "display_name": "SLB (Schlumberger)", "ticker": "SLB", "sector_type": "services", "headquarters": "Houston, TX", "sec_cik": "0000087347"},
    {"company_id": "halliburton", "display_name": "Halliburton Company", "ticker": "HAL", "sector_type": "services", "headquarters": "Houston, TX", "sec_cik": "0000045012"},
    {"company_id": "baker-hughes", "display_name": "Baker Hughes Company", "ticker": "BKR", "sector_type": "services", "headquarters": "Houston, TX", "sec_cik": "0001701605"},
]


def seed_companies(session):
    """Insert or update tracked energy companies."""
    count = 0
    for data in ENERGY_COMPANIES:
        existing = session.query(TrackedEnergyCompany).filter_by(company_id=data["company_id"]).first()
        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
        else:
            session.add(TrackedEnergyCompany(**data))
            count += 1
    session.commit()
    log.info(f"Seeded {count} new energy companies ({len(ENERGY_COMPANIES)} total)")


# ─── SEC EDGAR ────────────────────────────────────────────────

def fetch_sec_filings(session, company: TrackedEnergyCompany, limit: int = 10000):
    """Fetch recent SEC filings for an energy company."""
    if not company.sec_cik:
        log.info(f"  [{company.company_id}] No SEC CIK — skipping filings")
        return 0

    cik = company.sec_cik.lstrip("0")
    url = f"https://efts.sec.gov/LATEST/search-index?q=&dateRange=custom&startdt=2020-01-01&forms=10-K,10-Q,8-K&ciks={cik}"
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
        if session.query(SECEnergyFiling).filter_by(dedupe_hash=dedupe).first():
            continue

        acc_no_dash = acc.replace("-", "")
        filing_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_no_dash}/{docs[i]}" if i < len(docs) and docs[i] else None

        session.add(SECEnergyFiling(
            company_id=company.company_id,
            accession_number=acc,
            form_type=forms[i],
            filing_date=parse_date(dates[i]) if i < len(dates) else None,
            primary_doc_url=filing_url,
            filing_url=f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={forms[i]}&dateb=&owner=include&count=10",
            description=descs[i] if i < len(descs) else None,
            dedupe_hash=dedupe,
        ))
        count += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new SEC filings")
    return count


# ─── USASpending.gov Contracts ────────────────────────────────

def fetch_contracts(session, company: TrackedEnergyCompany):
    """Fetch government contracts from USASpending.gov with pagination."""
    search_name = company.usaspending_recipient_name or company.display_name
    url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
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
            if session.query(EnergyGovernmentContract).filter_by(dedupe_hash=dedupe).first():
                continue

            session.add(EnergyGovernmentContract(
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

def _safe_float(val) -> float:
    """Convert value to float, returning 0.0 on failure."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def fetch_lobbying(session, company: TrackedEnergyCompany):
    """Fetch lobbying disclosures from Senate LDA with full pagination."""
    search_name = company.display_name
    current_year = datetime.now().year
    years = list(range(current_year, 2019, -1))  # 2020-present
    count = 0

    for year in years:
        page_url = "https://lda.senate.gov/api/v1/filings/"
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
                if session.query(EnergyLobbyingRecord).filter_by(dedupe_hash=dedupe).first():
                    continue

                issues = []
                gov_entities = set()
                for activity in (r.get("lobbying_activities") or []):
                    issue_code = activity.get("general_issue_code_display")
                    if issue_code:
                        issues.append(issue_code)
                    for entity in (activity.get("government_entities") or []):
                        name = entity.get("name") if isinstance(entity, dict) else str(entity)
                        if name:
                            gov_entities.add(name)

                session.add(EnergyLobbyingRecord(
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
                    dedupe_hash=dedupe,
                ))
                count += 1

            page_url = data.get("next")
            page_num += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new lobbying filings")
    return count


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync energy sector data")
    parser.add_argument("--company", type=str, help="Sync only this company_id")
    parser.add_argument("--skip-sec", action="store_true", help="Skip SEC filings")
    parser.add_argument("--skip-contracts", action="store_true", help="Skip USASpending contracts")
    parser.add_argument("--skip-lobbying", action="store_true", help="Skip lobbying data")
    parser.add_argument("--skip-emissions", action="store_true", help="Skip EPA emissions")
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
        query = session.query(TrackedEnergyCompany).filter(TrackedEnergyCompany.is_active == 1)
        if args.company:
            query = query.filter(TrackedEnergyCompany.company_id == args.company)
        companies = query.all()

        log.info(f"Syncing {len(companies)} energy companies...")

        for co in companies:
            log.info(f"\n{'='*60}")
            log.info(f"Processing: {co.display_name} ({co.company_id})")

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
            co.last_full_refresh_at = datetime.utcnow()
            session.commit()

        log.info(f"\nDone! Synced {len(companies)} companies.")

    finally:
        session.close()


if __name__ == "__main__":
    main()
