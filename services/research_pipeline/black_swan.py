"""Black-swan detector.

Runs first each cycle. If anything fires, it overrides the rotating
selector for that day's story slot. Calibrated for genuine rarities:
"shit has to be crashing or highly irregular." Expected combined
firing rate: ~6-12 events per year, not per month.

Anything routine (Meta's normal $5M/quarter lobbying spend, ordinary
contract awards, ordinary trades) does NOT belong here — that's
what the rotating selector handles.

Each detector returns a list of dicts with a stable shape:
    {
        "signal": str,           # e.g. "lobbying_megaspike"
        "score": float,          # 0..1, used to pick the highest if multiple
        "entity_id": str,
        "sector": str,
        "summary": str,          # one-line description for ops log
        "evidence": dict,        # raw rows / values that triggered it
    }

The orchestrator picks the single highest-score result across all
detectors. If there are ties, it falls back to the rotating selector
to break them so the same kind of black swan doesn't dominate.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# --- Thresholds ------------------------------------------------------------
# Calibrated for headline news. Tunable from real data once running, but
# err on the side of "almost never fires" rather than "fires every week."

LOBBYING_SINGLE_QUARTER_MEGASPIKE_USD = 15_000_000      # Meta/Google scale
LOBBYING_SPIKE_RATIO_VS_BASELINE = 10.0                 # >= 10x quarterly mean
LOBBYING_SPIKE_MIN_ABSOLUTE_USD = 5_000_000             # baseline floor

CONGRESSIONAL_TRADE_MEGA_USD = 5_000_000                # 1-2 / year historically

ENFORCEMENT_MEGAPENALTY_USD = 1_000_000_000             # billion-dollar settlement

CONTRACT_MEGA_AWARD_USD = 10_000_000_000                # F-35 lot scale

TRACKED_PRIVATE_IPO_VALUATION_USD = 100_000_000_000     # SpaceX-grade IPO event

# Stories about a sitting member who had no disclosed activity for a long
# stretch and then has a single mega-trade are noteworthy. Threshold is
# a single trade > $1M after >= 90 days of disclosure silence. (Lower
# than the absolute mega-trade threshold because the silence-break IS
# the rarity here, not the dollar size alone.)
TRADE_SILENCEBREAK_USD = 1_000_000
TRADE_SILENCEBREAK_QUIET_DAYS = 90

# Window of recent data we consider "fresh" enough to fire as black swan.
LOOKBACK_DAYS = 7


# --- Data class for the detector return shape -----------------------------


def _hit(
    *,
    signal: str,
    score: float,
    entity_id: str,
    sector: str,
    summary: str,
    evidence: dict[str, Any],
) -> dict[str, Any]:
    """Build a black-swan hit dict in the canonical shape.

    Keeping this as a helper instead of a dataclass so the orchestrator
    can pass the dict straight through to logging / API responses with
    no serialisation step.
    """
    return {
        "signal": signal,
        "score": float(score),
        "entity_id": entity_id,
        "sector": sector,
        "summary": summary,
        "evidence": evidence,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }


# --- Detectors ------------------------------------------------------------


def detect_mega_lobbying_spend(db: Session) -> list[dict[str, Any]]:
    """Single-quarter lobbying spend by one client > $15M (across all
    sector tables). Genuinely rare; usually only a handful of entities
    per year (Meta, Comcast, Boeing, NAR) at this scale.
    """
    hits: list[dict[str, Any]] = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    sector_tables = [
        ("lobbying_records", "tech"),
        ("health_lobbying_records", "health"),
        ("energy_lobbying_records", "energy"),
        ("transportation_lobbying_records", "transportation"),
        ("defense_lobbying_records", "defense"),
        ("chemical_lobbying_records", "chemicals"),
        ("agriculture_lobbying_records", "agriculture"),
        ("telecom_lobbying_records", "telecom"),
        ("education_lobbying_records", "education"),
    ]
    for table, sector in sector_tables:
        try:
            rows = db.execute(
                text(
                    f"SELECT company_id, filing_period, filing_year, "
                    f"  CASE WHEN COALESCE(expenses, 0) > 0 "
                    f"  THEN COALESCE(expenses, 0) "
                    f"  ELSE COALESCE(income, 0) END AS spend, "
                    f"  client_name, filing_uuid "
                    f"FROM {table} "
                    f"WHERE created_at >= :cutoff "
                    f"  AND CASE WHEN COALESCE(expenses, 0) > 0 "
                    f"      THEN COALESCE(expenses, 0) "
                    f"      ELSE COALESCE(income, 0) END > :threshold"
                ),
                {"cutoff": cutoff, "threshold": LOBBYING_SINGLE_QUARTER_MEGASPIKE_USD},
            ).fetchall()
        except Exception as e:
            # Table may not exist in some environments (legacy DBs); skip.
            logger.debug("mega_lobbying_spend skipped %s: %s", table, e)
            continue
        for r in rows:
            hits.append(_hit(
                signal="lobbying_megaspend",
                score=min(1.0, r.spend / (LOBBYING_SINGLE_QUARTER_MEGASPIKE_USD * 5)),
                entity_id=r.company_id,
                sector=sector,
                summary=f"{r.client_name} disclosed ${r.spend / 1e6:.1f}M lobbying spend in "
                         f"{r.filing_period} {r.filing_year} (>${LOBBYING_SINGLE_QUARTER_MEGASPIKE_USD / 1e6:.0f}M threshold)",
                evidence={
                    "table": table,
                    "filing_uuid": r.filing_uuid,
                    "spend_usd": float(r.spend),
                    "filing_period": r.filing_period,
                    "filing_year": r.filing_year,
                },
            ))
    return hits


def detect_mega_congressional_trade(db: Session) -> list[dict[str, Any]]:
    """Single congressional trade > $5M. Almost unheard of; the entire
    STOCK Act dataset has only a handful of these per year.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    try:
        rows = db.execute(
            text(
                "SELECT person_id, transaction_date, ticker, "
                "       asset_description, transaction_type, "
                "       amount_min, amount_max "
                "FROM congressional_trades "
                "WHERE transaction_date >= :cutoff "
                "  AND COALESCE(amount_max, amount_min, 0) > :threshold"
            ),
            {"cutoff": cutoff, "threshold": CONGRESSIONAL_TRADE_MEGA_USD},
        ).fetchall()
    except Exception as e:
        logger.debug("mega_congressional_trade skipped: %s", e)
        return []
    hits = []
    for r in rows:
        amt = r.amount_max or r.amount_min or 0
        hits.append(_hit(
            signal="trade_megaorder",
            score=min(1.0, amt / (CONGRESSIONAL_TRADE_MEGA_USD * 4)),
            entity_id=r.person_id,
            sector="politics",
            summary=f"{r.person_id} {r.transaction_type} ${amt / 1e6:.1f}M of {r.ticker} "
                     f"on {r.transaction_date} (>${CONGRESSIONAL_TRADE_MEGA_USD / 1e6:.0f}M threshold)",
            evidence={
                "person_id": r.person_id,
                "transaction_date": str(r.transaction_date),
                "ticker": r.ticker,
                "amount_min": float(r.amount_min or 0),
                "amount_max": float(r.amount_max or 0),
                "transaction_type": r.transaction_type,
            },
        ))
    return hits


