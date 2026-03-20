"""
Aggregate sector-level endpoints for enforcement, lobbying, and contracts.

Returns all records for an entire sector in a single query instead of
requiring N individual per-company API calls from the frontend.
"""

from fastapi import APIRouter, Query
from sqlalchemy import desc, func, case

from models.database import SessionLocal
from models.finance_models import (
    TrackedInstitution, FinanceEnforcement, FinanceLobbyingRecord, FinanceGovernmentContract,
)
from models.health_models import (
    TrackedCompany, HealthEnforcement, HealthLobbyingRecord, HealthGovernmentContract,
)
from models.tech_models import (
    TrackedTechCompany, FTCEnforcement, LobbyingRecord, GovernmentContract,
)
from models.energy_models import (
    TrackedEnergyCompany, EnergyEnforcement, EnergyLobbyingRecord, EnergyGovernmentContract,
)

router = APIRouter(prefix="/aggregate", tags=["aggregate"])


# ── Helpers ──

def _str_date(d):
    return str(d) if d else None


# ── ENFORCEMENT ──

@router.get("/finance/enforcement")
def finance_enforcement_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(FinanceEnforcement, TrackedInstitution.display_name)
            .join(TrackedInstitution, FinanceEnforcement.institution_id == TrackedInstitution.institution_id)
            .order_by(desc(FinanceEnforcement.case_date))
            .limit(limit)
            .all()
        )
        return {
            "total": db.query(func.count(FinanceEnforcement.id)).scalar(),
            "actions": [{
                "id": a.id, "case_title": a.case_title,
                "case_date": _str_date(a.case_date), "case_url": a.case_url,
                "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount, "description": a.description,
                "source": a.source, "entity_id": a.institution_id,
                "entity_name": name,
            } for a, name in rows],
        }
    finally:
        db.close()


@router.get("/health/enforcement")
def health_enforcement_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(HealthEnforcement, TrackedCompany.display_name)
            .join(TrackedCompany, HealthEnforcement.company_id == TrackedCompany.company_id)
            .order_by(desc(HealthEnforcement.case_date))
            .limit(limit)
            .all()
        )
        return {
            "total": db.query(func.count(HealthEnforcement.id)).scalar(),
            "actions": [{
                "id": a.id, "case_title": a.case_title,
                "case_date": _str_date(a.case_date), "case_url": a.case_url,
                "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount, "description": a.description,
                "source": a.source, "entity_id": a.company_id,
                "entity_name": name,
            } for a, name in rows],
        }
    finally:
        db.close()


@router.get("/tech/enforcement")
def tech_enforcement_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(FTCEnforcement, TrackedTechCompany.display_name)
            .join(TrackedTechCompany, FTCEnforcement.company_id == TrackedTechCompany.company_id)
            .order_by(desc(FTCEnforcement.case_date))
            .limit(limit)
            .all()
        )
        return {
            "total": db.query(func.count(FTCEnforcement.id)).scalar(),
            "actions": [{
                "id": a.id, "case_title": a.case_title,
                "case_date": _str_date(a.case_date), "case_url": a.case_url,
                "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount, "description": a.description,
                "source": a.source, "entity_id": a.company_id,
                "entity_name": name,
            } for a, name in rows],
        }
    finally:
        db.close()


@router.get("/energy/enforcement")
def energy_enforcement_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(EnergyEnforcement, TrackedEnergyCompany.display_name)
            .join(TrackedEnergyCompany, EnergyEnforcement.company_id == TrackedEnergyCompany.company_id)
            .order_by(desc(EnergyEnforcement.case_date))
            .limit(limit)
            .all()
        )
        return {
            "total": db.query(func.count(EnergyEnforcement.id)).scalar(),
            "actions": [{
                "id": a.id, "case_title": a.case_title,
                "case_date": _str_date(a.case_date), "case_url": a.case_url,
                "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount, "description": a.description,
                "source": a.source, "entity_id": a.company_id,
                "entity_name": name,
            } for a, name in rows],
        }
    finally:
        db.close()


# ── LOBBYING ──

def _lobbying_response(rows, total, id_field):
    return {
        "total": total,
        "filings": [{
            "id": a.id, "filing_uuid": a.filing_uuid,
            "filing_year": a.filing_year, "filing_period": a.filing_period,
            "income": a.income, "expenses": a.expenses,
            "registrant_name": a.registrant_name, "client_name": a.client_name,
            "lobbying_issues": a.lobbying_issues,
            "government_entities": a.government_entities,
            "entity_id": getattr(a, id_field),
            "entity_name": name,
        } for a, name in rows],
    }


