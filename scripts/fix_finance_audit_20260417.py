"""
Finance audit remediation — 2026-04-17
Fixes four critical data-integrity bugs found in .planning/finance_audit_2026_04_17.md

Bug #2 (all 9 sector enforcement tables): DELETE Federal Register rulemakings
    mis-ingested as enforcement (enforcement_type = 'Regulatory Action').
    Also fixes penalty_amount pollution caused by those rows.

Bug #1 (finance): merge 12 true-duplicate institution pairs; fix 3 wrong-CIK
    assignments (markel/citizens-financial/stifel-financial).

Bug #3 (finance): dedupe finance_lobbying_records by (filing_uuid, institution_id).
    After the merges in bug #1, rebuild unique filings per institution.

Bug #4 (finance): drop the 40-capped sec_insider_trades rows so the new
    jobs/sync_insider_trades.py can repopulate without the artificial cap.

CIK backfill: nuvei (0001835522), home-bancfin slug rename → home-bancshares
    with CIK 0001331520.

Usage:
    python scripts/fix_finance_audit_20260417.py --dry-run    # show plan
    python scripts/fix_finance_audit_20260417.py --apply      # execute
"""

import argparse
import logging
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from models.database import SessionLocal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


# Tables that receive Federal Register rulemaking rows misclassified as enforcement.
ENFORCEMENT_TABLES = [
    "finance_enforcement_actions",
    "health_enforcement_actions",
    "energy_enforcement_actions",
    "transportation_enforcement_actions",
    "defense_enforcement_actions",
    "chemical_enforcement_actions",
    "agriculture_enforcement_actions",
    "telecom_enforcement_actions",
    "education_enforcement_actions",
]


# 12 true duplicate pairs in tracked_institutions — same company entered twice
# with different slugs. Canonical slug kept; orphan rows migrate children then delete.
MERGE_PAIRS = [
    ("synchrony-financial",        "synchrony"),
    ("apollo-global",              "apollo"),
    ("block",                      "block-inc"),
    ("raymond-james",              None),  # no merge: stifel-financial is a real separate company
    ("nycb",                       "new-york-community"),
    ("hartford-financial",         "hartford"),
    ("principal-financial",        "principal"),
    ("fidelity-national-financial","fidelity-national"),
    ("carlyle-group",              "carlyle"),
    ("ice",                        "intercontinental-exchange"),
    ("zions-bancorporation",       "zions-bancorp"),
    ("mt-bank",                    "mandt"),
    ("unum-group",                 "unum"),
]


# Institutions whose sec_cik was wrongly assigned to another company's CIK.
# Fix to real CIK; leave other rows alone — they will pick up correct SEC
# filings on next sync.
WRONG_CIK_FIXES = [
    # (institution_id, current_wrong_cik, correct_cik, source)
    ("markel",             "0000070858", "0001096343", "Markel Group Inc. — MKL"),
    ("citizens-financial", "0000831001", "0001378946", "Citizens Financial Group — CFG"),
    ("stifel-financial",   "0000720005", "0000720672", "Stifel Financial Corp. — SF"),
]


# Missing/bad CIKs to backfill.
CIK_BACKFILL = [
    ("nuvei",        None, "0001835522", "Nuvei Corporation — NVEI"),
    # home-bancfin is a typo slug; rename to home-bancshares with correct CIK.
    # Handled separately because it requires a slug update, not just a CIK fix.
]


# Child tables in finance sector that reference institution_id — merge logic
# moves these rows from orphan → canonical, dedup'ing on existing unique keys.
FINANCE_CHILD_TABLES = [
    "sec_filings",
    "sec_insider_trades",
    "fdic_financials",
    "cfpb_complaints",
    "fred_observations",
    "fed_press_releases",
    "finance_enforcement_actions",
    "finance_lobbying_records",
    "finance_government_contracts",
]

# stock_fundamentals uses entity_id + entity_type rather than institution_id.
STOCK_TABLE = "stock_fundamentals"


