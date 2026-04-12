"""
Finnhub Congressional Trades Connector

Fetch congressional trading data from Finnhub.io — stock transactions
disclosed by members of the US Congress.

API docs: https://finnhub.io/docs/api/congressional-trading
Rate limit: 60 requests/minute (free tier)
Auth: API key via FINNHUB_API_KEY env var (required)
"""

import os
import time
import requests
from typing import Optional, List, Dict, Any

from connectors._base import with_circuit_breaker
from utils.logging import get_logger

logger = get_logger(__name__)

FINNHUB_BASE = "https://finnhub.io/api/v1"
API_KEY = os.getenv("FINNHUB_API_KEY")

POLITE_DELAY = 0.5  # 60 req/min free tier → ~0.5s between requests


def _check_api_key():
    """Raise if FINNHUB_API_KEY is not configured."""
    if not API_KEY:
        raise RuntimeError(
            "FINNHUB_API_KEY environment variable is required. "
            "Get a free key at https://finnhub.io/"
        )


@with_circuit_breaker("finnhub", failure_threshold=3, recovery_timeout=120.0)
def fetch_congressional_trades(
    symbol: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch congressional trading data for a specific stock symbol.

    Args:
        symbol: Stock ticker (e.g. 'AAPL'). Required for this endpoint.
        from_date: Start date in YYYY-MM-DD format
        to_date: End date in YYYY-MM-DD format

    Returns:
        List of trade dicts from Finnhub's congressional-trading endpoint.
    """
    _check_api_key()
    time.sleep(POLITE_DELAY)

    params: Dict[str, Any] = {"token": API_KEY}
    if symbol:
        params["symbol"] = symbol.upper()
    if from_date:
        params["from"] = from_date
    if to_date:
        params["to"] = to_date

    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/stock/congressional-trading",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        logger.error("Finnhub congressional trades request timed out (symbol=%s)", symbol)
        raise
    except requests.exceptions.HTTPError as e:
        # Mask token from error URL to prevent API key leakage in logs
        safe_msg = str(e).replace(API_KEY, "***") if API_KEY else str(e)
        logger.error("Finnhub HTTP error (symbol=%s): %s", symbol, safe_msg)
        raise
    except Exception as e:
        safe_msg = str(e).replace(API_KEY, "***") if API_KEY else str(e)
        logger.error("Finnhub request failed (symbol=%s): %s", symbol, safe_msg)
        raise

    # Finnhub returns {"data": [...]} for this endpoint
    trades = data.get("data", [])
    logger.info(
        "Finnhub congressional trades: %d results (symbol=%s, from=%s, to=%s)",
        len(trades), symbol, from_date, to_date,
    )
    return trades


@with_circuit_breaker("finnhub", failure_threshold=3, recovery_timeout=120.0)
def fetch_all_congressional_trades(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Fetch all congressional trading data (no symbol filter).

    Args:
        from_date: Start date in YYYY-MM-DD format
        to_date: End date in YYYY-MM-DD format

    Returns:
        List of trade dicts from Finnhub's congressional-trading endpoint.
    """
    _check_api_key()
    time.sleep(POLITE_DELAY)

    params: Dict[str, Any] = {"token": API_KEY}
    if from_date:
        params["from"] = from_date
    if to_date:
        params["to"] = to_date

    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/stock/congressional-trading",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.Timeout:
        logger.error("Finnhub all congressional trades request timed out")
        raise
    except requests.exceptions.HTTPError as e:
        logger.error("Finnhub HTTP error (all trades): %s", e)
        raise
    except Exception as e:
        logger.error("Finnhub request failed (all trades): %s", e)
        raise

    trades = data.get("data", [])
    logger.info(
        "Finnhub all congressional trades: %d results (from=%s, to=%s)",
        len(trades), from_date, to_date,
    )
    return trades