def detect_silence_break_trade(db: Session) -> list[dict[str, Any]]:
    """A tracked member with >= 90 days of disclosure silence suddenly
    discloses a > $1M trade. The silence-break is the rarity here —
    the dollar threshold is lower than the mega-trade detector because
    silence-break is itself the signal.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    silence_cutoff = datetime.now(timezone.utc) - timedelta(days=TRADE_SILENCEBREAK_QUIET_DAYS)
    try:
        # Find recent trades > $1M by people whose previous trade was
        # > 90 days before the recent trade.
        rows = db.execute(
            text(
                "WITH recent AS ("
                "  SELECT person_id, transaction_date, ticker, transaction_type, "
                "         amount_min, amount_max "
                "  FROM congressional_trades "
                "  WHERE transaction_date >= :cutoff "
                "    AND COALESCE(amount_max, amount_min, 0) > :threshold"
                ") "
                "SELECT r.* FROM recent r "
                "WHERE NOT EXISTS ("
                "  SELECT 1 FROM congressional_trades t "
                "  WHERE t.person_id = r.person_id "
                "    AND t.transaction_date < r.transaction_date "
                "    AND t.transaction_date >= :silence_cutoff"
                ")"
            ),
            {
                "cutoff": cutoff,
                "threshold": TRADE_SILENCEBREAK_USD,
                "silence_cutoff": silence_cutoff,
            },
        ).fetchall()
    except Exception as e:
        logger.debug("silence_break_trade skipped: %s", e)
        return []
    hits = []
    for r in rows:
        amt = r.amount_max or r.amount_min or 0
        hits.append(_hit(
            signal="trade_silence_break",
            score=0.7,  # narrative weight more than dollar weight
            entity_id=r.person_id,
            sector="politics",
            summary=f"{r.person_id} broke {TRADE_SILENCEBREAK_QUIET_DAYS}-day disclosure silence "
                     f"with ${amt / 1e6:.1f}M trade in {r.ticker} on {r.transaction_date}",
            evidence={
                "person_id": r.person_id,
                "transaction_date": str(r.transaction_date),
                "ticker": r.ticker,
                "amount_min": float(r.amount_min or 0),
                "amount_max": float(r.amount_max or 0),
            },
        ))
    return hits


def detect_megapenalty_enforcement(db: Session) -> list[dict[str, Any]]:
    """New enforcement action >= $1B against a tracked entity. Rare;
    a handful per decade for headline-grabbing penalties.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    sector_tables = [
        ("finance_enforcement_actions", "finance"),
        ("health_enforcement_actions", "health"),
        ("defense_enforcement_actions", "defense"),
        ("enforcement_actions", "tech"),
    ]
    hits: list[dict[str, Any]] = []
    for table, sector in sector_tables:
        try:
            rows = db.execute(
                text(
                    f"SELECT company_id, action_date, agency, action_type, "
                    f"       penalty_amount, description, action_id "
                    f"FROM {table} "
                    f"WHERE action_date >= :cutoff "
                    f"  AND COALESCE(penalty_amount, 0) >= :threshold"
                ),
                {"cutoff": cutoff, "threshold": ENFORCEMENT_MEGAPENALTY_USD},
            ).fetchall()
        except Exception as e:
            logger.debug("megapenalty_enforcement skipped %s: %s", table, e)
            continue
        for r in rows:
            hits.append(_hit(
                signal="enforcement_megapenalty",
                score=min(1.0, r.penalty_amount / (ENFORCEMENT_MEGAPENALTY_USD * 3)),
                entity_id=r.company_id,
                sector=sector,
                summary=f"{r.company_id} hit with ${r.penalty_amount / 1e9:.1f}B penalty by "
                         f"{r.agency} on {r.action_date}",
                evidence={
                    "table": table,
                    "action_id": r.action_id,
                    "agency": r.agency,
                    "action_type": r.action_type,
                    "penalty_amount": float(r.penalty_amount),
                    "action_date": str(r.action_date),
                },
            ))
    return hits


