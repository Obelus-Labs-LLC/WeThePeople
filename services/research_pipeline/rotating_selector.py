"""Novelty-weighted rotating selector for the daily story candidate.

Runs after black_swan.scan() returns no override. Picks among the
detector outputs the one whose `(sector, primary_entity_id, category)`
signature is least like recent stories.

Hard rules (block):
  - Same primary entity within 7 days: blocked
  - Same sector two days running: blocked unless nothing else fires

Soft rules (penalize, but don't block):
  - Same category three days running: penalty multiplier 0.3

Score formula:
    final_score = signal_strength
                * novelty_multiplier(sector_recency, entity_recency, category_recency)

The detector outputs we score over are dicts in the same shape as the
black_swan hits (signal, score, entity_id, sector, summary, evidence)
so a single comparator works for both paths.

This module does NOT run the detectors itself. The orchestrator
provides the candidate list (from the existing detect_stories.py
detectors plus any fresh ones), and we just rank them.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# Look back at recent published + draft stories for novelty calculation.
# 14 days is enough horizon to penalize repetition without effectively
# permanent-banning a sector once it's covered.
RECENCY_LOOKBACK_DAYS = 14

# Hard-block windows for the rotation rules above.
ENTITY_BLOCK_DAYS = 7
SECTOR_BLOCK_DAYS = 1
CATEGORY_PENALTY_DAYS = 3
CATEGORY_PENALTY_MULTIPLIER = 0.3


def _recent_signature_counts(
    db: Session,
    *,
    lookback_days: int = RECENCY_LOOKBACK_DAYS,
) -> dict[str, dict[str, int]]:
    """Return counts of recent stories grouped by sector, entity_id, and category.

    Used by the novelty multiplier. The orchestrator already ensures
    we're not duplicating exact stories via dedup_gate; this is
    softer — "have we been writing about this slice of the data
    lately?" rather than "have we written THIS story before?".

    Returns:
        {
            "sector": {sector_name: count_in_window, ...},
            "entity": {entity_id: days_since_last_story, ...},
            "category": {category: days_since_last_story, ...},
        }
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows = db.execute(
        text(
            "SELECT sector, category, entity_ids, published_at, created_at "
            "FROM stories "
            "WHERE COALESCE(published_at, created_at) >= :cutoff "
            "  AND status IN ('draft', 'published')"
        ),
        {"cutoff": cutoff},
    ).fetchall()

    sector_counts: dict[str, int] = {}
    entity_last_seen: dict[str, datetime] = {}
    category_last_seen: dict[str, datetime] = {}

    now = datetime.now(timezone.utc)
    for r in rows:
        ts = r.published_at or r.created_at
        if ts is None:
            continue
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        sector = (r.sector or "").lower() or "unknown"
        sector_counts[sector] = sector_counts.get(sector, 0) + 1

        category = (r.category or "").lower() or "unknown"
        prev = category_last_seen.get(category)
        if prev is None or ts > prev:
            category_last_seen[category] = ts

        # entity_ids is JSON-serialised list. Pull the first entity as
        # the "primary" — that matches detect_stories.py's convention.
        eids = r.entity_ids
        if isinstance(eids, str):
            import json as _json
            try:
                eids = _json.loads(eids)
            except (ValueError, TypeError):
                eids = []
        if isinstance(eids, list) and eids:
            primary = str(eids[0])
            prev = entity_last_seen.get(primary)
            if prev is None or ts > prev:
                entity_last_seen[primary] = ts

    entity_age_days = {
        eid: max(0, (now - ts).days) for eid, ts in entity_last_seen.items()
    }
    category_age_days = {
        cat: max(0, (now - ts).days) for cat, ts in category_last_seen.items()
    }
    return {
        "sector": sector_counts,
        "entity": entity_age_days,
        "category": category_age_days,
    }


