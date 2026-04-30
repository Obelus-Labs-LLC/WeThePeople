"""
Cross-sector influence routes — aggregate lobbying, contracts, enforcement, donations across all sectors.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional

logger = logging.getLogger(__name__)

from models.database import get_db, CompanyDonation, CongressionalTrade, TrackedMember
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
from models.transportation_models import (
    TrackedTransportationCompany, TransportationLobbyingRecord, TransportationGovernmentContract, TransportationEnforcement,
)
from models.defense_models import (
    TrackedDefenseCompany, DefenseLobbyingRecord, DefenseGovernmentContract, DefenseEnforcement,
)
from models.chemicals_models import (
    TrackedChemicalCompany, ChemicalLobbyingRecord, ChemicalGovernmentContract, ChemicalEnforcement,
)
from models.agriculture_models import (
    TrackedAgricultureCompany, AgricultureLobbyingRecord, AgricultureGovernmentContract, AgricultureEnforcement,
)
from models.education_models import (
    TrackedEducationCompany, EducationLobbyingRecord, EducationGovernmentContract, EducationEnforcement,
)
from models.telecom_models import (
    TrackedTelecomCompany, TelecomLobbyingRecord, TelecomGovernmentContract, TelecomEnforcement,
)
from models.government_data_models import RegulatoryComment
from models.response_schemas import InfluenceStatsResponse
from utils.db_compat import lobby_spend

import threading
import time as _time

router = APIRouter(prefix="/influence", tags=["influence"])
limiter = Limiter(key_func=get_remote_address)

_freshness_cache: dict = {"ts": 0, "data": None, "computing": False}
_freshness_lock = threading.Lock()
_FRESHNESS_TTL = 300  # seconds

_stats_cache: dict = {"ts": 0, "data": None, "computing": False}
_stats_lock = threading.Lock()
_STATS_TTL = 300  # 5 minutes — see top-lobbying/top-contracts caches

# Top-lobbying / top-contracts: each runs 10 unindexed GROUP-BY scans
# (one per sector). Cache the result by `limit` for 5 minutes; the
# underlying numbers are aggregates over months/years and don't move
# minute-to-minute, so this is safe.
_top_lobby_cache: dict = {}
_top_lobby_lock = threading.Lock()
_top_contract_cache: dict = {}
_top_contract_lock = threading.Lock()
_TOP_TTL = 300  # 5 minutes


@router.get("/data-freshness")
def data_freshness(db: Session = Depends(get_db)):
    """Return last-updated timestamps and record counts for each major data type.

    The `computing` flag is set when a recompute starts and cleared in a
    `finally` block — without that guarantee a transient DB error left the
    flag permanently `True` and no future request ever recomputed.
    """
    now = _time.time()
    with _freshness_lock:
        if _freshness_cache["data"] is not None and (now - _freshness_cache["ts"]) < _FRESHNESS_TTL:
            return _freshness_cache["data"]
        if _freshness_cache["computing"] and _freshness_cache["data"] is not None:
            return _freshness_cache["data"]  # serve stale while another thread recomputes
        _freshness_cache["computing"] = True

    def _max_date_and_count(model, date_col):
        """Return (max_date_str_or_None, count) for a model/date column."""
        latest = db.query(func.max(date_col)).scalar()
        count = db.query(func.count(model.id)).scalar() or 0
        date_str = str(latest) if latest else None
        return date_str, count

    try:
        return _compute_freshness(db, _max_date_and_count)
    except Exception:
        # Clear computing flag so the next request retries instead of
        # serving stale data forever.
        with _freshness_lock:
            _freshness_cache["computing"] = False
        raise


def _compute_freshness(db: Session, _max_date_and_count):
    # -- Lobbying: filing_year is int, not a date. Use created_at as best proxy. --
    lobbying_models = [
        (LobbyingRecord, LobbyingRecord.created_at),
        (FinanceLobbyingRecord, FinanceLobbyingRecord.created_at),
        (HealthLobbyingRecord, HealthLobbyingRecord.created_at),
        (EnergyLobbyingRecord, EnergyLobbyingRecord.created_at),
        (TransportationLobbyingRecord, TransportationLobbyingRecord.created_at),
        (DefenseLobbyingRecord, DefenseLobbyingRecord.created_at),
        (ChemicalLobbyingRecord, ChemicalLobbyingRecord.created_at),
        (AgricultureLobbyingRecord, AgricultureLobbyingRecord.created_at),
        (EducationLobbyingRecord, EducationLobbyingRecord.created_at),
        (TelecomLobbyingRecord, TelecomLobbyingRecord.created_at),
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
        (TransportationGovernmentContract, TransportationGovernmentContract.start_date),
        (DefenseGovernmentContract, DefenseGovernmentContract.start_date),
        (ChemicalGovernmentContract, ChemicalGovernmentContract.start_date),
        (AgricultureGovernmentContract, AgricultureGovernmentContract.start_date),
        (EducationGovernmentContract, EducationGovernmentContract.start_date),
        (TelecomGovernmentContract, TelecomGovernmentContract.start_date),
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
        (TransportationEnforcement, TransportationEnforcement.case_date),
        (DefenseEnforcement, DefenseEnforcement.case_date),
        (ChemicalEnforcement, ChemicalEnforcement.case_date),
        (AgricultureEnforcement, AgricultureEnforcement.case_date),
        (EducationEnforcement, EducationEnforcement.case_date),
        (TelecomEnforcement, TelecomEnforcement.case_date),
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

    result = {
        "lobbying": {"last_updated": lobby_latest, "record_count": lobby_count},
        "contracts": {"last_updated": contract_latest, "record_count": contract_count},
        "enforcement": {"last_updated": enforcement_latest, "record_count": enforcement_count},
        "trades": {"last_updated": trades_latest, "record_count": trades_count},
        "insider_trades": {"last_updated": insider_latest, "record_count": insider_count},
    }
    with _freshness_lock:
        _freshness_cache["ts"] = _time.time()
        _freshness_cache["data"] = result
        _freshness_cache["computing"] = False
    return result


@router.get("/stats", response_model=InfluenceStatsResponse)
def get_influence_stats(db: Session = Depends(get_db)):
    """Aggregate influence stats across all sectors.

    The `computing` flag is cleared in a `try/except` even on transient
    failure so a single DB error doesn't lock out future recomputes.
    """
    now = _time.time()
    with _stats_lock:
        if _stats_cache["data"] is not None and (now - _stats_cache["ts"]) < _STATS_TTL:
            return _stats_cache["data"]
        if _stats_cache["computing"] and _stats_cache["data"] is not None:
            return _stats_cache["data"]  # serve stale while another thread recomputes
        _stats_cache["computing"] = True

    try:
        return _compute_influence_stats(db)
    except Exception:
        with _stats_lock:
            _stats_cache["computing"] = False
        raise


def _compute_influence_stats(db: Session):
    # Lobbying totals
    finance_lobbying = db.query(func.sum(lobby_spend(FinanceLobbyingRecord))).scalar() or 0
    health_lobbying = db.query(func.sum(lobby_spend(HealthLobbyingRecord))).scalar() or 0
    tech_lobbying = db.query(func.sum(lobby_spend(LobbyingRecord))).scalar() or 0
    energy_lobbying = db.query(func.sum(lobby_spend(EnergyLobbyingRecord))).scalar() or 0
    transport_lobbying = db.query(func.sum(lobby_spend(TransportationLobbyingRecord))).scalar() or 0
    defense_lobbying = db.query(func.sum(lobby_spend(DefenseLobbyingRecord))).scalar() or 0
    chemicals_lobbying = db.query(func.sum(lobby_spend(ChemicalLobbyingRecord))).scalar() or 0
    agriculture_lobbying = db.query(func.sum(lobby_spend(AgricultureLobbyingRecord))).scalar() or 0
    education_lobbying = db.query(func.sum(lobby_spend(EducationLobbyingRecord))).scalar() or 0
    telecom_lobbying = db.query(func.sum(lobby_spend(TelecomLobbyingRecord))).scalar() or 0
    total_lobbying = finance_lobbying + health_lobbying + tech_lobbying + energy_lobbying + transport_lobbying + defense_lobbying + chemicals_lobbying + agriculture_lobbying + education_lobbying + telecom_lobbying

    # Contract totals
    finance_contracts = db.query(func.sum(FinanceGovernmentContract.award_amount)).scalar() or 0
    health_contracts = db.query(func.sum(HealthGovernmentContract.award_amount)).scalar() or 0
    tech_contracts = db.query(func.sum(GovernmentContract.award_amount)).scalar() or 0
    energy_contracts = db.query(func.sum(EnergyGovernmentContract.award_amount)).scalar() or 0
    transport_contracts = db.query(func.sum(TransportationGovernmentContract.award_amount)).scalar() or 0
    defense_contracts = db.query(func.sum(DefenseGovernmentContract.award_amount)).scalar() or 0
    chemicals_contracts = db.query(func.sum(ChemicalGovernmentContract.award_amount)).scalar() or 0
    agriculture_contracts = db.query(func.sum(AgricultureGovernmentContract.award_amount)).scalar() or 0
    education_contracts = db.query(func.sum(EducationGovernmentContract.award_amount)).scalar() or 0
    telecom_contracts = db.query(func.sum(TelecomGovernmentContract.award_amount)).scalar() or 0
    total_contracts = finance_contracts + health_contracts + tech_contracts + energy_contracts + transport_contracts + defense_contracts + chemicals_contracts + agriculture_contracts + education_contracts + telecom_contracts

    # Enforcement totals
    finance_enforcement = db.query(func.count(FinanceEnforcement.id)).scalar() or 0
    health_enforcement = db.query(func.count(HealthEnforcement.id)).scalar() or 0
    tech_enforcement = db.query(func.count(FTCEnforcement.id)).scalar() or 0
    energy_enforcement = db.query(func.count(EnergyEnforcement.id)).scalar() or 0
    transport_enforcement = db.query(func.count(TransportationEnforcement.id)).scalar() or 0
    defense_enforcement = db.query(func.count(DefenseEnforcement.id)).scalar() or 0
    chemicals_enforcement = db.query(func.count(ChemicalEnforcement.id)).scalar() or 0
    agriculture_enforcement = db.query(func.count(AgricultureEnforcement.id)).scalar() or 0
    education_enforcement = db.query(func.count(EducationEnforcement.id)).scalar() or 0
    telecom_enforcement = db.query(func.count(TelecomEnforcement.id)).scalar() or 0
    total_enforcement = finance_enforcement + health_enforcement + tech_enforcement + energy_enforcement + transport_enforcement + defense_enforcement + chemicals_enforcement + agriculture_enforcement + education_enforcement + telecom_enforcement

    # Politicians tracked (all active members)
    politicians_connected = db.query(func.count(TrackedMember.id)).filter(
        TrackedMember.is_active == 1
    ).scalar() or 0

    result = {
        "total_lobbying_spend": total_lobbying,
        "total_contract_value": total_contracts,
        "total_enforcement_actions": total_enforcement,
        "politicians_connected": politicians_connected,
        "by_sector": {
            "finance": {"lobbying": finance_lobbying, "contracts": finance_contracts, "enforcement": finance_enforcement},
            "health": {"lobbying": health_lobbying, "contracts": health_contracts, "enforcement": health_enforcement},
            "tech": {"lobbying": tech_lobbying, "contracts": tech_contracts, "enforcement": tech_enforcement},
            "energy": {"lobbying": energy_lobbying, "contracts": energy_contracts, "enforcement": energy_enforcement},
            "transportation": {"lobbying": transport_lobbying, "contracts": transport_contracts, "enforcement": transport_enforcement},
            "defense": {"lobbying": defense_lobbying, "contracts": defense_contracts, "enforcement": defense_enforcement},
            "chemicals": {"lobbying": chemicals_lobbying, "contracts": chemicals_contracts, "enforcement": chemicals_enforcement},
            "agriculture": {"lobbying": agriculture_lobbying, "contracts": agriculture_contracts, "enforcement": agriculture_enforcement},
            "education": {"lobbying": education_lobbying, "contracts": education_contracts, "enforcement": education_enforcement},
            "telecom": {"lobbying": telecom_lobbying, "contracts": telecom_contracts, "enforcement": telecom_enforcement},
        },
    }

    with _stats_lock:
        _stats_cache["data"] = result
        _stats_cache["ts"] = _time.time()
        _stats_cache["computing"] = False
    return result


@router.get("/top-lobbying")
def get_top_lobbying(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    """Top lobbying spenders across all sectors. Cached for 5 minutes."""
    cache_key = limit
    now = _time.time()
    with _top_lobby_lock:
        cached = _top_lobby_cache.get(cache_key)
        if cached and (now - cached["ts"]) < _TOP_TTL:
            return cached["data"]

    data = _compute_top_lobbying(db, limit)
    with _top_lobby_lock:
        _top_lobby_cache[cache_key] = {"ts": _time.time(), "data": data}
    return data


def _compute_top_lobbying(db: Session, limit: int):
    results = []

    # Finance
    rows = db.query(
        TrackedInstitution.institution_id, TrackedInstitution.display_name,
        func.sum(lobby_spend(FinanceLobbyingRecord)),
    ).join(FinanceLobbyingRecord, FinanceLobbyingRecord.institution_id == TrackedInstitution.institution_id
    ).group_by(TrackedInstitution.institution_id, TrackedInstitution.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "finance", "total_lobbying": total or 0})

    # Health
    rows = db.query(
        TrackedCompany.company_id, TrackedCompany.display_name,
        func.sum(lobby_spend(HealthLobbyingRecord)),
    ).join(HealthLobbyingRecord, HealthLobbyingRecord.company_id == TrackedCompany.company_id
    ).group_by(TrackedCompany.company_id, TrackedCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "health", "total_lobbying": total or 0})

    # Tech
    rows = db.query(
        TrackedTechCompany.company_id, TrackedTechCompany.display_name,
        func.sum(lobby_spend(LobbyingRecord)),
    ).join(LobbyingRecord, LobbyingRecord.company_id == TrackedTechCompany.company_id
    ).group_by(TrackedTechCompany.company_id, TrackedTechCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "tech", "total_lobbying": total or 0})

    # Energy
    rows = db.query(
        TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name,
        func.sum(lobby_spend(EnergyLobbyingRecord)),
    ).join(EnergyLobbyingRecord, EnergyLobbyingRecord.company_id == TrackedEnergyCompany.company_id
    ).group_by(TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "energy", "total_lobbying": total or 0})

    # Transportation
    rows = db.query(
        TrackedTransportationCompany.company_id, TrackedTransportationCompany.display_name,
        func.sum(lobby_spend(TransportationLobbyingRecord)),
    ).join(TransportationLobbyingRecord, TransportationLobbyingRecord.company_id == TrackedTransportationCompany.company_id
    ).group_by(TrackedTransportationCompany.company_id, TrackedTransportationCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "transportation", "total_lobbying": total or 0})

    # Defense
    rows = db.query(
        TrackedDefenseCompany.company_id, TrackedDefenseCompany.display_name,
        func.sum(lobby_spend(DefenseLobbyingRecord)),
    ).join(DefenseLobbyingRecord, DefenseLobbyingRecord.company_id == TrackedDefenseCompany.company_id
    ).group_by(TrackedDefenseCompany.company_id, TrackedDefenseCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "defense", "total_lobbying": total or 0})

    # Chemicals
    rows = db.query(
        TrackedChemicalCompany.company_id, TrackedChemicalCompany.display_name,
        func.sum(lobby_spend(ChemicalLobbyingRecord)),
    ).join(ChemicalLobbyingRecord, ChemicalLobbyingRecord.company_id == TrackedChemicalCompany.company_id
    ).group_by(TrackedChemicalCompany.company_id, TrackedChemicalCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "chemicals", "total_lobbying": total or 0})

    # Agriculture
    rows = db.query(
        TrackedAgricultureCompany.company_id, TrackedAgricultureCompany.display_name,
        func.sum(lobby_spend(AgricultureLobbyingRecord)),
    ).join(AgricultureLobbyingRecord, AgricultureLobbyingRecord.company_id == TrackedAgricultureCompany.company_id
    ).group_by(TrackedAgricultureCompany.company_id, TrackedAgricultureCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "agriculture", "total_lobbying": total or 0})

    # Education
    rows = db.query(
        TrackedEducationCompany.company_id, TrackedEducationCompany.display_name,
        func.sum(lobby_spend(EducationLobbyingRecord)),
    ).join(EducationLobbyingRecord, EducationLobbyingRecord.company_id == TrackedEducationCompany.company_id
    ).group_by(TrackedEducationCompany.company_id, TrackedEducationCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "education", "total_lobbying": total or 0})

    # Telecom
    rows = db.query(
        TrackedTelecomCompany.company_id, TrackedTelecomCompany.display_name,
        func.sum(lobby_spend(TelecomLobbyingRecord)),
    ).join(TelecomLobbyingRecord, TelecomLobbyingRecord.company_id == TrackedTelecomCompany.company_id
    ).group_by(TrackedTelecomCompany.company_id, TrackedTelecomCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "telecom", "total_lobbying": total or 0})

    results.sort(key=lambda x: x["total_lobbying"], reverse=True)
    return {"leaders": results[:limit]}


@router.get("/spending-by-state")
def get_spending_by_state(
    metric: str = Query("donations", pattern="^(donations|members|lobbying)$"),
    sector: Optional[str] = Query(None, pattern="^(finance|health|tech|energy|transportation|defense|chemicals|agriculture|telecom|education)$"),
    db: Session = Depends(get_db),
):
    """
    Aggregate political-influence data by US state.

    Supported metrics:
      - donations: total CompanyDonation.amount flowing to politicians in each state
      - members:   count of tracked members per state
      - lobbying:  total lobbying spend from companies donating to each state's politicians
    """
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
        if sector is None or sector == "transportation":
            lobby_configs.append((TransportationLobbyingRecord, TransportationLobbyingRecord.company_id, "transportation"))
        if sector is None or sector == "defense":
            lobby_configs.append((DefenseLobbyingRecord, DefenseLobbyingRecord.company_id, "defense"))
        if sector is None or sector == "chemicals":
            lobby_configs.append((ChemicalLobbyingRecord, ChemicalLobbyingRecord.company_id, "chemicals"))
        if sector is None or sector == "agriculture":
            lobby_configs.append((AgricultureLobbyingRecord, AgricultureLobbyingRecord.company_id, "agriculture"))
        if sector is None or sector == "education":
            lobby_configs.append((EducationLobbyingRecord, EducationLobbyingRecord.company_id, "education"))
        if sector is None or sector == "telecom":
            lobby_configs.append((TelecomLobbyingRecord, TelecomLobbyingRecord.company_id, "telecom"))

        for lobby_model, entity_col, sec in lobby_configs:
            # Subquery: aggregate lobbying income per company first
            lobby_agg = (
                db.query(
                    entity_col.label("entity_id"),
                    func.sum(lobby_spend(lobby_model)).label("total_income"),
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

            # Count how many states each company donates to, so we can
            # proportionally distribute their lobbying spend across states
            state_count_sq = (
                db.query(
                    donation_states.c.entity_id.label("entity_id"),
                    func.count().label("num_states"),
                )
                .group_by(donation_states.c.entity_id)
                .subquery()
            )

            q = db.query(
                donation_states.c.state,
                func.sum(lobby_agg.c.total_income / state_count_sq.c.num_states),
                func.count(func.distinct(lobby_agg.c.entity_id)),
            ).select_from(lobby_agg).join(
                donation_states,
                donation_states.c.entity_id == lobby_agg.c.entity_id,
            ).join(
                state_count_sq,
                state_count_sq.c.entity_id == lobby_agg.c.entity_id,
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


@router.get("/top-contracts")
def get_top_contracts(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    """Top government contract recipients across all sectors. Cached for 5 minutes."""
    cache_key = limit
    now = _time.time()
    with _top_contract_lock:
        cached = _top_contract_cache.get(cache_key)
        if cached and (now - cached["ts"]) < _TOP_TTL:
            return cached["data"]

    data = _compute_top_contracts(db, limit)
    with _top_contract_lock:
        _top_contract_cache[cache_key] = {"ts": _time.time(), "data": data}
    return data


def _compute_top_contracts(db: Session, limit: int):
    results = []

    # Finance
    rows = db.query(
        TrackedInstitution.institution_id, TrackedInstitution.display_name,
        func.sum(FinanceGovernmentContract.award_amount),
    ).join(FinanceGovernmentContract, FinanceGovernmentContract.institution_id == TrackedInstitution.institution_id
    ).group_by(TrackedInstitution.institution_id, TrackedInstitution.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "finance", "total_contracts": total or 0})

    # Health
    rows = db.query(
        TrackedCompany.company_id, TrackedCompany.display_name,
        func.sum(HealthGovernmentContract.award_amount),
    ).join(HealthGovernmentContract, HealthGovernmentContract.company_id == TrackedCompany.company_id
    ).group_by(TrackedCompany.company_id, TrackedCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "health", "total_contracts": total or 0})

    # Tech
    rows = db.query(
        TrackedTechCompany.company_id, TrackedTechCompany.display_name,
        func.sum(GovernmentContract.award_amount),
    ).join(GovernmentContract, GovernmentContract.company_id == TrackedTechCompany.company_id
    ).group_by(TrackedTechCompany.company_id, TrackedTechCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "tech", "total_contracts": total or 0})

    # Energy
    rows = db.query(
        TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name,
        func.sum(EnergyGovernmentContract.award_amount),
    ).join(EnergyGovernmentContract, EnergyGovernmentContract.company_id == TrackedEnergyCompany.company_id
    ).group_by(TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "energy", "total_contracts": total or 0})

    # Transportation
    rows = db.query(
        TrackedTransportationCompany.company_id, TrackedTransportationCompany.display_name,
        func.sum(TransportationGovernmentContract.award_amount),
    ).join(TransportationGovernmentContract, TransportationGovernmentContract.company_id == TrackedTransportationCompany.company_id
    ).group_by(TrackedTransportationCompany.company_id, TrackedTransportationCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "transportation", "total_contracts": total or 0})

    # Defense
    rows = db.query(
        TrackedDefenseCompany.company_id, TrackedDefenseCompany.display_name,
        func.sum(DefenseGovernmentContract.award_amount),
    ).join(DefenseGovernmentContract, DefenseGovernmentContract.company_id == TrackedDefenseCompany.company_id
    ).group_by(TrackedDefenseCompany.company_id, TrackedDefenseCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "defense", "total_contracts": total or 0})

    # Chemicals
    rows = db.query(
        TrackedChemicalCompany.company_id, TrackedChemicalCompany.display_name,
        func.sum(ChemicalGovernmentContract.award_amount),
    ).join(ChemicalGovernmentContract, ChemicalGovernmentContract.company_id == TrackedChemicalCompany.company_id
    ).group_by(TrackedChemicalCompany.company_id, TrackedChemicalCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "chemicals", "total_contracts": total or 0})

    # Agriculture
    rows = db.query(
        TrackedAgricultureCompany.company_id, TrackedAgricultureCompany.display_name,
        func.sum(AgricultureGovernmentContract.award_amount),
    ).join(AgricultureGovernmentContract, AgricultureGovernmentContract.company_id == TrackedAgricultureCompany.company_id
    ).group_by(TrackedAgricultureCompany.company_id, TrackedAgricultureCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "agriculture", "total_contracts": total or 0})

    # Education
    rows = db.query(
        TrackedEducationCompany.company_id, TrackedEducationCompany.display_name,
        func.sum(EducationGovernmentContract.award_amount),
    ).join(EducationGovernmentContract, EducationGovernmentContract.company_id == TrackedEducationCompany.company_id
    ).group_by(TrackedEducationCompany.company_id, TrackedEducationCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "education", "total_contracts": total or 0})

    # Telecom
    rows = db.query(
        TrackedTelecomCompany.company_id, TrackedTelecomCompany.display_name,
        func.sum(TelecomGovernmentContract.award_amount),
    ).join(TelecomGovernmentContract, TelecomGovernmentContract.company_id == TrackedTelecomCompany.company_id
    ).group_by(TrackedTelecomCompany.company_id, TrackedTelecomCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "telecom", "total_contracts": total or 0})

    results.sort(key=lambda x: x["total_contracts"], reverse=True)
    return {"leaders": results[:limit]}


@router.get("/trade-timeline")
def get_trade_timeline(
    ticker: str = Query(..., min_length=1),
    person_id: Optional[str] = Query(None),
    time_range: str = Query("1y", alias="range", pattern="^(3m|6m|1y|2y)$"),
    db: Session = Depends(get_db),
):
    """
    Return congressional trade markers for a given ticker, optionally filtered
    by person_id. Used to overlay buy/sell events on a timeline chart.
    """
    from datetime import date, timedelta

    range_days = {"3m": 90, "6m": 180, "1y": 365, "2y": 730}
    cutoff = date.today() - timedelta(days=range_days[time_range])

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


@router.get("/network")
def get_influence_network(
    entity_type: str = Query(..., pattern="^(person|finance|health|tech|energy|transportation|defense|chemicals|agriculture)$"),
    entity_id: str = Query(..., min_length=1),
    depth: int = Query(1, ge=1, le=2),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Build an influence network graph centred on a person or company."""
    logger.info("Influence network request: %s/%s depth=%d", entity_type, entity_id, depth)
    from services.influence_network import build_influence_network

    try:
        return build_influence_network(db, entity_type, entity_id, depth=depth, limit=limit)
    except Exception as e:
        logger.exception("Influence network error for %s/%s: %s", entity_type, entity_id, e)
        raise HTTPException(status_code=500, detail="Network build failed. Please try again later.")


