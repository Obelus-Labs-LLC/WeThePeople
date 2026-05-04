"""
One-shot migration to rewrite stored congress.gov URLs that use the broken
short-form bill_type slug.

Background
----------
Pre-2026-04 the codebase had three sites that built congress.gov URLs as
`{bill_type}-bill/{number}` (e.g. `hr-bill/5516`, `s-bill/123`). congress.gov
rejects that format with "invalid request parameters". The correct slug is
`house-bill` for HR, `senate-bill` for S, plus longer slugs for joint /
concurrent / simple resolutions.

Once `utils/congress_urls.py` was extracted and all builders migrated, the
stored URLs in `source_documents.url` were left with the old format. To
keep links clickable, `routers/politics._normalize_action_source_url`
runtime-rewrites them on every action read.

This migration:
  1. Finds every `source_documents` row whose URL matches the broken pattern
  2. Looks up the associated Action (via `actions.source_id`) for bill metadata
  3. Rewrites the URL to the canonical form via `utils.congress_urls.congress_bill_url`
  4. Leaves the runtime normalization in place for safety (idempotent)

The runtime normalizer remains as a defense-in-depth fallback: a future
ingest writing the broken format would still surface correctly to users
even if this migration was run yesterday.

Usage
-----
    python scripts/backfill_normalize_congress_urls.py --dry-run
    python scripts/backfill_normalize_congress_urls.py --apply
"""

import argparse
import logging
import os
import re
import sys
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SourceDocument, Action  # noqa: E402
from utils.congress_urls import congress_bill_url  # noqa: E402

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("backfill_normalize_congress_urls")

DB_URL = os.getenv("DATABASE_URL", "sqlite:///wethepeople.db")

# Same pattern used at runtime in routers/politics.py.
_BROKEN_BILL_URL_PATTERN = re.compile(
    r"https?://www\.congress\.gov/bill/.*?/(hr|s|hjres|sjres|hconres|sconres|hres|sres)-bill/",
    re.IGNORECASE,
)

# Some legacy URLs additionally have the wrong congress segment
# (e.g. `21-congress` instead of `21st-congress`). The replacement
# logic via `congress_bill_url` produces the ordinal-correct version
# unconditionally.

# Also catch the fallback "{n}th-congress" form (works) so we don't
# misclassify it as needing rebuild — only short-slug URLs are broken.


def _rebuild(url: str, action: Optional[Action]) -> Optional[str]:
    """Try to rebuild a broken URL using its associated Action's bill metadata.

    Returns the new URL if we have enough info; None if we cannot rebuild
    (caller should leave the URL alone in that case).
    """
    if not _BROKEN_BILL_URL_PATTERN.search(url):
        return None
    if action is None:
        return None
    rebuilt = congress_bill_url(
        getattr(action, "bill_congress", None),
        getattr(action, "bill_type", None),
        getattr(action, "bill_number", None),
    )
    return rebuilt or None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true",
                       help="Report what would change without writing")
    group.add_argument("--apply", action="store_true",
                       help="Write the canonical URLs back to source_documents.url")
    parser.add_argument("--limit", type=int, default=0,
                        help="Cap the number of rows examined (0 = no cap)")
    args = parser.parse_args()

    engine = create_engine(DB_URL, echo=False)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # Match the broken pattern at the SQL level for efficiency. SQLite
        # LIKE doesn't support regex, so we use multiple OR conditions —
        # one per slug. The runtime regex still validates each match.
        slug_likes = [
            f"%/hr-bill/%", f"%/s-bill/%",
            f"%/hjres-bill/%", f"%/sjres-bill/%",
            f"%/hconres-bill/%", f"%/sconres-bill/%",
            f"%/hres-bill/%", f"%/sres-bill/%",
        ]
        from sqlalchemy import or_
        candidates_q = (
            session.query(SourceDocument)
            .filter(or_(*[SourceDocument.url.ilike(s) for s in slug_likes]))
            .order_by(SourceDocument.id)
        )
        if args.limit:
            candidates_q = candidates_q.limit(args.limit)
        candidates = candidates_q.all()

        log.info("Found %d candidate broken-URL rows in source_documents", len(candidates))

        if not candidates:
            log.info("Nothing to do.")
            return 0

        # Batch-fetch the actions that reference these source_ids. One
        # SourceDocument may be referenced by multiple Actions; we just
        # need any one Action with bill metadata to rebuild from.
        sd_ids = [c.id for c in candidates]
        action_rows = (
            session.query(Action)
            .filter(Action.source_id.in_(sd_ids))
            .filter(Action.bill_congress.isnot(None))
            .filter(Action.bill_type.isnot(None))
            .filter(Action.bill_number.isnot(None))
            .all()
        )
        # Pick the first Action per source_id with full bill metadata.
        actions_by_source: dict[int, Action] = {}
        for a in action_rows:
            if a.source_id not in actions_by_source:
                actions_by_source[a.source_id] = a

        rewritten = 0
        skipped_no_action = 0
        skipped_unparseable = 0
        sample_rewrites: list[tuple[str, str]] = []

        for sd in candidates:
            if not _BROKEN_BILL_URL_PATTERN.search(sd.url or ""):
                # Defensive: SQL LIKE matched but regex didn't. Skip.
                continue
            action = actions_by_source.get(sd.id)
            new_url = _rebuild(sd.url, action)
            if new_url is None:
                if action is None:
                    skipped_no_action += 1
                else:
                    skipped_unparseable += 1
                continue

            if new_url == sd.url:
                continue

            if len(sample_rewrites) < 5:
                sample_rewrites.append((sd.url, new_url))

            if args.apply:
                sd.url = new_url
            rewritten += 1

        log.info("Rewrites planned: %d", rewritten)
        log.info("Skipped (no associated Action with bill metadata): %d", skipped_no_action)
        log.info("Skipped (could not rebuild even with metadata): %d", skipped_unparseable)
        for old, new in sample_rewrites:
            log.info("  %s\n    -> %s", old, new)

        if args.apply:
            session.commit()
            log.info("Committed %d URL rewrites.", rewritten)
        else:
            log.info("Dry run — no changes written. Re-run with --apply to commit.")

        return 0
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