def detect_mega_contract_award(db: Session) -> list[dict[str, Any]]:
    """Single contract award >= $10B. Genuinely rare; F-35 lots, ICBM
    contracts, AWS / GovCloud awards. 1-3 per year typically.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    sector_tables = [
        ("government_contracts", "tech"),
        ("health_government_contracts", "health"),
        ("defense_government_contracts", "defense"),
        ("energy_government_contracts", "energy"),
        ("transportation_government_contracts", "transportation"),
    ]
    hits: list[dict[str, Any]] = []
    for table, sector in sector_tables:
        try:
            rows = db.execute(
                text(
                    f"SELECT company_id, action_date, awarding_agency, "
                    f"       obligated_amount, description, contract_id "
                    f"FROM {table} "
                    f"WHERE action_date >= :cutoff "
                    f"  AND COALESCE(obligated_amount, 0) >= :threshold"
                ),
                {"cutoff": cutoff, "threshold": CONTRACT_MEGA_AWARD_USD},
            ).fetchall()
        except Exception as e:
            logger.debug("mega_contract_award skipped %s: %s", table, e)
            continue
        for r in rows:
            hits.append(_hit(
                signal="contract_megaaward",
                score=min(1.0, r.obligated_amount / (CONTRACT_MEGA_AWARD_USD * 3)),
                entity_id=r.company_id,
                sector=sector,
                summary=f"{r.company_id} awarded ${r.obligated_amount / 1e9:.1f}B contract by "
                         f"{r.awarding_agency} on {r.action_date}",
                evidence={
                    "table": table,
                    "contract_id": r.contract_id,
                    "agency": r.awarding_agency,
                    "obligated_amount": float(r.obligated_amount),
                    "action_date": str(r.action_date),
                },
            ))
    return hits


# --- Top-level orchestrator entry --------------------------------------------


def scan(db: Session) -> list[dict[str, Any]]:
    """Run all detectors, return the union of hits sorted by score (desc).

    Empty list means "nothing rare enough; defer to rotating selector."
    The caller picks hits[0] as the override candidate when non-empty.
    """
    detectors = [
        detect_mega_lobbying_spend,
        detect_mega_congressional_trade,
        detect_silence_break_trade,
        detect_megapenalty_enforcement,
        detect_mega_contract_award,
    ]
    hits: list[dict[str, Any]] = []
    for detector in detectors:
        try:
            hits.extend(detector(db))
        except Exception as e:
            # One broken detector should not poison the whole sweep.
            logger.exception("black-swan detector %s failed: %s", detector.__name__, e)
    hits.sort(key=lambda h: h["score"], reverse=True)
    if hits:
        logger.info(
            "black-swan scan: %d hit(s); top signal=%s score=%.2f entity=%s",
            len(hits), hits[0]["signal"], hits[0]["score"], hits[0]["entity_id"],
        )
    return hits