def existing_tables(db):
    rows = db.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()
    return {r[0] for r in rows}


def purge_regulatory_actions(db, apply: bool):
    """Bug #2: delete Federal Register rulemaking rows from every sector
    enforcement table."""
    log.info("=" * 60)
    log.info("Bug #2 — purge Regulatory Action rows")
    log.info("=" * 60)
    tables = existing_tables(db)
    total_deleted = 0
    for tbl in ENFORCEMENT_TABLES:
        if tbl not in tables:
            log.info("  %s: missing, skipping", tbl)
            continue
        n = db.execute(
            text(f"SELECT COUNT(*) FROM {tbl} WHERE enforcement_type = 'Regulatory Action'")
        ).scalar() or 0
        log.info("  %s: %d Regulatory Action rows", tbl, n)
        total_deleted += n
        if apply and n:
            db.execute(
                text(f"DELETE FROM {tbl} WHERE enforcement_type = 'Regulatory Action'")
            )
    if apply:
        db.commit()
    log.info("Bug #2: %d rows %s", total_deleted, "deleted" if apply else "would be deleted")
    return total_deleted


def merge_finance_dupes(db, apply: bool):
    """Bug #1: for each true-dupe pair, move child rows orphan→canonical, then
    delete the orphan tracked_institutions row. Child rows that collide on an
    existing dedupe/unique key are skipped (the canonical wins)."""
    log.info("=" * 60)
    log.info("Bug #1 — merge 12 true-duplicate institution pairs")
    log.info("=" * 60)
    tables = existing_tables(db)
    merged_total = 0
    orphans_dropped = 0

    for canonical, orphan in MERGE_PAIRS:
        if orphan is None:
            continue
        canon_row = db.execute(
            text("SELECT institution_id, display_name FROM tracked_institutions WHERE institution_id=:i"),
            {"i": canonical},
        ).first()
        orph_row = db.execute(
            text("SELECT institution_id, display_name FROM tracked_institutions WHERE institution_id=:i"),
            {"i": orphan},
        ).first()
        if not canon_row or not orph_row:
            log.warning("  skip pair (%s, %s): missing", canonical, orphan)
            continue
        log.info("  MERGE: %s ← %s", canonical, orphan)

        per_pair_moved = 0
        for child in FINANCE_CHILD_TABLES:
            if child not in tables:
                continue
            # Use INSERT OR IGNORE semantics via UPDATE OR IGNORE so collisions
            # on dedupe_hash / UniqueConstraint drop the orphan copy.
            moved = db.execute(
                text(
                    f"UPDATE OR IGNORE {child} SET institution_id = :new_id "
                    f"WHERE institution_id = :old_id"
                ),
                {"new_id": canonical, "old_id": orphan},
            ).rowcount or 0
            # Rows that couldn't be moved (because canonical already has that
            # dedupe_hash) should be deleted — they are duplicates.
            deleted = db.execute(
                text(f"DELETE FROM {child} WHERE institution_id = :old_id"),
                {"old_id": orphan},
            ).rowcount or 0
            if moved or deleted:
                log.info("    %s: moved=%d dropped_as_dup=%d", child, moved, deleted)
                per_pair_moved += moved

        # stock_fundamentals uses (entity_type='finance', entity_id=slug) —
        # move the orphan's stock snapshots over if any.
        if STOCK_TABLE in tables:
            moved = db.execute(
                text(
                    f"UPDATE OR IGNORE {STOCK_TABLE} SET entity_id = :new_id "
                    f"WHERE entity_id = :old_id AND entity_type = 'finance'"
                ),
                {"new_id": canonical, "old_id": orphan},
            ).rowcount or 0
            deleted = db.execute(
                text(f"DELETE FROM {STOCK_TABLE} WHERE entity_id = :old_id AND entity_type = 'finance'"),
                {"old_id": orphan},
            ).rowcount or 0
            if moved or deleted:
                log.info("    %s: moved=%d dropped_as_dup=%d", STOCK_TABLE, moved, deleted)
                per_pair_moved += moved

        # Finally, drop the orphan institution row
        if apply:
            db.execute(
                text("DELETE FROM tracked_institutions WHERE institution_id=:i"),
                {"i": orphan},
            )
        merged_total += per_pair_moved
        orphans_dropped += 1

    if apply:
        db.commit()
    else:
        db.rollback()
    log.info(
        "Bug #1: %d orphan rows dropped, %d child rows merged",
        orphans_dropped, merged_total,
    )
    return merged_total


