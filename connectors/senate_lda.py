"""
Senate LDA Lobbying Disclosure Connector

Track corporate lobbying expenditures via the Senate Lobbying Disclosure Act API.
Query by client_name for quarterly filing data.

API docs: https://lda.senate.gov/api/redoc/v1/
Rate limit: Undocumented (throttled for anonymous access)
Auth: None required (optional API key for higher limits)
"""

import hashlib
import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

LDA_BASE = "https://lda.gov/api/v1/filings/"

POLITE_DELAY = 1.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _safe_float(val) -> float:
    """Safely convert a value to float."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def fetch_lobbying_filings(
    client_name: str,
    filing_year: Optional[int] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Fetch lobbying disclosure filings for a company from Senate LDA.

    Args:
        client_name: Client organization name (e.g. 'APPLE, INC.')
        filing_year: Year to query (defaults to current and prior year)
        limit: Max results per page

    Returns:
        List of filing dicts with keys: filing_uuid, filing_year, filing_period,
        income, registrant_name, client_name, lobbying_issues, government_entities,
        dedupe_hash
    """
    from datetime import datetime

    years = [filing_year] if filing_year else [datetime.now().year, datetime.now().year - 1]

    all_results = []

    for year in years:
        params = {
            "client_name": client_name,
            "filing_year": year,
            "page_size": min(limit, 25),
        }

        try:
            time.sleep(POLITE_DELAY)
            resp = requests.get(
                LDA_BASE,
                params=params,
                headers={"Accept": "application/json"},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error("Senate LDA fetch failed for '%s' (%d): %s", client_name, year, e)
            continue

        filings_raw = data.get("results") or []

        for f in filings_raw:
            filing_uuid = f.get("filing_uuid", "")
            client = f.get("client") or {}
            registrant = f.get("registrant") or {}

            # Extract lobbying issues and government entities
            issues = []
            gov_entities = set()
            for activity in (f.get("lobbying_activities") or []):
                issue_code = activity.get("general_issue_code_display")
                if issue_code:
                    issues.append(issue_code)
                for entity in (activity.get("government_entities") or []):
                    name = entity.get("name") if isinstance(entity, dict) else str(entity)
                    if name:
                        gov_entities.add(name)

            all_results.append({
                "filing_uuid": filing_uuid,
                "filing_year": year,
                "filing_period": f.get("filing_period_display", f.get("filing_type_display", "")),
                "income": _safe_float(f.get("income")),
                "expenses": _safe_float(f.get("expenses")),
                "registrant_name": registrant.get("name", ""),
                "client_name": client.get("name", ""),
                "lobbying_issues": ", ".join(sorted(set(issues))) if issues else None,
                "government_entities": ", ".join(sorted(gov_entities)) if gov_entities else None,
                "dedupe_hash": _compute_hash(filing_uuid),
            })

    logger.info(
        "Senate LDA '%s': %d filings (%s)",
        client_name, len(all_results),
        ", ".join(str(y) for y in years),
    )
    return all_results