@router.get("/closed-loops")
@limiter.limit("60/minute")
def get_closed_loops(
    request: Request,
    entity_type: Optional[str] = Query(None, description="Filter by sector: finance, health, tech, energy, transportation, defense, chemicals, agriculture, telecom, education"),
    entity_id: Optional[str] = Query(None, description="Filter by company ID"),
    person_id: Optional[str] = Query(None, description="Filter by politician person_id"),
    min_donation: float = Query(0, ge=0, description="Minimum donation amount"),
    year_from: int = Query(2020, ge=2010),
    year_to: int = Query(2026, le=2030),
    limit: int = Query(25, ge=1, le=250),
    offset: int = Query(0, ge=0, description="Pagination offset (use with stats.has_more)"),
    max_per_company: int = Query(0, ge=0, le=50, description="Cap loops per company; 0 = no cap, 1 = one per company (max diversity)"),
    db: Session = Depends(get_db),
):
    """Detect closed-loop influence: company lobbies -> bill -> committee -> donation to committee member."""
    from services.closed_loop_detection import find_closed_loops
    return find_closed_loops(
        db=db,
        entity_type=entity_type,
        entity_id=entity_id,
        person_id=person_id,
        min_donation=min_donation,
        year_from=year_from,
        year_to=year_to,
        limit=limit,
        offset=offset,
        max_per_company=max_per_company,
    )


