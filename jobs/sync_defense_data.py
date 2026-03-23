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

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_defense")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")
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
            filing_url=f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type={forms[i]}&dateb=&owner=include&count=10",
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
    url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
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
        page_url = "https://lda.senate.gov/api/v1/filings/"
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
        if args.seed_only:
            log.info("Seed-only mode -- done.")
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
                log.error(f"FAILED {cid}: {e}")
                session.rollback()

        log.info(f"\nDone! Synced {len(companies)} companies.")

    finally:
        session.close()


if __name__ == "__main__":
    main()
