"""
FDIC BankFind Suite Connector — Quarterly Financials

Fetch quarterly financial data for FDIC-insured institutions.
Query by CERT number for total assets, deposits, net income, capital ratios, etc.

API docs: https://banks.data.fdic.gov/docs/
Rate limit: None documented (be polite)
Auth: None required (free public API)
"""

import hashlib
import time
import requests
from typing import List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

FDIC_BASE = "https://banks.data.fdic.gov/api/financials"

POLITE_DELAY = 0.5


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _safe_float(val) -> float | None:
    """Safely convert a value to float, returning None if not possible."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def fetch_quarterly_financials(
    cert_number: int | str,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """
    Fetch quarterly financial data for an FDIC-insured institution.

    Args:
        cert_number: FDIC certificate number (e.g. 7213 for JPMorgan Chase)
        limit: Max quarterly records to return

    Returns:
        List of financial dicts with keys: report_date, total_assets,
        total_deposits, net_income, net_loans, roa, roe,
        tier1_capital_ratio, efficiency_ratio, noncurrent_loan_ratio,
        net_charge_off_ratio, dedupe_hash
    """
    params = {
        "filters": f"CERT:{cert_number}",
        "limit": limit,
        "sort_by": "REPDTE",
        "sort_order": "DESC",
        "fields": ",".join([
            "REPDTE",       # Report date (YYYYMMDD)
            "ASSET",        # Total assets ($thousands)
            "DEP",          # Total deposits ($thousands)
            "NETINC",       # Net income ($thousands)
            "LNLSNET",     # Net loans and leases ($thousands)
            "ROA",          # Return on assets (%)
            "ROE",          # Return on equity (%)
            "T1RJCA",       # Tier 1 risk-based capital ratio (%)
            "EFFR",         # Efficiency ratio (%)
            "NCLNLS",       # Noncurrent loans to loans ratio (%)
            "NTLNLS",       # Net charge-offs to loans ratio (%)
            "EQTOT",        # Total equity capital ($thousands)
        ]),
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(FDIC_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("FDIC BankFind fetch failed for cert %s: %s", cert_number, e)
        return []

    records_raw = data.get("data", [])
    results = []

    for entry in records_raw:
        row = entry.get("data", {})
        report_date = row.get("REPDTE")

        results.append({
            "report_date": report_date,
            "total_assets": _safe_float(row.get("ASSET")),
            "total_deposits": _safe_float(row.get("DEP")),
            "net_income": _safe_float(row.get("NETINC")),
            "net_loans": _safe_float(row.get("LNLSNET")),
            "roa": _safe_float(row.get("ROA")),
            "roe": _safe_float(row.get("ROE")),
            "tier1_capital_ratio": _safe_float(row.get("T1RJCA")),
            "efficiency_ratio": _safe_float(row.get("EFFR")),
            "noncurrent_loan_ratio": _safe_float(row.get("NCLNLS")),
            "net_charge_off_ratio": _safe_float(row.get("NTLNLS")),
            "equity_capital": _safe_float(row.get("EQTOT")),
            "dedupe_hash": _compute_hash(str(cert_number), str(report_date)),
        })

    logger.info(
        "FDIC BankFind cert %s: %d quarterly records",
        cert_number, len(results),
    )
    return results
