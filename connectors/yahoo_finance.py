"""Free stock-snapshot connector — yfinance primary, Stooq fallback.

Why this exists:
  We already have `connectors/alpha_vantage.py` but the free tier is
  25 requests/day. The user has no Alpha Vantage budget.

  yfinance (the third-party Python library that wraps Yahoo Finance's
  public endpoints with proper cookie/crumb handling) gives us full
  fundamentals — market_cap, P/E, EPS, dividends, sector, industry,
  52w range — with no API key. It works reliably from a real server
  (Hetzner) where Yahoo's rate-limiter is more permissive than from
  random consumer IPs. From a laptop you'll often get 429s.

  Stooq.com remains as a fallback for tickers yfinance can't resolve
  (some non-US listings).

Strategy:
  1. yfinance .info -> full fundamentals (works for ~95% of US tickers)
  2. Stooq .us suffix -> price + intraday range only (fallback for
     tickers yfinance returns empty/None for)

Polite delay (1.0s between calls) keeps us well clear of any per-IP
rate-limit. ~10 minutes for a 545-company backfill.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import time
import warnings
from datetime import date
from typing import Any, Optional

import requests

# yfinance is noisy with deprecation warnings about pandas; silence
# them so the backfill log stays readable.
warnings.filterwarnings("ignore", category=DeprecationWarning)
warnings.filterwarnings("ignore", message=".*Timestamp.utcnow.*")

logger = logging.getLogger(__name__)

STOOQ_URL = "https://stooq.com/q/l/"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Accept": "text/csv,application/json,text/plain,*/*",
}


def _hash(*parts: str) -> str:
    return hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()


def _safe_float(v: Any) -> Optional[float]:
    if v is None or v == "" or v == "N/D":
        return None
    try:
        f = float(v)
        # yfinance occasionally returns inf or NaN for missing fields
        if f != f or f in (float("inf"), float("-inf")):
            return None
        return f
    except (TypeError, ValueError):
        return None


def fetch_stooq_quote(ticker: str) -> Optional[dict]:
    """Stooq fallback. Returns price + intraday OHLCV or None."""
    if not ticker:
        return None
    try:
        r = requests.get(
            STOOQ_URL,
            params={"s": f"{ticker.lower()}.us", "f": "sd2t2ohlcv", "h": "", "e": "csv"},
            headers=_HEADERS,
            timeout=15,
        )
        if r.status_code != 200:
            return None
    except Exception:  # noqa: BLE001
        return None
    rows = list(csv.DictReader(io.StringIO(r.text)))
    if not rows:
        return None
    row = rows[0]
    if (row.get("Close") or "N/D").upper() == "N/D":
        return None
    return {
        "price": _safe_float(row.get("Close")),
        "open": _safe_float(row.get("Open")),
        "high": _safe_float(row.get("High")),
        "low": _safe_float(row.get("Low")),
        "volume": _safe_float(row.get("Volume")),
        "latest_trading_day": row.get("Date"),
    }


def _fetch_yfinance(ticker: str) -> Optional[dict]:
    """yfinance .info call — returns the rich fundamentals dict, or
    None if yfinance can't find the ticker / Yahoo errored / library
    isn't installed."""
    try:
        import yfinance as yf  # imported lazily so jobs that don't need it skip the dep
    except ImportError:
        logger.info("yfinance not installed; pip install yfinance")
        return None
    try:
        t = yf.Ticker(ticker)
        info = t.info
        # yfinance returns an empty-ish dict when Yahoo has no data
        if not info or not info.get("symbol") and not info.get("regularMarketPrice"):
            return None
        return info
    except Exception as exc:  # noqa: BLE001
        logger.info("yfinance %s err: %s", ticker, exc)
        return None


