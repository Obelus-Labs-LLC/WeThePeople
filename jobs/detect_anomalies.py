"""
WeThePeople Anomaly Detection — nightly scan for suspicious patterns.

Patterns detected:
  A) Trade near committee vote — congressional trades within 30 days before a vote
  B) Lobbying spike before contract award — 2x+ lobbying spend before contract
  C) Enforcement gap — high lobbying spend, zero enforcement actions
  D) Revolving door — committee members trading in their oversight sector

Usage:
    python jobs/detect_anomalies.py                       # Run all patterns
    python jobs/detect_anomalies.py --pattern trade_near_vote  # Run one pattern
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from datetime import datetime, date, timedelta, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from sqlalchemy import func, extract, or_
from models.database import (
    SessionLocal, Base, engine, Anomaly,
    CongressionalTrade, Vote, MemberVote, TrackedMember,
    CompanyDonation, Bill,
)
from models.committee_models import Committee, CommitteeMembership
from models.finance_models import (
    TrackedInstitution, FinanceLobbyingRecord, FinanceGovernmentContract, FinanceEnforcement,
)
from models.health_models import (
    TrackedCompany, HealthLobbyingRecord, HealthGovernmentContract, HealthEnforcement,
)
from models.tech_models import (
    TrackedTechCompany, LobbyingRecord, GovernmentContract, FTCEnforcement,
)
from models.energy_models import (
    TrackedEnergyCompany, EnergyLobbyingRecord, EnergyGovernmentContract, EnergyEnforcement,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("detect_anomalies")


def _hash(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def _amount_range_mid(amount_range: Optional[str]) -> float:
    """Parse STOCK Act amount range like '$1,001 - $15,000' into midpoint."""
    if not amount_range:
        return 5000.0
    try:
        cleaned = amount_range.replace("$", "").replace(",", "")
        parts = cleaned.split("-")
        if len(parts) == 2:
            lo = float(parts[0].strip())
            hi = float(parts[1].strip())
            return (lo + hi) / 2
        return float(parts[0].strip())
    except (ValueError, IndexError):
        return 5000.0


# ---------------------------------------------------------------------------
# Pattern A: Trade near committee vote
# ---------------------------------------------------------------------------

def detect_trade_near_vote(db) -> List[Dict[str, Any]]:
    """Find congressional trades within 30 days before a vote the member participated in."""
    log.info("Pattern A: Scanning for trades near committee votes...")
    anomalies = []

    # Get all trades with transaction dates
    trades = db.query(CongressionalTrade).filter(
        CongressionalTrade.transaction_date.isnot(None)
    ).all()

    if not trades:
        log.info("  No trades found, skipping.")
        return anomalies

    # Build member lookup
    members = {m.person_id: m for m in db.query(TrackedMember).all()}

    for trade in trades:
        if not trade.transaction_date or not trade.person_id:
            continue

        member = members.get(trade.person_id)
        if not member:
            continue
        if not member.bioguide_id and not trade.person_id:
            continue

        trade_date = trade.transaction_date
        vote_window_start = trade_date
        vote_window_end = trade_date + timedelta(days=30)

        # Find votes by this member within 30 days AFTER the trade
        # Match on bioguide_id OR person_id to catch members without bioguide_id
        member_filter = []
        if member.bioguide_id:
            member_filter.append(MemberVote.bioguide_id == member.bioguide_id)
        if trade.person_id:
            member_filter.append(MemberVote.person_id == trade.person_id)

        if not member_filter:
            continue

        nearby_votes = (
            db.query(MemberVote, Vote)
            .join(Vote, Vote.id == MemberVote.vote_id)
            .filter(
                or_(*member_filter),
                Vote.vote_date >= vote_window_start,
                Vote.vote_date <= vote_window_end,
            )
            .all()
        )

        for mv, vote in nearby_votes:
            if not vote.vote_date:
                continue

            days_gap = (vote.vote_date - trade_date).days
            if days_gap < 0:
                continue

            # Score: closer gap = higher score, larger amount = higher
            timing_score = max(1, 10 - (days_gap / 3))
            amount_mid = _amount_range_mid(trade.amount_range)
            amount_bonus = min(2, amount_mid / 50000)
            score = min(10, round(timing_score + amount_bonus, 1))

            title = (
                f"{member.display_name} traded {trade.ticker or 'stock'} "
                f"({trade.transaction_type}) {days_gap} days before voting"
            )
            description = (
                f"{member.display_name} ({member.party}-{member.state}) made a "
                f"{trade.transaction_type} trade of {trade.ticker or 'unknown'} "
                f"({trade.amount_range or 'unknown amount'}) on {trade_date}, "
                f"then voted ({mv.position}) on roll call #{vote.roll_number} "
                f"({vote.question or 'vote'}) on {vote.vote_date}. "
                f"Gap: {days_gap} days."
            )
            evidence = json.dumps({
                "trade_id": trade.id,
                "vote_id": vote.id,
                "ticker": trade.ticker,
                "transaction_type": trade.transaction_type,
                "amount_range": trade.amount_range,
                "trade_date": str(trade_date),
                "vote_date": str(vote.vote_date),
                "days_gap": days_gap,
                "position": mv.position,
                "vote_question": vote.question,
                "roll_number": vote.roll_number,
            })

            anomalies.append({
                "pattern_type": "trade_near_vote",
                "entity_type": "person",
                "entity_id": trade.person_id,
                "entity_name": member.display_name,
                "score": score,
                "title": title,
                "description": description,
                "evidence": evidence,
                "dedupe_hash": _hash("trade_near_vote", str(trade.id), str(vote.id)),
            })

    log.info("  Found %d trade-near-vote anomalies.", len(anomalies))
    return anomalies


# ---------------------------------------------------------------------------
# Pattern B: Lobbying spike before contract award
# ---------------------------------------------------------------------------

def detect_lobbying_spike(db) -> List[Dict[str, Any]]:
    """Flag companies whose lobbying spend spiked 2x+ in the 6 months before a contract."""
    log.info("Pattern B: Scanning for lobbying spikes before contracts...")
    anomalies = []

    sector_configs = [
        {
            "sector": "tech",
            "entity_model": TrackedTechCompany,
            "id_field": "company_id",
            "name_field": "display_name",
            "lobby_model": LobbyingRecord,
            "lobby_fk": "company_id",
            "contract_model": GovernmentContract,
            "contract_fk": "company_id",
        },
        {
            "sector": "finance",
            "entity_model": TrackedInstitution,
            "id_field": "institution_id",
            "name_field": "display_name",
            "lobby_model": FinanceLobbyingRecord,
            "lobby_fk": "institution_id",
            "contract_model": FinanceGovernmentContract,
            "contract_fk": "institution_id",
        },
        {
            "sector": "health",
            "entity_model": TrackedCompany,
            "id_field": "company_id",
            "name_field": "display_name",
            "lobby_model": HealthLobbyingRecord,
            "lobby_fk": "company_id",
            "contract_model": HealthGovernmentContract,
            "contract_fk": "company_id",
        },
        {
            "sector": "energy",
            "entity_model": TrackedEnergyCompany,
            "id_field": "company_id",
            "name_field": "display_name",
            "lobby_model": EnergyLobbyingRecord,
            "lobby_fk": "company_id",
            "contract_model": EnergyGovernmentContract,
            "contract_fk": "company_id",
        },
    ]

    for cfg in sector_configs:
        entity_model = cfg["entity_model"]
        lobby_model = cfg["lobby_model"]
        contract_model = cfg["contract_model"]

        entities = db.query(entity_model).filter(
            getattr(entity_model, "is_active") == 1
        ).all()

        for entity in entities:
            eid = getattr(entity, cfg["id_field"])
            ename = getattr(entity, cfg["name_field"])

            # Get total lobbying spend (baseline)
            total_spend = (
                db.query(func.sum(lobby_model.income))
                .filter(getattr(lobby_model, cfg["lobby_fk"]) == eid)
                .scalar()
            ) or 0

            if total_spend == 0:
                continue

            # Count lobbying years for baseline average
            year_count = (
                db.query(func.count(func.distinct(lobby_model.filing_year)))
                .filter(getattr(lobby_model, cfg["lobby_fk"]) == eid)
                .scalar()
            ) or 1
            yearly_avg = total_spend / max(year_count, 1)
            half_year_avg = yearly_avg / 2  # 6-month average baseline

            if half_year_avg <= 0:
                continue

            # Get contracts with start dates
            contracts = (
                db.query(contract_model)
                .filter(getattr(contract_model, cfg["contract_fk"]) == eid)
                .filter(contract_model.start_date.isnot(None))
                .all()
            )

            for contract in contracts:
                if not contract.start_date:
                    continue

                contract_year = contract.start_date.year
                # Lobbying in the same year as the contract (approximation for "6 months before")
                pre_contract_spend = (
                    db.query(func.sum(lobby_model.income))
                    .filter(
                        getattr(lobby_model, cfg["lobby_fk"]) == eid,
                        lobby_model.filing_year == contract_year,
                    )
                    .scalar()
                ) or 0

                if pre_contract_spend <= 0 or half_year_avg <= 0:
                    continue

                spike_ratio = pre_contract_spend / half_year_avg

                if spike_ratio >= 2.0:
                    award = contract.award_amount or 0
                    score = min(10, round(3 + spike_ratio + min(3, award / 10_000_000), 1))

                    title = (
                        f"{ename} lobbying spiked {spike_ratio:.1f}x before "
                        f"${award:,.0f} contract"
                    )
                    description = (
                        f"{ename} ({cfg['sector']}) spent ${pre_contract_spend:,.0f} on lobbying "
                        f"in {contract_year}, which is {spike_ratio:.1f}x their 6-month average "
                        f"of ${half_year_avg:,.0f}. They received a ${award:,.0f} government "
                        f"contract starting {contract.start_date}."
                    )
                    evidence = json.dumps({
                        "entity_id": eid,
                        "sector": cfg["sector"],
                        "contract_id": contract.id,
                        "contract_start": str(contract.start_date),
                        "award_amount": award,
                        "pre_contract_lobby_spend": pre_contract_spend,
                        "baseline_half_year_avg": round(half_year_avg, 2),
                        "spike_ratio": round(spike_ratio, 2),
                    })

                    anomalies.append({
                        "pattern_type": "lobbying_spike",
                        "entity_type": "company",
                        "entity_id": eid,
                        "entity_name": ename,
                        "score": score,
                        "title": title,
                        "description": description,
                        "evidence": evidence,
                        "dedupe_hash": _hash("lobbying_spike", eid, str(contract.id)),
                    })

    log.info("  Found %d lobbying-spike anomalies.", len(anomalies))
    return anomalies


# ---------------------------------------------------------------------------
# Pattern C: Enforcement gap
# ---------------------------------------------------------------------------

def detect_enforcement_gap(db) -> List[Dict[str, Any]]:
    """Flag companies with high lobbying but zero enforcement actions."""
    log.info("Pattern C: Scanning for enforcement gaps...")
    anomalies = []

    sector_configs = [
        {
            "sector": "tech",
            "entity_model": TrackedTechCompany,
            "id_field": "company_id",
            "name_field": "display_name",
            "lobby_model": LobbyingRecord,
            "lobby_fk": "company_id",
            "enforcement_model": FTCEnforcement,
            "enforcement_fk": "company_id",
        },
        {
            "sector": "finance",
            "entity_model": TrackedInstitution,
            "id_field": "institution_id",
            "name_field": "display_name",
            "lobby_model": FinanceLobbyingRecord,
            "lobby_fk": "institution_id",
            "enforcement_model": FinanceEnforcement,
            "enforcement_fk": "institution_id",
        },
        {
            "sector": "health",
            "entity_model": TrackedCompany,
            "id_field": "company_id",
            "name_field": "display_name",
            "lobby_model": HealthLobbyingRecord,
            "lobby_fk": "company_id",
            "enforcement_model": HealthEnforcement,
            "enforcement_fk": "company_id",
        },
        {
            "sector": "energy",
            "entity_model": TrackedEnergyCompany,
            "id_field": "company_id",
            "name_field": "display_name",
            "lobby_model": EnergyLobbyingRecord,
            "lobby_fk": "company_id",
            "enforcement_model": EnergyEnforcement,
            "enforcement_fk": "company_id",
        },
    ]

    for cfg in sector_configs:
        entity_model = cfg["entity_model"]
        lobby_model = cfg["lobby_model"]
        enforcement_model = cfg["enforcement_model"]

        entities = db.query(entity_model).filter(
            getattr(entity_model, "is_active") == 1
        ).all()

        for entity in entities:
            eid = getattr(entity, cfg["id_field"])
            ename = getattr(entity, cfg["name_field"])

            total_spend = (
                db.query(func.sum(lobby_model.income))
                .filter(getattr(lobby_model, cfg["lobby_fk"]) == eid)
                .scalar()
            ) or 0

            if total_spend < 500_000:
                continue  # Only flag companies with significant lobbying

            enforcement_count = (
                db.query(func.count(enforcement_model.id))
                .filter(getattr(enforcement_model, cfg["enforcement_fk"]) == eid)
                .scalar()
            ) or 0

            if enforcement_count == 0:
                # Score based on lobbying spend — more spend = more suspicious absence
                score = min(10, round(4 + min(4, total_spend / 5_000_000), 1))

                title = (
                    f"{ename} spent ${total_spend:,.0f} lobbying with zero enforcement actions"
                )
                description = (
                    f"{ename} ({cfg['sector']}) has spent ${total_spend:,.0f} on lobbying "
                    f"but has zero recorded enforcement actions. This absence may indicate "
                    f"effective regulatory capture or insufficient oversight."
                )
                evidence = json.dumps({
                    "entity_id": eid,
                    "sector": cfg["sector"],
                    "total_lobbying_spend": total_spend,
                    "enforcement_count": 0,
                })

                anomalies.append({
                    "pattern_type": "enforcement_gap",
                    "entity_type": "company",
                    "entity_id": eid,
                    "entity_name": ename,
                    "score": score,
                    "title": title,
                    "description": description,
                    "evidence": evidence,
                    "dedupe_hash": _hash("enforcement_gap", eid, cfg["sector"]),
                })

    log.info("  Found %d enforcement-gap anomalies.", len(anomalies))
    return anomalies


# ---------------------------------------------------------------------------
# Pattern D: Revolving door indicator
# ---------------------------------------------------------------------------

# Map committee thomas_id prefixes to sectors and tickers
COMMITTEE_SECTOR_MAP = {
    # Finance-related committees
    "SSBK": "finance",   # Senate Banking
    "HSBA": "finance",   # House Financial Services
    # Health-related committees
    "SSHR": "health",    # Senate HELP
    "HSIF": "health",    # House Energy and Commerce (health subcommittees)
    # Tech-related committees
    "SSCI": "tech",      # Senate Intelligence
    "HLIG": "tech",      # House Select on AI (if exists)
    "SSCM": "tech",      # Senate Commerce, Science
    "HSSY": "tech",      # House Science, Space, Technology
    # Energy-related committees
    "SSEG": "energy",    # Senate Energy
    "HSII": "energy",    # House Natural Resources
}

SECTOR_TICKERS = {
    "finance": {"JPM", "GS", "MS", "BAC", "WFC", "C", "BLK", "AXP", "USB", "PNC", "SCHW", "BK", "V", "MA"},
    "health": {"JNJ", "PFE", "UNH", "ABBV", "MRK", "LLY", "TMO", "ABT", "BMY", "AMGN", "GILD", "CVS", "CI", "HUM"},
    "tech": {"AAPL", "MSFT", "GOOG", "GOOGL", "AMZN", "META", "NVDA", "TSM", "ORCL", "CRM", "INTC", "AMD", "CSCO", "ADBE"},
    "energy": {"XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HAL", "DVN", "FANG", "NEE", "DUK"},
}


def detect_revolving_door(db) -> List[Dict[str, Any]]:
    """Flag politicians on sector-relevant committees who trade in that sector."""
    log.info("Pattern D: Scanning for revolving door indicators...")
    anomalies = []

    # Get all committee memberships with resolved person_ids
    memberships = (
        db.query(CommitteeMembership, Committee)
        .join(Committee, Committee.thomas_id == CommitteeMembership.committee_thomas_id)
        .filter(CommitteeMembership.person_id.isnot(None))
        .all()
    )

    members = {m.person_id: m for m in db.query(TrackedMember).all()}

    # Build person → sectors map from committee memberships
    person_sectors: Dict[str, set] = {}
    person_committees: Dict[str, List[str]] = {}
    for ms, committee in memberships:
        if not ms.person_id:
            continue
        thomas_prefix = committee.thomas_id[:4] if committee.thomas_id else ""
        sector = COMMITTEE_SECTOR_MAP.get(thomas_prefix)
        if sector:
            person_sectors.setdefault(ms.person_id, set()).add(sector)
            person_committees.setdefault(ms.person_id, []).append(committee.name)

    # Check each person's trades against their committee sectors
    for person_id, sectors in person_sectors.items():
        member = members.get(person_id)
        if not member:
            continue

        # Collect all tickers for this person's oversight sectors
        oversight_tickers = set()
        for s in sectors:
            oversight_tickers |= SECTOR_TICKERS.get(s, set())

        if not oversight_tickers:
            continue

        # Find trades in oversight tickers
        trades = (
            db.query(CongressionalTrade)
            .filter(
                CongressionalTrade.person_id == person_id,
                CongressionalTrade.ticker.in_(list(oversight_tickers)),
            )
            .all()
        )

        if not trades:
            continue

        total_trades = len(trades)
        tickers_traded = set(t.ticker for t in trades if t.ticker)

        score = min(10, round(5 + min(3, total_trades / 3) + len(sectors), 1))

        committees_str = ", ".join(set(person_committees.get(person_id, [])))
        sectors_str = ", ".join(sorted(sectors))
        tickers_str = ", ".join(sorted(tickers_traded))

        title = (
            f"{member.display_name} sits on {sectors_str} committees and traded "
            f"{', '.join(sorted(tickers_traded)[:3])}"
        )
        description = (
            f"{member.display_name} ({member.party}-{member.state}) serves on "
            f"committees overseeing {sectors_str} ({committees_str}) and made "
            f"{total_trades} trades in tickers from those sectors: {tickers_str}."
        )
        evidence = json.dumps({
            "person_id": person_id,
            "sectors": sorted(sectors),
            "committees": sorted(set(person_committees.get(person_id, []))),
            "tickers_traded": sorted(tickers_traded),
            "trade_count": total_trades,
        })

        anomalies.append({
            "pattern_type": "revolving_door",
            "entity_type": "person",
            "entity_id": person_id,
            "entity_name": member.display_name,
            "score": score,
            "title": title,
            "description": description,
            "evidence": evidence,
            "dedupe_hash": _hash("revolving_door", person_id, sectors_str),
        })

    log.info("  Found %d revolving-door anomalies.", len(anomalies))
    return anomalies


# ---------------------------------------------------------------------------
# Save anomalies
# ---------------------------------------------------------------------------

def save_anomalies(db, anomaly_dicts: List[Dict[str, Any]]) -> int:
    """Upsert anomalies into the database. Returns count of new records."""
    new_count = 0
    for ad in anomaly_dicts:
        existing = db.query(Anomaly).filter(Anomaly.dedupe_hash == ad["dedupe_hash"]).first()
        if existing:
            # Update score and description if changed
            existing.score = ad["score"]
            existing.title = ad["title"]
            existing.description = ad["description"]
            existing.evidence = ad["evidence"]
            existing.detected_at = datetime.now(timezone.utc)
        else:
            db.add(Anomaly(**ad))
            new_count += 1

    db.commit()
    return new_count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

PATTERN_FUNCS = {
    "trade_near_vote": detect_trade_near_vote,
    "lobbying_spike": detect_lobbying_spike,
    "enforcement_gap": detect_enforcement_gap,
    "revolving_door": detect_revolving_door,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="WeThePeople anomaly detection")
    parser.add_argument(
        "--pattern",
        choices=list(PATTERN_FUNCS.keys()),
        help="Run a single pattern (default: all)",
    )
    args = parser.parse_args()

    # Ensure table exists
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        all_anomalies: List[Dict[str, Any]] = []

        if args.pattern:
            patterns = {args.pattern: PATTERN_FUNCS[args.pattern]}
        else:
            patterns = PATTERN_FUNCS

        for name, func_ref in patterns.items():
            log.info("Running pattern: %s", name)
            try:
                results = func_ref(db)
                all_anomalies.extend(results)
            except Exception:
                log.exception("Error in pattern %s", name)

        log.info("Total anomalies found: %d", len(all_anomalies))

        new_count = save_anomalies(db, all_anomalies)
        log.info("Saved %d new anomalies (%d updated).", new_count, len(all_anomalies) - new_count)

        total = db.query(func.count(Anomaly.id)).scalar() or 0
        log.info("Total anomalies in database: %d", total)

        return 0
    except Exception:
        log.exception("Fatal error in anomaly detection")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
