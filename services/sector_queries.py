"""
Generic sector query functions.

Extracts business logic (multi-table joins, aggregation, formatting) from
sector routers into reusable service functions. Each function takes a
SectorConfig that describes the sector's models and field mappings.

Addresses bugs #343 (inline business logic) and #331 (copy-paste routers).
"""

import datetime
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Type

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from models.database import CompanyDonation
from models.market_models import StockFundamentals
from utils.db_compat import extract_year, lobby_spend
from utils.sanitize import escape_like

logger = logging.getLogger(__name__)


@dataclass
class SectorConfig:
    """Configuration describing a sector's models and field mappings."""

    prefix: str                    # URL prefix e.g. "/chemicals"
    tag: str                       # Router tag e.g. "chemicals"
    entity_label: str              # "companies" or "institutions"
    entity_id_field: str           # "company_id" or "institution_id"
    entity_type_donations: str     # e.g. "chemicals"
    entity_type_stock: str         # e.g. "chemicals_company"
    entity_model: Any              # TrackedChemicalCompany
    lobbying_model: Any            # ChemicalLobbyingRecord
    contract_model: Any            # ChemicalGovernmentContract
    enforcement_model: Any         # ChemicalEnforcement
    filing_model: Any = None       # SECChemicalFiling (optional)
    # Sector-specific count models for the list endpoint enrichment
    # List of (model_class, count_key_name) tuples
    list_count_models: List = field(default_factory=list)


def _entity_id_col(model, config: SectorConfig):
    """Get the entity_id column from a model using config's field name."""
    return getattr(model, config.entity_id_field)


def _entity_id_val(row, config: SectorConfig) -> str:
    """Get the entity_id value from an ORM row."""
    return getattr(row, config.entity_id_field)


def serialize_stock_fundamentals(stock) -> Optional[Dict[str, Any]]:
    """Serialize a StockFundamentals row to dict. Use across all sector routers."""
    if not stock:
        return None
    return {
        "snapshot_date": str(stock.snapshot_date) if stock.snapshot_date else None,
        "market_cap": stock.market_cap,
        "pe_ratio": stock.pe_ratio,
        "eps": stock.eps,
        "dividend_yield": stock.dividend_yield,
        "week_52_high": stock.week_52_high,
        "week_52_low": stock.week_52_low,
        "profit_margin": stock.profit_margin,
    }


# ── Dashboard ────────────────────────────────────────────────────────────────


def get_dashboard_stats(db: Session, config: SectorConfig) -> Dict[str, Any]:
    """Aggregate dashboard stats for a sector."""
    entity_model = config.entity_model
    eid_col = _entity_id_col(entity_model, config)

    total_entities = (
        db.query(func.count(entity_model.id))
        .filter(entity_model.is_active == 1)
        .scalar() or 0
    )

    result: Dict[str, Any] = {
        f"total_{config.entity_label}": total_entities,
    }

    if config.filing_model:
        result["total_filings"] = db.query(func.count(config.filing_model.id)).scalar() or 0

    lm = config.lobbying_model
    result["total_lobbying"] = db.query(func.count(lm.id)).scalar() or 0
    result["total_lobbying_spend"] = db.query(func.sum(lobby_spend(lm))).scalar() or 0

    cm = config.contract_model
    result["total_contracts"] = db.query(func.count(cm.id)).scalar() or 0
    result["total_contract_value"] = db.query(func.sum(cm.award_amount)).scalar() or 0

    em = config.enforcement_model
    result["total_enforcement"] = db.query(func.count(em.id)).scalar() or 0
    result["total_penalties"] = db.query(func.sum(em.penalty_amount)).scalar() or 0

    by_sector = dict(
        db.query(entity_model.sector_type, func.count(entity_model.id))
        .filter(entity_model.is_active == 1)
        .group_by(entity_model.sector_type)
        .all()
    )
    result["by_sector"] = by_sector

    return result