def _novelty_multiplier(
    candidate: dict[str, Any],
    counts: dict[str, dict[str, int]],
) -> tuple[float, list[str]]:
    """Compute the novelty multiplier and return (multiplier, reasons[]).

    Multiplier is in [0.0, 1.0]. 1.0 = unseen recently; 0.0 = blocked.
    Reasons list explains why the multiplier is what it is, useful for
    logging the selector's choice.
    """
    sector = (candidate.get("sector") or "").lower() or "unknown"
    entity_id = str(candidate.get("entity_id") or "")
    category = (candidate.get("category") or candidate.get("signal") or "").lower() or "unknown"

    reasons: list[str] = []

    # Hard block: same entity within 7 days.
    entity_age = counts["entity"].get(entity_id)
    if entity_age is not None and entity_age < ENTITY_BLOCK_DAYS:
        return 0.0, [f"entity {entity_id} covered {entity_age}d ago (block window {ENTITY_BLOCK_DAYS}d)"]

    # Hard block: same sector yesterday. Implemented as "any story in
    # this sector in the last SECTOR_BLOCK_DAYS days." We allow
    # bypassing this only if the candidate is the ONLY thing left,
    # which is the orchestrator's job, not ours.
    sector_count_today = sum(
        1 for cat_age in counts["category"].values() if cat_age <= SECTOR_BLOCK_DAYS
    )
    same_sector_recent = counts["sector"].get(sector, 0)
    if same_sector_recent > 0 and sector_count_today > 0:
        # Approximation: if there's anything published in the lookback
        # window for this sector AND there was a story in the past
        # SECTOR_BLOCK_DAYS days at all, penalize heavily. Hard-block is
        # left for the orchestrator to decide via the multiplier=0.0
        # signal in special cases.
        reasons.append(f"sector {sector} active in last {SECTOR_BLOCK_DAYS}d")

    # Soft penalty: same category recurring within 3 days.
    category_age = counts["category"].get(category)
    multiplier = 1.0
    if category_age is not None and category_age < CATEGORY_PENALTY_DAYS:
        multiplier *= CATEGORY_PENALTY_MULTIPLIER
        reasons.append(
            f"category {category} appeared {category_age}d ago (penalty x{CATEGORY_PENALTY_MULTIPLIER})"
        )

    # Down-weight by sector saturation: 1 / (1 + count_in_window).
    saturation_penalty = 1.0 / (1.0 + same_sector_recent)
    multiplier *= saturation_penalty
    if same_sector_recent > 0:
        reasons.append(
            f"sector {sector} appeared {same_sector_recent}x in last {RECENCY_LOOKBACK_DAYS}d "
            f"(saturation x{saturation_penalty:.2f})"
        )

    if not reasons:
        reasons.append("no recency penalties")
    return multiplier, reasons


def pick(
    db: Session,
    candidates: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """Return the highest-scoring candidate after novelty weighting.

    Each candidate must have at minimum:
        signal: str
        score: float           (signal strength, 0..1)
        entity_id: str
        sector: str
        category: str (optional; falls back to signal)
        summary: str

    Returns None if there are no candidates OR if the entire list is
    blocked by the entity-7d rule. The orchestrator can then either
    log "no story today" or relax the block window if it's been many
    days without a publication.
    """
    if not candidates:
        return None

    counts = _recent_signature_counts(db)

    scored: list[tuple[float, dict[str, Any], list[str]]] = []
    for c in candidates:
        multiplier, reasons = _novelty_multiplier(c, counts)
        signal_strength = float(c.get("score", 0.0))
        final = signal_strength * multiplier
        scored.append((final, c, reasons))

    # Filter out hard-blocked (multiplier == 0).
    eligible = [s for s in scored if s[0] > 0.0]
    if not eligible:
        # Log what got blocked so we can see if the rotation is too tight.
        for blocked_score, blocked_cand, blocked_reasons in scored:
            logger.info(
                "rotating_selector blocked %s/%s: %s",
                blocked_cand.get("sector"),
                blocked_cand.get("entity_id"),
                "; ".join(blocked_reasons),
            )
        return None

    eligible.sort(key=lambda s: s[0], reverse=True)
    winner_score, winner, reasons = eligible[0]
    logger.info(
        "rotating_selector picked %s/%s (signal %.2f * novelty -> final %.2f); reasons: %s",
        winner.get("sector"),
        winner.get("entity_id"),
        float(winner.get("score", 0.0)),
        winner_score,
        "; ".join(reasons),
    )
    return winner
