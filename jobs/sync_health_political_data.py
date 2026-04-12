"""
Health Sector Political Data Sync

Fetches lobbying, government contracts, and enforcement data
for tracked health companies.

Sources:
- Senate LDA (lobbying disclosures)
- USASpending.gov (government contracts)
- FDA Warning Letters / DOJ pharma enforcement (curated + scraped)

Usage:
    python jobs/sync_health_political_data.py
    python jobs/sync_health_political_data.py --company pfizer
    python jobs/sync_health_political_data.py --skip-lobbying --skip-contracts
"""

import os
from connectors.senate_lda import LDA_BASE
from connectors.usaspending import USASPENDING_BASE
import sys
import hashlib
import argparse
import logging
from datetime import datetime

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.health_models import (
    TrackedCompany,
    HealthLobbyingRecord,
    HealthGovernmentContract,
)
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_health_political")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})

import sqlalchemy.event as sa_event

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
    if isinstance(val, datetime):
        return val.date()
    s = str(val).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


# ─── Senate LDA Lobbying ─────────────────────────────────────

def _safe_float(val):
    """Convert to float, preserving None for nullable fields."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def fetch_lobbying(session, company: TrackedCompany):
    """Fetch lobbying disclosures from Senate LDA API with full pagination."""
    import time
    search_name = company.display_name
    current_year = datetime.now().year
    years = list(range(current_year, 2019, -1))  # 2020-present

    count = 0
    for year in years:
        page_url = LDA_BASE
        page_num = 0

        while page_url:
            params = {
                "client_name": search_name,
                "filing_year": year,
                "page_size": 25,  # API max
            }
            try:
                time.sleep(1)  # Rate limit
                if page_num == 0:
                    resp = requests.get(page_url, params=params,
                                        headers={"Accept": "application/json"}, timeout=30)
                else:
                    resp = requests.get(page_url,
                                        headers={"Accept": "application/json"}, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except Exception as e:
                log.warning(f"  [{company.company_id}] Senate LDA error ({year}, page {page_num}): {e}")
                break

            for r in data.get("results", []):
                filing_uuid = r.get("filing_uuid", "")
                dedupe = md5(f"{company.company_id}:lda:{filing_uuid}")
                if session.query(HealthLobbyingRecord).filter_by(dedupe_hash=dedupe).first():
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

                session.add(HealthLobbyingRecord(
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


# ─── USASpending Contracts ────────────────────────────────────

def fetch_contracts(session, company: TrackedCompany):
    """Fetch government contracts from USASpending.gov with pagination."""
    import time
    search_name = company.display_name
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
            if session.query(HealthGovernmentContract).filter_by(dedupe_hash=dedupe).first():
                continue

            session.add(HealthGovernmentContract(
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

        # Commit after each page to avoid large transactions
        if count > 0:
            session.commit()

        if len(results) < page_size:
            break
        page += 1
        time.sleep(1)

    session.commit()
    log.info(f"  [{company.company_id}] {count} new contracts")
    return count


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync health sector political data")
    parser.add_argument("--company", type=str, help="Sync only this company_id")
    parser.add_argument("--skip-lobbying", action="store_true")
    parser.add_argument("--skip-contracts", action="store_true")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    session = Session()

    try:
        query = session.query(TrackedCompany).filter_by(is_active=1)
        if args.company:
            query = query.filter_by(company_id=args.company)

        companies = query.all()
        log.info(f"Syncing political data for {len(companies)} health companies")

        totals = {"lobbying": 0, "contracts": 0}

        for co in companies:
            co_id = co.company_id
            log.info(f"── {co.display_name} ({co_id}) ──")

            try:
                if not args.skip_lobbying:
                    totals["lobbying"] += fetch_lobbying(session, co)

                if not args.skip_contracts:
                    totals["contracts"] += fetch_contracts(session, co)
            except Exception as e:
                log.error(f"FAILED {co_id}: {e}", exc_info=True)
                # NOTE: totals may be slightly inaccurate if lobbying succeeded but contracts failed
                session.rollback()

        log.info(f"Done. Lobbying: {totals['lobbying']} new, Contracts: {totals['contracts']} new")
    finally:
        session.close()


if __name__ == "__main__":
    main()