def fix_wrong_ciks(db, apply: bool):
    """Bug #1 (part 2): repair wrongly-assigned CIKs + wipe inherited wrong-SEC data."""
    log.info("=" * 60)
    log.info("Bug #1b — repair wrong-CIK assignments")
    log.info("=" * 60)
    tables = existing_tables(db)
    for iid, old_cik, new_cik, label in WRONG_CIK_FIXES:
        r = db.execute(
            text("SELECT sec_cik FROM tracked_institutions WHERE institution_id=:i"),
            {"i": iid},
        ).first()
        if not r:
            log.warning("  %s: not found, skip", iid)
            continue
        current = (r[0] or "").strip()
        if current != old_cik and current != new_cik:
            log.warning("  %s: current CIK %s ≠ expected wrong %s — skipping to be safe", iid, current, old_cik)
            continue
        if current == new_cik:
            log.info("  %s: already correct at %s", iid, new_cik)
            continue
        log.info("  %s: %s  →  %s   (%s)", iid, old_cik, new_cik, label)
        if apply:
            db.execute(
                text("UPDATE tracked_institutions SET sec_cik=:c WHERE institution_id=:i"),
                {"c": new_cik, "i": iid},
            )
            # Drop any SEC filings/insider trades that were pulled under the
            # wrong CIK so the next sync re-populates against the right CIK.
            for child in ("sec_filings", "sec_insider_trades"):
                if child in tables:
                    db.execute(
                        text(f"DELETE FROM {child} WHERE institution_id=:i"),
                        {"i": iid},
                    )
    if apply:
        db.commit()


def dedupe_lobbying(db, apply: bool):
    """Bug #3: after bug #1 merges, some finance_lobbying_records still have
    duplicate (filing_uuid, institution_id) pairs or same filing_uuid under
    multiple institutions. Deduplicate keeping the smallest id."""
    log.info("=" * 60)
    log.info("Bug #3 — dedupe finance_lobbying_records")
    log.info("=" * 60)
    tables = existing_tables(db)
    if "finance_lobbying_records" not in tables:
        log.info("  table not present, skipping")
        return 0

    before = db.execute(text("SELECT COUNT(*) FROM finance_lobbying_records")).scalar() or 0
    # Rows to delete: every row whose (filing_uuid, institution_id) is not the
    # minimum id for that key, AND every row whose filing_uuid appears under a
    # different institution (keep the institution whose min id is smallest).
    deleted = db.execute(text(
        "DELETE FROM finance_lobbying_records WHERE id NOT IN ("
        " SELECT MIN(id) FROM finance_lobbying_records "
        " WHERE filing_uuid IS NOT NULL "
        " GROUP BY filing_uuid"
        ") AND filing_uuid IS NOT NULL"
    )).rowcount or 0
    after = db.execute(text("SELECT COUNT(*) FROM finance_lobbying_records")).scalar() or 0
    log.info("  before=%d deleted=%d after=%d", before, deleted, after)

    if apply:
        db.commit()
    else:
        db.rollback()
    return deleted