@router.get("/money-flow")
def get_money_flow(
    sector: Optional[str] = Query(None, description="Filter by sector: finance, health, tech, energy"),
    limit: int = Query(15, ge=5, le=50),
    db: Session = Depends(get_db),
):
    """
    Build Sankey-style money flow data: Company -> Lobbying/Donations -> Politician.
    Returns nodes and links for a Sankey diagram.
    """
    nodes = []
    links = []
    node_map: dict[str, int] = {}

    def get_node_id(name: str, group: str) -> int:
        key = f"{group}:{name}"
        if key not in node_map:
            node_map[key] = len(nodes)
            nodes.append({"name": name, "group": group})
        return node_map[key]

    sector_configs = []
    if not sector or sector == "finance":
        sector_configs.append({
            "label": "Finance",
            "entity_model": TrackedInstitution,
            "id_field": "institution_id",
            "lobby_model": FinanceLobbyingRecord,
            "lobby_fk": "institution_id",
        })
    if not sector or sector == "health":
        sector_configs.append({
            "label": "Health",
            "entity_model": TrackedCompany,
            "id_field": "company_id",
            "lobby_model": HealthLobbyingRecord,
            "lobby_fk": "company_id",
        })
    if not sector or sector == "tech":
        sector_configs.append({
            "label": "Tech",
            "entity_model": TrackedTechCompany,
            "id_field": "company_id",
            "lobby_model": LobbyingRecord,
            "lobby_fk": "company_id",
        })
    if not sector or sector == "energy":
        sector_configs.append({
            "label": "Energy",
            "entity_model": TrackedEnergyCompany,
            "id_field": "company_id",
            "lobby_model": EnergyLobbyingRecord,
            "lobby_fk": "company_id",
        })

    # Company -> Sector (lobbying spend)
    for cfg in sector_configs:
        entity_model = cfg["entity_model"]
        lobby_model = cfg["lobby_model"]
        fk = cfg["lobby_fk"]

        rows = db.query(
            entity_model.display_name,
            func.sum(lobby_spend(lobby_model)),
        ).join(
            lobby_model, getattr(lobby_model, fk) == getattr(entity_model, cfg["id_field"])
        ).group_by(entity_model.display_name).order_by(
            desc(func.sum(lobby_spend(lobby_model)))
        ).limit(limit).all()

        sector_node = get_node_id(f"{cfg['label']} Lobbying", "sector")

        for name, total in rows:
            if not total or total <= 0:
                continue
            company_node = get_node_id(name, "company")
            links.append({
                "source": company_node,
                "target": sector_node,
                "value": float(total),
            })

    # Donations: PAC -> Politician
    donation_rows = db.query(
        CompanyDonation.committee_name,
        TrackedMember.display_name,
        func.sum(CompanyDonation.amount),
    ).join(
        TrackedMember, CompanyDonation.person_id == TrackedMember.person_id
    ).filter(
        CompanyDonation.amount > 0,
        CompanyDonation.committee_name.isnot(None),
    ).group_by(
        CompanyDonation.committee_name, TrackedMember.display_name
    ).order_by(
        desc(func.sum(CompanyDonation.amount))
    ).limit(limit * 3).all()

    donations_node = get_node_id("PAC Donations", "channel")

    # Aggregate PAC->channel links to avoid duplicates when a PAC donates to multiple politicians
    pac_channel_totals: dict = {}
    for pac_name, politician_name, total in donation_rows:
        if not total or total <= 0 or not pac_name:
            continue
        pac_node = get_node_id(pac_name, "company")
        politician_node = get_node_id(politician_name, "politician")
        pac_channel_totals[pac_node] = pac_channel_totals.get(pac_node, 0) + float(total)
        links.append({"source": donations_node, "target": politician_node, "value": float(total)})

    for pac_node, agg_total in pac_channel_totals.items():
        links.append({"source": pac_node, "target": donations_node, "value": agg_total})

    return {"nodes": nodes, "links": links}


# ── Regulatory Comments (cross-sector) ──────────────────────────────────


@router.get("/regulatory-comments/{company_id}")
def get_regulatory_comments(
    company_id: str,
    agency_id: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get regulatory comments by a company across all agencies."""
    query = db.query(RegulatoryComment).filter(RegulatoryComment.company_id == company_id)
    if agency_id:
        query = query.filter(RegulatoryComment.agency_id == agency_id)

    total = query.count()
    comments = query.order_by(desc(RegulatoryComment.posted_date)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "comments": [
            {
                "id": c.id,
                "comment_id": c.comment_id,
                "document_id": c.document_id,
                "docket_id": c.docket_id,
                "agency_id": c.agency_id,
                "title": c.title,
                "posted_date": str(c.posted_date) if c.posted_date else None,
                "commenter_name": c.commenter_name,
                "comment_text": c.comment_text,
            }
            for c in comments
        ],
    }
