"""
Story Detection Job - Automated Data Story Generation

Scans data sources for patterns and generates data-driven stories.
The full 15-pattern detection engine is in the wtp-core private package.
Without wtp-core, a basic 2-pattern detector runs instead.

Usage:
    python jobs/detect_stories.py
    python jobs/detect_stories.py --dry-run
    python jobs/detect_stories.py --max-stories 3
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from wtp_core.detection.detect_stories import main
except ImportError:
    # Stub: basic story detection without wtp-core
    import argparse
    import json
    import logging
    import os
    from datetime import datetime, timezone

    from models.database import SessionLocal
    from models.stories_models import Story
    from sqlalchemy import text
    from utils.db_compat import now_minus_days, limit_sql

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger = logging.getLogger(__name__)

    def main():
        parser = argparse.ArgumentParser(description="Detect and generate data stories")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--max-stories", type=int, default=5)
        args = parser.parse_args()

        logger.info("Running basic story detection (install wtp-core for full 15-pattern engine)")

        db = SessionLocal()
        try:
            # Basic pattern: find companies with large contracts
            sql = text(f"""
                SELECT 'defense' as sector, company_id, SUM(award_amount) as total
                FROM defense_government_contracts
                GROUP BY company_id
                HAVING total > 1000000000
                ORDER BY total DESC
                {limit_sql(5)}
            """)
            rows = db.execute(sql).fetchall()
            logger.info("Found %d contract windfall candidates", len(rows))

            if args.dry_run:
                for r in rows:
                    logger.info("[DRY-RUN] %s: $%.0f in contracts", r[1], float(r[2]))
                return

            logger.info("Story generation requires wtp-core package for Claude integration.")
            logger.info("Install: pip install git+ssh://git@github.com/Obelus-Labs-LLC/wtp-core.git")
        finally:
            db.close()


if __name__ == "__main__":
    raise SystemExit(main() or 0)