def backfill_ciks(db, apply: bool):
    """Backfill missing/bad CIKs."""
    log.info("=" * 60)
    log.info("CIK backfill")
    log.info("=" * 60)
    for iid, old_cik, new_cik, label in CIK_BACKFILL:
        r = db.execute(
            text("SELECT sec_cik FROM tracked_institutions WHERE institution_id=:i"),
            {"i": iid},
        ).first()
        if not r:
            log.warning("  %s: not found, skip", iid)
            continue
        current = (r[0] or "").strip()
        if current == new_cik:
            log.info("  %s: already at %s", iid, new_cik)
            continue
        log.info("  %s: %r → %s  (%s)", iid, current, new_cik, label)
        if apply:
            db.execute(
                text("UPDATE tracked_institutions SET sec_cik=:c WHERE institution_id=:i"),
                {"c": new_cik, "i": iid},
            )
    # home-bancfin typo fix: rename slug to home-bancshares + set CIK
    r = db.execute(
        text("SELECT institution_id, display_name, sec_cik FROM tracked_institutions WHERE institution_id='home-bancfin'"),
    ).first()
    if r:
        log.info("  home-bancfin: rename slug → home-bancshares, CIK=0001331520")
        # Check target doesn't exist
        target = db.execute(
            text("SELECT institution_id FROM tracked_institutions WHERE institution_id='home-bancshares'"),
        ).first()
        if apply and not target:
            # Update child tables to new slug, then the institution itself
            tbls = existing_tables(db)
            for child in FINANCE_CHILD_TABLES:
                if child in tbls:
                    db.execute(
                        text(f"UPDATE {child} SET institution_id='home-bancshares' WHERE institution_id='home-bancfin'"),
                    )
            if STOCK_TABLE in tbls:
                db.execute(
                    text(f"UPDATE {STOCK_TABLE} SET entity_id='home-bancshares' WHERE entity_id='home-bancfin' AND entity_type='finance'"),
                )
            db.execute(
                text(
                    "UPDATE tracked_institutions SET "
                    "institution_id='home-bancshares', "
                    "display_name='Home BancShares, Inc.', "
                    "sec_cik='0001331520' "
                    "WHERE institution_id='home-bancfin'"
                ),
            )
    if apply:
        db.commit()


def purge_capped_insider_trades(db, apply: bool):
    """Bug #4: the existing sec_insider_trades data was capped at 40 per
    institution by a now-missing ingest script. Wipe and rely on the new
    jobs/sync_insider_trades.py to repopulate without a cap."""
    log.info("=" * 60)
    log.info("Bug #4 — wipe capped insider-trades data")
    log.info("=" * 60)
    tables = existing_tables(db)
    if "sec_insider_trades" not in tables:
        log.info("  table missing, skipping")
        return 0
    n = db.execute(text("SELECT COUNT(*) FROM sec_insider_trades")).scalar() or 0
    log.info("  purging %d capped rows", n)
    if apply:
        db.execute(text("DELETE FROM sec_insider_trades"))
        db.commit()
    return n


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="actually write changes")
    parser.add_argument("--dry-run", action="store_true", help="show plan only (default)")
    parser.add_argument("--skip-enforcement", action="store_true")
    parser.add_argument("--skip-merge", action="store_true")
    parser.add_argument("--skip-cik", action="store_true")
    parser.add_argument("--skip-lobbying", action="store_true")
    parser.add_argument("--skip-insider", action="store_true")
    parser.add_argument("--skip-backfill", action="store_true")
    args = parser.parse_args()

    apply = args.apply and not args.dry_run
    log.info("Mode: %s (started at %s)", "APPLY" if apply else "DRY-RUN", datetime.utcnow().isoformat())

    db = SessionLocal()
    try:
        if not args.skip_enforcement:
            purge_regulatory_actions(db, apply)
        if not args.skip_merge:
            merge_finance_dupes(db, apply)
            fix_wrong_ciks(db, apply)
        if not args.skip_lobbying:
            dedupe_lobbying(db, apply)
        if not args.skip_backfill:
            backfill_ciks(db, apply)
        if not args.skip_insider:
            purge_capped_insider_trades(db, apply)
    finally:
        db.close()

    log.info("Done.")


if __name__ == "__main__":
    main()
