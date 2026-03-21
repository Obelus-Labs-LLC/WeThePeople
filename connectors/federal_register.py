"""
Federal Register Connector — Full API

Fetches executive orders, agency rules, proposed rules, notices, and
presidential documents from the Federal Register API. No API key needed.

This is the official daily journal of the U.S. Government — every regulation,
executive order, and agency action is published here. Key for:
- Tracking executive actions (what the president ACTUALLY did)
- Agency rulemaking (downstream effects of legislation)
- Regulatory enforcement actions

API docs: https://www.federalregister.gov/developers/documentation/api/v1
Auth: None required (public API)
Rate limit: Be polite — 1s between calls
Format: JSON or CSV
Pagination: Max 2000 results per search (use date ranges for more)
"""

import time
import json
import requests
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path

from models.database import SessionLocal, Action, SourceDocument
from sqlalchemy.exc import IntegrityError
from utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# API base URL
BASE_URL = "https://www.federalregister.gov/api/v1"

# Polite delay between API calls (seconds)
POLITE_DELAY = 1.0

# Default fields to request (reduces response size)
DEFAULT_FIELDS = [
    "document_number",
    "title",
    "abstract",
    "type",
    "subtype",
    "publication_date",
    "signing_date",
    "html_url",
    "pdf_url",
    "agencies",
    "action",
    "dates",
    "docket_ids",
    "executive_order_number",
    "citation",
    "regulation_id_numbers",
    "significant",
]


# ============================================================================
# DOCUMENT TYPES — What the Federal Register publishes
# ============================================================================

DOCUMENT_TYPES = {
    "RULE": "Final rules — legally binding regulations",
    "PRORULE": "Proposed rules — open for public comment",
    "NOTICE": "Agency notices — meetings, hearings, investigations",
    "PRESDOCU": "Presidential documents — EOs, proclamations, memoranda",
}

PRESIDENTIAL_SUBTYPES = {
    1: "Executive Order",
    2: "Proclamation",
    3: "Presidential Memorandum",
    4: "Determination",
    5: "Notice",
    6: "Administrative Order",
    7: "Sequestration Order",
}


# ============================================================================
# CORE API — Search and fetch documents
# ============================================================================

