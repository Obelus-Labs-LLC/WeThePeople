"""
Alpha Vantage Connector — Stock Fundamentals & Quotes

Fetch company overviews (fundamentals) and stock quotes.

API docs: https://www.alphavantage.co/documentation/
Rate limit: 25 requests/day on free tier (premium tiers available)
Auth: API key required — set ALPHA_VANTAGE_KEY env var
"""

import hashlib
import os
import time
import requests
from datetime import date
from typing import Optional, Dict, Any

from utils.logging import get_logger

logger = get_logger(__name__)

AV_BASE = "https://www.alphavantage.co/query"
API_KEY = os.environ.get("ALPHA_VANTAGE_KEY", "")

# Free tier: 25 req/day — be conservative
POLITE_DELAY = 2.0


def _compute_hash(*parts: str) -> str:
    """MD5 hash for deduplication."""
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _safe_float(val) -> float | None:
    """Safely convert Alpha Vantage values to float. Returns None for 'None' strings."""
    if val is None or val == "None" or val == "-":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def fetch_company_overview(ticker: str) -> Optional[Dict[str, Any]]:
    """
    Fetch company fundamentals/overview from Alpha Vantage.

    Args:
        ticker: Stock ticker symbol (e.g. 'AAPL', 'JPM')

    Returns:
        Dict with keys: snapshot_date, market_cap, pe_ratio, forward_pe,
        peg_ratio, price_to_book, eps, revenue_ttm, profit_margin,
        operating_margin, return_on_equity, dividend_yield,
        dividend_per_share, week_52_high, week_52_low, day_50_moving_avg,
        day_200_moving_avg, sector, industry, description, dedupe_hash.
        Returns None on error or if API key is missing.
    """
    if not API_KEY:
        logger.warning("ALPHA_VANTAGE_KEY not set — skipping overview for '%s'", ticker)
        return None

    params = {
        "function": "OVERVIEW",
        "symbol": ticker,
        "apikey": API_KEY,
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(AV_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("Alpha Vantage overview failed for '%s': %s", ticker, e)
        return None

    # Alpha Vantage returns an empty-ish dict or error message on rate limit
    if not data or "Symbol" not in data:
        note = data.get("Note") or data.get("Information") or "empty response"
        logger.warning("Alpha Vantage overview for '%s': %s", ticker, note)
        return None

    today = date.today().isoformat()
    result = {
        "snapshot_date": today,
        "market_cap": _safe_float(data.get("MarketCapitalization")),
        "pe_ratio": _safe_float(data.get("PERatio")),
        "forward_pe": _safe_float(data.get("ForwardPE")),
        "peg_ratio": _safe_float(data.get("PEGRatio")),
        "price_to_book": _safe_float(data.get("PriceToBookRatio")),
        "eps": _safe_float(data.get("EPS")),
        "revenue_ttm": _safe_float(data.get("RevenueTTM")),
        "profit_margin": _safe_float(data.get("ProfitMargin")),
        "operating_margin": _safe_float(data.get("OperatingMarginTTM")),
        "return_on_equity": _safe_float(data.get("ReturnOnEquityTTM")),
        "dividend_yield": _safe_float(data.get("DividendYield")),
        "dividend_per_share": _safe_float(data.get("DividendPerShare")),
        "week_52_high": _safe_float(data.get("52WeekHigh")),
        "week_52_low": _safe_float(data.get("52WeekLow")),
        "day_50_moving_avg": _safe_float(data.get("50DayMovingAverage")),
        "day_200_moving_avg": _safe_float(data.get("200DayMovingAverage")),
        "sector": data.get("Sector"),
        "industry": data.get("Industry"),
        "description": (data.get("Description") or "")[:1000],
        "dedupe_hash": _compute_hash(ticker, today),
    }

    logger.info("Alpha Vantage overview for '%s': OK", ticker)
    return result


def fetch_stock_quote(ticker: str) -> Optional[Dict[str, Any]]:
    """
    Fetch the latest stock quote from Alpha Vantage.

    Args:
        ticker: Stock ticker symbol (e.g. 'AAPL')

    Returns:
        Dict with keys: symbol, price, open, high, low, volume,
        previous_close, change, change_percent, latest_trading_day.
        Returns None on error or if API key is missing.
    """
    if not API_KEY:
        logger.warning("ALPHA_VANTAGE_KEY not set — skipping quote for '%s'", ticker)
        return None

    params = {
        "function": "GLOBAL_QUOTE",
        "symbol": ticker,
        "apikey": API_KEY,
    }

    try:
        time.sleep(POLITE_DELAY)
        resp = requests.get(AV_BASE, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error("Alpha Vantage quote failed for '%s': %s", ticker, e)
        return None

    quote = data.get("Global Quote", {})
    if not quote:
        note = data.get("Note") or data.get("Information") or "empty response"
        logger.warning("Alpha Vantage quote for '%s': %s", ticker, note)
        return None

    result = {
        "symbol": quote.get("01. symbol"),
        "price": _safe_float(quote.get("05. price")),
        "open": _safe_float(quote.get("02. open")),
        "high": _safe_float(quote.get("03. high")),
        "low": _safe_float(quote.get("04. low")),
        "volume": _safe_float(quote.get("06. volume")),
        "previous_close": _safe_float(quote.get("08. previous close")),
        "change": _safe_float(quote.get("09. change")),
        "change_percent": quote.get("10. change percent"),
        "latest_trading_day": quote.get("07. latest trading day"),
    }

    logger.info("Alpha Vantage quote for '%s': $%s", ticker, result.get("price"))
    return result
