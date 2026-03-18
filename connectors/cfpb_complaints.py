"""
CFPB Consumer Complaint Database Connector

Search consumer complaints filed against financial institutions.
Query by company name for complaint records.

API docs: https://cfpb.github.io/api/ccdb/
Rate limit: None documented (be polite)
Auth: None required (free public API)
"""

import hashlib
import time
import requests
from typing import Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

CFPB_BASE = "https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/"

POLITE_DELAY = 1.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def fetch_complaints(
    company_name: str,
    size: int = 100,
) -> Dict[str, Any]:
    """
    Search CFPB complaints for a financial institution.

    Args:
        company_name: Company name to search (e.g. 'JPMORGAN CHASE & CO.')
        size: Max complaints to return

    Returns:
        Dict with keys:
        - 'complaints': List of complaint dicts with keys: complaint_id,
          date_received, product, sub_product, issue, sub_issue,
          company_response, timely_response, consumer_disputed,
          complaint_narrative, state
        - 'total': Total matching complaints
    """
    params = {
        "company": company_name,
        "size": size,
        "sort": "created_date_desc",
        "no_aggs": "true",
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(CFPB_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("CFPB complaints fetch failed for '%s': %s", company_name, e)
        return {"complaints": [], "total": 0}

    hits = data.get("hits", {})
    total = hits.get("total", {})
    total_count = total.get("value", 0) if isinstance(total, dict) else total
    raw_hits = hits.get("hits", [])

    complaints = []
    for hit in raw_hits:
        source = hit.get("_source", {})
        complaint_id = source.get("complaint_id")
        if not complaint_id:
            continue

        complaints.append({
            "complaint_id": str(complaint_id),
            "date_received": source.get("date_received"),
            "product": source.get("product"),
            "sub_product": source.get("sub_product"),
            "issue": source.get("issue"),
            "sub_issue": source.get("sub_issue"),
            "company_response": source.get("company_response"),
            "timely_response": source.get("timely"),
            "consumer_disputed": source.get("consumer_disputed"),
            "complaint_narrative": source.get("complaint_what_happened"),
            "state": source.get("state"),
        })

    logger.info(
        "CFPB complaints '%s': %d fetched of %d total",
        company_name, len(complaints), total_count,
    )
    return {"complaints": complaints, "total": total_count}
