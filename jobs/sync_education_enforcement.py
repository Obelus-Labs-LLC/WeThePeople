"""
Education sector enforcement data ingestion.

Fetches enforcement actions from:
- ED (Department of Education) — via Federal Register API
- FTC (Federal Trade Commission) — via Federal Register API
- CFPB (Consumer Financial Protection Bureau) — via Federal Register API

Usage:
    python jobs/sync_education_enforcement.py [--company COMPANY_ID]
"""

import os
import sys
import hashlib
import argparse
import logging
import time
import re
from datetime import datetime, date

import requests
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import Base
from models.education_models import TrackedEducationCompany, EducationEnforcement
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./wethepeople.db")
from connectors.federal_register import BASE_URL as FR_BASE

AGENCY_SLUGS = {
    "ED": "education-department",
    "FTC": "federal-trade-commission",
    "CFPB": "consumer-financial-protection-bureau",
}

# Map subsector types to relevant enforcement agencies
SUBSECTOR_AGENCIES = {
    "student_lending": ["ED", "CFPB", "FTC"],
    "for_profit_college": ["ED", "CFPB", "FTC"],
    "edtech": ["ED", "FTC"],
    "publishing": ["ED", "FTC"],
    "testing_assessment": ["ED", "FTC"],
    "tutoring": ["ED", "FTC"],
    "early_childhood": ["ED", "FTC"],
    "workforce_training": ["ED", "FTC"],
}


def md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def parse_date(val):
    if val is None:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float:
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def extract_penalty(title: str, abstract: str = "") -> float:
    """Try to extract a dollar penalty amount from title or abstract."""
    MAX_REAL_PENALTY = 5e10  # $50B cap — rejects rulemaking thresholds like "$700B"
    # sanity: reject > 5e10 — any penalty >$50B is essentially never a real penalty
    # (the largest ever was ~$20B BofA 2014); values that high are almost always
    # capital thresholds or market-size figures from rulemaking text.
    text = f"{title} {abstract}"
    patterns = [
        r'\$(\d+(?:\.\d+)?)\s*billion',
        r'\$(\d+(?:\.\d+)?)\s*million',
        r'\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)',
    ]
    for i, pattern in enumerate(patterns):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount = float(match.group(1).replace(",", ""))
            if i == 0:
                return amount * 1_000_000_000
            elif i == 1:
                return amount * 1_000_000
            else:
                return amount if amount <= MAX_REAL_PENALTY else None
    return None


def classify_enforcement_type(title: str, abstract: str = "") -> str:
    """Classify enforcement action type from text."""
    text = f"{title} {abstract}".lower()
    if "consent decree" in text:
        return "Consent Decree"
    elif "civil penalty" in text or "civil money penalty" in text:
        return "Civil Penalty"
    elif "administrative order" in text:
        return "Administrative Order"
    elif "settlement" in text:
        return "Settlement"
    elif "violation" in text:
        return "Violation"
    elif "enforcement" in text:
        return "Enforcement Action"
    else:
        return None  # Federal Register rulemaking — not a real enforcement action


