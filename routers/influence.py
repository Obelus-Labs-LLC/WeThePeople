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
