"""
Retroactive cleanup: strip HTML comments from all existing story bodies.

Earlier Opus prompts instructed the model to emit a metadata header like:
    <!-- WeThePeople Influence Journal story -->
    <!-- Generated: 2026-04-08T20:54:12+00:00 -->
    <!-- Story shape: company-focused -->
    <!-- Category: lobbying_spike -->

The frontend markdown renderer was showing those as visible prose to readers,
so the prompt rule was removed and the validator now rejects any story with
an HTML comment. This script fixes the already-stored rows.

For each story whose body contains '<!--':
  1. Strip every HTML comment with a single regex.
  2. If the original body carried '<!-- WeThePeople Influence Journal story -->'
     or '<!-- opus-generated -->', tag evidence.generator = 'opus' so the
     Opus daily-cap counter still finds it after cleanup.
  3. Commit.

Usage:
    python jobs/cleanup_story_html_comments.py          # apply changes
    python jobs/cleanup_story_html_comments.py --dry-run
"""

import argparse
import logging
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(os.path.join(str(ROOT), ".env"))

from models.database import SessionLocal
from models.stories_models import Story

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("cleanup_story_html_comments")

_HTML_COMMENT_RE = re.compile(r'<!--.*?-->', re.DOTALL)

OPUS_MARKERS = (
    "<!-- WeThePeople Influence Journal story -->",
    "<!-- opus-generated -->",
)


def strip_html_comments(text: str) -> str:
    if not text:
        return text
    cleaned = _HTML_COMMENT_RE.sub('', text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.lstrip('\n')


def main():
    parser = argparse.ArgumentParser(description="Strip HTML comments from all stories.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        dirty = (
            db.query(Story)
            .filter(Story.body.contains("<!--"))
            .all()
        )
        log.info("Found %d story rows containing HTML comments", len(dirty))

        cleaned_count = 0
        tagged_count = 0
        for s in dirty:
            original = s.body or ""
            was_opus = any(m in original for m in OPUS_MARKERS)
            new_body = strip_html_comments(original)
            if new_body == original:
                continue

            log.info("  id=%s slug=%s title=%r", s.id, s.slug, (s.title or "")[:60])
            if args.dry_run:
                cleaned_count += 1
                if was_opus:
                    tagged_count += 1
                continue

            s.body = new_body
            if was_opus:
                ev = s.evidence if isinstance(s.evidence, dict) else {}
                ev["generator"] = "opus"
                # Reassign to make SQLAlchemy's JSON mutation tracker notice.
                s.evidence = {**ev}
                tagged_count += 1
            cleaned_count += 1

        if args.dry_run:
            log.info("[dry-run] Would clean %d stories, tag %d as Opus", cleaned_count, tagged_count)
            return

        db.commit()
        log.info("Cleaned %d stories, tagged %d with evidence.generator='opus'", cleaned_count, tagged_count)
    finally:
        db.close()


if __name__ == "__main__":
    main()
