"""
Cross-sector influence routes — aggregate lobbying, contracts, enforcement, donations across all sectors.
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional

from models.database import SessionLocal, CompanyDonation, CongressionalTrade, TrackedMember
from models.finance_models import (
    TrackedInstitution, FinanceLobbyingRecord, FinanceGovernmentContract, FinanceEnforcement,
    SECInsiderTrade,
)
from models.health_models import (
    TrackedCompany, HealthLobbyingRecord, HealthGovernmentContract, HealthEnforcement,
)
from models.tech_models import TrackedTechCompany, LobbyingRecord, GovernmentContract, FTCEnforcement
from models.energy_models import (
    TrackedEnergyCompany, EnergyLobbyingRecord, EnergyGovernmentContract, EnergyEnforcement,
)

router = APIRouter(prefix="/influence", tags=["influence"])


@router.get("/data-freshness")
def data_freshness():
    """Return last-updated timestamps and record counts for each major data type."""
    db = SessionLocal()
    try:
        def _max_date_and_count(model, date_col):
            """Return (max_date_str_or_None, count) for a model/date column."""
            latest = db.query(func.max(date_col)).scalar()
            count = db.query(func.count(model.id)).scalar() or 0
            date_str = str(latest) if latest else None
            return date_str, count

        # -- Lobbying: filing_year is int, not a date. Use created_at as best proxy. --
        lobbying_models = [
            (LobbyingRecord, LobbyingRecord.created_at),
            (FinanceLobbyingRecord, FinanceLobbyingRecord.created_at),
            (HealthLobbyingRecord, HealthLobbyingRecord.created_at),
            (EnergyLobbyingRecord, EnergyLobbyingRecord.created_at),
        ]
        lobby_latest = None
        lobby_count = 0
        for model, col in lobbying_models:
            dt, ct = _max_date_and_count(model, col)
            lobby_count += ct
            if dt and (lobby_latest is None or dt > lobby_latest):
                lobby_latest = dt

        # -- Contracts: max start_date --
        contract_models = [
            (GovernmentContract, GovernmentContract.start_date),
            (FinanceGovernmentContract, FinanceGovernmentContract.start_date),
            (HealthGovernmentContract, HealthGovernmentContract.start_date),
            (EnergyGovernmentContract, EnergyGovernmentContract.start_date),
        ]
        contract_latest = None
        contract_count = 0
        for model, col in contract_models:
            dt, ct = _max_date_and_count(model, col)
            contract_count += ct
            if dt and (contract_latest is None or dt > contract_latest):
                contract_latest = dt

        # -- Enforcement: max case_date --
        enforcement_models = [
            (FTCEnforcement, FTCEnforcement.case_date),
            (FinanceEnforcement, FinanceEnforcement.case_date),
            (HealthEnforcement, HealthEnforcement.case_date),
            (EnergyEnforcement, EnergyEnforcement.case_date),
        ]
        enforcement_latest = None
        enforcement_count = 0
        for model, col in enforcement_models:
            dt, ct = _max_date_and_count(model, col)
            enforcement_count += ct
            if dt and (enforcement_latest is None or dt > enforcement_latest):
                enforcement_latest = dt

        # -- Congressional trades --
        trades_latest, trades_count = _max_date_and_count(
            CongressionalTrade, CongressionalTrade.transaction_date,
        )

        # -- Insider trades --
        insider_latest, insider_count = _max_date_and_count(
            SECInsiderTrade, SECInsiderTrade.transaction_date,
        )

        return {
            "lobbying": {"last_updated": lobby_latest, "record_count": lobby_count},
            "contracts": {"last_updated": contract_latest, "record_count": contract_count},
            "enforcement": {"last_updated": enforcement_latest, "record_count": enforcement_count},
            "trades": {"last_updated": trades_latest, "record_count": trades_count},
            "insider_trades": {"last_updated": insider_latest, "record_count": insider_count},
        }
    finally:
        db.close()


@router.get("/stats")
def get_influence_stats():
    """Aggregate influence stats across all sectors."""
    db = SessionLocal()
    try:
        # Lobbying totals
        finance_lobbying = db.query(func.sum(FinanceLobbyingRecord.income)).scalar() or 0
        health_lobbying = db.query(func.sum(HealthLobbyingRecord.income)).scalar() or 0
        tech_lobbying = db.query(func.sum(LobbyingRecord.income)).scalar() or 0
        energy_lobbying = db.query(func.sum(EnergyLobbyingRecord.income)).scalar() or 0
        total_lobbying = finance_lobbying + health_lobbying + tech_lobbying + energy_lobbying

        # Contract totals
        finance_contracts = db.query(func.sum(FinanceGovernmentContract.award_amount)).scalar() or 0
        health_contracts = db.query(func.sum(HealthGovernmentContract.award_amount)).scalar() or 0
        tech_contracts = db.query(func.sum(GovernmentContract.award_amount)).scalar() or 0
        energy_contracts = db.query(func.sum(EnergyGovernmentContract.award_amount)).scalar() or 0
        total_contracts = finance_contracts + health_contracts + tech_contracts + energy_contracts

        # Enforcement totals
        finance_enforcement = db.query(func.count(FinanceEnforcement.id)).scalar() or 0
        health_enforcement = db.query(func.count(HealthEnforcement.id)).scalar() or 0
        tech_enforcement = db.query(func.count(FTCEnforcement.id)).scalar() or 0
        energy_enforcement = db.query(func.count(EnergyEnforcement.id)).scalar() or 0
        total_enforcement = finance_enforcement + health_enforcement + tech_enforcement + energy_enforcement

        # Politicians connected (via donations, fallback to tracked members)
        politicians_connected = db.query(func.count(func.distinct(CompanyDonation.person_id))).filter(
            CompanyDonation.person_id.isnot(None)
        ).scalar() or 0
        if politicians_connected == 0:
            politicians_connected = db.query(func.count(TrackedMember.id)).scalar() or 0

        return {
            "total_lobbying_spend": total_lobbying,
            "total_contract_value": total_contracts,
            "total_enforcement_actions": total_enforcement,
            "politicians_connected": politicians_connected,
            "by_sector": {
                "finance": {"lobbying": finance_lobbying, "contracts": finance_contracts, "enforcement": finance_enforcement},
                "health": {"lobbying": health_lobbying, "contracts": health_contracts, "enforcement": health_enforcement},
                "tech": {"lobbying": tech_lobbying, "contracts": tech_contracts, "enforcement": tech_enforcement},
                "energy": {"lobbying": energy_lobbying, "contracts": energy_contracts, "enforcement": energy_enforcement},
            },
        }
    finally:
        db.close()


@router.get("/top-lobbying")
def get_top_lobbying(limit: int = Query(10, ge=1, le=50)):
    """Top lobbying spenders across all sectors."""
    db = SessionLocal()
    try:
        results = []

        # Finance
        rows = db.query(
            TrackedInstitution.institution_id, TrackedInstitution.display_name,
            func.sum(FinanceLobbyingRecord.income),
        ).join(FinanceLobbyingRecord, FinanceLobbyingRecord.institution_id == TrackedInstitution.institution_id
        ).group_by(TrackedInstitution.institution_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "finance", "total_lobbying": total or 0})

        # Health
        rows = db.query(
            TrackedCompany.company_id, TrackedCompany.display_name,
            func.sum(HealthLobbyingRecord.income),
        ).join(HealthLobbyingRecord, HealthLobbyingRecord.company_id == TrackedCompany.company_id
        ).group_by(TrackedCompany.company_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "health", "total_lobbying": total or 0})

        # Tech
        rows = db.query(
            TrackedTechCompany.company_id, TrackedTechCompany.display_name,
            func.sum(LobbyingRecord.income),
        ).join(LobbyingRecord, LobbyingRecord.company_id == TrackedTechCompany.company_id
        ).group_by(TrackedTechCompany.company_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "tech", "total_lobbying": total or 0})

        # Energy
        rows = db.query(
            TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name,
            func.sum(EnergyLobbyingRecord.income),
        ).join(EnergyLobbyingRecord, EnergyLobbyingRecord.company_id == TrackedEnergyCompany.company_id
        ).group_by(TrackedEnergyCompany.company_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "energy", "total_lobbying": total or 0})

        results.sort(key=lambda x: x["total_lobbying"], reverse=True)
        return {"leaders": results[:limit]}
    finally:
        db.close()


@router.get("/spending-by-state")
def get_spending_by_state(
    metric: str = Query("donations", regex="^(donations|members|lobbying)$"),
    sector: Optional[str] = Query(None, regex="^(finance|health|tech|energy)$"),
):
    """
    Aggregate political-influence data by US state.

    Supported metrics:
      - donations: total CompanyDonation.amount flowing to politicians in each state
      - members:   count of tracked members per state
      - lobbying:  total lobbying spend from companies donating to each state's politicians
    """
    db = SessionLocal()
    try:
        states: dict = {}

        if metric == "members":
            # Simple: count TrackedMembers per state
            q = db.query(
                TrackedMember.state,
                func.count(TrackedMember.id),
            ).filter(TrackedMember.state.isnot(None))
            if sector:
                # Members don't have a sector, so we skip sector filter for this metric
                pass
            rows = q.group_by(TrackedMember.state).all()
            for st, cnt in rows:
                if st:
                    states[st] = {"value": cnt, "count": cnt}

        elif metric == "donations":
            # Sum CompanyDonation.amount grouped by the recipient member's state
            q = db.query(
                TrackedMember.state,
                func.sum(CompanyDonation.amount),
                func.count(CompanyDonation.id),
            ).join(
                TrackedMember,
                TrackedMember.person_id == CompanyDonation.person_id,
            ).filter(
                TrackedMember.state.isnot(None),
                CompanyDonation.amount.isnot(None),
            )
            if sector:
                q = q.filter(CompanyDonation.entity_type == sector)
            rows = q.group_by(TrackedMember.state).all()
            for st, total, cnt in rows:
                if st:
                    states[st] = {"value": float(total or 0), "count": cnt}

        elif metric == "lobbying":
            # Total lobbying spend from companies that donate to politicians in each state.
            # First aggregate lobbying income per company (subquery), then join to donations/members.
            lobby_configs = []
            if sector is None or sector == "finance":
                lobby_configs.append((FinanceLobbyingRecord, FinanceLobbyingRecord.institution_id, "finance"))
            if sector is None or sector == "health":
                lobby_configs.append((HealthLobbyingRecord, HealthLobbyingRecord.company_id, "health"))
            if sector is None or sector == "tech":
                lobby_configs.append((LobbyingRecord, LobbyingRecord.company_id, "tech"))
            if sector is None or sector == "energy":
                lobby_configs.append((EnergyLobbyingRecord, EnergyLobbyingRecord.company_id, "energy"))

            for lobby_model, entity_col, sec in lobby_configs:
                # Subquery: aggregate lobbying income per company first
                lobby_agg = (
                    db.query(
                        entity_col.label("entity_id"),
                        func.sum(lobby_model.income).label("total_income"),
                    )
                    .group_by(entity_col)
                    .subquery()
                )

                # Subquery: distinct (entity_id, state) pairs to avoid
                # cartesian product when a company donates to multiple
                # politicians in the same state
                donation_states = (
                    db.query(
                        CompanyDonation.entity_id.label("entity_id"),
                        TrackedMember.state.label("state"),
                    )
                    .join(TrackedMember, TrackedMember.person_id == CompanyDonation.person_id)
                    .filter(CompanyDonation.entity_type == sec, TrackedMember.state.isnot(None))
                    .group_by(CompanyDonation.entity_id, TrackedMember.state)
                    .subquery()
                )

                q = db.query(
                    donation_states.c.state,
                    func.sum(lobby_agg.c.total_income),
                    func.count(func.distinct(lobby_agg.c.entity_id)),
                ).select_from(lobby_agg).join(
                    donation_states,
                    donation_states.c.entity_id == lobby_agg.c.entity_id,
                )
                rows = q.group_by(donation_states.c.state).all()
                for st, total, cnt in rows:
                    if st:
                        prev = states.get(st, {"value": 0, "count": 0})
                        states[st] = {
                            "value": prev["value"] + float(total or 0),
                            "count": prev["count"] + cnt,
                        }

        return {"metric": metric, "sector": sector, "states": states}
    finally:
        db.close()


@router.get("/top-contracts")
def get_top_contracts(limit: int = Query(10, ge=1, le=50)):
    """Top government contract recipients across all sectors."""
    db = SessionLocal()
    try:
        results = []

        # Finance
        rows = db.query(
            TrackedInstitution.institution_id, TrackedInstitution.display_name,
            func.sum(FinanceGovernmentContract.award_amount),
        ).join(FinanceGovernmentContract, FinanceGovernmentContract.institution_id == TrackedInstitution.institution_id
        ).group_by(TrackedInstitution.institution_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "finance", "total_contracts": total or 0})

        # Health
        rows = db.query(
            TrackedCompany.company_id, TrackedCompany.display_name,
            func.sum(HealthGovernmentContract.award_amount),
        ).join(HealthGovernmentContract, HealthGovernmentContract.company_id == TrackedCompany.company_id
        ).group_by(TrackedCompany.company_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "health", "total_contracts": total or 0})

        # Tech
        rows = db.query(
            TrackedTechCompany.company_id, TrackedTechCompany.display_name,
            func.sum(GovernmentContract.award_amount),
        ).join(GovernmentContract, GovernmentContract.company_id == TrackedTechCompany.company_id
        ).group_by(TrackedTechCompany.company_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "tech", "total_contracts": total or 0})

        # Energy
        rows = db.query(
            TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name,
            func.sum(EnergyGovernmentContract.award_amount),
        ).join(EnergyGovernmentContract, EnergyGovernmentContract.company_id == TrackedEnergyCompany.company_id
        ).group_by(TrackedEnergyCompany.company_id).all()
        for eid, name, total in rows:
            results.append({"entity_id": eid, "display_name": name, "sector": "energy", "total_contracts": total or 0})

        results.sort(key=lambda x: x["total_contracts"], reverse=True)
        return {"leaders": results[:limit]}
    finally:
        db.close()


@router.get("/trade-timeline")
def get_trade_timeline(
    ticker: str = Query(..., min_length=1),
    person_id: Optional[str] = Query(None),
    range: str = Query("1y", regex="^(3m|6m|1y|2y)$"),
):
    """
    Return congressional trade markers for a given ticker, optionally filtered
    by person_id. Used to overlay buy/sell events on a timeline chart.
    """
    from datetime import date, timedelta

    range_days = {"3m": 90, "6m": 180, "1y": 365, "2y": 730}
    cutoff = date.today() - timedelta(days=range_days[range])

    db = SessionLocal()
    try:
        q = (
            db.query(CongressionalTrade, TrackedMember)
            .outerjoin(TrackedMember, TrackedMember.person_id == CongressionalTrade.person_id)
            .filter(CongressionalTrade.ticker == ticker.upper())
            .filter(CongressionalTrade.transaction_date >= cutoff)
        )
        if person_id:
            q = q.filter(CongressionalTrade.person_id == person_id)

        q = q.order_by(CongressionalTrade.transaction_date.asc())

        trades = []
        for trade, member in q.all():
            trades.append({
                "date": str(trade.transaction_date) if trade.transaction_date else None,
                "person_id": trade.person_id,
                "display_name": member.display_name if member else trade.person_id,
                "party": member.party if member else None,
                "transaction_type": trade.transaction_type,
                "amount_range": trade.amount_range,
                "reporting_gap": trade.reporting_gap,
            })

        return {"ticker": ticker.upper(), "trades": trades}
    finally:
        db.close()


@router.get("/network")
def get_influence_network(
    entity_type: str = Query(..., regex="^(person|finance|health|tech|energy)$"),
    entity_id: str = Query(..., min_length=1),
    depth: int = Query(1, ge=1, le=2),
    limit: int = Query(50, ge=1, le=100),
):
    """Build an influence network graph centred on a person or company."""
    from services.influence_network import build_influence_network

    db = SessionLocal()
    try:
        return build_influence_network(db, entity_type, entity_id, depth=depth, limit=limit)
    finally:
        db.close()


@router.get("/closed-loops")
def get_closed_loops(
    entity_type: Optional[str] = Query(None, description="Filter by sector: finance, health, tech, energy"),
    entity_id: Optional[str] = Query(None, description="Filter by company ID"),
    person_id: Optional[str] = Query(None, description="Filter by politician person_id"),
    min_donation: float = Query(0, ge=0, description="Minimum donation amount"),
    year_from: int = Query(2020, ge=2010),
    year_to: int = Query(2026, le=2030),
    limit: int = Query(25, ge=1, le=100),
):
    """Detect closed-loop influence: company lobbies → bill → committee → donation to committee member."""
    from services.closed_loop_detection import find_closed_loops
    db = SessionLocal()
    try:
        return find_closed_loops(
            db=db,
            entity_type=entity_type,
            entity_id=entity_id,
            person_id=person_id,
            min_donation=min_donation,
            year_from=year_from,
            year_to=year_to,
            limit=limit,
        )
    finally:
        db.close()
