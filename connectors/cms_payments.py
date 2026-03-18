"""
CMS Open Payments Connector

Search physician payments from pharmaceutical and device companies.
Data from the Sunshine Act / Open Payments program.

API docs: https://openpaymentsdata.cms.gov/api
Rate limit: None documented (be polite)
Auth: None required (free public API)
"""

import hashlib
import time
import requests
from typing import List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

# CMS Open Payments uses a Socrata-style API
CMS_BASE = "https://openpaymentsdata.cms.gov/api/1/datastore/query"

# General Payments dataset identifier (most recent program year)
# This is the general payments dataset — covers consulting, food, travel, etc.
DATASET_ID = "6b81-24b8"

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


def _parse_payment_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a single CMS payment record into our standard format."""
    record_id = record.get("record_id", "")
    payment_date = record.get("date_of_payment")
    amount = _safe_float(record.get("total_amount_of_payment_usdollars"))
    nature = record.get("nature_of_payment_or_transfer_of_value")

    # Physician info
    first_name = record.get("covered_recipient_first_name", "")
    last_name = record.get("covered_recipient_last_name", "")
    physician_name = f"{first_name} {last_name}".strip() if (first_name or last_name) else None
    physician_specialty = record.get("covered_recipient_specialty_1")
    state = record.get("recipient_state")

    return {
        "record_id": str(record_id),
        "payment_date": payment_date,
        "amount": amount,
        "payment_nature": nature,
        "physician_name": physician_name,
        "physician_specialty": physician_specialty,
        "state": state,
        "dedupe_hash": _compute_hash(str(record_id)),
    }


def fetch_payments(
    company_name: str,
    limit: int = 5000,
) -> List[Dict[str, Any]]:
    """
    Search CMS Open Payments for payments made by a company.
    Paginates using offset until all results are fetched.

    Args:
        company_name: Submitting manufacturer name (e.g. 'Pfizer Inc.')
        limit: Max payment records to return

    Returns:
        List of payment dicts with keys: record_id, payment_date, amount,
        payment_nature, physician_name, physician_specialty, state,
        dedupe_hash
    """
    url = f"{CMS_BASE}/{DATASET_ID}"
    page_size = min(limit, 500)  # Reasonable page size
    results = []
    offset = 0

    while len(results) < limit:
        payload = {
            "conditions": [
                {
                    "resource": "t",
                    "property": "submitting_applicable_manufacturer_or_applicable_gpo_name",
                    "value": company_name,
                    "operator": "like",
                }
            ],
            "limit": page_size,
            "offset": offset,
            "sorts": [
                {
                    "property": "date_of_payment",
                    "order": "desc",
                }
            ],
        }

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
            logger.error("CMS Open Payments fetch failed for '%s': %s", company_name, e)
            if not results:
                return _fetch_payments_get(company_name, limit)
            break

        results_raw = data.get("results", [])
        if not results_raw:
            break

        for record in results_raw:
            results.append(_parse_payment_record(record))

        offset += len(results_raw)

        # Stop if we got fewer than a full page
        if len(results_raw) < page_size:
            break

    logger.info(
        "CMS Open Payments '%s': %d records",
        company_name, len(results),
    )
    return results[:limit]


def _fetch_payments_get(
    company_name: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fallback: fetch CMS Open Payments via GET-based search.
    Used if the POST-based datastore query fails.
    """
    # Alternative endpoint using direct Socrata query
    url = "https://openpaymentsdata.cms.gov/api/1/metastore/schemas/dataset/items"

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        # This just returns dataset metadata; the real data requires the POST API
        logger.warning("CMS GET fallback: only metadata available for '%s'", company_name)
        return []
    except Exception as e:
        logger.error("CMS Open Payments GET fallback failed for '%s': %s", company_name, e)
        return []
