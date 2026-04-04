"""
Treasury Fiscal Data Connector — US Treasury Fiscal Service

Fetch federal revenue, spending, and national debt data from the
Treasury's Fiscal Data API. Covers Monthly Treasury Statements,
daily debt figures, and revenue breakdowns by source.

API docs: https://fiscaldata.treasury.gov/api-documentation/
Rate limit: No published limit (use polite delays)
Auth: None required (free public API)
"""

import logging
import time
import requests
from datetime import datetime
from typing import Optional, List, Dict, Any

log = logging.getLogger(__name__)

FISCAL_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"

POLITE_DELAY = 0.5


def _fiscal_get(endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Make a GET request to the Treasury Fiscal Data API.

    Args:
        endpoint: API path after the base URL (e.g. '/v2/accounting/od/debt_to_penny')
        params: Query parameters

    Returns:
        Parsed JSON response dict, or empty dict on error
    """
    url = f"{FISCAL_BASE}{endpoint}"
    if params is None:
        params = {}
    params["format"] = "json"

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        log.error("Treasury Fiscal API failed (HTTP %s) %s: %s", status, endpoint, e)
        return {}
    except Exception as e:
        log.error("Treasury Fiscal API failed %s: %s", endpoint, e)
        return {}


def get_monthly_treasury_statement(year: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Fetch Monthly Treasury Statement data — federal revenue and outlays by month.

    Endpoint: /v1/accounting/mts/mts_table_5

    Args:
        year: Fiscal year to filter (e.g. 2024). If None, returns most recent data.

    Returns:
        List of monthly statement records with revenue/outlay figures
    """
    params: Dict[str, Any] = {
        "page[size]": 120,
        "sort": "-record_date",
    }
    if year:
        params["filter"] = f"record_fiscal_year:eq:{year}"

    data = _fiscal_get("/v1/accounting/mts/mts_table_5", params)
    results = data.get("data", [])

    log.info(
        "Treasury MTS (year=%s): %d records",
        year, len(results),
    )
    return results


def get_debt_to_penny() -> List[Dict[str, Any]]:
    """
    Fetch the current national debt (Debt to the Penny).
    Returns the most recent daily debt figures.

    Endpoint: /v2/accounting/od/debt_to_penny

    Returns:
        List of recent debt records with total public debt outstanding,
        intragovernmental holdings, and total debt
    """
    params: Dict[str, Any] = {
        "page[size]": 30,
        "sort": "-record_date",
    }

    data = _fiscal_get("/v2/accounting/od/debt_to_penny", params)
    results = data.get("data", [])

    log.info("Treasury debt to penny: %d records", len(results))
    return results


def get_revenue_by_source(year: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Fetch federal tax revenue by category/source.

    Endpoint: /v1/accounting/mts/mts_table_4

    Args:
        year: Fiscal year to filter (e.g. 2024). If None, returns most recent data.

    Returns:
        List of revenue records broken down by source category
        (individual income tax, corporate tax, excise, etc.)
    """
    params: Dict[str, Any] = {
        "page[size]": 200,
        "sort": "-record_date",
    }
    if year:
        params["filter"] = f"record_fiscal_year:eq:{year}"

    data = _fiscal_get("/v1/accounting/mts/mts_table_4", params)
    results = data.get("data", [])

    log.info(
        "Treasury revenue by source (year=%s): %d records",
        year, len(results),
    )
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    print("=== Testing Treasury Fiscal Data Connector ===\n")

    print("--- National Debt (latest) ---")
    debt = get_debt_to_penny()
    for d in debt[:3]:
        print(f"  {d.get('record_date', 'N/A')}: ${d.get('tot_pub_debt_out_amt', 'N/A')}")
    print()

    current_year = datetime.now().year
    print(f"--- Monthly Treasury Statement ({current_year}) ---")
    mts = get_monthly_treasury_statement(year=current_year)
    for m in mts[:3]:
        print(f"  {m.get('record_date', 'N/A')}: {m.get('classification_desc', 'N/A')}")
    print(f"  Total records: {len(mts)}\n")

    print(f"--- Revenue by Source ({current_year}) ---")
    rev = get_revenue_by_source(year=current_year)
    for r in rev[:5]:
        print(f"  {r.get('classification_desc', 'N/A')}: ${r.get('current_fytd_net_rcpt_amt', 'N/A')}")
    print(f"  Total records: {len(rev)}")
