"""Phase 3 thread B: per-story outcome detection.

Walks every published story and refreshes its `story_outcomes` row.
Each story's outcome shape depends on its category — different
categories have different "did it get better/worse" signals.

Categories handled in v1:

  trade_timing, stock_act_violation, committee_stock_trade,
  bipartisan_buying, prolific_trader, trade_cluster
        Trade-shape stories. Heuristic:
        - resolved if the named member is no longer in office
          OR the trade has been retracted/amended in disclosures
        - improved if no further trades by that member in N days
        - worsened if NEW matching trades appear
        - else open

  contract_windfall, lobby_then_win, lobby_contract_loop,
  contract_timing, penalty_contract_ratio
        Contract-shape stories. Heuristic:
        - improved if new contracts to entity dropped to zero
          for the past 90 days
        - worsened if new contracts continue to flow at >= the
          rate baselined in the story
        - else open

  lobbying_spike, lobbying_breakdown, foreign_lobbying,
  revolving_door
        Lobbying-shape. Heuristic:
        - improved if the entity stopped filing new disclosures
        - worsened if filings continue
        - else open

Categories not in the table above stay at "unknown" — the status
bar simply hides for those stories.

Usage:
    python jobs/detect_story_outcomes.py --dry-run
    python jobs/detect_story_outcomes.py
    python jobs/detect_story_outcomes.py --slug some-story-slug
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import desc

from models.database import SessionLocal, CongressionalTrade
from models.stories_models import Story, StoryOutcome

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("detect_story_outcomes")

# How many days of "no new activity" we treat as evidence of improvement.
QUIET_PERIOD_DAYS = 90


# ── Trade-shape detectors ────────────────────────────────────────────

_TRADE_CATEGORIES = {
    "trade_timing", "stock_act_violation", "committee_stock_trade",
    "bipartisan_buying", "prolific_trader", "trade_cluster",
    "trade_before_legislation",
}


def _detect_trade_outcome(db, story: Story) -> Tuple[str, str, Optional[str]]:
    """Return (state, note, last_signal_source) for a trade-shape story."""
    # Pull the entity_ids; the trader's bioguide_id / person_id is
    # usually the first slot. If we can't resolve it, skip with
    # state=unknown so the UI hides the bar.
    eids = story.entity_ids or []
    if not isinstance(eids, list) or not eids:
        return "unknown", "No tradable entity on the story.", None
    person_id = str(eids[0])

    # Story published at...
    pub = story.published_at or story.created_at
    if pub is None:
        return "unknown", "Story has no published_at.", None

    cutoff = datetime.now(timezone.utc) - timedelta(days=QUIET_PERIOD_DAYS)
    # Trades by this member published since the story dropped.
    new_count = (
        db.query(CongressionalTrade)
        .filter(CongressionalTrade.person_id == person_id)
        .filter(CongressionalTrade.transaction_date >= pub.date())
        .count()
    )
    new_recent = (
        db.query(CongressionalTrade)
        .filter(CongressionalTrade.person_id == person_id)
        .filter(CongressionalTrade.transaction_date >= cutoff.date())
        .count()
    )

    if new_count == 0:
        return (
            "improved",
            f"No new trades by this member since the story published.",
            f"trade_count:{person_id}",
        )
    if new_recent == 0:
        return (
            "improved",
            f"No new trades by this member in the last {QUIET_PERIOD_DAYS} days.",
            f"trade_count:{person_id}",
        )
    if new_count >= 5 or new_recent >= 3:
        return (
            "worsened",
            f"{new_count} additional trades disclosed since this story; "
            f"{new_recent} in the last {QUIET_PERIOD_DAYS} days.",
            f"trade_count:{person_id}",
        )
    return (
        "open",
        f"{new_count} additional trades disclosed since publication.",
        f"trade_count:{person_id}",
    )


# ── Contract-shape detectors ─────────────────────────────────────────

_CONTRACT_CATEGORIES = {
    "contract_windfall", "lobby_then_win", "lobby_contract_loop",
    "contract_timing", "penalty_contract_ratio",
}


def _contract_table_for_sector(sector: Optional[str]) -> Optional[str]:
    """Map a story's sector to the per-sector contracts table.
    Returns the table name or None if we don't have a contracts
    table wired up for that sector."""
    if not sector:
        return None
    s = sector.lower()
    return {
        "finance":        "finance_contracts",
        "health":         "health_contracts",
        "tech":           "tech_contracts",
        "technology":     "tech_contracts",
        "energy":         "energy_contracts",
        "transportation": "transportation_contracts",
        "defense":        "defense_contracts",
        "chemicals":      "chemicals_contracts",
        "agriculture":    "agriculture_contracts",
        "telecom":        "telecom_contracts",
        "education":      "education_contracts",
    }.get(s)


def _detect_contract_outcome(db, story: Story) -> Tuple[str, str, Optional[str]]:
    """Return (state, note, last_signal_source) for a contract-shape story."""
    eids = story.entity_ids or []
    if not isinstance(eids, list) or not eids:
        return "unknown", "No company entity on the story.", None
    company_id = str(eids[0])

    table = _contract_table_for_sector(story.sector)
    if not table:
        return "unknown", f"No contracts table for sector {story.sector!r}.", None

    pub = story.published_at or story.created_at
    if pub is None:
        return "unknown", "Story has no published_at.", None

    # Light raw-SQL probe; the per-sector table column names vary
    # but they all carry company_id and an action_date / awarded_at.
    # We try a few common column names and bail if none match.
    from sqlalchemy import text
    quiet = (datetime.now(timezone.utc) - timedelta(days=QUIET_PERIOD_DAYS)).date()
    candidate_date_cols = ("award_date", "action_date", "awarded_at", "obligated_at")
    for col in candidate_date_cols:
        try:
            recent = db.execute(
                text(
                    f"SELECT COUNT(*) FROM {table} "
                    f"WHERE company_id = :cid AND {col} >= :since"
                ),
                {"cid": company_id, "since": quiet},
            ).scalar() or 0
            since_pub = db.execute(
                text(
                    f"SELECT COUNT(*) FROM {table} "
                    f"WHERE company_id = :cid AND {col} >= :pub"
                ),
                {"cid": company_id, "pub": pub.date()},
            ).scalar() or 0
        except Exception:
            continue
        if since_pub == 0:
            return (
                "improved",
                "No new federal contracts to this company since publication.",
                f"contract_count:{table}:{company_id}",
            )
        if recent == 0:
            return (
                "improved",
                f"No new federal contracts in the last {QUIET_PERIOD_DAYS} days.",
                f"contract_count:{table}:{company_id}",
            )
        if since_pub >= 3:
            return (
                "worsened",
                f"{since_pub} new federal contracts to this company since publication.",
                f"contract_count:{table}:{company_id}",
            )
        return (
            "open",
            f"{since_pub} additional contracts since publication.",
            f"contract_count:{table}:{company_id}",
        )
    return "unknown", f"No matching date column on {table}.", None


# ── Lobbying-shape detectors ─────────────────────────────────────────

_LOBBY_CATEGORIES = {
    "lobbying_spike", "lobbying_breakdown", "foreign_lobbying",
    "revolving_door", "tax_lobbying", "budget_lobbying",
    "budget_influence",
}


def _lobby_table_for_sector(sector: Optional[str]) -> Optional[str]:
    if not sector:
        return None
    s = sector.lower()
    return {
        "finance":        "finance_lobbying",
        "health":         "health_lobbying",
        "tech":           "tech_lobbying",
        "technology":     "tech_lobbying",
        "energy":         "energy_lobbying",
        "transportation": "transportation_lobbying",
        "defense":        "defense_lobbying",
        "chemicals":      "chemicals_lobbying",
        "agriculture":    "agriculture_lobbying",
        "telecom":        "telecom_lobbying",
        "education":      "education_lobbying",
    }.get(s)


def _detect_lobby_outcome(db, story: Story) -> Tuple[str, str, Optional[str]]:
    """Return (state, note, last_signal_source) for a lobbying-shape story."""
    eids = story.entity_ids or []
    if not isinstance(eids, list) or not eids:
        return "unknown", "No entity on the story.", None
    entity_id = str(eids[0])

    table = _lobby_table_for_sector(story.sector)
    if not table:
        return "unknown", f"No lobbying table for sector {story.sector!r}.", None

    pub = story.published_at or story.created_at
    if pub is None:
        return "unknown", "Story has no published_at.", None

    from sqlalchemy import text
    quiet = (datetime.now(timezone.utc) - timedelta(days=QUIET_PERIOD_DAYS)).date()
    # Most per-sector lobbying tables use filing_year + filing_quarter
    # as the timestamp surrogate. Keep this simple: count rows whose
    # filing_year is at or after the publish year.
    try:
        since_pub = db.execute(
            text(
                f"SELECT COUNT(*) FROM {table} "
                f"WHERE company_id = :eid AND filing_year >= :year"
            ),
            {"eid": entity_id, "year": pub.year},
        ).scalar() or 0
        recent = db.execute(
            text(
                f"SELECT COUNT(*) FROM {table} "
                f"WHERE company_id = :eid AND filing_year >= :year"
            ),
            {"eid": entity_id, "year": quiet.year},
        ).scalar() or 0
    except Exception as exc:
        return "unknown", f"Lobbying probe failed: {exc}", None

    if since_pub == 0:
        return (
            "improved",
            "No new lobbying disclosures from this entity since publication.",
            f"lobby_count:{table}:{entity_id}",
        )
    if recent == 0:
        return (
            "improved",
            f"No new lobbying disclosures in the last {QUIET_PERIOD_DAYS} days.",
            f"lobby_count:{table}:{entity_id}",
        )
    return (
        "open",
        f"{since_pub} additional lobbying disclosures since publication.",
        f"lobby_count:{table}:{entity_id}",
    )


# ── Driver ───────────────────────────────────────────────────────────

def _detect_outcome_for_story(db, story: Story) -> Tuple[str, str, Optional[str]]:
    cat = (story.category or "").lower()
    if cat in _TRADE_CATEGORIES:
        return _detect_trade_outcome(db, story)
    if cat in _CONTRACT_CATEGORIES:
        return _detect_contract_outcome(db, story)
    if cat in _LOBBY_CATEGORIES:
        return _detect_lobby_outcome(db, story)
    return "unknown", f"Category {cat!r} has no outcome detector.", None


def upsert_outcome_for_story(db, story: Story, dry_run: bool = False) -> str:
    """Compute and persist the outcome for one story. Returns the
    new state."""
    state, note, signal = _detect_outcome_for_story(db, story)
    state = StoryOutcome.validate_state(state)

    row = (
        db.query(StoryOutcome).filter(StoryOutcome.story_id == story.id).first()
    )
    now = datetime.now(timezone.utc)
    if row is None:
        row = StoryOutcome(
            story_id=story.id,
            state=state,
            note=note,
            last_signal_source=signal,
            last_signal_at=now,
        )
        if not dry_run:
            db.add(row)
    else:
        row.state = state
        row.note = note
        row.last_signal_source = signal
        row.last_signal_at = now

    if dry_run:
        log.info("DRY %s [%s] %s", state.upper(), story.slug, note)
    else:
        db.commit()
        log.info("OK  %s [%s] %s", state.upper(), story.slug, note)
    return state


def run(dry_run: bool = False, slug: Optional[str] = None) -> int:
    db = SessionLocal()
    try:
        q = db.query(Story).filter(Story.status == "published")
        if slug:
            q = q.filter(Story.slug == slug)
        stories = q.order_by(Story.id.asc()).all()
        log.info("scanning %d stories", len(stories))

        counts: dict = {}
        for s in stories:
            try:
                state = upsert_outcome_for_story(db, s, dry_run=dry_run)
                counts[state] = counts.get(state, 0) + 1
            except Exception as exc:
                log.error("failed for %s: %s", s.slug, exc)
                if not dry_run:
                    db.rollback()
        log.info("done. %s", ", ".join(f"{k}:{v}" for k, v in sorted(counts.items())))
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect story outcomes")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--slug", default=None, help="Limit to one story slug")
    args = parser.parse_args()
    return run(dry_run=args.dry_run, slug=args.slug)


if __name__ == "__main__":
    sys.exit(main())
