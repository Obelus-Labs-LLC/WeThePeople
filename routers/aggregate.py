"""
Aggregate sector-level endpoints for enforcement, lobbying, and contracts.

Returns all records for an entire sector in a single query instead of
requiring N individual per-company API calls from the frontend.

Refactored: uses a SECTOR_MODELS dispatch table so each endpoint is a
thin wrapper around a generic query helper.

Caching note: each aggregate query touches a sector's full child
table (lobbying / contracts / enforcement) and joins to the entity
table for display names. Wire-time per request is ~0.7-1.1s and the
underlying tables only update on the daily sync cadence, so this
module wraps each query in a 5-minute in-process TTL cache. The first
visitor pays the SQL cost; everyone in the next 5-minute window gets
the response from a dict lookup. The HTTP-layer Cache-Control header
(see middleware/security.py) covers browser-side reuse on top.
"""

import logging
import threading
import time

from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

logger = logging.getLogger(__name__)

# In-process TTL cache. Key = (kind, sector, limit). Value = (timestamp, payload).
_AGG_CACHE: dict = {}
_AGG_CACHE_LOCK = threading.Lock()
_AGG_CACHE_TTL = 300  # 5 minutes


def _cached_or_compute(kind: str, sector: str, limit: int, compute):
    """Generic in-process cache for the aggregate-router queries.

    `kind` is "enforcement" / "lobbying" / "contracts". `compute` is a
    zero-arg callable that runs the actual SQL and returns the response
    dict. We take a snapshot of the cache under the lock, then run the
    compute (potentially slow) OUTSIDE the lock so concurrent readers
    of OTHER keys don't block each other.
    """
    key = (kind, sector, int(limit))
    now = time.monotonic()
    with _AGG_CACHE_LOCK:
        hit = _AGG_CACHE.get(key)
    if hit is not None and (now - hit[0]) < _AGG_CACHE_TTL:
        return hit[1]
    payload = compute()
    with _AGG_CACHE_LOCK:
        _AGG_CACHE[key] = (time.monotonic(), payload)
    return payload

from models.database import get_db
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
from models.transportation_models import (
    TrackedTransportationCompany, TransportationEnforcement,
    TransportationLobbyingRecord, TransportationGovernmentContract,
)
from models.defense_models import (
    TrackedDefenseCompany, DefenseEnforcement,
    DefenseLobbyingRecord, DefenseGovernmentContract,
)
from models.chemicals_models import (
    TrackedChemicalCompany, ChemicalEnforcement,
    ChemicalLobbyingRecord, ChemicalGovernmentContract,
)
from models.agriculture_models import (
    TrackedAgricultureCompany, AgricultureEnforcement,
    AgricultureLobbyingRecord, AgricultureGovernmentContract,
)
from models.telecom_models import (
    TrackedTelecomCompany, TelecomEnforcement,
    TelecomLobbyingRecord, TelecomGovernmentContract,
)
from models.education_models import (
    TrackedEducationCompany, EducationEnforcement,
    EducationLobbyingRecord, EducationGovernmentContract,
)

router = APIRouter(prefix="/aggregate", tags=["aggregate"])


# ── Sector dispatch table ──
# Each sector maps to its entity (tracked) model, the FK column name on
# child tables, and the enforcement/lobbying/contracts model classes.

