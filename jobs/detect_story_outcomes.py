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
from models.stories_models import Story, StoryOutcome, StoryOutcomeHistory

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
    Real production names are *_government_contracts (note 'chemical'
    is singular). Returns None when no per-sector table exists for
    the given sector — those stories stay at 'unknown'."""
    if not sector:
        return None
    s = sector.lower()
    return {
        "finance":        "finance_government_contracts",
        "health":         "health_government_contracts",
        "energy":         "energy_government_contracts",
        "transportation": "transportation_government_contracts",
        "defense":        "defense_government_contracts",
        "chemicals":      "chemical_government_contracts",   # singular in DB
        "chemical":       "chemical_government_contracts",
        "agriculture":    "agriculture_government_contracts",
        "telecom":        "telecom_government_contracts",
        "education":      "education_government_contracts",
        # tech / technology have no dedicated *_government_contracts
        # table; the canonical 'government_contracts' table is the
        # cross-sector roll-up but uses different ID semantics, so
        # we let tech stories stay at 'unknown' for now.
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

    # Light raw-SQL probe. Different sector contract tables use
    # different column names for the entity FK and the award date,
    # so we walk a small candidate matrix and bail if none match.
    from sqlalchemy import text
    quiet = (datetime.now(timezone.utc) - timedelta(days=QUIET_PERIOD_DAYS)).date()
    candidate_id_cols = ("institution_id", "company_id", "entity_id")
    candidate_date_cols = ("start_date", "action_date", "award_date", "awarded_at", "obligated_at")
    for id_col in candidate_id_cols:
        for date_col in candidate_date_cols:
            try:
                recent = db.execute(
                    text(
                        f"SELECT COUNT(*) FROM {table} "
                        f"WHERE {id_col} = :cid AND {date_col} >= :since"
                    ),
                    {"cid": company_id, "since": quiet},
                ).scalar() or 0
                since_pub = db.execute(
                    text(
                        f"SELECT COUNT(*) FROM {table} "
                        f"WHERE {id_col} = :cid AND {date_col} >= :pub"
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
    return "unknown", f"No matching id/date columns on {table}.", None


# ── Lobbying-shape detectors ─────────────────────────────────────────

_LOBBY_CATEGORIES = {
    "lobbying_spike", "lobbying_breakdown", "foreign_lobbying",
    "revolving_door", "tax_lobbying", "budget_lobbying",
    "budget_influence",
}


def _lobby_table_for_sector(sector: Optional[str]) -> Optional[str]:
    """Real production names are *_lobbying_records (note 'chemical'
    is singular). Returns None when no per-sector table exists."""
    if not sector:
        return None
    s = sector.lower()
    return {
        "finance":        "finance_lobbying_records",
        "health":         "health_lobbying_records",
        "energy":         "energy_lobbying_records",
        "transportation": "transportation_lobbying_records",
        "defense":        "defense_lobbying_records",
        "chemicals":      "chemical_lobbying_records",
        "chemical":       "chemical_lobbying_records",
        "agriculture":    "agriculture_lobbying_records",
        "telecom":        "telecom_lobbying_records",
        "education":      "education_lobbying_records",
        # tech / technology lobbying isn't sector-isolated in this
        # schema; falls back to 'unknown'.
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
    # Per-sector lobbying tables use different ID column names:
    # institution_id (finance), company_id (most others). Try both.
    candidate_id_cols = ("institution_id", "company_id", "entity_id")
    last_exc: Optional[Exception] = None
    for id_col in candidate_id_cols:
        try:
            since_pub = db.execute(
                text(
                    f"SELECT COUNT(*) FROM {table} "
                    f"WHERE {id_col} = :eid AND filing_year >= :year"
                ),
                {"eid": entity_id, "year": pub.year},
            ).scalar() or 0
            recent = db.execute(
                text(
                    f"SELECT COUNT(*) FROM {table} "
                    f"WHERE {id_col} = :eid AND filing_year >= :year"
                ),
                {"eid": entity_id, "year": quiet.year},
            ).scalar() or 0
        except Exception as exc:
            last_exc = exc
            continue
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
    return "unknown", f"Lobbying probe failed: {last_exc}", None


# ── Enforcement-shape detectors ──────────────────────────────────────

_ENFORCEMENT_CATEGORIES = {
    "penalty_contract_ratio", "enforcement_immunity",
    "enforcement_gap", "enforcement_disappearance",
}


def _enforcement_table_for_sector(sector: Optional[str]) -> Optional[str]:
    """Per-sector enforcement table mapping. Real prod names use
    *_enforcement_actions; chemicals is singular, transportation has
    a duplicate _enforcement table that we ignore."""
    if not sector:
        return None
    s = sector.lower()
    return {
        "finance":        "finance_enforcement_actions",
        "health":         "health_enforcement_actions",
        "energy":         "energy_enforcement_actions",
        "transportation": "transportation_enforcement_actions",
        "defense":        "defense_enforcement_actions",
        "chemicals":      "chemical_enforcement_actions",
        "chemical":       "chemical_enforcement_actions",
        "agriculture":    "agriculture_enforcement_actions",
        "telecom":        "telecom_enforcement_actions",
        "education":      "education_enforcement_actions",
    }.get(s)


def _detect_enforcement_outcome(db, story: Story) -> Tuple[str, str, Optional[str]]:
    """Enforcement-shape outcome detector.

    Heuristic: a story about enforcement immunity / penalty gap is
    'improved' if new enforcement actions land against the entity
    after publication (regulators are doing their job again),
    'worsened' if the silence continues, 'open' otherwise.
    """
    eids = story.entity_ids or []
    if not isinstance(eids, list) or not eids:
        return "unknown", "No company entity on the story.", None
    company_id = str(eids[0])

    table = _enforcement_table_for_sector(story.sector)
    if not table:
        return "unknown", f"No enforcement table for sector {story.sector!r}.", None

    pub = story.published_at or story.created_at
    if pub is None:
        return "unknown", "Story has no published_at.", None

    from sqlalchemy import text
    quiet = (datetime.now(timezone.utc) - timedelta(days=QUIET_PERIOD_DAYS)).date()
    candidate_id_cols = ("institution_id", "company_id", "entity_id")
    for id_col in candidate_id_cols:
        try:
            since_pub = db.execute(
                text(
                    f"SELECT COUNT(*) FROM {table} "
                    f"WHERE {id_col} = :cid AND case_date >= :pub"
                ),
                {"cid": company_id, "pub": pub.date()},
            ).scalar() or 0
            recent = db.execute(
                text(
                    f"SELECT COUNT(*) FROM {table} "
                    f"WHERE {id_col} = :cid AND case_date >= :since"
                ),
                {"cid": company_id, "since": quiet},
            ).scalar() or 0
        except Exception:
            continue
        if since_pub == 0:
            return (
                "worsened",
                "Still no enforcement actions despite the gap this story flagged.",
                f"enforcement_count:{table}:{company_id}",
            )
        if recent > 0:
            return (
                "improved",
                f"{since_pub} new enforcement actions since publication; "
                f"{recent} in the last {QUIET_PERIOD_DAYS} days.",
                f"enforcement_count:{table}:{company_id}",
            )
        return (
            "open",
            f"{since_pub} new enforcement actions since publication, "
            "but none in the recent window.",
            f"enforcement_count:{table}:{company_id}",
        )
    return "unknown", f"No matching id column on {table}.", None


# ── Donation-shape detector (PAC committee pipeline) ─────────────────

_DONATION_CATEGORIES = {
    "pac_committee_pipeline", "bipartisan_buying", "trade_cluster",
}


def _detect_donation_outcome(db, story: Story) -> Tuple[str, str, Optional[str]]:
    """Donation-flow stories. Heuristic:
    - improved if new PAC donations from the entity stopped
    - worsened if the flow continues at the same rate
    - open otherwise
    Reads from the cross-sector company_donations table.
    """
    eids = story.entity_ids or []
    if not isinstance(eids, list) or not eids:
        return "unknown", "No entity on the story.", None
    entity_id = str(eids[0])

    pub = story.published_at or story.created_at
    if pub is None:
        return "unknown", "Story has no published_at.", None

    from sqlalchemy import text
    quiet = (datetime.now(timezone.utc) - timedelta(days=QUIET_PERIOD_DAYS)).date()
    try:
        since_pub = db.execute(
            text(
                "SELECT COUNT(*) FROM company_donations "
                "WHERE company_id = :cid AND donation_date >= :pub"
            ),
            {"cid": entity_id, "pub": pub.date()},
        ).scalar() or 0
        recent = db.execute(
            text(
                "SELECT COUNT(*) FROM company_donations "
                "WHERE company_id = :cid AND donation_date >= :since"
            ),
            {"cid": entity_id, "since": quiet},
        ).scalar() or 0
    except Exception as exc:
        return "unknown", f"Donation probe failed: {exc}", None

    if since_pub == 0:
        return (
            "improved",
            "No new PAC donations from this entity since publication.",
            f"donation_count:company_donations:{entity_id}",
        )
    if recent == 0:
        return (
            "improved",
            f"No new PAC donations in the last {QUIET_PERIOD_DAYS} days.",
            f"donation_count:company_donations:{entity_id}",
        )
    return (
        "open",
        f"{since_pub} additional PAC donations since publication.",
        f"donation_count:company_donations:{entity_id}",
    )


# ── Vote-shape detector (member voting after a flagged trade) ────────

_VOTE_CATEGORIES = {
    "trade_before_legislation", "committee_stock_trade",
}


def _detect_vote_outcome(db, story: Story) -> Tuple[str, str, Optional[str]]:
    """Vote-shape stories cite a member trading before/around a
    bill they sponsored or voted on. Outcome heuristic:
    - resolved if the member is no longer in office (TrackedMember
      is_active = 0)
    - improved if no further trades AND the implicated bill has
      enacted/failed (terminal status)
    - open otherwise
    """
    from models.database import TrackedMember
    eids = story.entity_ids or []
    if not isinstance(eids, list) or not eids:
        return "unknown", "No member entity on the story.", None
    person_id = str(eids[0])

    member = (
        db.query(TrackedMember)
        .filter(TrackedMember.person_id == person_id)
        .first()
    )
    if member is None:
        return "unknown", f"Member {person_id!r} not in TrackedMember.", None
    if not member.is_active:
        return (
            "resolved",
            f"{member.display_name} is no longer in office; "
            "the conflict described in this story can no longer recur.",
            f"member_active:{person_id}",
        )

    pub = story.published_at or story.created_at
    if pub is None:
        return "unknown", "Story has no published_at.", None

    new_count = (
        db.query(CongressionalTrade)
        .filter(CongressionalTrade.person_id == person_id)
        .filter(CongressionalTrade.transaction_date >= pub.date())
        .count()
    )
    if new_count == 0:
        return (
            "improved",
            f"No further trades by {member.display_name} since the story.",
            f"vote_trade_count:{person_id}",
        )
    return (
        "open",
        f"{new_count} additional trades by {member.display_name} since the story.",
        f"vote_trade_count:{person_id}",
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
    if cat in _ENFORCEMENT_CATEGORIES:
        return _detect_enforcement_outcome(db, story)
    if cat in _DONATION_CATEGORIES:
        return _detect_donation_outcome(db, story)
    if cat in _VOTE_CATEGORIES:
        return _detect_vote_outcome(db, story)
    return "unknown", f"Category {cat!r} has no outcome detector.", None


def upsert_outcome_for_story(db, story: Story, dry_run: bool = False) -> str:
    """Compute and persist the outcome for one story. Returns the
    new state. Phase 4-W also records a row in
    story_outcome_history whenever the state actually changes,
    so the timeline is recoverable."""
    state, note, signal = _detect_outcome_for_story(db, story)
    state = StoryOutcome.validate_state(state)

    row = (
        db.query(StoryOutcome).filter(StoryOutcome.story_id == story.id).first()
    )
    now = datetime.now(timezone.utc)
    prev_state: Optional[str] = None
    state_changed = False
    if row is None:
        # First time we've evaluated this story. Record the initial
        # state as a history entry too — `from_state=None` means
        # "first observed at this state".
        row = StoryOutcome(
            story_id=story.id,
            state=state,
            note=note,
            last_signal_source=signal,
            last_signal_at=now,
        )
        state_changed = True
        if not dry_run:
            db.add(row)
    else:
        prev_state = row.state
        if prev_state != state:
            state_changed = True
        row.state = state
        row.note = note
        row.last_signal_source = signal
        row.last_signal_at = now

    if state_changed and not dry_run:
        try:
            db.add(StoryOutcomeHistory(
                story_id=story.id,
                from_state=prev_state,
                to_state=state,
                note=note,
                signal_source=signal,
                transitioned_at=now,
            ))
        except Exception as exc:
            log.warning("history insert failed for %s: %s", story.slug, exc)

    if dry_run:
        log.info("DRY %s [%s] %s", state.upper(), story.slug, note)
    else:
        db.commit()
        log.info(
            "OK  %s [%s]%s %s",
            state.upper(),
            story.slug,
            f" (was {prev_state})" if state_changed and prev_state else (
                " (NEW)" if state_changed else ""
            ),
            note,
        )
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