@router.get("/finance/lobbying")
def finance_lobbying_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(FinanceLobbyingRecord, TrackedInstitution.display_name)
            .join(TrackedInstitution, FinanceLobbyingRecord.institution_id == TrackedInstitution.institution_id)
            .order_by(desc(FinanceLobbyingRecord.filing_year), FinanceLobbyingRecord.filing_period)
            .limit(limit)
            .all()
        )
        total = db.query(func.count(FinanceLobbyingRecord.id)).scalar()
        return _lobbying_response(rows, total, "institution_id")
    finally:
        db.close()


@router.get("/health/lobbying")
def health_lobbying_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(HealthLobbyingRecord, TrackedCompany.display_name)
            .join(TrackedCompany, HealthLobbyingRecord.company_id == TrackedCompany.company_id)
            .order_by(desc(HealthLobbyingRecord.filing_year), HealthLobbyingRecord.filing_period)
            .limit(limit)
            .all()
        )
        total = db.query(func.count(HealthLobbyingRecord.id)).scalar()
        return _lobbying_response(rows, total, "company_id")
    finally:
        db.close()


@router.get("/tech/lobbying")
def tech_lobbying_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(LobbyingRecord, TrackedTechCompany.display_name)
            .join(TrackedTechCompany, LobbyingRecord.company_id == TrackedTechCompany.company_id)
            .order_by(desc(LobbyingRecord.filing_year), LobbyingRecord.filing_period)
            .limit(limit)
            .all()
        )
        total = db.query(func.count(LobbyingRecord.id)).scalar()
        return _lobbying_response(rows, total, "company_id")
    finally:
        db.close()


@router.get("/energy/lobbying")
def energy_lobbying_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(EnergyLobbyingRecord, TrackedEnergyCompany.display_name)
            .join(TrackedEnergyCompany, EnergyLobbyingRecord.company_id == TrackedEnergyCompany.company_id)
            .order_by(desc(EnergyLobbyingRecord.filing_year), EnergyLobbyingRecord.filing_period)
            .limit(limit)
            .all()
        )
        total = db.query(func.count(EnergyLobbyingRecord.id)).scalar()
        return _lobbying_response(rows, total, "company_id")
    finally:
        db.close()


# ── CONTRACTS ──

def _contracts_response(rows, total, id_field):
    return {
        "total": total,
        "contracts": [{
            "id": a.id, "award_id": a.award_id,
            "award_amount": a.award_amount,
            "awarding_agency": a.awarding_agency,
            "description": a.description,
            "start_date": _str_date(a.start_date),
            "end_date": _str_date(a.end_date),
            "contract_type": a.contract_type,
            "entity_id": getattr(a, id_field),
            "entity_name": name,
        } for a, name in rows],
    }


@router.get("/finance/contracts")
def finance_contracts_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(FinanceGovernmentContract, TrackedInstitution.display_name)
            .join(TrackedInstitution, FinanceGovernmentContract.institution_id == TrackedInstitution.institution_id)
            .order_by(desc(FinanceGovernmentContract.award_amount))
            .limit(limit)
            .all()
        )
        total = db.query(func.count(FinanceGovernmentContract.id)).scalar()
        return _contracts_response(rows, total, "institution_id")
    finally:
        db.close()


@router.get("/health/contracts")
def health_contracts_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(HealthGovernmentContract, TrackedCompany.display_name)
            .join(TrackedCompany, HealthGovernmentContract.company_id == TrackedCompany.company_id)
            .order_by(desc(HealthGovernmentContract.award_amount))
            .limit(limit)
            .all()
        )
        total = db.query(func.count(HealthGovernmentContract.id)).scalar()
        return _contracts_response(rows, total, "company_id")
    finally:
        db.close()


@router.get("/tech/contracts")
def tech_contracts_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(GovernmentContract, TrackedTechCompany.display_name)
            .join(TrackedTechCompany, GovernmentContract.company_id == TrackedTechCompany.company_id)
            .order_by(desc(GovernmentContract.award_amount))
            .limit(limit)
            .all()
        )
        total = db.query(func.count(GovernmentContract.id)).scalar()
        return _contracts_response(rows, total, "company_id")
    finally:
        db.close()


@router.get("/energy/contracts")
def energy_contracts_all(limit: int = Query(500, ge=1, le=2000)):
    db = SessionLocal()
    try:
        rows = (
            db.query(EnergyGovernmentContract, TrackedEnergyCompany.display_name)
            .join(TrackedEnergyCompany, EnergyGovernmentContract.company_id == TrackedEnergyCompany.company_id)
            .order_by(desc(EnergyGovernmentContract.award_amount))
            .limit(limit)
            .all()
        )
        total = db.query(func.count(EnergyGovernmentContract.id)).scalar()
        return _contracts_response(rows, total, "company_id")
    finally:
        db.close()
