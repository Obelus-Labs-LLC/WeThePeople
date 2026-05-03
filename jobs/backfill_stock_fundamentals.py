"""Populate `stock_fundamentals` for every tracked entity that has a
ticker but lacks a recent snapshot.

Why a separate script:
  Existing per-sector sync jobs (sync_health_data, sync_finance_political_data,
  …) call Alpha Vantage. The free Alpha Vantage tier is 25 req/day —
  with ~545 tracked companies that's a 22-day backfill, and we'd
  burn the whole quota every time we onboarded a new sector. Yahoo's
  public chart endpoint is unauthenticated, no daily quota, and
  returns enough for the sidebar fields the app actually displays
  (price, 52-week range, market cap, P/E).

  This script walks every entity with a ticker, fetches via Yahoo,
  and inserts a StockFundamentals row. Idempotent: skips entities
  whose latest snapshot is from today.

What it persists:
  - `stock_fundamentals` row per (entity, ticker, today)

Usage:
  python jobs/backfill_stock_fundamentals.py
  python jobs/backfill_stock_fundamentals.py --dry-run
  python jobs/backfill_stock_fundamentals.py --limit 50
  python jobs/backfill_stock_fundamentals.py --table tracked_tech_companies
"""

from __future__ import annotations

import argparse
import logging
import os
import sqlite3
import sys
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_stock_fundamentals")


# (table, id_col, entity_type-for-stock_fundamentals).
# `entity_type` is the discriminator we already use: 'institution' for
# tracked_institutions, 'company' for everything else.
TABLES = [
    ("tracked_institutions",                "institution_id", "institution"),
    ("tracked_tech_companies",              "company_id",     "company"),
    ("tracked_defense_companies",           "company_id",     "company"),
    ("tracked_energy_companies",            "company_id",     "company"),
    ("tracked_transportation_companies",    "company_id",     "company"),
    ("tracked_chemical_companies",          "company_id",     "company"),
    ("tracked_agriculture_companies",       "company_id",     "company"),
    ("tracked_education_companies",         "company_id",     "company"),
    ("tracked_telecom_companies",           "company_id",     "company"),
]


def _today_iso() -> str:
    return date.today().isoformat()


def _has_fresh_snapshot(conn, entity_type: str, entity_id: str) -> bool:
    """True if a stock_fundamentals row already exists for this entity
    with snapshot_date == today. Lets us re-run safely."""
    row = conn.execute(
        "SELECT 1 FROM stock_fundamentals "
        "WHERE entity_type = ? AND entity_id = ? AND snapshot_date = ? LIMIT 1",
        (entity_type, entity_id, _today_iso()),
    ).fetchone()
    return row is not None


def _iter_targets(conn, limit: int, restrict_table: str | None):
    """Yield (table, id_col, entity_type, entity_id, ticker, name) for
    rows that have a non-empty ticker. Caller filters fresh-snapshot
    rows so the count log matches what we actually attempt."""
    cur = conn.cursor()
    yielded = 0
    for table, id_col, entity_type in TABLES:
        if restrict_table and table != restrict_table:
            continue
        if limit and yielded >= limit:
            break
        try:
            sql = (
                f"SELECT {id_col}, ticker, display_name FROM {table} "
                f"WHERE ticker IS NOT NULL AND ticker != '' "
                f"ORDER BY id"
            )
            cur.execute(sql)
        except Exception as exc:  # noqa: BLE001
            log.warning("skipping %s: %s", table, exc)
            continue
        for row in cur.fetchall():
            yield table, id_col, entity_type, row[0], row[1], row[2]
            yielded += 1
            if limit and yielded >= limit:
                break


def _insert_snapshot(conn, entity_type: str, entity_id: str, ticker: str, fields: dict) -> None:
    """Write one StockFundamentals row. We use raw sqlite rather than
    SQLAlchemy here because this script runs as a thin standalone job
    against the same db file the API uses, and avoiding SA imports
    keeps cold-start fast for cron."""
    cols = [
        "entity_type", "entity_id", "ticker", "snapshot_date",
        "market_cap", "pe_ratio", "forward_pe", "peg_ratio", "price_to_book",
        "eps", "revenue_ttm", "profit_margin", "operating_margin", "return_on_equity",
        "dividend_yield", "dividend_per_share",
        "week_52_high", "week_52_low", "day_50_moving_avg", "day_200_moving_avg",
        "sector", "industry", "description", "dedupe_hash",
    ]
    values = [
        entity_type, entity_id, ticker, fields.get("snapshot_date"),
        fields.get("market_cap"), fields.get("pe_ratio"), fields.get("forward_pe"),
        fields.get("peg_ratio"), fields.get("price_to_book"),
        fields.get("eps"), fields.get("revenue_ttm"),
        fields.get("profit_margin"), fields.get("operating_margin"), fields.get("return_on_equity"),
        fields.get("dividend_yield"), fields.get("dividend_per_share"),
        fields.get("week_52_high"), fields.get("week_52_low"),
        fields.get("day_50_moving_avg"), fields.get("day_200_moving_avg"),
        fields.get("sector"), fields.get("industry"), fields.get("description"),
        fields.get("dedupe_hash"),
    ]
    placeholders = ",".join("?" * len(cols))
    conn.execute(
        f"INSERT OR IGNORE INTO stock_fundamentals ({','.join(cols)}) VALUES ({placeholders})",
        values,
    )


def run(limit: int, dry_run: bool, restrict_table: str | None) -> int:
    db_path = os.getenv("WTP_DB_PATH", str(ROOT / "wethepeople.db"))
    if not Path(db_path).exists():
        log.error("DB not found at %s", db_path)
        return 1
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")

    if dry_run:
        client_fetch = None
    else:
        # Imported lazily so a misconfigured env can still --dry-run.
        from connectors.yahoo_finance import fetch_overview as client_fetch  # noqa

    seen = 0
    fresh_skipped = 0
    written = 0
    failed = 0
    t0 = time.time()
    for table, id_col, entity_type, entity_id, ticker, name in _iter_targets(conn, limit, restrict_table):
        seen += 1
        if _has_fresh_snapshot(conn, entity_type, entity_id):
            fresh_skipped += 1
            continue

        if dry_run:
            log.info("DRY: would fetch %s (%s) for %s/%s", ticker, name, table, entity_id)
            continue

        fields = client_fetch(ticker)
        if not fields:
            failed += 1
            log.info("? %s (%s): no data from Yahoo", ticker, name)
            continue

        _insert_snapshot(conn, entity_type, entity_id, ticker, fields)
        conn.commit()
        written += 1
        price = fields.get("_current_price")
        log.info("+ %s (%s): $%s, mcap=%s",
                 ticker, name, price,
                 f"{fields.get('market_cap'):,.0f}" if fields.get("market_cap") else "?")

        # 1s polite delay handled inside fetch_overview (between chart
        # and quote calls). Add a small tail-delay so we don't burst
        # consecutive entities.
        time.sleep(0.25)

    elapsed = time.time() - t0
    log.info(
        "done. seen=%d fresh_skipped=%d written=%d failed=%d in %.1fs",
        seen, fresh_skipped, written, failed, elapsed,
    )
    conn.close()
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--limit", type=int, default=0, help="0 = unlimited")
    p.add_argument("--table", default=None,
                   help="Restrict to one table (e.g. tracked_tech_companies)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    return run(limit=args.limit, dry_run=args.dry_run, restrict_table=args.table)


if __name__ == "__main__":
    raise SystemExit(main())
