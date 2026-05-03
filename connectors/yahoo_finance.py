"""Free stock-snapshot connector — Stooq primary, Yahoo opportunistic.

Why this exists:
  We already have `connectors/alpha_vantage.py` but the free tier is
  25 requests/day. With 545 tracked companies that's a 22-day backfill.

  Stooq.com publishes a free, unauthenticated CSV quote endpoint
  (no key, no daily quota, just rate-limit by politeness) that
  returns the current OHLCV. That's enough to populate
  `latest_stock.price` on every company's sidebar. Fundamentals
  (market_cap, pe_ratio, eps, dividends, sector) need a paid source —
  we leave those nullable and let the existing Alpha Vantage flow
  fill them in when the budget allows.

  We also try Yahoo's v7/quote endpoint as best-effort enrichment.
  Yahoo aggressively rate-limits unauthenticated traffic now, so
  treat it as bonus — not a dependency.

  The module is named `yahoo_finance` for backward compat with the
  earliest draft; the bulk of the work is Stooq.

Endpoints used:
  - Stooq:  https://stooq.com/q/l/?s={ticker}.us&f=sd2t2ohlcv&h&e=csv
  - Yahoo:  https://query1.finance.yahoo.com/v7/finance/quote?symbols=...
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import time
from datetime import date, datetime
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)

STOOQ_URL = "https://stooq.com/q/l/"
YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"

# Real-browser UA. Yahoo's WAF rejects python-default UA strings;
# Stooq doesn't care, but we send the same header for consistency.
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
        return float(v)
    except (TypeError, ValueError):
        return None


def fetch_stooq_quote(ticker: str) -> Optional[dict]:
    """Stooq returns a single-line CSV with the latest OHLCV. Tickers
    are suffixed `.us` for US-listed equities. Returns dict with
    `price`, `open`, `high`, `low`, `volume`, `latest_trading_day`,
    or None on any failure (including N/D rows, which Stooq emits for
    delisted or unknown symbols)."""
    if not ticker:
        return None
    try:
        r = requests.get(
            STOOQ_URL,
            params={
                "s": f"{ticker.lower()}.us",
                "f": "sd2t2ohlcv",
                "h": "",
                "e": "csv",
            },
            headers=_HEADERS,
            timeout=15,
        )
        if r.status_code != 200:
            logger.info("stooq %s -> %d", ticker, r.status_code)
            return None
    except Exception as exc:  # noqa: BLE001
        logger.info("stooq %s err: %s", ticker, exc)
        return None

    reader = csv.DictReader(io.StringIO(r.text))
    rows = list(reader)
    if not rows:
        return None
    row = rows[0]
    # Stooq writes "N/D" in every column when it has nothing for the
    # symbol — most common cause is a non-US listing or a delisted
    # ticker. Treat as miss.
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


def fetch_yahoo_quote(ticker: str) -> Optional[dict]:
    """Best-effort Yahoo quote for fundamentals. Returns the raw row
    or None when Yahoo rate-limits us (frequent now) or the ticker
    isn't found."""
    if not ticker:
        return None
    try:
        r = requests.get(
            YAHOO_QUOTE_URL,
            params={"symbols": ticker},
            headers=_HEADERS,
            timeout=15,
        )
        if r.status_code != 200:
            return None
        rows = r.json().get("quoteResponse", {}).get("result") or []
        return rows[0] if rows else None
    except Exception:  # noqa: BLE001
        return None


def fetch_overview(ticker: str) -> Optional[dict]:
    """Compose a StockFundamentals-shaped dict.

    Strategy:
      1. Stooq for current price + recent OHLCV (always works).
      2. Yahoo opportunistic — if it returns, fill in market cap,
         P/E, EPS, dividends, sector, 52w range. If Yahoo 429s, we
         still return the row from Stooq with those fields null.

    Returns None only when Stooq has nothing — meaning the ticker is
    delisted/unlisted or fundamentally wrong. Callers can use that
    signal to flag a bad ticker on the entity record."""
    stooq = fetch_stooq_quote(ticker)
    if not stooq:
        return None

    # Tail-delay between provider calls so we don't burst.
    time.sleep(0.5)
    yq = fetch_yahoo_quote(ticker) or {}

    today = date.today().isoformat()
    return {
        "snapshot_date": today,
        "market_cap": _safe_float(yq.get("marketCap")),
        "pe_ratio": _safe_float(yq.get("trailingPE")),
        "forward_pe": _safe_float(yq.get("forwardPE")),
        "peg_ratio": None,
        "price_to_book": _safe_float(yq.get("priceToBook")),
        "eps": _safe_float(yq.get("epsTrailingTwelveMonths")),
        "revenue_ttm": None,
        "profit_margin": None,
        "operating_margin": None,
        "return_on_equity": None,
        "dividend_yield": _safe_float(yq.get("trailingAnnualDividendYield")),
        "dividend_per_share": _safe_float(yq.get("trailingAnnualDividendRate")),
        "week_52_high": _safe_float(yq.get("fiftyTwoWeekHigh")) or stooq.get("high"),
        "week_52_low": _safe_float(yq.get("fiftyTwoWeekLow")) or stooq.get("low"),
        "day_50_moving_avg": _safe_float(yq.get("fiftyDayAverage")),
        "day_200_moving_avg": _safe_float(yq.get("twoHundredDayAverage")),
        "sector": yq.get("sector"),
        "industry": yq.get("industry"),
        "description": (yq.get("longName") or yq.get("shortName") or "")[:1000],
        # Current price isn't on the StockFundamentals model but the
        # backfill logs it for visibility — and downstream code may
        # store it on a sibling table later.
        "_current_price": stooq.get("price"),
        "_latest_trading_day": stooq.get("latest_trading_day"),
        "dedupe_hash": _hash(ticker, today),
    }


if __name__ == "__main__":
    import json
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    print(json.dumps(fetch_overview(sym), indent=2))