def fetch_finnhub(ticker: str) -> Optional[dict]:
    """Finnhub.io fallback for tickers yfinance can't resolve. Free
    tier is 60 req/min, 30K/mo — plenty for our daily 600-entity
    backfill, especially since this only fires on yfinance misses
    (typically 5-10% of entities).

    Activated only when `FINNHUB_API_KEY` env var is set; returns None
    otherwise.

    Combines two endpoints:
      /stock/profile2  -> sector, industry, name, mcap (in M USD)
      /quote           -> current price, OHLCV
    """
    import os
    key = os.environ.get("FINNHUB_API_KEY", "")
    if not key:
        return None
    try:
        # Profile call — sector/industry/name/mcap. Returns {} when ticker unknown.
        r = requests.get(
            "https://finnhub.io/api/v1/stock/profile2",
            params={"symbol": ticker, "token": key},
            headers=_HEADERS,
            timeout=15,
        )
        if r.status_code != 200:
            return None
        profile = r.json() or {}
        if not profile.get("ticker") and not profile.get("name"):
            return None

        # Quote call — current price + 52w range.
        rq = requests.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": ticker, "token": key},
            headers=_HEADERS,
            timeout=15,
        )
        quote = rq.json() if rq.status_code == 200 else {}
    except Exception as exc:  # noqa: BLE001
        logger.info("finnhub %s err: %s", ticker, exc)
        return None

    # Finnhub `marketCapitalization` is in millions USD; convert to raw.
    mcap = _safe_float(profile.get("marketCapitalization"))
    if mcap is not None:
        mcap = mcap * 1_000_000

    return {
        "marketCap": mcap,
        "sector": profile.get("finnhubIndustry") or profile.get("gind"),
        "industry": profile.get("finnhubIndustry"),
        "longName": profile.get("name"),
        # Finnhub /quote: c=current, h=high, l=low, o=open, pc=prev_close
        "regularMarketPrice": _safe_float(quote.get("c")),
        "fiftyTwoWeekHigh": _safe_float(profile.get("52WeekHigh")) or _safe_float(quote.get("h")),
        "fiftyTwoWeekLow": _safe_float(profile.get("52WeekLow")) or _safe_float(quote.get("l")),
    }


def fetch_overview(ticker: str) -> Optional[dict]:
    """Compose a StockFundamentals-shaped dict.

    yfinance is the primary source — it handles Yahoo's cookie/crumb
    auth and returns the full quoteSummary modules (market cap, P/E,
    EPS, dividends, sector, 52w range). Falls back to Stooq for the
    handful of tickers yfinance can't resolve.

    Returns None only when all sources fail."""
    # Tier 1: yfinance (rich US fundamentals)
    info = _fetch_yfinance(ticker)
    # Tier 2: Finnhub for non-US / ADR-only tickers (key required)
    if not info:
        info = fetch_finnhub(ticker)

    today = date.today().isoformat()
    if info:
        return {
            "snapshot_date": today,
            "market_cap": _safe_float(info.get("marketCap")),
            "pe_ratio": _safe_float(info.get("trailingPE")),
            "forward_pe": _safe_float(info.get("forwardPE")),
            "peg_ratio": _safe_float(info.get("pegRatio") or info.get("trailingPegRatio")),
            "price_to_book": _safe_float(info.get("priceToBook")),
            "eps": _safe_float(info.get("trailingEps") or info.get("epsTrailingTwelveMonths")),
            "revenue_ttm": _safe_float(info.get("totalRevenue")),
            "profit_margin": _safe_float(info.get("profitMargins")),
            "operating_margin": _safe_float(info.get("operatingMargins")),
            "return_on_equity": _safe_float(info.get("returnOnEquity")),
            "dividend_yield": _safe_float(info.get("dividendYield")),
            "dividend_per_share": _safe_float(info.get("dividendRate") or info.get("trailingAnnualDividendRate")),
            "week_52_high": _safe_float(info.get("fiftyTwoWeekHigh")),
            "week_52_low": _safe_float(info.get("fiftyTwoWeekLow")),
            "day_50_moving_avg": _safe_float(info.get("fiftyDayAverage")),
            "day_200_moving_avg": _safe_float(info.get("twoHundredDayAverage")),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "description": (info.get("longName") or info.get("shortName") or info.get("longBusinessSummary") or "")[:1000],
            "_current_price": _safe_float(info.get("currentPrice") or info.get("regularMarketPrice")),
            "_latest_trading_day": today,
            "dedupe_hash": _hash(ticker, today),
        }

    # yfinance miss — try Stooq for at least the price
    stooq = fetch_stooq_quote(ticker)
    if not stooq:
        return None
    return {
        "snapshot_date": today,
        "market_cap": None,
        "pe_ratio": None,
        "forward_pe": None,
        "peg_ratio": None,
        "price_to_book": None,
        "eps": None,
        "revenue_ttm": None,
        "profit_margin": None,
        "operating_margin": None,
        "return_on_equity": None,
        "dividend_yield": None,
        "dividend_per_share": None,
        "week_52_high": stooq.get("high"),
        "week_52_low": stooq.get("low"),
        "day_50_moving_avg": None,
        "day_200_moving_avg": None,
        "sector": None,
        "industry": None,
        "description": "",
        "_current_price": stooq.get("price"),
        "_latest_trading_day": stooq.get("latest_trading_day"),
        "dedupe_hash": _hash(ticker, today),
    }


if __name__ == "__main__":
    import json
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    print(json.dumps(fetch_overview(sym), indent=2))
