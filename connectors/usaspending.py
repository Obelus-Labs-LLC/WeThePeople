"""
USASpending.gov Connector — Federal Government Contracts

Fetch federal contract awards for tracked companies.

API docs: https://api.usaspending.gov/
Rate limit: None documented (be polite — 1s between calls)
Auth: None required (free public API)
"""

import hashlib
import time
import requests
from typing import Optional, List, Dict, Any
from datetime import datetime

from utils.logging import get_logger

logger = get_logger(__name__)

USASPENDING_BASE = "https://api.usaspending.gov/api/v2"

POLITE_DELAY = 1.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _safe_float(val) -> float | None:
    """Safely convert a value to float."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _parse_date(val) -> Optional[str]:
    """Parse USASpending date strings (YYYY-MM-DD). Returns string or None."""
    if val is None:
        return None
    s = str(val).strip()[:10]
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except (ValueError, TypeError):
        return None


def fetch_contracts(
    recipient_name: str,
    limit: int = 50,
    fiscal_year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch federal contract awards for a recipient from USASpending.gov.

    Args:
        recipient_name: Recipient organization name (e.g. 'APPLE INC.')
        limit: Max contracts to return
        fiscal_year: Optional fiscal year filter

    Returns:
        List of contract dicts with keys: award_id, award_amount,
        awarding_agency, description, start_date, end_date,
        contract_type, dedupe_hash
    """
    # USASpending uses a POST-based search endpoint
    payload = {
        "filters": {
            "recipient_search_text": [recipient_name],
            "award_type_codes": ["A", "B", "C", "D"],  # Contracts only
        },
        "fields": [
            "Award ID",
            "Award Amount",
            "Awarding Agency",
            "Description",
            "Start Date",
            "End Date",
            "Award Type",
            "Recipient Name",
        ],
        "limit": limit,
        "page": 1,
        "sort": "Award Amount",
        "order": "desc",
    }

    if fiscal_year:
        payload["filters"]["time_period"] = [
            {"start_date": f"{fiscal_year - 1}-10-01", "end_date": f"{fiscal_year}-09-30"}
        ]

    url = f"{USASPENDING_BASE}/search/spending_by_award/"

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("USASpending fetch failed for '%s': %s", recipient_name, e)
        return []

    results_raw = data.get("results", [])
    results = []

    for award in results_raw:
        award_id = award.get("Award ID", "")
        award_amount = _safe_float(award.get("Award Amount"))
        awarding_agency = award.get("Awarding Agency")
        description = (award.get("Description") or "")[:500]
        start_date = _parse_date(award.get("Start Date"))
        end_date = _parse_date(award.get("End Date"))
        contract_type = award.get("Award Type")

        results.append({
            "award_id": award_id,
            "award_amount": award_amount,
            "awarding_agency": awarding_agency,
            "description": description,
            "start_date": start_date,
            "end_date": end_date,
            "contract_type": contract_type,
            "dedupe_hash": _compute_hash(award_id or description[:50]),
        })

    logger.info(
        "USASpending '%s': %d contracts",
        recipient_name, len(results),
    )
    return results