def fetch_enforcement_from_fr(company_name: str, agency_slug: str, source_label: str, limit: int = 100):
    """Fetch enforcement-related documents from Federal Register for a company."""
    enforcement_terms = [
        f'"{company_name}" enforcement',
        f'"{company_name}" penalty',
        f'"{company_name}" violation',
        f'"{company_name}" settlement',
    ]

    all_results = []
    seen_doc_numbers = set()

    for term in enforcement_terms:
        params = {
            "per_page": limit,
            "order": "newest",
            "conditions[term]": term,
            "conditions[agencies][]": agency_slug,
            "fields[]": [
                "document_number", "title", "abstract", "type",
                "publication_date", "html_url", "action",
            ],
        }

        try:
            time.sleep(1.0)
            resp = requests.get(f"{FR_BASE}/documents.json", params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning(f"  Federal Register search failed ({source_label}, term='{term[:40]}'): {e}")
            continue

        for doc in data.get("results", []):
            doc_num = doc.get("document_number", "")
            if doc_num in seen_doc_numbers:
                continue
            seen_doc_numbers.add(doc_num)
            # Federal Register 'Rule' and 'Proposed Rule' types are rulemakings,
            # not enforcement actions — reject them outright so dollar
            # thresholds inside the rule text aren't mis-stored as penalties.
            doc_type = (doc.get("type") or "").strip()
            if doc_type in ("Rule", "Proposed Rule"):
                continue

            title = doc.get("title", "")
            abstract = doc.get("abstract", "") or ""

            _etype = classify_enforcement_type(title, abstract)

            if _etype is None:

                continue

            all_results.append({
                "case_title": title[:500],
                "case_date": parse_date(doc.get("publication_date")),
                "case_url": doc.get("html_url", ""),
                "enforcement_type": _etype,
                "penalty_amount": extract_penalty(title, abstract),
                "description": abstract[:1000] if abstract else title[:500],
                "source": source_label,
                "doc_number": doc_num,
            })

    return all_results


def sync_company_enforcement(session, company: TrackedEducationCompany) -> int:
    """Sync enforcement actions for a single education company."""
    search_names = [company.display_name]
    if "," in company.display_name:
        search_names.append(company.display_name.split(",")[0].strip())
    short = company.display_name.replace(" Corporation", "").replace(" Inc.", "").replace(" Inc", "").replace(" Co.", "").replace(" plc", "").replace(" LP", "").replace(" LLC", "").strip()
    if short != company.display_name:
        search_names.append(short)

    # Determine which agencies to search based on subsector
    sector_type = getattr(company, "sector_type", None)
    agency_keys = SUBSECTOR_AGENCIES.get(sector_type, list(AGENCY_SLUGS.keys()))

    count = 0
    seen_hashes = set()

    for search_name in search_names:
        for source_label in agency_keys:
            agency_slug = AGENCY_SLUGS.get(source_label)
            if not agency_slug:
                continue
            results = fetch_enforcement_from_fr(search_name, agency_slug, source_label, limit=100)

            for r in results:
                dedupe = md5(f"{company.company_id}:{r['source']}:{r['doc_number']}")
                if dedupe in seen_hashes:
                    continue
                seen_hashes.add(dedupe)

                if session.query(EducationEnforcement).filter_by(dedupe_hash=dedupe).first():
                    continue

                session.add(EducationEnforcement(
                    company_id=company.company_id,
                    case_title=r["case_title"],
                    case_date=r["case_date"],
                    case_url=r["case_url"],
                    enforcement_type=r["enforcement_type"],
                    penalty_amount=r["penalty_amount"],
                    description=r["description"],
                    source=r["source"],
                    dedupe_hash=dedupe,
                ))
                count += 1

    if count:
        session.commit()
    log.info(f"  [{company.company_id}] {count} new enforcement actions")
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--company", type=str, help="Sync a specific company")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL)

    if is_sqlite():
        @sa_event.listens_for(engine, "connect")
        def _set_sqlite_pragmas(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=60000")
            cursor.close()

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    log.info(f"Database: {DATABASE_URL}")

    if args.company:
        company = session.query(TrackedEducationCompany).filter_by(company_id=args.company).first()
        if not company:
            log.error(f"Company '{args.company}' not found")
            return
        companies = [company]
    else:
        companies = session.query(TrackedEducationCompany).all()

    log.info(f"Syncing enforcement for {len(companies)} education companies...")
    total = 0

    for company in companies:
        log.info(f"\n{'='*60}")
        log.info(f"Processing: {company.display_name} ({company.company_id})")
        total += sync_company_enforcement(session, company)

    log.info(f"\nDone! Total new enforcement actions: {total}")
    session.close()


if __name__ == "__main__":
    main()