def search_documents(
    term: Optional[str] = None,
    doc_type: Optional[str] = None,
    agencies: Optional[List[str]] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    president: Optional[str] = None,
    significant: Optional[bool] = None,
    per_page: int = 1000,
    page: int = 1,
    order: str = "newest",
    fields: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Search Federal Register documents with full filter support.

    Args:
        term: Full-text search term
        doc_type: Document type filter: "RULE", "PRORULE", "NOTICE", "PRESDOCU"
        agencies: List of agency slugs (e.g., ["environmental-protection-agency"])
        date_from: Start date (YYYY-MM-DD)
        date_to: End date (YYYY-MM-DD)
        president: President identifier (e.g., "joe-biden", "donald-trump")
        significant: If True, only "significant" rules (EO 12866)
        per_page: Results per page (max 1000)
        page: Page number
        order: Sort order ("newest", "oldest", "relevance", "executive_order_number")
        fields: Specific fields to return (default: DEFAULT_FIELDS)

    Returns:
        Dict with 'count', 'results', 'next_page_url', etc.
    """
    params: Dict[str, Any] = {
        "per_page": min(per_page, 1000),
        "page": page,
        "order": order,
    }

    # Add field selection
    params["fields[]"] = fields or DEFAULT_FIELDS

    # Search conditions
    if term:
        params["conditions[term]"] = term
    if doc_type:
        params["conditions[type][]"] = doc_type
    if agencies:
        for agency in agencies:
            params.setdefault("conditions[agencies][]", [])
            if isinstance(params["conditions[agencies][]"], list):
                params["conditions[agencies][]"].append(agency)
            else:
                params["conditions[agencies][]"] = [params["conditions[agencies][]"], agency]
    if date_from:
        params["conditions[publication_date][gte]"] = date_from
    if date_to:
        params["conditions[publication_date][lte]"] = date_to
    if president:
        params["conditions[president]"] = president
    if significant is not None:
        params["conditions[significant]"] = "1" if significant else "0"

    try:
        response = requests.get(f"{BASE_URL}/documents.json", params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        count = data.get("count", 0)
        results = data.get("results", [])
        logger.info("Federal Register search: %d results (page %d, total %d)", len(results), page, count)
        return data
    except requests.RequestException as e:
        logger.error("Federal Register search failed: %s", e)
        return {"count": 0, "results": []}


def search_all_pages(
    max_pages: int = 20,
    **search_kwargs,
) -> List[Dict[str, Any]]:
    """
    Search with automatic pagination (up to 2000 results).

    Args:
        max_pages: Maximum pages to fetch
        **search_kwargs: All arguments from search_documents()

    Returns:
        Combined list of all document results
    """
    all_results = []

    for page in range(1, max_pages + 1):
        data = search_documents(page=page, **search_kwargs)
        results = data.get("results", [])

        if not results:
            break

        all_results.extend(results)

        # Check if there are more pages
        if not data.get("next_page_url"):
            break

        time.sleep(POLITE_DELAY)

    logger.info("Federal Register paginated search: %d total results", len(all_results))
    return all_results


# ============================================================================
# SINGLE DOCUMENT FETCH
# ============================================================================

def fetch_document(document_number: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a single document by its FR document number.

    Args:
        document_number: Federal Register document number (e.g., "2025-02345")

    Returns:
        Document dict, or None on error
    """
    try:
        response = requests.get(f"{BASE_URL}/documents/{document_number}.json", timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error("Failed to fetch document %s: %s", document_number, e)
        return None


def fetch_documents_multi(document_numbers: List[str]) -> List[Dict[str, Any]]:
    """
    Fetch multiple documents at once (max ~100 per request).

    Args:
        document_numbers: List of FR document numbers

    Returns:
        List of document dicts
    """
    if not document_numbers:
        return []

    numbers_str = ",".join(document_numbers[:100])
    try:
        response = requests.get(
            f"{BASE_URL}/documents/{numbers_str}.json",
            params={"fields[]": DEFAULT_FIELDS},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        results = data.get("results", [])
        return results
    except requests.RequestException as e:
        logger.error("Failed to fetch multiple documents: %s", e)
        return []


# ============================================================================
# CONVENIENCE — Common searches
# ============================================================================

def fetch_executive_orders(
    president: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    per_page: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch executive orders, optionally filtered by president and date.

    Args:
        president: President slug (e.g., "donald-trump", "joe-biden")
        date_from: Start date (YYYY-MM-DD)
        date_to: End date (YYYY-MM-DD)
        per_page: Results per page

    Returns:
        List of executive order document dicts
    """
    return search_all_pages(
        doc_type="PRESDOCU",
        president=president,
        date_from=date_from,
        date_to=date_to,
        per_page=per_page,
    )


def fetch_agency_rules(
    agency_slug: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    significant_only: bool = False,
    per_page: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch final rules published by a specific agency.

    Args:
        agency_slug: Agency slug (e.g., "environmental-protection-agency")
        date_from: Start date
        date_to: End date
        significant_only: Only rules deemed "significant" under EO 12866
        per_page: Results per page

    Returns:
        List of rule document dicts
    """
    return search_all_pages(
        doc_type="RULE",
        agencies=[agency_slug],
        date_from=date_from,
        date_to=date_to,
        significant=True if significant_only else None,
        per_page=per_page,
    )


def fetch_proposed_rules(
    agency_slug: Optional[str] = None,
    term: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    per_page: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch proposed rules (open for public comment).

    Args:
        agency_slug: Optional agency filter
        term: Optional search term
        date_from: Start date
        date_to: End date
        per_page: Results per page

    Returns:
        List of proposed rule document dicts
    """
    agencies = [agency_slug] if agency_slug else None
    return search_all_pages(
        doc_type="PRORULE",
        term=term,
        agencies=agencies,
        date_from=date_from,
        date_to=date_to,
        per_page=per_page,
    )


def fetch_recent_documents(
    days: int = 7,
    doc_type: Optional[str] = None,
    per_page: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch documents published in the last N days.

    Args:
        days: Number of days to look back
        doc_type: Optional document type filter
        per_page: Results per page

    Returns:
        List of document dicts
    """
    date_from = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    return search_all_pages(
        doc_type=doc_type,
        date_from=date_from,
        per_page=per_page,
    )


# ============================================================================
# AGENCIES — Federal agencies that publish in the FR
# ============================================================================

# Common agency slugs for WeThePeople
AGENCY_SLUGS = {
    "epa": "environmental-protection-agency",
    "fda": "food-and-drug-administration",
    "doj": "justice-department",
    "dol": "labor-department",
    "ed": "education-department",
    "hhs": "health-and-human-services-department",
    "dhs": "homeland-security-department",
    "dod": "defense-department",
    "treasury": "treasury-department",
    "state": "state-department",
    "interior": "interior-department",
    "usda": "agriculture-department",
    "commerce": "commerce-department",
    "energy": "energy-department",
    "hud": "housing-and-urban-development-department",
    "transportation": "transportation-department",
    "va": "veterans-affairs-department",
    "sec": "securities-and-exchange-commission",
    "ftc": "federal-trade-commission",
    "fcc": "federal-communications-commission",
    "cfpb": "consumer-financial-protection-bureau",
    "irs": "internal-revenue-service",
}


def list_agencies() -> Dict[str, str]:
    """Return mapping of agency abbreviations to FR slugs."""
    return AGENCY_SLUGS.copy()


# ============================================================================
# INGESTION — Store presidential documents as Actions (legacy compat)
# ============================================================================

def find_or_create_source(session, url):
    """Find existing SourceDocument or create new one."""
    source = session.query(SourceDocument).filter(SourceDocument.url == url).first()
    if not source:
        source = SourceDocument(
            url=url,
            publisher="Federal Register",
            retrieved_at=datetime.utcnow(),
            content_hash=None,
        )
        session.add(source)
        session.flush()
    return source


def fetch_presidential_documents(pages=3):
    """
    Ingest presidential documents into the database as Actions.

    Legacy function — creates Action records for presidential documents
    attributed to "trump". Uses the search API with presidential document filters.
    """
    logger.info("Fetching Presidential Documents...")

    db = SessionLocal()
    doc_count = 0

    search_params = {
        "per_page": 100,
        "order": "newest",
        "conditions[presidential_document]": "true",
        "conditions[type][]": [
            "Presidential Document",
            "Executive Order",
            "Proclamation",
            "Notice",
        ],
    }

    for page in range(1, pages + 1):
        params = search_params.copy()
        params["page"] = page

        try:
            response = requests.get(f"{BASE_URL}/documents.json", params=params, timeout=30)
            if response.status_code != 200:
                logger.warning("Request failed: %d", response.status_code)
                break
        except requests.RequestException as e:
            logger.error("Request failed: %s", e)
            break

        results = response.json().get("results", [])
        if not results:
            break

        for doc in results:
            doc_number = doc.get("document_number")
            source_url = doc.get("html_url")

            if not source_url:
                continue

            source = find_or_create_source(db, source_url)

            already_exists = (
                db.query(Action)
                .filter(Action.person_id == "trump", Action.source_id == source.id)
                .first()
            )

            if already_exists:
                continue

            action = Action(
                person_id="trump",
                title=doc.get("title", "No Title"),
                summary=doc.get("abstract", "")[:500],
                date=datetime.strptime(doc["publication_date"], "%Y-%m-%d"),
                source_id=source.id,
            )

            db.add(action)

            try:
                db.commit()
                doc_count += 1

                # Audit logging
                try:
                    audit_dir = Path("data/raw/federal_register/trump")
                    audit_dir.mkdir(parents=True, exist_ok=True)

                    audit_data = {
                        "retrieved_at": datetime.utcnow().isoformat(),
                        "source_url": source_url,
                        "raw_doc": doc,
                    }

                    filepath = audit_dir / f"{doc_number}.json"
                    with open(filepath, "w", encoding="utf-8") as f:
                        json.dump(audit_data, f, indent=2)

                except Exception as log_error:
                    logger.warning("Audit log failed for %s: %s", doc_number, log_error)

            except IntegrityError:
                db.rollback()

        time.sleep(POLITE_DELAY)

    db.close()
    logger.info("Ingest complete. New documents: %d", doc_count)


# ============================================================================
# CLI TEST
# ============================================================================

if __name__ == "__main__":
    import sys

    setup_logging("INFO")

    print("Federal Register Connector Test")
    print("=" * 60)

    # Test 1: Search for recent executive orders
    print("\n1. Fetching recent executive orders (last 30 days)...")
    date_from = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
    data = search_documents(doc_type="PRESDOCU", date_from=date_from, per_page=5)
    results = data.get("results", [])
    print(f"   Found {data.get('count', 0)} total ({len(results)} shown)")
    for doc in results[:3]:
        print(f"   - [{doc.get('type', '?')}] {doc.get('title', 'untitled')[:70]}")
        print(f"     Date: {doc.get('publication_date', '?')}")

    time.sleep(POLITE_DELAY)

    # Test 2: Search for EPA rules
    print("\n2. Fetching recent EPA rules...")
    data = search_documents(
        doc_type="RULE",
        agencies=["environmental-protection-agency"],
        per_page=5,
    )
    results = data.get("results", [])
    print(f"   Found {data.get('count', 0)} total ({len(results)} shown)")
    for doc in results[:3]:
        print(f"   - {doc.get('title', 'untitled')[:70]}")

    time.sleep(POLITE_DELAY)

    # Test 3: Search by keyword
    print("\n3. Searching for 'climate change'...")
    data = search_documents(term="climate change", per_page=5)
    results = data.get("results", [])
    print(f"   Found {data.get('count', 0)} total ({len(results)} shown)")
    for doc in results[:3]:
        print(f"   - [{doc.get('type', '?')}] {doc.get('title', 'untitled')[:70]}")

    time.sleep(POLITE_DELAY)

    # Test 4: Fetch a single document
    if results:
        doc_num = results[0].get("document_number")
        if doc_num:
            print(f"\n4. Fetching single document: {doc_num}...")
            doc = fetch_document(doc_num)
            if doc:
                print(f"   Title: {doc.get('title', 'untitled')[:70]}")
                print(f"   Type: {doc.get('type', '?')}")
                agencies = doc.get("agencies", [])
                if agencies:
                    print(f"   Agency: {agencies[0].get('name', '?')}")

    # Test 5: Available agencies
    print(f"\n5. Tracked agency slugs: {len(AGENCY_SLUGS)}")
    for abbr, slug in list(AGENCY_SLUGS.items())[:5]:
        print(f"   {abbr}: {slug}")
    print(f"   ... and {len(AGENCY_SLUGS) - 5} more")

    print("\n" + "=" * 60)
    print("Federal Register connector test complete.")
