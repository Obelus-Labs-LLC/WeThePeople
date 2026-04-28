"""Story dedup gate.

Refuses to invoke the research agent when an essentially-identical
story is already in the queue. Saves a research-agent run (which costs
real money under the $7/story cap) when a recent draft / published
story already covers the same entity, pattern, and date range.

The check runs AFTER candidate selection but BEFORE the agent is
called. If dedup blocks the chosen candidate, the orchestrator either
falls back to the second-best candidate from the rotating selector or
logs "no story today" if nothing else is eligible.

Key rule: dedup ONLY applies to the same `(entity_id, pattern,
date_range)` triple. Two different lobbying-spike stories about the
same company at different times are fine. A second take on the exact
same data slice is not.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# Dedup window. A story about the same (entity, pattern, date_range)
# triple within the last N days blocks a new run. After this window,
# if the underlying data has materially changed, a fresh story is fine.
DEDUP_WINDOW_DAYS = 30


def _date_range_key(date_range: Optional[Any]) -> str:
    """Normalise a date_range candidate field to a stable string key.

    Accepts (start, end) tuple/list, ISO string, or None. None is
    treated as a sentinel meaning "no specific range" and uses the
    literal string "none" so two range-less stories about the same
    entity/pattern still dedup against each other.
    """
    if date_range is None:
        return "none"
    if isinstance(date_range, (list, tuple)) and len(date_range) >= 2:
        start = str(date_range[0])
        end = str(date_range[1])
        return f"{start}..{end}"
    return str(date_range)


def is_fresh(
    db: Session,
    candidate: dict[str, Any],
    *,
    window_days: int = DEDUP_WINDOW_DAYS,
) -> tuple[bool, Optional[str]]:
    """Return (is_fresh, blocking_story_slug).

    is_fresh=True  → safe to run the agent on this candidate
    is_fresh=False → an existing story already covers it; skip

    The blocking_story_slug is included for logging and for the
    orchestrator's fallback-candidate path: it can tell the user
    "skipped X because we already published Y on the same data."
    """
    entity_id = str(candidate.get("entity_id") or "")
    pattern = (candidate.get("category") or candidate.get("signal") or "").lower()
    date_key = _date_range_key(candidate.get("date_range"))

    if not entity_id or not pattern:
        # Without an entity AND a pattern there's nothing to dedup
        # against. Let it through; downstream gates will reject if it's
        # too thin.
        return True, None

    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

    rows = db.execute(
        text(
            "SELECT id, slug, category, sector, entity_ids, evidence, "
            "       COALESCE(published_at, created_at) AS ts "
            "FROM stories "
            "WHERE COALESCE(published_at, created_at) >= :cutoff "
            "  AND status IN ('draft', 'published') "
            "  AND LOWER(category) = :pattern "
            "ORDER BY ts DESC"
        ),
        {"cutoff": cutoff, "pattern": pattern},
    ).fetchall()

    for r in rows:
        # Match on entity_id appearing in the existing story's entity_ids list.
        eids = r.entity_ids
        if isinstance(eids, str):
            import json as _json
            try:
                eids = _json.loads(eids)
            except (ValueError, TypeError):
                eids = []
        if not isinstance(eids, list):
            continue
        if entity_id not in [str(e) for e in eids]:
            continue

        # Check date_range from the existing story's evidence object.
        ev = r.evidence
        if isinstance(ev, str):
            import json as _json
            try:
                ev = _json.loads(ev)
            except (ValueError, TypeError):
                ev = {}
        if not isinstance(ev, dict):
            ev = {}

        existing_range = ev.get("date_range") or ev.get("data_date_range")
        existing_key = _date_range_key(existing_range)
        if existing_key == date_key:
            logger.info(
                "dedup_gate: candidate (%s, %s, %s) blocked by existing story #%s '%s'",
                entity_id, pattern, date_key, r.id, r.slug,
            )
            return False, r.slug

    return True, None
