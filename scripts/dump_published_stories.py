#!/usr/bin/env python3
"""
Dump published + archived stories from the WTP database to a JSON
file the audit script can read.

Output:
    .planning/published_stories.json

Reads from the same DATABASE_URL the FastAPI app uses (defaults to
sqlite:///./wethepeople.db). Run on the operator's machine after a
fresh `git pull` from prod, OR run on prod and copy the file back.
The audit script (`scripts/audit_published_stories.py`) is the next
step in the workflow.

Story status filter: by default includes both `published` and
`archived` so the audit covers stories that are no longer visible
on the journal but might re-surface during the rebuild. Pass
`--status published` to scope tighter.

Usage
-----
    python scripts/dump_published_stories.py
    python scripts/dump_published_stories.py --status published
    python scripts/dump_published_stories.py --output /tmp/stories.json
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.stories_models import Story  # noqa: E402

load_dotenv()

DEFAULT_OUTPUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".planning",
    "published_stories.json",
)


def _serialize_story(s: Story) -> dict:
    """Flatten a Story row to the dict shape the audit script expects.

    The audit checks reference fields by name: title, slug, body,
    summary, verification_tier, ai_generated, data_date_range,
    entity_ids, data_sources, evidence, published_at, etc. Use the
    model's column names verbatim.
    """
    return {
        "id": s.id,
        "title": s.title,
        "slug": s.slug,
        "summary": s.summary,
        "body": s.body,
        "category": s.category,
        "sector": s.sector,
        "entity_ids": s.entity_ids if isinstance(s.entity_ids, list) else (
            json.loads(s.entity_ids) if isinstance(s.entity_ids, str) and s.entity_ids else []
        ),
        "data_sources": s.data_sources if isinstance(s.data_sources, list) else (
            json.loads(s.data_sources) if isinstance(s.data_sources, str) and s.data_sources else []
        ),
        "evidence": s.evidence if isinstance(s.evidence, dict) else (
            json.loads(s.evidence) if isinstance(s.evidence, str) and s.evidence else {}
        ),
        "status": s.status,
        "verification_score": s.verification_score,
        "verification_tier": s.verification_tier,
        "ai_generated": s.ai_generated,
        "data_date_range": s.data_date_range,
        "retraction_reason": s.retraction_reason,
        "published_at": s.published_at.isoformat() if s.published_at else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", default=DEFAULT_OUTPUT,
        help=f"Output path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--status", default="all",
        choices=("all", "published", "archived"),
        help="Story status filter (default: all = published + archived)",
    )
    args = parser.parse_args()

    db_url = os.getenv("DATABASE_URL") or os.getenv("WTP_DB_URL") or "sqlite:///./wethepeople.db"
    print(f"DB: {db_url.split('@')[-1]}")

    engine = create_engine(db_url, echo=False)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        q = session.query(Story)
        if args.status == "published":
            q = q.filter(Story.status == "published")
        elif args.status == "archived":
            q = q.filter(Story.status == "archived")
        else:
            q = q.filter(Story.status.in_(["published", "archived"]))
        stories = q.all()
        rows = [_serialize_story(s) for s in stories]
    finally:
        session.close()

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "dumped_at": datetime.utcnow().isoformat() + "Z",
        "status_filter": args.status,
        "story_count": len(rows),
        "stories": rows,
    }
    out_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    print(f"Wrote {len(rows)} stories to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
