"""
FRED (Federal Reserve Economic Data) Connector

Fetch economic data series from the St. Louis Fed FRED API.
Useful for macro indicators: interest rates, inflation, unemployment, GDP, etc.

API docs: https://fred.stlouisfed.org/docs/api/fred/
Rate limit: 120 requests/min
Auth: API key required — set FRED_API_KEY env var
      Request a free key: https://fred.stlouisfed.org/docs/api/api_key.html
"""

import hashlib
import os
import time
import requests
from typing import Optional, List, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

FRED_BASE = "https://api.stlouisfed.org/fred"
API_KEY = os.environ.get("FRED_API_KEY", "")

POLITE_DELAY = 0.5

# Key economic series tracked by WeThePeople
TRACKED_SERIES = {
    "FEDFUNDS": "Federal Funds Effective Rate",
    "CPIAUCSL": "Consumer Price Index (All Urban Consumers)",
    "UNRATE": "Unemployment Rate",
    "GDP": "Gross Domestic Product",
    "DGS10": "10-Year Treasury Constant Maturity Rate",
    "DGS2": "2-Year Treasury Constant Maturity Rate",
    "T10Y2Y": "10-Year Treasury Minus 2-Year Treasury (Yield Curve)",
    "MORTGAGE30US": "30-Year Fixed Rate Mortgage Average",
    "M2SL": "M2 Money Stock",
    "WALCL": "Federal Reserve Total Assets",
    "DEXUSEU": "US Dollar / Euro Exchange Rate",
    "VIXCLS": "CBOE Volatility Index (VIX)",
}


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def fetch_series_observations(
    series_id: str,
    limit: int = 100000,
    sort_order: str = "desc",
) -> List[Dict[str, Any]]:
    """
    Fetch recent observations for a FRED data series.

    Args:
        series_id: FRED series ID (e.g. 'FEDFUNDS', 'UNRATE')
        limit: Max observations to return
        sort_order: 'desc' (newest first) or 'asc' (oldest first)

    Returns:
        List of observation dicts with keys: series_id, series_title,
        observation_date, value, units, dedupe_hash.
        Returns empty list on error or if API key is missing.
    """
    if not API_KEY:
        logger.warning("FRED_API_KEY not set — skipping series '%s'", series_id)
        return []

    # First get series metadata for title and units
    series_title = TRACKED_SERIES.get(series_id, series_id)
    units = None

    try:
        time.sleep(POLITE_DELAY)
        meta_resp = requests.get(
            f"{FRED_BASE}/series",
            params={
                "series_id": series_id,
                "api_key": API_KEY,
                "file_type": "json",
            },
            timeout=15,
        )
        if meta_resp.ok:
            meta = meta_resp.json()
            serieses = meta.get("seriess", [])
            if serieses:
                series_title = serieses[0].get("title", series_title)
                units = serieses[0].get("units")
    except Exception:
        pass  # Metadata is optional; continue with observations

    # Fetch observations
    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
        "limit": limit,
        "sort_order": sort_order,
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(
            f"{FRED_BASE}/series/observations",
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("FRED fetch failed for series '%s': %s", series_id, e)
        return []

    observations_raw = data.get("observations", [])
    results = []

    for obs in observations_raw:
        obs_date = obs.get("date")
        obs_value = obs.get("value")

        # FRED uses '.' for missing values
        if obs_value == ".":
            continue

        try:
            value_float = float(obs_value)
        except (ValueError, TypeError):
            continue

        results.append({
            "series_id": series_id,
            "series_title": series_title,
            "observation_date": obs_date,
            "value": value_float,
            "units": units,
            "dedupe_hash": _compute_hash(series_id, str(obs_date)),
        })

    logger.info(
        "FRED series '%s': %d observations",
        series_id, len(results),
    )
    return results


def fetch_series_info(series_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch metadata for a FRED series.

    Args:
        series_id: FRED series ID

    Returns:
        Dict with series metadata (title, units, frequency, etc.),
        or None on error.
    """
    if not API_KEY:
        logger.warning("FRED_API_KEY not set — skipping series info for '%s'", series_id)
        return None

    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(f"{FRED_BASE}/series", params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("FRED series info failed for '%s': %s", series_id, e)
        return None

    serieses = data.get("seriess", [])
    if not serieses:
        return None

    return serieses[0]
