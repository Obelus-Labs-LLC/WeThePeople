"""
Finance Sector Political Data Sync

Fetches lobbying, government contracts, and enforcement data
for tracked financial institutions.

Sources:
- Senate LDA (lobbying disclosures)
- USASpending.gov (government contracts)

Usage:
    python jobs/sync_finance_political_data.py
    python jobs/sync_finance_political_data.py --institution jpmorgan
    python jobs/sync_finance_political_data.py --skip-lobbying
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
from models.finance_models import (
    TrackedInstitution,
    FinanceLobbyingRecord,
    FinanceGovernmentContract,
    FinanceEnforcement,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("sync_finance_political")

DB_PATH = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

engine = create_engine(DB_PATH, connect_args={"check_same_thread": False} if "sqlite" in DB_PATH else {})
Session = sessionmaker(bind=engine)


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


# ─── Senate LDA Lobbying ─────────────────────────────────────

def fetch_lobbying(session, inst: TrackedInstitution, limit: int = 50):
    """Fetch lobbying disclosures from Senate LDA."""
    search_name = inst.display_name
    url = f"https://lda.senate.gov/api/v1/filings/?filing_client_name={requests.utils.quote(search_name)}&filing_year=2024&filing_year=2023&filing_year=2022"
    headers = {"Accept": "application/json"}

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        log.warning(f"  [{inst.institution_id}] Senate LDA error: {e}")
        return 0

    results = data.get("results", [])[:limit]
    count = 0
    for r in results:
        filing_uuid = r.get("filing_uuid", "")
        dedupe = md5(f"{inst.institution_id}:lda:{filing_uuid}")
        if session.query(FinanceLobbyingRecord).filter_by(dedupe_hash=dedupe).first():
            continue

        issues = ", ".join([li.get("general_issue_code_display", "") for li in r.get("lobbying_activities", [])]) if r.get("lobbying_activities") else None
        entities = ", ".join([li.get("government_entities_description", "") for li in r.get("lobbying_activities", []) if li.get("government_entities_description")]) if r.get("lobbying_activities") else None

        session.add(FinanceLobbyingRecord(
            institution_id=inst.institution_id,
            filing_uuid=filing_uuid,
            filing_year=r.get("filing_year", 0),
            filing_period=r.get("filing_period_display"),
            income=r.get("income"),
            expenses=r.get("expenses"),
            registrant_name=r.get("registrant", {}).get("name") if r.get("registrant") else None,
            client_name=r.get("client", {}).get("name") if r.get("client") else None,
            lobbying_issues=issues,
            government_entities=entities,
            dedupe_hash=dedupe,
        ))
        count += 1

    session.commit()
    log.info(f"  [{inst.institution_id}] {count} new lobbying filings")
    return count


# ─── USASpending Contracts ────────────────────────────────────

def fetch_contracts(session, inst: TrackedInstitution, limit: int = 50):
    """Fetch government contracts from USASpending.gov."""
    search_name = inst.display_name
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
        log.warning(f"  [{inst.institution_id}] USASpending error: {e}")
        return 0

    results = data.get("results", [])
    count = 0
    for r in results:
        award_id = r.get("Award ID") or r.get("generated_internal_id", "")
        dedupe = md5(f"{inst.institution_id}:usa:{award_id}")
        if session.query(FinanceGovernmentContract).filter_by(dedupe_hash=dedupe).first():
            continue

        session.add(FinanceGovernmentContract(
            institution_id=inst.institution_id,
            award_id=award_id,
            award_amount=r.get("Award Amount"),
            awarding_agency=r.get("Awarding Agency"),
            description=r.get("Description"),
            start_date=r.get("Start Date"),
            end_date=r.get("End Date"),
            contract_type=r.get("Award Type"),
            dedupe_hash=dedupe,
        ))
        count += 1

    session.commit()
    log.info(f"  [{inst.institution_id}] {count} new contracts")
    return count


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync finance sector political data")
    parser.add_argument("--institution", type=str, help="Sync only this institution_id")
    parser.add_argument("--skip-lobbying", action="store_true")
    parser.add_argument("--skip-contracts", action="store_true")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    session = Session()

    try:
        query = session.query(TrackedInstitution).filter_by(is_active=1)
        if args.institution:
            query = query.filter_by(institution_id=args.institution)

        institutions = query.all()
        log.info(f"Syncing political data for {len(institutions)} finance institutions")

        totals = {"lobbying": 0, "contracts": 0}

        for inst in institutions:
            log.info(f"── {inst.display_name} ({inst.institution_id}) ──")

            if not args.skip_lobbying:
                totals["lobbying"] += fetch_lobbying(session, inst)

            if not args.skip_contracts:
                totals["contracts"] += fetch_contracts(session, inst)

        log.info(f"Done. Lobbying: {totals['lobbying']} new, Contracts: {totals['contracts']} new")
    finally:
        session.close()


if __name__ == "__main__":
    main()
