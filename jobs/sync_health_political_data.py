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
    HealthEnforcement,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_health_political")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})
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

def _safe_float(val) -> float:
    """Convert to float, treating None as 0."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def fetch_lobbying(session, company: TrackedCompany, limit: int = 50):
    """Fetch lobbying disclosures from Senate LDA API."""
    import time
    search_name = company.display_name
    all_results = []

    for year in [2024, 2023, 2022]:
        time.sleep(1)  # Rate limit
        params = {
            "client_name": search_name,
            "filing_year": year,
            "page_size": 25,
        }
        try:
            resp = requests.get("https://lda.senate.gov/api/v1/filings/", params=params,
                                headers={"Accept": "application/json"}, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning(f"  [{company.company_id}] Senate LDA error ({year}): {e}")
            continue

        for r in data.get("results", []):
            all_results.append(r)

    count = 0
    for r in all_results[:limit]:
        filing_uuid = r.get("filing_uuid", "")
        dedupe = md5(f"{company.company_id}:lda:{filing_uuid}")
        if session.query(HealthLobbyingRecord).filter_by(dedupe_hash=dedupe).first():
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
            dedupe_hash=dedupe,
        ))
        count += 1

    session.commit()
    log.info(f"  [{company.company_id}] {count} new lobbying filings")
    return count


# ─── USASpending Contracts ────────────────────────────────────

def fetch_contracts(session, company: TrackedCompany, limit: int = 50):
    """Fetch government contracts from USASpending.gov."""
    search_name = company.display_name
    url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
    payload = {
        "filters": {
            "recipient_search_text": [search_name],
            "award_type_codes": ["A", "B", "C", "D"],
            "time_period": [{"start_date": "2015-01-01", "end_date": datetime.now().strftime("%Y-%m-%d")}],
        },
        "fields": ["Award ID", "Award Amount", "Awarding Agency", "Description", "Start Date", "End Date", "Award Type"],
        "limit": limit,
        "page": 1,
        "sort": "Award Amount",
        "order": "desc",
    }

    try:
        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"  [{company.company_id}] USASpending error: {e}")
        return 0

    results = data.get("results", [])
    count = 0
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
            log.info(f"── {co.display_name} ({co.company_id}) ──")

            if not args.skip_lobbying:
                totals["lobbying"] += fetch_lobbying(session, co)

            if not args.skip_contracts:
                totals["contracts"] += fetch_contracts(session, co)

        log.info(f"Done. Lobbying: {totals['lobbying']} new, Contracts: {totals['contracts']} new")
    finally:
        session.close()


if __name__ == "__main__":
    main()