def get_recent_activity(
    db: Session, config: SectorConfig, limit: int = 10
) -> Dict[str, Any]:
    """Recent enforcement, contracts, and lobbying across all entities in a sector."""
    em = config.enforcement_model
    cm = config.contract_model
    lm = config.lobbying_model
    entity_model = config.entity_model
    eid_field = config.entity_id_field

    enforcements = db.query(em).order_by(desc(em.case_date)).limit(limit).all()
    contracts = db.query(cm).order_by(desc(cm.start_date)).limit(limit).all()
    lobbying = (
        db.query(lm)
        .order_by(desc(lm.filing_year), desc(lm.filing_period))
        .limit(limit)
        .all()
    )

    # Collect all entity IDs for name lookup
    all_ids = set()
    for e in enforcements:
        all_ids.add(getattr(e, eid_field))
    for ct in contracts:
        all_ids.add(getattr(ct, eid_field))
    for r in lobbying:
        all_ids.add(getattr(r, eid_field))

    entity_names: Dict[str, str] = {}
    if all_ids:
        eid_col = _entity_id_col(entity_model, config)
        for ent in db.query(entity_model).filter(eid_col.in_(list(all_ids))).all():
            entity_names[_entity_id_val(ent, config)] = ent.display_name

    items: List[Dict[str, Any]] = []

    for e in enforcements:
        eid = getattr(e, eid_field)
        items.append({
            "type": "enforcement",
            "title": e.case_title or "Enforcement Action",
            "description": e.description,
            "date": str(e.case_date) if e.case_date else None,
            f"{eid_field}": eid,
            "company_name": entity_names.get(eid, eid),
            "url": e.case_url,
            "meta": {
                "penalty_amount": e.penalty_amount,
                "enforcement_type": e.enforcement_type,
            },
        })

    for ct in contracts:
        eid = getattr(ct, eid_field)
        items.append({
            "type": "contract",
            "title": ct.description or f"Contract Award — {ct.awarding_agency or 'Unknown Agency'}",
            "description": ct.description,
            "date": str(ct.start_date) if ct.start_date else None,
            f"{eid_field}": eid,
            "company_name": entity_names.get(eid, eid),
            "url": None,
            "meta": {
                "award_amount": ct.award_amount,
                "awarding_agency": ct.awarding_agency,
            },
        })

    for r in lobbying:
        eid = getattr(r, eid_field)
        period_str = f"{r.filing_year}" + (f" {r.filing_period}" if r.filing_period else "")
        items.append({
            "type": "lobbying",
            "title": f"Lobbying Filing — {r.client_name or r.registrant_name or 'Unknown'}",
            "description": r.lobbying_issues,
            "date": f"{r.filing_year}-01-01" if r.filing_year else None,
            f"{eid_field}": eid,
            "company_name": entity_names.get(eid, eid),
            "url": (
                f"https://lda.senate.gov/filings/public/filing/{r.filing_uuid}/"
                if r.filing_uuid
                else None
            ),
            "meta": {
                "income": r.income,
                "expenses": r.expenses,
                # Per-row dollar value: in-house filings report the total
                # under expenses (already includes any outside-firm fees),
                # outside-firm filings report under income. See
                # services/lobby_spend.py for the prefer-expenses
                # convention.
                "total_spend": float(r.expenses or 0) if (r.expenses or 0) > 0 else float(r.income or 0),
                "filing_period": period_str,
                "registrant_name": r.registrant_name,
            },
        })

    items.sort(key=lambda x: x.get("date") or "0000-00-00", reverse=True)
    return {"items": items[:limit]}


# ── Entity List ──────────────────────────────────────────────────────────────


