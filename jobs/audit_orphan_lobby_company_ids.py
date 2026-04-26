"""Audit lobbying_records.company_id values that don't link to a
tracked_<sector>_companies row.

Background
----------
``<sector>_lobbying_records`` tables store one row per Senate LDA filing
keyed by ``company_id``. The corresponding ``tracked_<sector>_companies``
tables list the companies our pipeline cares about (these drive the
sector pages, story detection, contract joins, etc.). When a
``lobbying_records.company_id`` doesn't appear in the matching tracked
table, that filing is effectively invisible to story detection — it
shows up in raw aggregates but never gets attributed to an entity page.

This audit prints:
  * total / matched / orphan counts per sector
  * the top dollar orphans per sector (so we can decide whether to
    backfill them into tracked_*, merge slugs, or accept the orphan
    state as "untracked third-party clients")

It's read-only.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from models.database import SessionLocal  # noqa: E402


SECTOR_MAPPING = {
    "lobbying_records":                 "tracked_tech_companies",
    "health_lobbying_records":          "tracked_companies",  # health uses the unprefixed name (legacy)
    "energy_lobbying_records":          "tracked_energy_companies",
    "transportation_lobbying_records":  "tracked_transportation_companies",
    "defense_lobbying_records":         "tracked_defense_companies",
    "chemical_lobbying_records":        "tracked_chemical_companies",
    "agriculture_lobbying_records":     "tracked_agriculture_companies",
    "telecom_lobbying_records":         "tracked_telecom_companies",
    "education_lobbying_records":       "tracked_education_companies",
}


def main():
    db = SessionLocal()
    try:
        orphan_total = 0
        per_sector_orphans = {}

        for lr_table, tracked_table in SECTOR_MAPPING.items():
            total = db.execute(
                text(f"SELECT COUNT(DISTINCT company_id) FROM {lr_table}")
            ).scalar()
            matched = db.execute(
                text(
                    f"SELECT COUNT(DISTINCT lr.company_id) "
                    f"FROM {lr_table} lr "
                    f"JOIN {tracked_table} c ON c.company_id = lr.company_id"
                )
            ).scalar()
            orphan = total - matched
            orphan_total += orphan
            per_sector_orphans[lr_table] = orphan
            print(
                f"{lr_table:40s}  total={total:4d}  matched={matched:4d}  "
                f"orphan={orphan:4d}  ({tracked_table})"
            )

        print()
        print(f"TOTAL ORPHANS across mapped sectors: {orphan_total}")
        print()

        # Per-sector top orphans by spend
        for lr_table, tracked_table in SECTOR_MAPPING.items():
            n = per_sector_orphans.get(lr_table, 0)
            if n == 0:
                continue
            print(f"---- {lr_table}: top 8 orphans by lobbying spend ----")
            rows = db.execute(text(f"""
                SELECT
                  lr.company_id,
                  MIN(lr.client_name) AS client_name,
                  COUNT(*) AS filings,
                  ROUND(
                    SUM(
                      CASE
                        WHEN COALESCE(lr.expenses, 0) > 0 THEN COALESCE(lr.expenses, 0)
                        ELSE COALESCE(lr.income, 0)
                      END
                    ) / 1e6, 2
                  ) AS spend_m
                FROM {lr_table} lr
                LEFT JOIN {tracked_table} c ON c.company_id = lr.company_id
                WHERE c.company_id IS NULL
                GROUP BY lr.company_id
                ORDER BY spend_m DESC
                LIMIT 8
            """)).fetchall()
            for r in rows:
                client = (r[1] or "")[:50]
                print(f"  {r[0]:38s} filings={r[2]:4d}  ${r[3]}M  {client}")
            print()
    finally:
        db.close()


if __name__ == "__main__":
    main()
