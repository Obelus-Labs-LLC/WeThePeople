"""
One-time script: Retract misattributed stories and flag suspicious ones.

Findings from editorial audit (2026-04-12):
- Story #223 (Avient) — Navient's $1.3B DoE contracts attributed to Avient (chemicals company)
- Story #224 (McGraw Hill) — S&P Global's financial lobbying mixed into McGraw Hill Education data
- Story #220 (Stride) — Stride Health and Strider Technologies data contaminating Stride Inc.

Suspicious (cross-sector double-counting but not factually wrong):
- Stories #118, #122, #133, #134, #136 — dual-sector companies counted in both sectors

Usage:
    python jobs/retract_misattributed_stories.py
    python jobs/retract_misattributed_stories.py --dry-run
"""

import sys
import os
import argparse
import logging
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from models.database import SessionLocal, Base, engine
from models.stories_models import Story, StoryCorrection
from sqlalchemy import text

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("retract_stories")


# ── Stories to retract (confirmed misattribution) ──

RETRACTIONS = [
    {
        "id": 223,
        "reason": (
            "RETRACTED: Entity misattribution. This story incorrectly attributed "
            "$1.3B in Department of Education student loan servicing contracts to "
            "Avient Corporation (a specialty chemicals/polymer company). The contracts "
            "belong to Navient Corporation. The error was caused by fuzzy name matching "
            "in the USASpending.gov data sync pipeline. Avient's actual government "
            "contracts total approximately $390K across DoD and NASA, consistent with "
            "a chemicals company. This story has been retracted pending data pipeline "
            "corrections to prevent similar entity confusion."
        ),
    },
    {
        "id": 224,
        "reason": (
            "RETRACTED: Entity data contamination. Approximately 53.8% of lobbying "
            "filings (57 of 106) attributed to McGraw Hill Education in this story "
            "actually belong to S&P Global Inc. (formerly McGraw Hill Financial), a "
            "completely separate company since 2013. The story's top lobbying issue, "
            "Financial Institutions/Investments/Securities ($2.0M), is S&P Global's "
            "lobbying, not the education publisher's. The error was caused by Senate "
            "LDA name matching conflating 'MCGRAW HILL FINANCIAL' with the 'mcgraw-hill' "
            "entity. This story has been retracted pending data decontamination."
        ),
    },
]

# ── Stories to add clarification notes (suspicious but not factually wrong) ──

CLARIFICATIONS = [
    {
        "id": 220,
        "note": (
            "CORRECTION: Data contamination identified. Approximately 30.7% of lobbying "
            "filings (39 of 127) attributed to Stride Inc. in this story include data "
            "from Stride Health Inc. (a health insurance startup, 23 filings/$280K) and "
            "Strider Technologies Inc. (an intelligence firm, 16 filings/$710K). The "
            "true Stride Inc. lobbying total is approximately $5.83M, not $6.8M. The "
            "defense lobbying issue allocation is also inflated by ~$710K from Strider "
            "Technologies. The Senate LDA name matching has been tightened to prevent "
            "similar contamination."
        ),
    },
    {
        "id": 134,
        "note": (
            "CLARIFICATION: The $1.2B aggregate lobbying total across 7 sectors includes "
            "some double-counting of companies that operate in multiple sectors (e.g., "
            "Boeing appears in both defense and transportation, Comcast in both tech and "
            "telecom). The per-sector figures are individually accurate, but the cross-sector "
            "sum overstates the unique total. A future update will deduplicate cross-sector "
            "aggregations."
        ),
    },
    {
        "id": 136,
        "note": (
            "CLARIFICATION: The $71.7M budget/appropriations lobbying total across 7 sectors "
            "includes some double-counting of companies that operate in multiple sectors. "
            "Per-sector figures are individually accurate, but the aggregate overstates the "
            "unique total."
        ),
    },
]


def ensure_tables(db):
    """Create story_corrections table if it doesn't exist."""
    try:
        db.execute(text(
            "CREATE TABLE IF NOT EXISTS story_corrections ("
            "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "  story_id INTEGER NOT NULL,"
            "  correction_type TEXT NOT NULL,"
            "  description TEXT NOT NULL,"
            "  corrected_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
            "  corrected_by TEXT"
            ")"
        ))
        db.commit()
    except Exception as e:
        log.warning("Table creation check: %s", e)
        db.rollback()

    # Add new columns to stories if missing
    for col, coldef in [
        ("correction_history", "TEXT DEFAULT '[]'"),
        ("retraction_reason", "TEXT"),
        ("data_date_range", "TEXT"),
        ("data_freshness_at", "DATETIME"),
        ("ai_generated", "TEXT DEFAULT 'algorithmic'"),
    ]:
        try:
            db.execute(text("ALTER TABLE stories ADD COLUMN %s %s" % (col, coldef)))
            db.commit()
            log.info("Added column stories.%s", col)
        except Exception:
            db.rollback()  # Column likely already exists


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    ensure_tables(db)

    # ── Retract misattributed stories ──
    for entry in RETRACTIONS:
        story = db.query(Story).filter(Story.id == entry["id"]).first()
        if not story:
            log.warning("Story #%d not found, skipping", entry["id"])
            continue

        if args.dry_run:
            log.info("[DRY-RUN] Would retract #%d: %s", story.id, story.title)
            continue

        story.status = "retracted"
        story.retraction_reason = entry["reason"]

        correction = StoryCorrection(
            story_id=story.id,
            correction_type="retraction",
            description=entry["reason"],
            corrected_by="editorial",
        )
        db.add(correction)
        log.info("RETRACTED #%d: %s", story.id, story.title)

    # ── Add clarification notes to suspicious stories ──
    for entry in CLARIFICATIONS:
        story = db.query(Story).filter(Story.id == entry["id"]).first()
        if not story:
            log.warning("Story #%d not found, skipping", entry["id"])
            continue

        if args.dry_run:
            log.info("[DRY-RUN] Would add clarification to #%d: %s", story.id, story.title)
            continue

        correction = StoryCorrection(
            story_id=story.id,
            correction_type="clarification",
            description=entry["note"],
            corrected_by="editorial",
        )
        db.add(correction)
        log.info("CLARIFICATION added to #%d: %s", story.id, story.title)

    if not args.dry_run:
        try:
            db.commit()
            log.info("All retractions and clarifications committed.")
        except Exception as e:
            db.rollback()
            log.error("Failed to commit: %s", e)

    # ── Update CHECK constraint to allow 'retracted' status ──
    # SQLite doesn't support ALTER CONSTRAINT, but the model already defines it
    # and new rows will be validated by SQLAlchemy. Existing constraint is soft.

    db.close()
    log.info("Done.")


if __name__ == "__main__":
    main()
