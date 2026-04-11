"""
Regulations.gov Connector — Federal Rulemaking Comments, Documents, Dockets

Provides access to the Regulations.gov v4 API for tracking:
- Corporate comments on proposed federal regulations
- Rulemaking documents (proposed rules, final rules)
- Docket metadata

API docs: https://open.gsa.gov/api/regulationsgov/
Rate limit: 1,000 requests/hour
Auth: API key in X-Api-Key header

Key use case: detecting regulatory capture — companies that lobby AND comment
on the same regulations they're trying to influence.
"""

import hashlib
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

REGULATIONS_BASE = "https://api.regulations.gov/v4"
POLITE_DELAY = 0.5


def _get_api_key() -> str:
    key = os.getenv("REGULATIONS_GOV_API_KEY", "")
    if not key:
        logger.error("REGULATIONS_GOV_API_KEY not set in environment")
    return key


def _compute_hash(*parts: str) -> str:
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()


def _parse_date(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(val.strip(), fmt).date().isoformat()
        except (ValueError, AttributeError):
            continue
    return val


def _api_get(path: str, params: Dict, api_key: str) -> Optional[Dict]:
    """Make a GET request to Regulations.gov API."""
    url = f"{REGULATIONS_BASE}{path}"
    headers = {"X-Api-Key": api_key}

    for attempt in range(3):
        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(url, params=params, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 429:
                logger.warning("Regulations.gov rate limit reached, retrying in 60s (attempt %d/3)", attempt + 1)
                time.sleep(60)
                continue
            elif e.response is not None and e.response.status_code == 404:
                return None
            else:
                logger.error("Regulations.gov request failed: %s", e)
            return None
        except Exception as e:
            logger.error("Regulations.gov request failed: %s", e)
            return None
    logger.error("Regulations.gov request failed after 3 retries (429)")
    return None


def fetch_comments_by_org(
    org_name: str,
    api_key: str = "",
    agency_id: Optional[str] = None,
    max_pages: int = 10,
) -> List[Dict[str, Any]]:
    """Search for comments submitted by an organization.

    Uses searchTerm to find comments mentioning the org name.
    The organization field is not directly filterable in the API,
    so we search by text and verify in detail responses.
    """
    api_key = api_key or _get_api_key()
    if not api_key:
        return []

    params: Dict[str, Any] = {
        "filter[searchTerm]": org_name,
        "page[size]": 25,
        "sort": "-postedDate",
    }
    if agency_id:
        params["filter[agencyId]"] = agency_id

    results = []
    seen_hashes = set()

    for page_num in range(1, max_pages + 1):
        params["page[number]"] = page_num
        data = _api_get("/comments", params, api_key)
        if not data:
            break

        items = data.get("data", [])
        if not items:
            break

        for item in items:
            attrs = item.get("attributes", {})
            comment_id = item.get("id", "")
            title = attrs.get("title", "")
            posted_date = _parse_date(attrs.get("postedDate"))
            agency = attrs.get("agencyId", "")
            doc_id = attrs.get("commentOnDocumentId", "")
            docket_id = attrs.get("docketId", "")

            h = _compute_hash(comment_id)
            if h in seen_hashes:
                continue
            seen_hashes.add(h)

            results.append({
                "comment_id": comment_id,
                "document_id": doc_id,
                "docket_id": docket_id,
                "title": title,
                "agency_id": agency,
                "posted_date": posted_date,
                "commenter_name": org_name,
                "comment_text": (attrs.get("highlightedContent") or "")[:2000],
                "dedupe_hash": h,
            })

        meta = data.get("meta", {})
        total_pages = meta.get("totalPages", 1)
        if page_num >= total_pages:
            break

    logger.info("Regulations.gov comments '%s': %d records", org_name, len(results))
    return results


def fetch_documents(
    agency_id: str,
    search_term: str,
    doc_type: str = "Proposed Rule",
    api_key: str = "",
    max_pages: int = 5,
) -> List[Dict[str, Any]]:
    """Search for regulatory documents (proposed rules, final rules, etc.)."""
    api_key = api_key or _get_api_key()
    if not api_key:
        return []

    params: Dict[str, Any] = {
        "filter[agencyId]": agency_id,
        "filter[searchTerm]": search_term,
        "filter[documentType]": doc_type,
        "page[size]": 25,
        "sort": "-postedDate",
    }

    results = []
    seen_hashes = set()

    for page_num in range(1, max_pages + 1):
        params["page[number]"] = page_num
        data = _api_get("/documents", params, api_key)
        if not data:
            break

        items = data.get("data", [])
        if not items:
            break

        for item in items:
            attrs = item.get("attributes", {})
            doc_id = item.get("id", "")

            h = _compute_hash(doc_id)
            if h in seen_hashes:
                continue
            seen_hashes.add(h)

            results.append({
                "document_id": doc_id,
                "title": attrs.get("title", ""),
                "agency_id": attrs.get("agencyId", ""),
                "document_type": attrs.get("documentType", ""),
                "posted_date": _parse_date(attrs.get("postedDate")),
                "comment_start_date": _parse_date(attrs.get("commentStartDate")),
                "comment_end_date": _parse_date(attrs.get("commentEndDate")),
                "docket_id": attrs.get("docketId", ""),
                "fr_doc_num": attrs.get("frDocNum", ""),
                "open_for_comment": attrs.get("openForComment", False),
                "dedupe_hash": h,
            })

        meta = data.get("meta", {})
        if page_num >= meta.get("totalPages", 1):
            break

    logger.info("Regulations.gov documents '%s' at %s: %d records", search_term, agency_id, len(results))
    return results


def fetch_docket(
    docket_id: str,
    api_key: str = "",
) -> Optional[Dict[str, Any]]:
    """Fetch details for a single docket."""
    api_key = api_key or _get_api_key()
    if not api_key:
        return None

    data = _api_get(f"/dockets/{docket_id}", {}, api_key)
    if not data:
        return None

    item = data.get("data", {})
    attrs = item.get("attributes", {})

    return {
        "docket_id": item.get("id", docket_id),
        "title": attrs.get("title", ""),
        "agency_id": attrs.get("agencyId", ""),
        "docket_type": attrs.get("docketType", ""),
        "abstract": (attrs.get("dkAbstract") or "")[:2000],
        "rin": attrs.get("rin", ""),
        "comment_start_date": _parse_date(attrs.get("commentStartDate")),
        "comment_end_date": _parse_date(attrs.get("commentEndDate")),
        "effective_date": _parse_date(attrs.get("effectiveDate")),
        "dedupe_hash": _compute_hash(docket_id),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    print("=== Testing Regulations.gov Connector ===\n")

    key = _get_api_key()
    if not key:
        print("Set REGULATIONS_GOV_API_KEY to test")
    else:
        print("--- Comments: Pfizer ---")
        comments = fetch_comments_by_org("Pfizer", key, agency_id="FDA", max_pages=1)
        for c in comments[:3]:
            print(f"  {c['posted_date']} | {c['agency_id']} | {c['title'][:80]}")

        print("\n--- Documents: EPA Clean Air ---")
        docs = fetch_documents("EPA", "Clean Air Act", api_key=key, max_pages=1)
        for d in docs[:3]:
            print(f"  {d['posted_date']} | {d['document_type']} | {d['title'][:80]}")
