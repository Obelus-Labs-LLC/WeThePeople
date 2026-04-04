"""
Finance sector enforcement data ingestion.

Fetches enforcement actions from:
- CFPB (Consumer Financial Protection Bureau) — via Federal Register API
- SEC (Securities and Exchange Commission) — via Federal Register API
- OCC (Office of the Comptroller of the Currency) — via Federal Register API

Usage:
    python jobs/sync_finance_enforcement.py [--institution INSTITUTION_ID]
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
from models.finance_models import TrackedInstitution, FinanceEnforcement
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./wethepeople.db")
FR_BASE = "https://www.federalregister.gov/api/v1"

AGENCY_SLUGS = {
    "CFPB": "consumer-financial-protection-bureau",
    "SEC": "securities-and-exchange-commission",
    "OCC": "comptroller-of-the-currency",
    "DOJ": "justice-department",
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
    text = f"{title} {abstract}"
    # Match patterns like "$X million", "$X,XXX", "$X billion"
    patterns = [
        r'\$(\d+(?:\.\d+)?)\s*billion',
        r'\$(\d+(?:\.\d+)?)\s*million',
        r'\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)',
    ]
    for i, pattern in enumerate(patterns):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            amount = float(match.group(1).replace(",", ""))
            if i == 0:  # billion
                return amount * 1_000_000_000
            elif i == 1:  # million
                return amount * 1_000_000
            else:
                return amount
    return None


def classify_enforcement_type(title: str, abstract: str = "") -> str:
    """Classify enforcement action type from text."""
    text = f"{title} {abstract}".lower()
    if "consent order" in text or "consent decree" in text:
        return "Consent Order"
    elif "cease and desist" in text or "cease-and-desist" in text:
        return "Cease and Desist"
    elif "civil penalty" in text or "civil money penalty" in text:
        return "Civil Penalty"
    elif "settlement" in text:
        return "Settlement"
    elif "enforcement" in text:
        return "Enforcement Action"
    else:
        return "Regulatory Action"


def fetch_enforcement_from_fr(company_name: str, agency_slug: str, source_label: str, limit: int = 100):
    """Fetch enforcement-related documents from Federal Register for a company."""
    # Search terms that indicate enforcement actions
    enforcement_terms = [
        f'"{company_name}" enforcement',
        f'"{company_name}" penalty',
        f'"{company_name}" consent order',
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
            time.sleep(1.0)  # polite delay
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

            title = doc.get("title", "")
            abstract = doc.get("abstract", "") or ""

            all_results.append({
                "case_title": title[:500],
                "case_date": parse_date(doc.get("publication_date")),
                "case_url": doc.get("html_url", ""),
                "enforcement_type": classify_enforcement_type(title, abstract),
                "penalty_amount": extract_penalty(title, abstract),
                "description": abstract[:1000] if abstract else title[:500],
                "source": source_label,
                "doc_number": doc_num,
            })

    return all_results


def sync_institution_enforcement(session, institution: TrackedInstitution) -> int:
    """Sync enforcement actions for a single institution."""
    search_names = [institution.display_name]
    # Also try shorter name variants
    if "," in institution.display_name:
        search_names.append(institution.display_name.split(",")[0].strip())
    if " Inc" in institution.display_name:
        search_names.append(institution.display_name.replace(" Inc.", "").replace(" Inc", "").strip())

    count = 0
    seen_hashes = set()

    for search_name in search_names:
        for source_label, agency_slug in AGENCY_SLUGS.items():
            results = fetch_enforcement_from_fr(search_name, agency_slug, source_label, limit=100)

            for r in results:
                dedupe = md5(f"{institution.institution_id}:{r['source']}:{r['doc_number']}")
                if dedupe in seen_hashes:
                    continue
                seen_hashes.add(dedupe)

                if session.query(FinanceEnforcement).filter_by(dedupe_hash=dedupe).first():
                    continue

                session.add(FinanceEnforcement(
                    institution_id=institution.institution_id,
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
    log.info(f"  [{institution.institution_id}] {count} new enforcement actions")
    return count


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--institution", type=str, help="Sync a specific institution")
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

    if args.institution:
        inst = session.query(TrackedInstitution).filter_by(institution_id=args.institution).first()
        if not inst:
            log.error(f"Institution '{args.institution}' not found")
            return
        institutions = [inst]
    else:
        institutions = session.query(TrackedInstitution).all()

    log.info(f"Syncing enforcement for {len(institutions)} institutions...")
    total = 0

    for inst in institutions:
        log.info(f"\n{'='*60}")
        log.info(f"Processing: {inst.display_name} ({inst.institution_id})")
        total += sync_institution_enforcement(session, inst)

    log.info(f"\nDone! Total new enforcement actions: {total}")
    session.close()


if __name__ == "__main__":
    main()
