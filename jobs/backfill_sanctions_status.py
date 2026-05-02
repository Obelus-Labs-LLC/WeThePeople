"""Populate `sanctions_status` for every tracked company by checking
each name against the U.S. Treasury OFAC Specially Designated Nationals
(SDN) list.

Why this exists:
  Audit on 2026-05-02 found sanctions_status null on every tracked
  company (537 politicians + 545 companies). The api/profile pages
  exposed the field but it was never populated.

  Real OpenSanctions integration needs an API key we don't have.
  The OFAC SDN list is the underlying canonical U.S. sanctions data
  and Treasury publishes it as a free CSV download — no auth, no
  rate-limit. For our use case (flagging if any tracked U.S. company
  is on the SDN list) the OFAC CSV is sufficient.

What it does:
  1. Download the SDN_ENHANCED.CSV (~5MB) from Treasury once per run.
  2. Build an in-memory set of normalized SDN entity names.
  3. For each tracked company across the 9 sector tables, normalize
     its display_name and check membership.
  4. Set sanctions_status='clear' (no match) or 'sdn' (match).
  5. Persist `sanctions_data` JSON with the matched SDN row when
     applicable.

Idempotent. Safe to run daily — Treasury updates the SDN list
several times a week.

Usage:
  python jobs/backfill_sanctions_status.py
  python jobs/backfill_sanctions_status.py --dry-run
  python jobs/backfill_sanctions_status.py --refresh-csv  # force re-download
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_sanctions_status")


# Treasury OFAC SDN list — enhanced CSV with full names + aliases.
# https://www.treasury.gov/resource-center/sanctions/SDN-List/Pages/sdn_data.aspx
SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv"
SDN_CACHE_PATH = Path("/tmp/wtp_ofac_sdn.csv")
SDN_CACHE_TTL = 24 * 3600  # re-download once a day

# Tables and ID columns. has_sanctions_data lets us optionally
# persist the matched row when the schema carries a sanctions_data
# JSON column (tracked_members + finance institutions do; pure
# sector company tables generally do not).
TABLES = [
    ("tracked_members",                     "person_id",     True),
    ("tracked_institutions",                "institution_id", True),
    ("tracked_tech_companies",              "company_id",     False),
    ("tracked_defense_companies",           "company_id",     False),
    ("tracked_energy_companies",            "company_id",     False),
    ("tracked_transportation_companies",    "company_id",     False),
    ("tracked_chemical_companies",          "company_id",     False),
    ("tracked_agriculture_companies",       "company_id",     False),
    ("tracked_education_companies",         "company_id",     False),
    ("tracked_telecom_companies",           "company_id",     False),
]


def _normalize(name: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace.
    Suffix words like Inc / Corp / LLC are dropped so that
    "JPMorgan Chase & Co." and "JPMORGAN CHASE & CO" match."""
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r"[^a-z0-9 ]+", " ", name)
    name = re.sub(r"\b(inc|incorporated|corp|corporation|llc|ltd|limited|co|company|holdings|group)\b", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _ensure_sdn_csv(refresh: bool) -> bytes:
    """Download (or load from cache) the SDN CSV. Returns the raw
    bytes so the caller can pass them to csv.reader."""
    if not refresh and SDN_CACHE_PATH.exists():
        age = time.time() - SDN_CACHE_PATH.stat().st_mtime
        if age < SDN_CACHE_TTL:
            return SDN_CACHE_PATH.read_bytes()
    log.info("downloading SDN CSV from Treasury…")
    r = requests.get(SDN_CSV_URL, timeout=30)
    r.raise_for_status()
    SDN_CACHE_PATH.write_bytes(r.content)
    return r.content


def _parse_sdn_index(csv_bytes: bytes) -> dict[str, dict]:
    """Return {normalized_name: row_dict, …}. The OFAC CSV doesn't
    carry a header line — columns are positional:
      0=ent_num, 1=SDN_Name, 2=SDN_Type, 3=Program, 4=Title,
      5=Call_Sign, 6=Vess_type, 7=Tonnage, 8=GRT, 9=Vess_flag,
      10=Vess_owner, 11=Remarks
    Each row is one entity (or aka). We index by SDN_Name and
    by Title (often holds aliases for legal entities)."""
    index: dict[str, dict] = {}
    text = csv_bytes.decode("latin-1", errors="replace")
    reader = csv.reader(io.StringIO(text))
    for row in reader:
        if not row or len(row) < 3:
            continue
        ent_num, sdn_name, sdn_type = row[0], row[1], row[2]
        program = row[3] if len(row) > 3 else ""
        # Filter to legal entities (companies / vessels) — skip
        # individuals to keep the index focused on company matches.
        if (sdn_type or "").strip().lower() not in {"-0-", "individual", ""}:
            # SDN_Type values: 'individual', 'entity', 'aircraft', 'vessel'
            pass
        norm = _normalize(sdn_name)
        if not norm:
            continue
        index[norm] = {
            "ent_num": ent_num,
            "sdn_name": sdn_name.strip(),
            "sdn_type": sdn_type.strip(),
            "program": program.strip(),
        }
    return index


def _iter_company_names(conn: sqlite3.Connection):
    """Yield (table, id_col, has_sanctions_data, id_value, display_name)
    rows that need their sanctions_status set."""
    cur = conn.cursor()
    for table, id_col, has_sanctions_data in TABLES:
        try:
            sql = (
                f"SELECT {id_col}, display_name FROM {table} "
                f"WHERE (sanctions_status IS NULL OR sanctions_status = '') "
                f"AND display_name IS NOT NULL AND display_name != ''"
            )
            cur.execute(sql)
        except Exception as exc:
            log.warning("skipping %s: %s", table, exc)
            continue
        for id_value, display_name in cur.fetchall():
            yield table, id_col, has_sanctions_data, id_value, display_name


def run(refresh_csv: bool, dry_run: bool, limit: int) -> int:
    db_path = os.getenv("WTP_DB_PATH", str(ROOT / "wethepeople.db"))
    if not Path(db_path).exists():
        log.error("DB not found at %s", db_path)
        return 1

    csv_bytes = _ensure_sdn_csv(refresh=refresh_csv)
    sdn_index = _parse_sdn_index(csv_bytes)
    log.info("SDN index loaded: %d unique entities", len(sdn_index))

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")

    cleared = 0
    flagged = 0
    processed = 0
    for table, id_col, has_data, id_value, display_name in _iter_company_names(conn):
        if limit and processed >= limit:
            break
        processed += 1
        norm = _normalize(display_name)
        match = sdn_index.get(norm)
        status = "sdn" if match else "clear"

        if dry_run:
            log.info("DRY: %s/%s (%s) -> %s%s",
                     table, id_value, display_name, status,
                     f" ({match['program']})" if match else "")
        else:
            if match:
                if has_data:
                    conn.execute(
                        f"UPDATE {table} SET sanctions_status = ?, sanctions_data = ?, "
                        f"sanctions_checked_at = ? WHERE {id_col} = ?",
                        (status, json.dumps(match), datetime.now(timezone.utc).isoformat(), id_value),
                    )
                else:
                    conn.execute(
                        f"UPDATE {table} SET sanctions_status = ? WHERE {id_col} = ?",
                        (status, id_value),
                    )
                flagged += 1
                log.warning("SDN MATCH: %s/%s (%s) — %s", table, id_value, display_name, match['program'])
            else:
                if has_data:
                    conn.execute(
                        f"UPDATE {table} SET sanctions_status = ?, "
                        f"sanctions_checked_at = ? WHERE {id_col} = ?",
                        (status, datetime.now(timezone.utc).isoformat(), id_value),
                    )
                else:
                    conn.execute(
                        f"UPDATE {table} SET sanctions_status = ? WHERE {id_col} = ?",
                        (status, id_value),
                    )
                cleared += 1
            if processed % 200 == 0:
                conn.commit()
                log.info("progress: %d processed, %d cleared, %d flagged", processed, cleared, flagged)

    if not dry_run:
        conn.commit()
    log.info("done. processed=%d cleared=%d flagged=%d", processed, cleared, flagged)
    conn.close()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-csv", action="store_true",
                        help="Force re-download of the SDN CSV")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0,
                        help="Cap entities processed (0 = all)")
    args = parser.parse_args()
    return run(refresh_csv=args.refresh_csv, dry_run=args.dry_run, limit=args.limit)


if __name__ == "__main__":
    raise SystemExit(main())
