"""
Defense sector enforcement data ingestion.

Fetches enforcement actions from:
- DOD (Department of Defense) -- via Federal Register API
- DCAA (Defense Contract Audit Agency) -- via Federal Register API
- DDTC/State Dept (ITAR arms export violations) -- via Federal Register API
- DOD IG (Inspector General) -- via Federal Register API
- DOJ (Department of Justice, defense fraud) -- via Federal Register API

Usage:
    python jobs/sync_defense_enforcement.py [--company COMPANY_ID]
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
from models.defense_models import TrackedDefenseCompany, DefenseEnforcement
from sqlalchemy import create_engine, event as sa_event
from sqlalchemy.orm import sessionmaker
from utils.db_compat import is_sqlite, set_pragmas_if_sqlite

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./wethepeople.db")
from connectors.federal_register import BASE_URL as FR_BASE

AGENCY_SLUGS = {
    "DOD": "defense-department",
    "DCAA": "defense-contract-audit-agency",
    "DDTC": "state-department",  # ITAR/arms export violations
    "DOD_IG": "defense-department",  # DOD Inspector General (same parent slug)
    "DOJ": "justice-department",  # defense fraud prosecutions
}

# Map sub-sectors to relevant agencies
SUBSECTOR_AGENCIES = {
    "defense_prime": ["DOD", "DCAA", "DDTC", "DOJ"],
    "defense_sub": ["DOD", "DCAA", "DOJ"],
    "aerospace_defense": ["DOD", "DCAA", "DDTC", "DOJ"],
    "cybersecurity": ["DOD", "DOJ"],
    "shipbuilding": ["DOD", "DCAA", "DOJ"],
    "munitions": ["DOD", "DDTC", "DOJ"],
    "intelligence": ["DOD", "DOJ"],
    "logistics_defense": ["DOD", "DCAA", "DOJ"],
}

LEGAL_SUFFIXES = [
    " Corporation", " Corp.", " Corp", " Incorporated", " Inc.", " Inc",
    " Company", " Co.", " Co", " Limited", " Ltd.", " Ltd",
    " Holdings", " Group", " plc", " LP", " LLC", " L.L.C.",
    " N.V.", " S.A.", " SE", " AG",
]


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


def _safe_float(val):
    """Safely convert to float, returning None on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


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
    if "debarment" in text or "debarred" in text:
        return "Debarment"
    elif "itar" in text or "arms export" in text:
        return "ITAR Violation"
    elif "consent decree" in text or "consent order" in text:
        return "Consent Decree"
    elif "civil penalty" in text or "civil money penalty" in text:
        return "Civil Penalty"
    elif "false claims" in text or "fraud" in text:
        return "Fraud/False Claims"
    elif "settlement" in text:
        return "Settlement"
    elif "suspension" in text:
        return "Suspension"
    elif "violation" in text:
        return "Violation"
    elif "enforcement" in text:
        return "Enforcement Action"
    else:
        return None  # Federal Register rulemaking — not a real enforcement action


def fetch_enforcement_from_fr(company_name: str, agency_slugs: list = None, limit: int = 100):
    """Fetch enforcement-related documents from Federal Register for a company."""
    enforcement_terms = [
        f'"{company_name}" enforcement',
        f'"{company_name}" penalty',
        f'"{company_name}" violation',
        f'"{company_name}" debarment',
        f'"{company_name}" fraud',
    ]

    all_results = []
    seen_doc_numbers = set()

    for term in enforcement_terms:
        params = {
            "per_page": limit,
            "order": "newest",
            "conditions[term]": term,
            "fields[]": [
                "document_number", "title", "abstract", "type",
                "publication_date", "html_url", "action", "agencies",
            ],
        }
        # Scope to specific agencies if provided
        if agency_slugs:
            for slug in agency_slugs:
                params.setdefault("conditions[agencies][]", [])
                if isinstance(params["conditions[agencies][]"], list):
                    params["conditions[agencies][]"].append(slug)
                else:
                    params["conditions[agencies][]"] = [params["conditions[agencies][]"], slug]

        try:
            time.sleep(1.0)
            resp = requests.get(f"{FR_BASE}/documents.json", params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning(f"  Federal Register search failed (term='{term[:50]}'): {e}")
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
            # Determine source label from agencies in the result
            agencies = doc.get("agencies", [])
            source_label = "DOD"
            for a in (agencies or []):
                slug = a.get("slug", "")
                for label, s in AGENCY_SLUGS.items():
                    if slug == s:
                        source_label = label
                        break

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


def _strip_legal_suffixes(name: str) -> str:
    """Strip legal entity suffixes to get a cleaner search name."""
    result = name
    for suffix in LEGAL_SUFFIXES:
        if result.endswith(suffix):
            result = result[:-len(suffix)].strip()
    if "," in result:
        result = result.split(",")[0].strip()
    return result


def sync_company_enforcement(session, company: TrackedDefenseCompany) -> int:
    """Sync enforcement actions for a single defense company."""
    search_names = set()
    search_names.add(company.display_name)
    stripped = _strip_legal_suffixes(company.display_name)
    if stripped != company.display_name:
        search_names.add(stripped)
    words = stripped.split()
    if len(words) >= 2 and len(words[0]) > 4:
        search_names.add(words[0])

    # Get relevant agencies for this company's sub-sector
    sector_type = getattr(company, "sector_type", None) or ""
    relevant_labels = SUBSECTOR_AGENCIES.get(sector_type, list(AGENCY_SLUGS.keys()))
    relevant_slugs = list(set(AGENCY_SLUGS[label] for label in relevant_labels if label in AGENCY_SLUGS))

    count = 0
    seen_hashes = set()

    for search_name in search_names:
        results = fetch_enforcement_from_fr(search_name, agency_slugs=relevant_slugs, limit=100)

        for r in results:
            dedupe = md5(f"{company.company_id}:{r['source']}:{r['doc_number']}")
            if dedupe in seen_hashes:
                continue
            seen_hashes.add(dedupe)

            if session.query(DefenseEnforcement).filter_by(dedupe_hash=dedupe).first():
                continue

            session.add(DefenseEnforcement(
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
        company = session.query(TrackedDefenseCompany).filter_by(company_id=args.company).first()
        if not company:
            log.error(f"Company '{args.company}' not found")
            return
        companies = [company]
    else:
        companies = session.query(TrackedDefenseCompany).all()

    log.info(f"Syncing enforcement for {len(companies)} defense companies...")
    total = 0

    for company in companies:
        log.info(f"\n{'='*60}")
        log.info(f"Processing: {company.display_name} ({company.company_id})")
        total += sync_company_enforcement(session, company)

    log.info(f"\nDone! Total new enforcement actions: {total}")
    session.close()


if __name__ == "__main__":
    main()
