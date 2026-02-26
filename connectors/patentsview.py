"""
USPTO PatentsView Connector — Patent Grants (v1 API)

Track patent portfolios for Big Tech companies.
Query by assignees_at_grant.assignee_organization for granted patents.

API docs: https://search.patentsview.org/docs/
Rate limit: 45 req/min per API key
Auth: API key required (X-Api-Key header). Set PATENTSVIEW_API_KEY env var.
      Request a free key: https://patentsview-support.atlassian.net/servicedesk/customer/portal/1
"""

import hashlib
import os
import time
import requests
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from utils.logging import get_logger

logger = get_logger(__name__)

PATENTSVIEW_BASE = "https://search.patentsview.org/api/v1/patent/"
API_KEY = os.environ.get("PATENTSVIEW_API_KEY", "")

POLITE_DELAY = 1.5  # ~40 req/min stays under 45 limit


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def fetch_patents(
    assignee_name: str,
    date_from: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Fetch granted patents for a company from PatentsView v1 API.

    Args:
        assignee_name: Assignee organization name (e.g. 'Apple Inc.')
        date_from: Start date YYYY-MM-DD (defaults to 3 years ago)
        limit: Max results to return

    Returns:
        List of patent dicts with keys: patent_number, patent_title,
        patent_date, patent_abstract, num_claims, cpc_codes, dedupe_hash
    """
    if not API_KEY:
        logger.warning("PATENTSVIEW_API_KEY not set — skipping patent fetch for '%s'", assignee_name)
        return []

    if not date_from:
        date_from = (datetime.now() - timedelta(days=3 * 365)).strftime("%Y-%m-%d")

    payload = {
        "q": {
            "_and": [
                {"_contains": {"assignees_at_grant.assignee_organization": assignee_name}},
                {"_gte": {"patent_date": date_from}},
            ]
        },
        "f": [
            "patent_id",
            "patent_title",
            "patent_date",
            "patent_abstract",
            "patent_num_claims",
            "cpc_at_issue.cpc_group",
        ],
        "o": {
            "size": min(limit, 1000),
        },
        "s": [{"patent_date": "desc"}],
    }

    headers = {
        "X-Api-Key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.post(
            PATENTSVIEW_BASE,
            json=payload,
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("PatentsView fetch failed for '%s': %s", assignee_name, e)
        return []

    patents_raw = data.get("patents") or []
    results = []

    for p in patents_raw:
        patent_id = p.get("patent_id", "")

        # Extract CPC codes from nested structure
        cpc_list = []
        for cpc in (p.get("cpc_at_issue") or []):
            cpc_group = cpc.get("cpc_group")
            if cpc_group:
                cpc_list.append(cpc_group)
        cpc_codes = ", ".join(sorted(set(cpc_list))) if cpc_list else None

        results.append({
            "patent_number": patent_id,
            "patent_title": p.get("patent_title"),
            "patent_date": p.get("patent_date"),
            "patent_abstract": p.get("patent_abstract"),
            "num_claims": p.get("patent_num_claims"),
            "cpc_codes": cpc_codes,
            "dedupe_hash": _compute_hash(patent_id),
        })

    logger.info(
        "PatentsView '%s': %d patents (from %s)",
        assignee_name, len(results), date_from,
    )
    return results