SECTOR_MODELS = {
    "finance": {
        "entity": TrackedInstitution,
        "entity_id_col": "institution_id",
        "enforcement": FinanceEnforcement,
        "lobbying": FinanceLobbyingRecord,
        "contracts": FinanceGovernmentContract,
    },
    "health": {
        "entity": TrackedCompany,
        "entity_id_col": "company_id",
        "enforcement": HealthEnforcement,
        "lobbying": HealthLobbyingRecord,
        "contracts": HealthGovernmentContract,
    },
    "tech": {
        "entity": TrackedTechCompany,
        "entity_id_col": "company_id",
        "enforcement": FTCEnforcement,
        "lobbying": LobbyingRecord,
        "contracts": GovernmentContract,
    },
    "energy": {
        "entity": TrackedEnergyCompany,
        "entity_id_col": "company_id",
        "enforcement": EnergyEnforcement,
        "lobbying": EnergyLobbyingRecord,
        "contracts": EnergyGovernmentContract,
    },
    "transportation": {
        "entity": TrackedTransportationCompany,
        "entity_id_col": "company_id",
        "enforcement": TransportationEnforcement,
        "lobbying": TransportationLobbyingRecord,
        "contracts": TransportationGovernmentContract,
    },
    "defense": {
        "entity": TrackedDefenseCompany,
        "entity_id_col": "company_id",
        "enforcement": DefenseEnforcement,
        "lobbying": DefenseLobbyingRecord,
        "contracts": DefenseGovernmentContract,
    },
    "chemicals": {
        "entity": TrackedChemicalCompany,
        "entity_id_col": "company_id",
        "enforcement": ChemicalEnforcement,
        "lobbying": ChemicalLobbyingRecord,
        "contracts": ChemicalGovernmentContract,
    },
    "agriculture": {
        "entity": TrackedAgricultureCompany,
        "entity_id_col": "company_id",
        "enforcement": AgricultureEnforcement,
        "lobbying": AgricultureLobbyingRecord,
        "contracts": AgricultureGovernmentContract,
    },
    "telecom": {
        "entity": TrackedTelecomCompany,
        "entity_id_col": "company_id",
        "enforcement": TelecomEnforcement,
        "lobbying": TelecomLobbyingRecord,
        "contracts": TelecomGovernmentContract,
    },
    "education": {
        "entity": TrackedEducationCompany,
        "entity_id_col": "company_id",
        "enforcement": EducationEnforcement,
        "lobbying": EducationLobbyingRecord,
        "contracts": EducationGovernmentContract,
    },
}


# ── Helpers ──

def _str_date(d):
    return str(d) if d else None


def _get_join_condition(model, entity_model, id_col):
    """Build the join ON clause: model.<id_col> == entity_model.<id_col>."""
    return getattr(model, id_col) == getattr(entity_model, id_col)


# ── Generic query functions ──

def _query_enforcement(sector: str, limit: int, db: Session):
    """Generic enforcement query for any sector. 5-min in-mem cache."""
    def _compute():
        cfg = SECTOR_MODELS[sector]
        model = cfg["enforcement"]
        entity = cfg["entity"]
        id_col = cfg["entity_id_col"]

        rows = (
            db.query(model, entity.display_name)
            .join(entity, _get_join_condition(model, entity, id_col))
            .order_by(desc(model.case_date))
            .limit(limit)
            .all()
        )
        total = (
            db.query(func.count(model.id))
            .join(entity, _get_join_condition(model, entity, id_col))
            .scalar()
        )
        return {
            "total": total,
            "actions": [{
                "id": a.id, "case_title": a.case_title,
                "case_date": _str_date(a.case_date), "case_url": a.case_url,
                "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount, "description": a.description,
                "source": a.source, "entity_id": getattr(a, id_col),
                "entity_name": name,
            } for a, name in rows],
        }
    return _cached_or_compute("enforcement", sector, limit, _compute)


def _query_lobbying(sector: str, limit: int, db: Session):
    """Generic lobbying query for any sector. 5-min in-mem cache."""
    def _compute():
        cfg = SECTOR_MODELS[sector]
        model = cfg["lobbying"]
        entity = cfg["entity"]
        id_col = cfg["entity_id_col"]

        rows = (
            db.query(model, entity.display_name)
            .join(entity, _get_join_condition(model, entity, id_col))
            .order_by(desc(model.filing_year), model.filing_period)
            .limit(limit)
            .all()
        )
        total = (
            db.query(func.count(model.id))
            .join(entity, _get_join_condition(model, entity, id_col))
            .scalar()
        )
        return {
            "total": total,
            "filings": [{
                "id": a.id, "filing_uuid": a.filing_uuid,
                "filing_year": a.filing_year, "filing_period": a.filing_period,
                "income": a.income, "expenses": a.expenses,
                "registrant_name": a.registrant_name, "client_name": a.client_name,
                "lobbying_issues": a.lobbying_issues,
                "government_entities": a.government_entities,
                "entity_id": getattr(a, id_col),
                "entity_name": name,
            } for a, name in rows],
        }
    return _cached_or_compute("lobbying", sector, limit, _compute)


