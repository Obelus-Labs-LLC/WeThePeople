"""
Sector Router Factory — generates common CRUD/aggregation endpoints.

Each sector has ~14 identical endpoints (lobbying, contracts, enforcement,
donations, filings, stock, compare, trends, dashboard, recent-activity).
This factory creates them from a SectorConfig, eliminating ~2,500 lines
of copy-pasted code across 10 sector routers.

Sector-specific endpoints (e.g. Health's adverse-events, Finance's FRED)
remain in the individual router files and are added to the same router.

Addresses bugs #331 (copy-paste) and #343 (inline business logic).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from models.database import get_db
from models.sector_schemas import (
    SectorDashboardStats,
    RecentActivityResponse,
    EntityListResponse,
    EntityDetailResponse,
    FilingsResponse,
    ContractsResponse,
    ContractSummaryResponse,
    LobbyingResponse,
    LobbySummaryResponse,
    EnforcementResponse,
    StockResponse,
    DonationsResponse,
    CompareResponse,
    TrendsResponse,
)
from services.sector_queries import (
    SectorConfig,
    get_dashboard_stats,
    get_recent_activity,
    list_entities,
    get_entity_detail,
    get_entity_filings,
    get_entity_contracts,
    get_entity_contract_summary,
    get_entity_lobbying,
    get_entity_lobbying_summary,
    get_entity_enforcement,
    get_entity_stock,
    get_entity_donations,
    compare_entities,
    get_entity_trends,
)


def create_sector_router(config: SectorConfig) -> APIRouter:
    """
    Build an APIRouter with all common sector endpoints.

    Returns the router so the sector module can add sector-specific
    endpoints to it before registering with the app.
    """
    router = APIRouter(prefix=config.prefix, tags=[config.tag])
    label = config.entity_label  # "companies" or "institutions"
    eid_field = config.entity_id_field
    # URL path param name is always {entity_id} for simplicity
    entity_path = f"/{label}/{{entity_id}}"

    # ── Dashboard ───────────────────────────────────────────────────���────

    @router.get("/dashboard/stats", response_model=SectorDashboardStats)
    def dashboard_stats(db: Session = Depends(get_db)):
        return get_dashboard_stats(db, config)

    @router.get("/dashboard/recent-activity", response_model=RecentActivityResponse)
    def recent_activity(
        limit: int = Query(10, ge=1, le=30),
        db: Session = Depends(get_db),
    ):
        return get_recent_activity(db, config, limit)

    # ── Entity List ───────────────────────────────────────────────────��──

    @router.get(f"/{label}", response_model=EntityListResponse)
    def entity_list(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        q: Optional[str] = Query(None),
        sector_type: Optional[str] = Query(None),
        db: Session = Depends(get_db),
    ):
        return list_entities(db, config, q=q, sector_type=sector_type, limit=limit, offset=offset)

    # ── Entity Detail ────────────────────────────────────────────────────

    @router.get(entity_path, response_model=EntityDetailResponse)
    def entity_detail(entity_id: str, db: Session = Depends(get_db)):
        result = get_entity_detail(db, config, entity_id)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    # ── Filings ──────────────────────────────────────────────────────────

    @router.get(f"{entity_path}/filings", response_model=FilingsResponse)
    def entity_filings(
        entity_id: str,
        form_type: Optional[str] = Query(None),
        limit: int = Query(25, ge=1, le=100),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
    ):
        result = get_entity_filings(db, config, entity_id, form_type=form_type, limit=limit, offset=offset)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    # ── Contracts ────────────────────────────────────────────────────────

    @router.get(f"{entity_path}/contracts", response_model=ContractsResponse)
    def entity_contracts(
        entity_id: str,
        limit: int = Query(25, ge=1, le=100),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
    ):
        result = get_entity_contracts(db, config, entity_id, limit=limit, offset=offset)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    @router.get(f"{entity_path}/contracts/summary", response_model=ContractSummaryResponse)
    def entity_contract_summary(entity_id: str, db: Session = Depends(get_db)):
        result = get_entity_contract_summary(db, config, entity_id)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    # ── Lobbying ─────────────────────────────────────────────────────────

    @router.get(f"{entity_path}/lobbying", response_model=LobbyingResponse)
    def entity_lobbying(
        entity_id: str,
        filing_year: Optional[int] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
    ):
        result = get_entity_lobbying(db, config, entity_id, filing_year=filing_year, limit=limit, offset=offset)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    @router.get(f"{entity_path}/lobbying/summary", response_model=LobbySummaryResponse)
    def entity_lobbying_summary(entity_id: str, db: Session = Depends(get_db)):
        result = get_entity_lobbying_summary(db, config, entity_id)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    # ── Enforcement ──────────────────────────────────────────────────────

    @router.get(f"{entity_path}/enforcement", response_model=EnforcementResponse)
    def entity_enforcement(
        entity_id: str,
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
    ):
        result = get_entity_enforcement(db, config, entity_id, limit=limit, offset=offset)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    # ── Stock ────────────────────────────────────────────────────────────

    @router.get(f"{entity_path}/stock", response_model=StockResponse)
    def entity_stock(entity_id: str, db: Session = Depends(get_db)):
        result = get_entity_stock(db, config, entity_id)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    # ── Donations ────────────────────────────────────────────────────────

    @router.get(f"{entity_path}/donations", response_model=DonationsResponse)
    def entity_donations(
        entity_id: str,
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
    ):
        result = get_entity_donations(db, config, entity_id, limit=limit, offset=offset)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    # ── Compare ──────────────────────────────────────────────────────────

    @router.get("/compare", response_model=CompareResponse)
    def entity_compare(
        ids: str = Query(..., description="Comma-separated entity IDs"),
        db: Session = Depends(get_db),
    ):
        entity_ids = [eid.strip() for eid in ids.split(",") if eid.strip()]
        if not entity_ids or len(entity_ids) > 10:
            raise HTTPException(400, "Provide 2-10 entity IDs")
        return compare_entities(db, config, entity_ids)

    # ── Trends ───────────────────────────────────────────────────────────

    @router.get(f"{entity_path}/trends", response_model=TrendsResponse)
    def entity_trends(entity_id: str, db: Session = Depends(get_db)):
        result = get_entity_trends(db, config, entity_id)
        if result is None:
            raise HTTPException(404, f"{config.tag.title()} entity not found")
        return result

    return router
