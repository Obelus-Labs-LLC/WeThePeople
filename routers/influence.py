"""
Cross-sector influence routes — aggregate lobbying, contracts, enforcement, donations across all sectors.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Depends
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
from models.chemicals_models import (
    TrackedChemicalCompany, ChemicalLobbyingRecord, ChemicalGovernmentContract, ChemicalEnforcement,
)
from models.agriculture_models import (
    TrackedAgricultureCompany, AgricultureLobbyingRecord, AgricultureGovernmentContract, AgricultureEnforcement,
)
from models.government_data_models import RegulatoryComment
from models.response_schemas import InfluenceStatsResponse

import time as _time

router = APIRouter(prefix="/influence", tags=["influence"])

_freshness_cache: dict = {"ts": 0, "data": None}
_FRESHNESS_TTL = 60  # seconds


@router.get("/data-freshness")
def data_freshness(db: Session = Depends(get_db)):
    """Return last-updated timestamps and record counts for each major data type."""
    now = _time.time()
    if _freshness_cache["data"] is not None and (now - _freshness_cache["ts"]) < _FRESHNESS_TTL:
        return _freshness_cache["data"]

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
        (ChemicalLobbyingRecord, ChemicalLobbyingRecord.created_at),
        (AgricultureLobbyingRecord, AgricultureLobbyingRecord.created_at),
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
        (ChemicalGovernmentContract, ChemicalGovernmentContract.start_date),
        (AgricultureGovernmentContract, AgricultureGovernmentContract.start_date),
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
        (ChemicalEnforcement, ChemicalEnforcement.case_date),
        (AgricultureEnforcement, AgricultureEnforcement.case_date),
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
    _freshness_cache["ts"] = _time.time()
    _freshness_cache["data"] = result
    return result


@router.get("/stats", response_model=InfluenceStatsResponse)
def get_influence_stats(db: Session = Depends(get_db)):
    """Aggregate influence stats across all sectors."""
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


@router.get("/top-lobbying")
def get_top_lobbying(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    """Top lobbying spenders across all sectors."""
    results = []

    # Finance
    rows = db.query(
        TrackedInstitution.institution_id, TrackedInstitution.display_name,
        func.sum(FinanceLobbyingRecord.income),
    ).join(FinanceLobbyingRecord, FinanceLobbyingRecord.institution_id == TrackedInstitution.institution_id
    ).group_by(TrackedInstitution.institution_id, TrackedInstitution.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "finance", "total_lobbying": total or 0})

    # Health
    rows = db.query(
        TrackedCompany.company_id, TrackedCompany.display_name,
        func.sum(HealthLobbyingRecord.income),
    ).join(HealthLobbyingRecord, HealthLobbyingRecord.company_id == TrackedCompany.company_id
    ).group_by(TrackedCompany.company_id, TrackedCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "health", "total_lobbying": total or 0})

    # Tech
    rows = db.query(
        TrackedTechCompany.company_id, TrackedTechCompany.display_name,
        func.sum(LobbyingRecord.income),
    ).join(LobbyingRecord, LobbyingRecord.company_id == TrackedTechCompany.company_id
    ).group_by(TrackedTechCompany.company_id, TrackedTechCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "tech", "total_lobbying": total or 0})

    # Energy
    rows = db.query(
        TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name,
        func.sum(EnergyLobbyingRecord.income),
    ).join(EnergyLobbyingRecord, EnergyLobbyingRecord.company_id == TrackedEnergyCompany.company_id
    ).group_by(TrackedEnergyCompany.company_id, TrackedEnergyCompany.display_name).all()
    for eid, name, total in rows:
        results.append({"entity_id": eid, "display_name": name, "sector": "energy", "total_lobbying": total or 0})

    results.sort(key=lambda x: x["total_lobbying"], reverse=True)
    return {"leaders": results[:limit]}


@router.get("/spending-by-state")
def get_spending_by_state(
    metric: str = Query("donations", pattern="^(donations|members|lobbying)$"),
    sector: Optional[str] = Query(None, pattern="^(finance|health|tech|energy|transportation|defense|chemicals|agriculture)$"),
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
    """Top government contract recipients across all sectors."""
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
        raise HTTPException(status_code=500, detail=f"Network build failed: {str(e)}")


@router.get("/closed-loops")
def get_closed_loops(
    entity_type: Optional[str] = Query(None, description="Filter by sector: finance, health, tech, energy"),
    entity_id: Optional[str] = Query(None, description="Filter by company ID"),
    person_id: Optional[str] = Query(None, description="Filter by politician person_id"),
    min_donation: float = Query(0, ge=0, description="Minimum donation amount"),
    year_from: int = Query(2020, ge=2010),
    year_to: int = Query(2026, le=2030),
    limit: int = Query(25, ge=1, le=100),
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
            func.sum(lobby_model.income),
        ).join(
            lobby_model, getattr(lobby_model, fk) == getattr(entity_model, cfg["id_field"])
        ).group_by(entity_model.display_name).order_by(
            desc(func.sum(lobby_model.income))
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
