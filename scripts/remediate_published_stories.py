"""Retroactive remediation for already-published stories.

For every non-archived, non-retracted story currently in the `stories` table
this script:

  1. Reruns `_normalize_disclaimer_block(body, category)` so that
     * legacy free-text `**Disclosure:** ...` paragraphs are stripped
     * wrong-category canonical disclaimers embedded mid-body are removed
     * duplicate copies of the correct disclaimer collapse to a single trailer
     Running this on already-clean stories is a no-op.

  2. Backfills `data_date_range` when the column is null or blank. The
     remediator walks the entity_ids attached to the story and probes the
     lobbying / contract / enforcement / trade / donation tables that match
     the story's category + sector to derive a date span.

Usage:
    python scripts/remediate_published_stories.py --dry-run
    python scripts/remediate_published_stories.py         # applies changes

Safe to run repeatedly. Writes nothing unless a body or date_range actually
changed, so the `updated_at` timestamp stays clean on already-remediated rows.
"""

import argparse
import logging
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal, Base, engine
from models.stories_models import Story
from sqlalchemy import text

from jobs.detect_stories import (
    _normalize_disclaimer_block,
    get_data_date_range,
    LOBBYING_TABLES,
    CONTRACT_TABLES,
    ENFORCEMENT_TABLES,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


# Map a story's category to the primary fact-table family so we know which
# table's date column to probe when backfilling coverage. Categories listed
# more than once are intentional: we fall through until we find data.
_CATEGORY_TABLE_FAMILIES = {
    # Lobbying-first
    "lobbying_breakdown": ("lobbying", "contracts"),
    "lobbying_spike": ("lobbying", "contracts"),
    "tax_lobbying": ("lobbying",),
    "budget_influence": ("lobbying",),
    "budget_lobbying": ("lobbying",),
    "regulatory_loop": ("lobbying", "contracts"),
    "regulatory_capture": ("lobbying", "contracts"),
    "revolving_door": ("lobbying",),
    "cross_sector": ("lobbying", "contracts"),
    "lobby_then_win": ("lobbying", "contracts"),
    "lobby_contract_loop": ("lobbying", "contracts"),
    "education_pipeline": ("lobbying", "contracts"),

    # Contracts-first
    "contract_windfall": ("contracts", "lobbying"),
    "contract": ("contracts",),
    "contract_timing": ("contracts", "donations"),
    "penalty_contract_ratio": ("contracts", "enforcement"),

    # Enforcement-first
    "penalty_gap": ("enforcement", "contracts"),
    "enforcement_disappearance": ("enforcement", "lobbying"),
    "enforcement_immunity": ("enforcement", "lobbying"),

    # Trade-first
    "prolific_trader": ("trades",),
    "trade_cluster": ("trades",),
    "trade_timing": ("trades",),
    "committee_stock_trade": ("trades",),
    "stock_act_violation": ("trades",),

    # Donation-first
    "bipartisan_buying": ("donations",),
    "pac_donation_pattern": ("donations",),
    "pac_committee_pipeline": ("donations",),

    # FARA
    "foreign_lobbying": ("fara", "lobbying"),
    "fara_domestic_overlap": ("fara", "lobbying"),
    "fara_concentration": ("fara",),
}


def _lookup_sector_cfg(sector, tables):
    """Return (table_name, id_col) or None for the given sector in table list."""
    if not sector:
        return None
    for t, sec, id_col, _entity in tables:
        if sec == sector:
            return t, id_col
    return None


def _derive_range_from_family(db, family, sector, entity_ids):
    """Probe one table family across the sector + entity and return the first
    non-null date range label, or None."""
    if not entity_ids:
        return None

    for eid in entity_ids:
        eid = (eid or "").strip()
        if not eid:
            continue

        if family == "lobbying":
            cfg = _lookup_sector_cfg(sector, LOBBYING_TABLES)
            candidates = [cfg] if cfg else [
                (t, id_col) for t, _s, id_col, _e in LOBBYING_TABLES
            ]
            for table, id_col in candidates:
                r = get_data_date_range(db, table, id_col, eid)
                if r:
                    return r[2]

        elif family == "contracts":
            cfg = _lookup_sector_cfg(sector, CONTRACT_TABLES)
            candidates = [cfg] if cfg else [
                (t, id_col) for t, _s, id_col, _e in CONTRACT_TABLES
            ]
            for table, id_col in candidates:
                r = get_data_date_range(db, table, id_col, eid)
                if r:
                    return r[2]

        elif family == "enforcement":
            cfg = _lookup_sector_cfg(sector, ENFORCEMENT_TABLES)
            candidates = [cfg] if cfg else [
                (t, id_col) for t, _s, id_col, _e in ENFORCEMENT_TABLES
            ]
            for table, id_col in candidates:
                try:
                    row = db.execute(text(
                        "SELECT MIN(case_date), MAX(case_date) FROM %s "
                        "WHERE %s = :eid AND case_date IS NOT NULL"
                        % (table, id_col)
                    ), {"eid": eid}).fetchone()
                except Exception:
                    continue
                if row and row[0] and row[1]:
                    a, b = str(row[0])[:7], str(row[1])[:7]
                    return a if a == b else "%s - %s" % (a, b)

        elif family == "trades":
            try:
                row = db.execute(text(
                    "SELECT MIN(transaction_date), MAX(transaction_date) "
                    "FROM congressional_trades "
                    "WHERE person_id = :eid AND transaction_date IS NOT NULL"
                ), {"eid": eid}).fetchone()
            except Exception:
                row = None
            if row and row[0] and row[1]:
                a, b = str(row[0])[:7], str(row[1])[:7]
                return a if a == b else "%s - %s" % (a, b)

        elif family == "donations":
            try:
                row = db.execute(text(
                    "SELECT MIN(donation_date), MAX(donation_date) "
                    "FROM company_donations "
                    "WHERE entity_id = :eid AND donation_date IS NOT NULL"
                ), {"eid": eid}).fetchone()
            except Exception:
                row = None
            if row and row[0] and row[1]:
                a, b = str(row[0])[:7], str(row[1])[:7]
                return a if a == b else "%s - %s" % (a, b)

        elif family == "fara":
            try:
                row = db.execute(text(
                    "SELECT MIN(registration_date), MAX(registration_date) "
                    "FROM fara_registrants "
                    "WHERE LOWER(registrant_name) = LOWER(:eid) "
                    "AND registration_date IS NOT NULL"
                ), {"eid": eid}).fetchone()
            except Exception:
                row = None
            if row and row[0] and row[1]:
                a, b = str(row[0])[:7], str(row[1])[:7]
                return a if a == b else "%s - %s" % (a, b)

    return None


def backfill_date_range(db, story):
    """Return a date_range string for the story, or None."""
    families = _CATEGORY_TABLE_FAMILIES.get(story.category)
    if not families:
        # Unknown category -- probe lobbying + contracts as a best effort.
        families = ("lobbying", "contracts")

    entity_ids = story.entity_ids or []
    for family in families:
        rng = _derive_range_from_family(db, family, story.sector, entity_ids)
        if rng:
            return rng
    return None


def remediate_story(db, story, dry_run=False):
    """Apply disclaimer normalisation + date_range backfill to one story.

    Returns a dict describing what changed (empty dict = no change).
    """
    changes = {}

    # 1. Disclaimer normalisation
    new_body = _normalize_disclaimer_block(story.body or "", story.category or "")
    if new_body != (story.body or ""):
        changes["body"] = {
            "old_len": len(story.body or ""),
            "new_len": len(new_body),
        }
        if not dry_run:
            story.body = new_body

    # 2. data_date_range backfill
    current = (story.data_date_range or "").strip()
    if not current:
        new_range = backfill_date_range(db, story)
        if new_range:
            changes["data_date_range"] = new_range
            if not dry_run:
                story.data_date_range = new_range

    if changes and not dry_run:
        story.updated_at = datetime.now(timezone.utc)

    return changes


def main():
    parser = argparse.ArgumentParser(description="Remediate published stories")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report changes without writing to the DB")
    parser.add_argument("--status", default="published",
                        help="Restrict to a single status ('published', 'draft', 'all')")
    parser.add_argument("--limit", type=int, default=0,
                        help="Cap at N stories (0 = no cap)")
    args = parser.parse_args()

    Base.metadata.create_all(engine)
    db = SessionLocal()

    q = db.query(Story)
    if args.status == "all":
        q = q.filter(Story.status.in_(("draft", "published")))
    else:
        q = q.filter(Story.status == args.status)
    q = q.order_by(Story.id.asc())
    if args.limit > 0:
        q = q.limit(args.limit)

    touched = 0
    examined = 0
    body_changes = 0
    range_changes = 0

    for story in q.all():
        examined += 1
        changes = remediate_story(db, story, dry_run=args.dry_run)
        if not changes:
            continue
        touched += 1
        if "body" in changes:
            body_changes += 1
        if "data_date_range" in changes:
            range_changes += 1
        log.info(
            "%s [%s] category=%s slug=%s changes=%s",
            "WOULD UPDATE" if args.dry_run else "UPDATED",
            story.id, story.category, story.slug, sorted(changes.keys()),
        )

    if not args.dry_run:
        db.commit()

    log.info(
        "Done. examined=%d touched=%d body=%d date_range=%d dry_run=%s",
        examined, touched, body_changes, range_changes, args.dry_run,
    )


if __name__ == "__main__":
    main()
