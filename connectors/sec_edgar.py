"""
SEC EDGAR Connector — Company Submissions & Filings

Fetch SEC filings (10-K, 10-Q, 8-K, etc.) for any public company via CIK number.
Uses the EDGAR full-text submissions endpoint.

API docs: https://www.sec.gov/edgar/sec-api-documentation
Rate limit: 10 requests/sec (with User-Agent header)
Auth: None required, but User-Agent header is mandatory
"""

import hashlib
import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

SUBMISSIONS_BASE = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_BROWSE_BASE = "https://www.sec.gov/cgi-bin/browse-edgar"
EFTS_BASE = "https://efts.sec.gov/LATEST"

HEADERS = {
    "User-Agent": "WeThePeople/1.0 (wethepeopleforus@gmail.com)",
    "Accept": "application/json",
}

POLITE_DELAY = 0.15  # ~6 req/sec, well under 10/sec limit


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _zero_pad_cik(cik: str) -> str:
    """Pad CIK to 10 digits with leading zeros as EDGAR requires."""
    return str(cik).strip().zfill(10)


def fetch_company_submissions(cik: str) -> Optional[Dict[str, Any]]:
    """
    Fetch the full submissions JSON for a company from SEC EDGAR.

    Args:
        cik: SEC Central Index Key (e.g. '320193' for Apple)

    Returns:
        Full submissions dict (contains recent filings, company info),
        or None on error.
    """
    padded = _zero_pad_cik(cik)
    url = SUBMISSIONS_BASE.format(cik=padded)

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error("SEC EDGAR fetch failed for CIK %s: %s", cik, e)
        return None


def extract_filings(
    submissions: Dict[str, Any],
    form_types: Optional[List[str]] = None,
    limit: int = 10000,
) -> List[Dict[str, Any]]:
    """
    Extract structured filing records from a submissions response.

    Args:
        submissions: Full submissions JSON from fetch_company_submissions()
        form_types: List of form types to include (e.g. ['10-K', '10-Q', '8-K']).
                    If None, returns all filings.
        limit: Max filings to return

    Returns:
        List of filing dicts with keys: accession_number, form_type,
        filing_date, filing_url, index_url, description, dedupe_hash
    """
    if not submissions:
        return []

    recent = submissions.get("filings", {}).get("recent", {})
    if not recent:
        return []

    accession_numbers = recent.get("accessionNumber", [])
    forms = recent.get("form", [])
    filing_dates = recent.get("filingDate", [])
    primary_documents = recent.get("primaryDocument", [])
    descriptions = recent.get("primaryDocDescription", [])

    cik = str(submissions.get("cik", "")).zfill(10)

    results = []
    for i in range(len(accession_numbers)):
        form_type = forms[i] if i < len(forms) else ""

        # Filter by form type if specified
        if form_types and form_type not in form_types:
            continue

        accession = accession_numbers[i]
        accession_nodash = accession.replace("-", "")
        primary_doc = primary_documents[i] if i < len(primary_documents) else ""
        filing_date = filing_dates[i] if i < len(filing_dates) else None
        description = descriptions[i] if i < len(descriptions) else None

        filing_url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/{primary_doc}"
            if primary_doc else None
        )
        index_url = (
            f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_nodash}/"
        )

        results.append({
            "accession_number": accession,
            "form_type": form_type,
            "filing_date": filing_date,
            "filing_url": filing_url,
            "index_url": index_url,
            "description": description,
            "dedupe_hash": _compute_hash(accession),
        })

        if len(results) >= limit:
            break

    logger.info(
        "SEC EDGAR CIK %s: %d filings extracted (filter: %s)",
        cik, len(results), form_types or "all",
    )
    return results
