"""Rebuild the SQLite FTS5 entity_search index from source tables.

Idempotent: deletes the existing rows, then re-inserts. Designed to
run quickly (<10s on the current dataset). Safe to run on a live
database — FTS5 readers see a consistent snapshot mid-rebuild.

Sources:
    politicians          TrackedMember
    state_legislators    StateLegislator
    bills                Bill
    stories              Story
    companies            Tracked* across all sectors

Usage:
    python jobs/rebuild_search_index.py
    python jobs/rebuild_search_index.py --counts-only   (dry run)

Cadence: hourly via jobs/scheduler.py is plenty — these tables don't
change minute-to-minute. Manual rebuild after large imports is fine.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Iterable, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import text

from models.database import SessionLocal, TrackedMember, Bill
from models.stories_models import Story

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("rebuild_search_index")


# Each entry: (entity_type, model_class, id_field, title_field, body_fields, sector, url_template)
# url_template is .format()ed with kwargs from the row.

def _politician_rows(db) -> Iterable[Tuple[str, str, str, str, str, str]]:
    for m in db.query(TrackedMember).filter(TrackedMember.is_active == 1).all():
        body = " ".join(filter(None, [m.state, m.party, m.chamber, m.bioguide_id]))
        yield (
            "politician",
            m.person_id or "",
            m.display_name or "",
            body,
            "politics",
            f"/politics/people/{m.person_id}",
        )


def _state_legislator_rows(db):
    from models.state_models import StateLegislator
    for leg in db.query(StateLegislator).filter(StateLegislator.is_active == True).all():  # noqa: E712
        body = " ".join(filter(None, [leg.state, leg.party, leg.chamber, leg.district]))
        yield (
            "state_legislator",
            leg.ocd_id or "",
            leg.name or "",
            body,
            "politics",
            f"/civic/state/{leg.state}",
        )


def _bill_rows(db):
    for b in db.query(Bill).all():
        body = " ".join(filter(None, [
            b.bill_type, str(b.bill_number) if b.bill_number else None,
            b.policy_area, b.status_bucket, b.summary_text,
        ]))
        yield (
            "bill",
            b.bill_id or "",
            b.title or b.bill_id or "",
            body[:1000],  # cap body to keep FTS row tight
            "politics",
            f"/politics/bill/{b.bill_id}",
        )


def _story_rows(db):
    for s in db.query(Story).filter(Story.status == "published").all():
        body = " ".join(filter(None, [
            s.summary, s.category, s.sector,
            " ".join(s.entity_ids) if isinstance(s.entity_ids, list) else "",
        ]))
        yield (
            "story",
            s.slug or "",
            s.title or "",
            body[:1000],
            s.sector,
            f"https://journal.wethepeopleforus.com/story/{s.slug}",
        )


_COMPANY_TABLES = [
    # (model, sector_slug, id_field, name_field, route_prefix)
    ("models.finance_models",       "TrackedInstitution",      "finance",        "institution_id", "display_name", "/finance"),
    ("models.health_models",        "TrackedCompany",          "health",         "company_id",     "display_name", "/health"),
    ("models.tech_models",          "TrackedTechCompany",      "technology",     "company_id",     "display_name", "/technology"),
    ("models.energy_models",        "TrackedEnergyCompany",    "energy",         "company_id",     "display_name", "/energy"),
    ("models.transportation_models","TrackedTransportationCompany","transportation","company_id",  "display_name", "/transportation"),
    ("models.defense_models",       "TrackedDefenseCompany",   "defense",        "company_id",     "display_name", "/defense"),
    ("models.chemicals_models",     "TrackedChemicalCompany",  "chemicals",      "company_id",     "display_name", "/chemicals"),
    ("models.agriculture_models",   "TrackedAgricultureCompany","agriculture",   "company_id",     "display_name", "/agriculture"),
    ("models.education_models",     "TrackedEducationCompany", "education",      "company_id",     "display_name", "/education"),
    ("models.telecom_models",       "TrackedTelecomCompany",   "telecom",        "company_id",     "display_name", "/telecom"),
]


def _company_rows(db):
    import importlib
    for module_path, cls_name, sector, id_field, name_field, route in _COMPANY_TABLES:
        try:
            mod = importlib.import_module(module_path)
            cls = getattr(mod, cls_name)
        except Exception as exc:
            log.warning("skip %s.%s: %s", module_path, cls_name, exc)
            continue
        try:
            for row in db.query(cls).all():
                eid = getattr(row, id_field, None) or ""
                name = getattr(row, name_field, None) or ""
                ticker = getattr(row, "ticker", None) or ""
                hq = getattr(row, "headquarters", None) or ""
                body = " ".join(filter(None, [ticker, hq, sector]))
                if not eid or not name:
                    continue
                yield (
                    "company",
                    eid,
                    name,
                    body[:500],
                    sector,
                    f"{route}/{eid}",
                )
        except Exception as exc:
            log.warning("query failed for %s: %s", cls_name, exc)
            continue


def rebuild(counts_only: bool = False) -> int:
    db = SessionLocal()
    try:
        # Drop and re-insert. FTS5 supports DELETE + INSERT; this is
        # the simplest correct approach for a small dataset (<100K
        # rows expected). For larger sets, switch to upsert with a
        # last_updated guard.
        if not counts_only:
            db.execute(text("DELETE FROM entity_search"))

        bucket_counts: dict = {}

        def _ingest(name: str, gen):
            n = 0
            for tup in gen:
                if not counts_only:
                    db.execute(
                        text(
                            "INSERT INTO entity_search "
                            "(entity_type, entity_id, title, body, sector, url) "
                            "VALUES (:t, :i, :ti, :b, :s, :u)"
                        ),
                        {
                            "t": tup[0], "i": tup[1], "ti": tup[2],
                            "b": tup[3], "s": tup[4], "u": tup[5],
                        },
                    )
                n += 1
            bucket_counts[name] = n
            log.info("  %s: %d", name, n)

        _ingest("politicians",        _politician_rows(db))
        _ingest("state_legislators",  _state_legislator_rows(db))
        _ingest("bills",              _bill_rows(db))
        _ingest("stories",            _story_rows(db))
        _ingest("companies",          _company_rows(db))

        if not counts_only:
            db.commit()
        total = sum(bucket_counts.values())
        log.info("rebuild done: %d rows%s", total, " (dry-run)" if counts_only else "")
        return 0
    except Exception:
        db.rollback()
        log.exception("rebuild failed")
        return 1
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Rebuild FTS5 entity search index")
    parser.add_argument("--counts-only", action="store_true",
                        help="Count rows without writing to the FTS table")
    args = parser.parse_args()
    return rebuild(counts_only=args.counts_only)


if __name__ == "__main__":
    sys.exit(main())