def list_entities(
    db: Session,
    config: SectorConfig,
    q: Optional[str] = None,
    sector_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List entities with search, filtering, and count enrichment."""
    entity_model = config.entity_model
    eid_field = config.entity_id_field

    query = db.query(entity_model).filter(entity_model.is_active == 1)

    if q:
        pattern = f"%{escape_like(q)}%"
        eid_col = _entity_id_col(entity_model, config)
        query = query.filter(
            entity_model.display_name.ilike(pattern, escape="\\")
            | eid_col.ilike(pattern, escape="\\")
            | entity_model.ticker.ilike(pattern, escape="\\")
        )

    if sector_type:
        query = query.filter(entity_model.sector_type == sector_type)

    total = query.count()
    rows = query.order_by(entity_model.display_name).offset(offset).limit(limit).all()

    entity_ids = [_entity_id_val(r, config) for r in rows]

    # Build enrichment counts from configured models
    count_maps: Dict[str, Dict[str, int]] = {}
    for count_model, count_key in config.list_count_models:
        count_col = getattr(count_model, eid_field)
        if entity_ids:
            count_maps[count_key] = dict(
                db.query(count_col, func.count(count_model.id))
                .filter(count_col.in_(entity_ids))
                .group_by(count_col)
                .all()
            )
        else:
            count_maps[count_key] = {}

    # Build total $-amount maps for contracts, lobbying, enforcement
    # penalties. The sector-list FE for student-loans / market-movers /
    # similar tools needs `contract_total`, `lobbying_total`, and
    # `enforcement_total_fines` per entity. Pre-2026-05-04 only counts
    # were exposed, so the Student Loan Servicer Tracker rendered $0
    # across the board (R-9). Cheap — one grouped sum per sector
    # because we filter by entity_ids.
    contract_total: Dict[str, float] = {}
    lobbying_total: Dict[str, float] = {}
    enforcement_total_fines: Dict[str, float] = {}
    if entity_ids:
        if config.contract_model is not None:
            cm_col = getattr(config.contract_model, eid_field)
            try:
                contract_total = dict(
                    db.query(cm_col, func.sum(config.contract_model.award_amount))
                    .filter(cm_col.in_(entity_ids))
                    .group_by(cm_col)
                    .all()
                )
            except Exception:  # noqa: BLE001
                contract_total = {}
        if config.lobbying_model is not None:
            lm_col = getattr(config.lobbying_model, eid_field)
            try:
                lobbying_total = dict(
                    db.query(lm_col, func.sum(lobby_spend(config.lobbying_model)))
                    .filter(lm_col.in_(entity_ids))
                    .group_by(lm_col)
                    .all()
                )
            except Exception:  # noqa: BLE001
                lobbying_total = {}
        if config.enforcement_model is not None:
            em_col = getattr(config.enforcement_model, eid_field)
            try:
                enforcement_total_fines = dict(
                    db.query(em_col, func.sum(config.enforcement_model.penalty_amount))
                    .filter(em_col.in_(entity_ids))
                    .group_by(em_col)
                    .all()
                )
            except Exception:  # noqa: BLE001
                enforcement_total_fines = {}

    entities = []
    for r in rows:
        eid = _entity_id_val(r, config)
        item = {
            eid_field: eid,
            "display_name": r.display_name,
            "ticker": r.ticker,
            "sector_type": r.sector_type,
            "headquarters": r.headquarters,
            "logo_url": r.logo_url,
            "contract_total": float(contract_total.get(eid) or 0),
            "lobbying_total": float(lobbying_total.get(eid) or 0),
            "enforcement_total_fines": float(enforcement_total_fines.get(eid) or 0),
        }
        for count_key, cmap in count_maps.items():
            item[count_key] = cmap.get(eid, 0)
        entities.append(item)

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        config.entity_label: entities,
    }


# ── Entity Detail ────────────────────────────────────────────────────────────


def get_entity_detail(
    db: Session, config: SectorConfig, entity_id: str
) -> Optional[Dict[str, Any]]:
    """
    Get entity detail with counts and stock data.
    Returns None if entity not found.
    """
    entity_model = config.entity_model
    eid_col = _entity_id_col(entity_model, config)

    ent = db.query(entity_model).filter(eid_col == entity_id, entity_model.is_active == 1).first()
    if not ent:
        return None

    result: Dict[str, Any] = {
        config.entity_id_field: entity_id,
        "display_name": ent.display_name,
        "ticker": ent.ticker,
        "sector_type": ent.sector_type,
        "headquarters": ent.headquarters,
        "logo_url": ent.logo_url,
        "sec_cik": getattr(ent, "sec_cik", None),
        "ai_profile_summary": getattr(ent, "ai_profile_summary", None),
        "sanctions_status": getattr(ent, "sanctions_status", None),
    }

    # Standard counts
    if config.filing_model:
        fm_eid = getattr(config.filing_model, config.entity_id_field)
        result["filing_count"] = (
            db.query(func.count(config.filing_model.id))
            .filter(fm_eid == entity_id)
            .scalar() or 0
        )

    lm_eid = getattr(config.lobbying_model, config.entity_id_field)
    result["lobbying_count"] = (
        db.query(func.count(config.lobbying_model.id))
        .filter(lm_eid == entity_id)
        .scalar() or 0
    )

    cm_eid = getattr(config.contract_model, config.entity_id_field)
    result["contract_count"] = (
        db.query(func.count(config.contract_model.id))
        .filter(cm_eid == entity_id)
        .scalar() or 0
    )
    result["total_contract_value"] = (
        db.query(func.sum(config.contract_model.award_amount))
        .filter(cm_eid == entity_id)
        .scalar() or 0
    )

    em_eid = getattr(config.enforcement_model, config.entity_id_field)
    result["enforcement_count"] = (
        db.query(func.count(config.enforcement_model.id))
        .filter(em_eid == entity_id)
        .scalar() or 0
    )
    result["total_penalties"] = (
        db.query(func.sum(config.enforcement_model.penalty_amount))
        .filter(em_eid == entity_id)
        .scalar() or 0
    )

    # Stock data
    latest_stock = (
        db.query(StockFundamentals)
        .filter_by(entity_type=config.entity_type_stock, entity_id=entity_id)
        .order_by(desc(StockFundamentals.snapshot_date))
        .first()
    )
    result["latest_stock"] = _format_stock(latest_stock)

    return result


# ── Filings ──────────────────────────────────────────────────────────────────


def get_entity_filings(
    db: Session,
    config: SectorConfig,
    entity_id: str,
    form_type: Optional[str] = None,
    limit: int = 25,
    offset: int = 0,
) -> Optional[Dict[str, Any]]:
    """SEC filings for an entity. Returns None if entity not found."""
    if not config.filing_model:
        return {"total": 0, "limit": limit, "offset": offset, "filings": []}

    if not _entity_exists(db, config, entity_id):
        return None

    fm = config.filing_model
    fm_eid = getattr(fm, config.entity_id_field)
    query = db.query(fm).filter(fm_eid == entity_id)
    if form_type:
        query = query.filter(fm.form_type == form_type)
    total = query.count()
    rows = query.order_by(desc(fm.filing_date)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "filings": [
            {
                "id": f.id,
                "accession_number": f.accession_number,
                "form_type": f.form_type,
                "filing_date": str(f.filing_date) if f.filing_date else None,
                "primary_doc_url": f.primary_doc_url,
                "filing_url": f.filing_url,
                "description": f.description,
            }
            for f in rows
        ],
    }


# ── Contracts ────────────────────────────────────────────────────────────────


def get_entity_contracts(
    db: Session,
    config: SectorConfig,
    entity_id: str,
    limit: int = 25,
    offset: int = 0,
) -> Optional[Dict[str, Any]]:
    """Government contracts for an entity."""
    if not _entity_exists(db, config, entity_id):
        return None

    cm = config.contract_model
    cm_eid = getattr(cm, config.entity_id_field)
    query = db.query(cm).filter(cm_eid == entity_id)
    total = query.count()
    rows = query.order_by(desc(cm.award_amount)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "contracts": [
            {
                "id": ct.id,
                "award_id": ct.award_id,
                "award_amount": ct.award_amount,
                "awarding_agency": ct.awarding_agency,
                "description": ct.description,
                "start_date": str(ct.start_date) if ct.start_date else None,
                "end_date": str(ct.end_date) if ct.end_date else None,
                "contract_type": ct.contract_type,
                "ai_summary": ct.ai_summary,
            }
            for ct in rows
        ],
    }


def get_entity_contract_summary(
    db: Session, config: SectorConfig, entity_id: str
) -> Optional[Dict[str, Any]]:
    """Contract summary with totals and breakdown by agency."""
    if not _entity_exists(db, config, entity_id):
        return None

    cm = config.contract_model
    cm_eid = getattr(cm, config.entity_id_field)

    total_contracts = db.query(cm).filter(cm_eid == entity_id).count()
    total_amount = (
        db.query(func.sum(cm.award_amount)).filter(cm_eid == entity_id).scalar() or 0
    )

    by_agency: Dict[str, int] = {}
    rows = (
        db.query(cm.awarding_agency, func.count())
        .filter(cm_eid == entity_id)
        .group_by(cm.awarding_agency)
        .order_by(func.count().desc())
        .limit(10)
        .all()
    )
    for agency, count in rows:
        if agency:
            by_agency[agency] = count

    return {
        "total_contracts": total_contracts,
        "total_amount": total_amount,
        "by_agency": by_agency,
    }


# ── Lobbying ─────────────────────────────────────────────────────────────────


def get_entity_lobbying(
    db: Session,
    config: SectorConfig,
    entity_id: str,
    filing_year: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
) -> Optional[Dict[str, Any]]:
    """Lobbying records for an entity."""
    if not _entity_exists(db, config, entity_id):
        return None

    lm = config.lobbying_model
    lm_eid = getattr(lm, config.entity_id_field)
    query = db.query(lm).filter(lm_eid == entity_id)
    if filing_year:
        query = query.filter(lm.filing_year == filing_year)
    total = query.count()
    rows = (
        query.order_by(desc(lm.filing_year), lm.filing_period)
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "filings": [
            {
                "id": r.id,
                "filing_uuid": r.filing_uuid,
                "filing_year": r.filing_year,
                "filing_period": r.filing_period,
                "income": r.income,
                "expenses": r.expenses,
                "registrant_name": r.registrant_name,
                "client_name": r.client_name,
                "lobbying_issues": r.lobbying_issues,
                "government_entities": r.government_entities,
                "ai_summary": r.ai_summary,
            }
            for r in rows
        ],
    }


def get_entity_lobbying_summary(
    db: Session, config: SectorConfig, entity_id: str
) -> Optional[Dict[str, Any]]:
    """Lobbying spend summary by year and top firms."""
    if not _entity_exists(db, config, entity_id):
        return None

    lm = config.lobbying_model
    lm_eid = getattr(lm, config.entity_id_field)

    total_filings = db.query(lm).filter(lm_eid == entity_id).count()
    total_income = (
        db.query(func.sum(lobby_spend(lm))).filter(lm_eid == entity_id).scalar() or 0
    )

    by_year: Dict[str, Dict] = {}
    rows = (
        db.query(lm.filing_year, func.sum(lobby_spend(lm)), func.count())
        .filter(lm_eid == entity_id)
        .group_by(lm.filing_year)
        .order_by(lm.filing_year)
        .all()
    )
    for year, income, count in rows:
        by_year[str(year)] = {"income": income or 0, "filings": count}

    top_firms: Dict[str, Dict] = {}
    rows = (
        db.query(lm.registrant_name, func.sum(lobby_spend(lm)), func.count())
        .filter(lm_eid == entity_id)
        .group_by(lm.registrant_name)
        .order_by(func.sum(lobby_spend(lm)).desc())
        .limit(10)
        .all()
    )
    for name, income, count in rows:
        if name:
            top_firms[name] = {"income": income or 0, "filings": count}

    return {
        "total_filings": total_filings,
        "total_income": total_income,
        "by_year": by_year,
        "top_firms": top_firms,
    }


# ── Enforcement ──────────────────────────────────────────────────────────────


def get_entity_enforcement(
    db: Session,
    config: SectorConfig,
    entity_id: str,
    limit: int = 50,
    offset: int = 0,
) -> Optional[Dict[str, Any]]:
    """Enforcement actions against an entity."""
    if not _entity_exists(db, config, entity_id):
        return None

    em = config.enforcement_model
    em_eid = getattr(em, config.entity_id_field)
    query = db.query(em).filter(em_eid == entity_id)
    total = query.count()
    rows = query.order_by(desc(em.case_date)).offset(offset).limit(limit).all()
    total_penalties = (
        db.query(func.sum(em.penalty_amount)).filter(em_eid == entity_id).scalar() or 0
    )

    return {
        "total": total,
        "total_penalties": total_penalties,
        "limit": limit,
        "offset": offset,
        "actions": [
            {
                "id": a.id,
                "case_title": a.case_title,
                "case_date": str(a.case_date) if a.case_date else None,
                "case_url": a.case_url,
                "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount,
                "description": a.description,
                "source": a.source,
                "ai_summary": a.ai_summary,
            }
            for a in rows
        ],
    }


# ── Stock ────────────────────────────────────────────────────────────────────


def get_entity_stock(
    db: Session, config: SectorConfig, entity_id: str
) -> Optional[Dict[str, Any]]:
    """Latest stock fundamentals for an entity."""
    if not _entity_exists(db, config, entity_id):
        return None

    latest = (
        db.query(StockFundamentals)
        .filter_by(entity_type=config.entity_type_stock, entity_id=entity_id)
        .order_by(desc(StockFundamentals.snapshot_date))
        .first()
    )
    return {"latest_stock": _format_stock(latest)}


# ── Donations ────────────────────────────────────────────────────────────────


def get_entity_donations(
    db: Session,
    config: SectorConfig,
    entity_id: str,
    limit: int = 50,
    offset: int = 0,
) -> Optional[Dict[str, Any]]:
    """PAC/corporate donations from an entity to politicians."""
    if not _entity_exists(db, config, entity_id):
        return None

    query = db.query(CompanyDonation).filter_by(
        entity_type=config.entity_type_donations, entity_id=entity_id
    )
    total = query.count()
    rows = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()
    total_amount = (
        db.query(func.sum(CompanyDonation.amount))
        .filter_by(entity_type=config.entity_type_donations, entity_id=entity_id)
        .scalar() or 0
    )

    return {
        "total": total,
        "total_amount": total_amount,
        "limit": limit,
        "offset": offset,
        "donations": [
            {
                "id": d.id,
                "committee_name": d.committee_name,
                "committee_id": d.committee_id,
                "candidate_name": d.candidate_name,
                "candidate_id": d.candidate_id,
                "person_id": d.person_id,
                "amount": d.amount,
                "cycle": d.cycle,
                "donation_date": str(d.donation_date) if d.donation_date else None,
                "source_url": d.source_url,
            }
            for d in rows
        ],
    }


# ── Compare ──────────────────────────────────────────────────────────────────


def compare_entities(
    db: Session, config: SectorConfig, entity_ids: List[str]
) -> Dict[str, Any]:
    """Cross-entity comparison for key metrics."""
    entity_model = config.entity_model
    eid_col = _entity_id_col(entity_model, config)
    eid_field = config.entity_id_field

    entities = {
        _entity_id_val(e, config): e
        for e in db.query(entity_model).filter(eid_col.in_(entity_ids)).all()
    }

    cm = config.contract_model
    cm_eid = getattr(cm, eid_field)
    contract_counts = dict(
        db.query(cm_eid, func.count(cm.id))
        .filter(cm_eid.in_(entity_ids))
        .group_by(cm_eid)
        .all()
    )
    contract_values = dict(
        db.query(cm_eid, func.sum(cm.award_amount))
        .filter(cm_eid.in_(entity_ids))
        .group_by(cm_eid)
        .all()
    )

    lm = config.lobbying_model
    lm_eid = getattr(lm, eid_field)
    lobbying_totals = dict(
        db.query(lm_eid, func.sum(lobby_spend(lm)))
        .filter(lm_eid.in_(entity_ids))
        .group_by(lm_eid)
        .all()
    )

    em = config.enforcement_model
    em_eid = getattr(em, eid_field)
    enforcement_counts = dict(
        db.query(em_eid, func.count(em.id))
        .filter(em_eid.in_(entity_ids))
        .group_by(em_eid)
        .all()
    )
    penalty_totals = dict(
        db.query(em_eid, func.sum(em.penalty_amount))
        .filter(em_eid.in_(entity_ids))
        .group_by(em_eid)
        .all()
    )

    stock_map: Dict[str, Any] = {}
    for eid in entity_ids:
        latest = (
            db.query(StockFundamentals)
            .filter_by(entity_type=config.entity_type_stock, entity_id=eid)
            .order_by(desc(StockFundamentals.snapshot_date))
            .first()
        )
        if latest:
            stock_map[eid] = latest

    results = []
    for eid in entity_ids:
        ent = entities.get(eid)
        if not ent:
            continue
        latest = stock_map.get(eid)
        results.append({
            eid_field: eid,
            "display_name": ent.display_name,
            "ticker": ent.ticker,
            "sector_type": ent.sector_type,
            "contract_count": contract_counts.get(eid, 0),
            "total_contract_value": float(contract_values.get(eid, 0) or 0),
            "lobbying_total": float(lobbying_totals.get(eid, 0) or 0),
            "enforcement_count": enforcement_counts.get(eid, 0),
            "total_penalties": float(penalty_totals.get(eid, 0) or 0),
            "market_cap": latest.market_cap if latest else None,
            "pe_ratio": latest.pe_ratio if latest else None,
            "profit_margin": latest.profit_margin if latest else None,
        })

    return {config.entity_label: results}


# ── Trends ───────────────────────────────────────────────────────────────────


def get_entity_trends(
    db: Session, config: SectorConfig, entity_id: str
) -> Optional[Dict[str, Any]]:
    """Yearly trend data: lobbying, contracts, enforcement."""
    if not _entity_exists(db, config, entity_id):
        return None

    current_year = datetime.date.today().year
    min_year = 2018
    eid_field = config.entity_id_field

    lm = config.lobbying_model
    lm_eid = getattr(lm, eid_field)
    lobby_rows = (
        db.query(lm.filing_year, func.count(lm.id))
        .filter(lm_eid == entity_id, lm.filing_year.isnot(None))
        .group_by(lm.filing_year)
        .all()
    )
    lobby_by_year = {int(r[0]): r[1] for r in lobby_rows if r[0]}

    cm = config.contract_model
    cm_eid = getattr(cm, eid_field)
    contract_rows = (
        db.query(extract_year(cm.start_date).label("yr"), func.count(cm.id))
        .filter(cm_eid == entity_id, cm.start_date.isnot(None))
        .group_by("yr")
        .all()
    )
    contracts_by_year = {int(r[0]): r[1] for r in contract_rows if r[0]}

    em = config.enforcement_model
    em_eid = getattr(em, eid_field)
    enforcement_rows = (
        db.query(extract_year(em.case_date).label("yr"), func.count(em.id))
        .filter(em_eid == entity_id, em.case_date.isnot(None))
        .group_by("yr")
        .all()
    )
    enforcement_by_year = {int(r[0]): r[1] for r in enforcement_rows if r[0]}

    all_years_set = set(lobby_by_year) | set(contracts_by_year) | set(enforcement_by_year)
    all_years_set = {y for y in all_years_set if min_year <= y <= current_year}
    if not all_years_set:
        all_years_set = set(range(min_year, current_year + 1))
    years = sorted(all_years_set)

    return {
        "years": years,
        "series": {
            "lobbying": [lobby_by_year.get(y, 0) for y in years],
            "contracts": [contracts_by_year.get(y, 0) for y in years],
            "enforcement": [enforcement_by_year.get(y, 0) for y in years],
        },
    }


# ── Helpers ──────────────────────────────────────────────────────────────────


def _entity_exists(db: Session, config: SectorConfig, entity_id: str) -> bool:
    """Check if an entity exists (active)."""
    entity_model = config.entity_model
    eid_col = _entity_id_col(entity_model, config)
    return db.query(entity_model).filter(eid_col == entity_id).first() is not None


def _format_stock(stock) -> Optional[Dict[str, Any]]:
    """Format a StockFundamentals row into a dict."""
    if not stock:
        return None
    return {
        "ticker": stock.ticker,
        "snapshot_date": str(stock.snapshot_date) if stock.snapshot_date else None,
        "market_cap": stock.market_cap,
        "pe_ratio": stock.pe_ratio,
        "forward_pe": stock.forward_pe,
        "peg_ratio": stock.peg_ratio,
        "price_to_book": stock.price_to_book,
        "eps": stock.eps,
        "revenue_ttm": stock.revenue_ttm,
        "profit_margin": stock.profit_margin,
        "operating_margin": stock.operating_margin,
        "return_on_equity": stock.return_on_equity,
        "dividend_yield": stock.dividend_yield,
        "dividend_per_share": stock.dividend_per_share,
        "week_52_high": stock.week_52_high,
        "week_52_low": stock.week_52_low,
        "day_50_moving_avg": stock.day_50_moving_avg,
        "day_200_moving_avg": stock.day_200_moving_avg,
        "sector": stock.sector,
        "industry": stock.industry,
    }