def _query_contracts(sector: str, limit: int, db: Session):
    """Generic contracts query for any sector. 5-min in-mem cache."""
    def _compute():
        cfg = SECTOR_MODELS[sector]
        model = cfg["contracts"]
        entity = cfg["entity"]
        id_col = cfg["entity_id_col"]

        rows = (
            db.query(model, entity.display_name)
            .join(entity, _get_join_condition(model, entity, id_col))
            .order_by(desc(model.award_amount))
            .limit(limit)
            .all()
        )
        total = (
            db.query(func.count(model.id))
            .join(entity, _get_join_condition(model, entity, id_col))
            .scalar()
        )
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
                "entity_id": getattr(a, id_col),
                "entity_name": name,
            } for a, name in rows],
        }
    return _cached_or_compute("contracts", sector, limit, _compute)


# ── Enforcement endpoints ──

@router.get("/finance/enforcement")
def finance_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("finance", limit, db)


@router.get("/health/enforcement")
def health_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("health", limit, db)


@router.get("/tech/enforcement")
def tech_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("tech", limit, db)


@router.get("/energy/enforcement")
def energy_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("energy", limit, db)


@router.get("/transportation/enforcement")
def transportation_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("transportation", limit, db)


@router.get("/defense/enforcement")
def defense_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("defense", limit, db)


@router.get("/chemicals/enforcement")
def chemicals_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("chemicals", limit, db)


@router.get("/agriculture/enforcement")
def agriculture_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("agriculture", limit, db)


@router.get("/telecom/enforcement")
def telecom_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("telecom", limit, db)


@router.get("/education/enforcement")
def education_enforcement_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_enforcement("education", limit, db)


# ── Lobbying endpoints ──

@router.get("/finance/lobbying")
def finance_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("finance", limit, db)


@router.get("/health/lobbying")
def health_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("health", limit, db)


@router.get("/tech/lobbying")
def tech_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("tech", limit, db)


@router.get("/energy/lobbying")
def energy_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("energy", limit, db)


@router.get("/transportation/lobbying")
def transportation_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("transportation", limit, db)


@router.get("/defense/lobbying")
def defense_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("defense", limit, db)


@router.get("/chemicals/lobbying")
def chemicals_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("chemicals", limit, db)


@router.get("/agriculture/lobbying")
def agriculture_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("agriculture", limit, db)


@router.get("/telecom/lobbying")
def telecom_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("telecom", limit, db)


@router.get("/education/lobbying")
def education_lobbying_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_lobbying("education", limit, db)


# ── Contracts endpoints ──

@router.get("/finance/contracts")
def finance_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("finance", limit, db)


@router.get("/health/contracts")
def health_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("health", limit, db)


@router.get("/tech/contracts")
def tech_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("tech", limit, db)


@router.get("/energy/contracts")
def energy_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("energy", limit, db)


@router.get("/transportation/contracts")
def transportation_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("transportation", limit, db)


@router.get("/defense/contracts")
def defense_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("defense", limit, db)


@router.get("/chemicals/contracts")
def chemicals_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("chemicals", limit, db)


@router.get("/agriculture/contracts")
def agriculture_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("agriculture", limit, db)


@router.get("/telecom/contracts")
def telecom_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("telecom", limit, db)


@router.get("/education/contracts")
def education_contracts_all(limit: int = Query(500, ge=1, le=500), db: Session = Depends(get_db)):
    return _query_contracts("education", limit, db)
