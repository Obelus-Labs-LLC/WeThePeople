"""
Agriculture sector routes — Companies, contracts, lobbying, enforcement, SEC filings, stock.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

from models.database import get_db
from utils.sanitize import escape_like
from models.agriculture_models import (
    TrackedAgricultureCompany,
    SECAgricultureFiling,
    AgricultureGovernmentContract,
    AgricultureLobbyingRecord,
    AgricultureEnforcement,
)
from models.market_models import StockFundamentals
from models.database import CompanyDonation
from utils.db_compat import extract_year

router = APIRouter(prefix="/agriculture", tags=["agriculture"])


@router.get("/dashboard/stats")
def get_agriculture_dashboard_stats(db: Session = Depends(get_db)):
    total_companies = db.query(TrackedAgricultureCompany).filter(TrackedAgricultureCompany.is_active == 1).count()
    total_filings = db.query(SECAgricultureFiling).count()
    total_contracts = db.query(AgricultureGovernmentContract).count()
    total_enforcement = db.query(AgricultureEnforcement).count()
    total_lobbying = db.query(func.count(AgricultureLobbyingRecord.id)).scalar() or 0
    total_lobbying_spend = db.query(func.sum(AgricultureLobbyingRecord.income)).scalar() or 0
    total_contract_value = db.query(func.sum(AgricultureGovernmentContract.award_amount)).scalar() or 0
    total_penalties = db.query(func.sum(AgricultureEnforcement.penalty_amount)).scalar() or 0
    by_sector = {}
    rows = db.query(TrackedAgricultureCompany.sector_type, func.count()).filter(TrackedAgricultureCompany.is_active == 1).group_by(TrackedAgricultureCompany.sector_type).all()
    for sector_type, count in rows:
        by_sector[sector_type] = count
    return {
        "total_companies": total_companies, "total_filings": total_filings,
        "total_contracts": total_contracts,
        "total_enforcement": total_enforcement,
        "total_lobbying": total_lobbying, "total_lobbying_spend": total_lobbying_spend,
        "total_contract_value": total_contract_value, "total_penalties": total_penalties,
        "by_sector": by_sector,
    }


@router.get("/dashboard/recent-activity")
def get_agriculture_recent_activity(limit: int = Query(10, ge=1, le=30), db: Session = Depends(get_db)):
    """Return recent enforcement actions, contracts, and lobbying filings across all agriculture companies."""
    items = []
    enforcements = db.query(AgricultureEnforcement).order_by(desc(AgricultureEnforcement.case_date)).limit(limit).all()
    contracts = db.query(AgricultureGovernmentContract).order_by(desc(AgricultureGovernmentContract.start_date)).limit(limit).all()
    lobbying = db.query(AgricultureLobbyingRecord).order_by(desc(AgricultureLobbyingRecord.filing_year), desc(AgricultureLobbyingRecord.filing_period)).limit(limit).all()
    all_cids = set()
    for e in enforcements: all_cids.add(e.company_id)
    for ct in contracts: all_cids.add(ct.company_id)
    for r in lobbying: all_cids.add(r.company_id)
    company_names = {}
    if all_cids:
        for co in db.query(TrackedAgricultureCompany).filter(TrackedAgricultureCompany.company_id.in_(list(all_cids))).all():
            company_names[co.company_id] = co.display_name
    for e in enforcements:
        items.append({"type": "enforcement", "title": e.case_title or "Enforcement Action", "description": e.description, "date": str(e.case_date) if e.case_date else None, "company_id": e.company_id, "company_name": company_names.get(e.company_id, e.company_id), "url": e.case_url, "meta": {"penalty_amount": e.penalty_amount, "enforcement_type": e.enforcement_type}})
    for ct in contracts:
        items.append({"type": "contract", "title": ct.description or f"Contract Award — {ct.awarding_agency or 'Unknown Agency'}", "description": ct.description, "date": str(ct.start_date) if ct.start_date else None, "company_id": ct.company_id, "company_name": company_names.get(ct.company_id, ct.company_id), "url": None, "meta": {"award_amount": ct.award_amount, "awarding_agency": ct.awarding_agency}})
    for r in lobbying:
        period_str = f"{r.filing_year}" + (f" {r.filing_period}" if r.filing_period else "")
        items.append({"type": "lobbying", "title": f"Lobbying Filing — {r.client_name or r.registrant_name or 'Unknown'}", "description": r.lobbying_issues, "date": f"{r.filing_year}-01-01" if r.filing_year else None, "company_id": r.company_id, "company_name": company_names.get(r.company_id, r.company_id), "url": f"https://lda.senate.gov/filings/public/filing/{r.filing_uuid}/" if r.filing_uuid else None, "meta": {"income": r.income, "filing_period": period_str, "registrant_name": r.registrant_name}})
    items.sort(key=lambda x: x["date"] or "0000-00-00", reverse=True)
    return {"items": items[:limit]}


@router.get("/companies")
def get_agriculture_companies(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), q: Optional[str] = Query(None), sector_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(TrackedAgricultureCompany).filter(TrackedAgricultureCompany.is_active == 1)
    if q:
        pattern = f"%{escape_like(q)}%"
        query = query.filter((TrackedAgricultureCompany.display_name.ilike(pattern, escape="\\")) | (TrackedAgricultureCompany.company_id.ilike(pattern, escape="\\")) | (TrackedAgricultureCompany.ticker.ilike(pattern, escape="\\")))
    if sector_type:
        query = query.filter(TrackedAgricultureCompany.sector_type == sector_type)
    total = query.count()
    companies = query.order_by(TrackedAgricultureCompany.display_name).offset(offset).limit(limit).all()
    company_ids = [co.company_id for co in companies]
    contract_counts = dict(db.query(AgricultureGovernmentContract.company_id, func.count(AgricultureGovernmentContract.id)).filter(AgricultureGovernmentContract.company_id.in_(company_ids)).group_by(AgricultureGovernmentContract.company_id).all()) if company_ids else {}
    filing_counts = dict(db.query(SECAgricultureFiling.company_id, func.count(SECAgricultureFiling.id)).filter(SECAgricultureFiling.company_id.in_(company_ids)).group_by(SECAgricultureFiling.company_id).all()) if company_ids else {}
    enforcement_counts = dict(db.query(AgricultureEnforcement.company_id, func.count(AgricultureEnforcement.id)).filter(AgricultureEnforcement.company_id.in_(company_ids)).group_by(AgricultureEnforcement.company_id).all()) if company_ids else {}
    results = []
    for co in companies:
        results.append({"company_id": co.company_id, "display_name": co.display_name, "ticker": co.ticker, "sector_type": co.sector_type, "headquarters": co.headquarters, "logo_url": co.logo_url, "contract_count": contract_counts.get(co.company_id, 0), "filing_count": filing_counts.get(co.company_id, 0), "enforcement_count": enforcement_counts.get(co.company_id, 0)})
    return {"total": total, "limit": limit, "offset": offset, "companies": results}


@router.get("/companies/{company_id}")
def get_agriculture_company(company_id: str, db: Session = Depends(get_db)):
    logger.info("Agriculture company detail request: %s", company_id)
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co:
        raise HTTPException(status_code=404, detail="Agriculture company not found")
    contract_count = db.query(AgricultureGovernmentContract).filter_by(company_id=company_id).count()
    filing_count = db.query(SECAgricultureFiling).filter_by(company_id=company_id).count()
    enforcement_count = db.query(AgricultureEnforcement).filter_by(company_id=company_id).count()
    lobbying_count = db.query(AgricultureLobbyingRecord).filter_by(company_id=company_id).count()
    total_contract_value = db.query(func.sum(AgricultureGovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0
    total_penalties = db.query(func.sum(AgricultureEnforcement.penalty_amount)).filter_by(company_id=company_id).scalar() or 0
    latest_stock = None
    latest = db.query(StockFundamentals).filter_by(entity_type="agriculture_company", entity_id=company_id).order_by(desc(StockFundamentals.snapshot_date)).first()
    if latest:
        latest_stock = {"snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None, "market_cap": latest.market_cap, "pe_ratio": latest.pe_ratio, "forward_pe": latest.forward_pe, "peg_ratio": latest.peg_ratio, "price_to_book": latest.price_to_book, "eps": latest.eps, "revenue_ttm": latest.revenue_ttm, "profit_margin": latest.profit_margin, "operating_margin": latest.operating_margin, "return_on_equity": latest.return_on_equity, "dividend_yield": latest.dividend_yield, "dividend_per_share": latest.dividend_per_share, "week_52_high": latest.week_52_high, "week_52_low": latest.week_52_low, "day_50_moving_avg": latest.day_50_moving_avg, "day_200_moving_avg": latest.day_200_moving_avg, "sector": latest.sector, "industry": latest.industry}
    return {"company_id": co.company_id, "display_name": co.display_name, "ticker": co.ticker, "sector_type": co.sector_type, "headquarters": co.headquarters, "logo_url": co.logo_url, "sec_cik": co.sec_cik, "contract_count": contract_count, "filing_count": filing_count, "enforcement_count": enforcement_count, "lobbying_count": lobbying_count, "total_contract_value": total_contract_value, "total_penalties": total_penalties, "latest_stock": latest_stock, "ai_profile_summary": co.ai_profile_summary, "sanctions_status": co.sanctions_status}


@router.get("/companies/{company_id}/filings")
def get_agriculture_company_filings(company_id: str, form_type: Optional[str] = Query(None), limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    query = db.query(SECAgricultureFiling).filter_by(company_id=company_id)
    if form_type: query = query.filter(SECAgricultureFiling.form_type == form_type)
    total = query.count()
    filings = query.order_by(desc(SECAgricultureFiling.filing_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "filings": [{"id": f.id, "accession_number": f.accession_number, "form_type": f.form_type, "filing_date": str(f.filing_date) if f.filing_date else None, "primary_doc_url": f.primary_doc_url, "filing_url": f.filing_url, "description": f.description} for f in filings]}


@router.get("/companies/{company_id}/contracts")
def get_agriculture_company_contracts(company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    query = db.query(AgricultureGovernmentContract).filter_by(company_id=company_id)
    total = query.count()
    contracts = query.order_by(desc(AgricultureGovernmentContract.award_amount)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "contracts": [{"id": ct.id, "award_id": ct.award_id, "award_amount": ct.award_amount, "awarding_agency": ct.awarding_agency, "description": ct.description, "start_date": str(ct.start_date) if ct.start_date else None, "end_date": str(ct.end_date) if ct.end_date else None, "contract_type": ct.contract_type, "ai_summary": ct.ai_summary} for ct in contracts]}


@router.get("/companies/{company_id}/contracts/summary")
def get_agriculture_company_contract_summary(company_id: str, db: Session = Depends(get_db)):
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    total_contracts = db.query(AgricultureGovernmentContract).filter_by(company_id=company_id).count()
    total_amount = db.query(func.sum(AgricultureGovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0
    by_agency = {}
    rows = db.query(AgricultureGovernmentContract.awarding_agency, func.count()).filter_by(company_id=company_id).group_by(AgricultureGovernmentContract.awarding_agency).order_by(func.count().desc()).limit(10).all()
    for agency, count in rows:
        if agency: by_agency[agency] = count
    return {"total_contracts": total_contracts, "total_amount": total_amount, "by_agency": by_agency}


@router.get("/companies/{company_id}/lobbying")
def get_agriculture_company_lobbying(company_id: str, filing_year: Optional[int] = Query(None), limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    query = db.query(AgricultureLobbyingRecord).filter_by(company_id=company_id)
    if filing_year: query = query.filter(AgricultureLobbyingRecord.filing_year == filing_year)
    total = query.count()
    records = query.order_by(desc(AgricultureLobbyingRecord.filing_year), AgricultureLobbyingRecord.filing_period).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "filings": [{"id": r.id, "filing_uuid": r.filing_uuid, "filing_year": r.filing_year, "filing_period": r.filing_period, "income": r.income, "expenses": r.expenses, "registrant_name": r.registrant_name, "client_name": r.client_name, "lobbying_issues": r.lobbying_issues, "government_entities": r.government_entities, "ai_summary": r.ai_summary} for r in records]}


@router.get("/companies/{company_id}/lobbying/summary")
def get_agriculture_company_lobbying_summary(company_id: str, db: Session = Depends(get_db)):
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    total_filings = db.query(AgricultureLobbyingRecord).filter_by(company_id=company_id).count()
    total_income = db.query(func.sum(AgricultureLobbyingRecord.income)).filter_by(company_id=company_id).scalar() or 0
    by_year = {}
    rows = db.query(AgricultureLobbyingRecord.filing_year, func.sum(AgricultureLobbyingRecord.income), func.count()).filter_by(company_id=company_id).group_by(AgricultureLobbyingRecord.filing_year).order_by(AgricultureLobbyingRecord.filing_year).all()
    for year, income, count in rows: by_year[str(year)] = {"income": income or 0, "filings": count}
    top_firms = {}
    rows = db.query(AgricultureLobbyingRecord.registrant_name, func.sum(AgricultureLobbyingRecord.income), func.count()).filter_by(company_id=company_id).group_by(AgricultureLobbyingRecord.registrant_name).order_by(func.sum(AgricultureLobbyingRecord.income).desc()).limit(10).all()
    for name, income, count in rows:
        if name: top_firms[name] = {"income": income or 0, "filings": count}
    return {"total_filings": total_filings, "total_income": total_income, "by_year": by_year, "top_firms": top_firms}


@router.get("/companies/{company_id}/enforcement")
def get_agriculture_company_enforcement(company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    query = db.query(AgricultureEnforcement).filter_by(company_id=company_id)
    total = query.count()
    actions = query.order_by(desc(AgricultureEnforcement.case_date)).offset(offset).limit(limit).all()
    total_penalties = db.query(func.sum(AgricultureEnforcement.penalty_amount)).filter_by(company_id=company_id).scalar() or 0
    return {"total": total, "total_penalties": total_penalties, "limit": limit, "offset": offset, "actions": [{"id": a.id, "case_title": a.case_title, "case_date": str(a.case_date) if a.case_date else None, "case_url": a.case_url, "enforcement_type": a.enforcement_type, "penalty_amount": a.penalty_amount, "description": a.description, "source": a.source, "ai_summary": a.ai_summary} for a in actions]}


@router.get("/companies/{company_id}/stock")
def get_agriculture_company_stock(company_id: str, db: Session = Depends(get_db)):
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    latest = db.query(StockFundamentals).filter_by(entity_type="agriculture_company", entity_id=company_id).order_by(desc(StockFundamentals.snapshot_date)).first()
    if not latest: return {"latest_stock": None}
    return {"latest_stock": {"snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None, "market_cap": latest.market_cap, "pe_ratio": latest.pe_ratio, "forward_pe": latest.forward_pe, "peg_ratio": latest.peg_ratio, "price_to_book": latest.price_to_book, "eps": latest.eps, "revenue_ttm": latest.revenue_ttm, "profit_margin": latest.profit_margin, "operating_margin": latest.operating_margin, "return_on_equity": latest.return_on_equity, "dividend_yield": latest.dividend_yield, "dividend_per_share": latest.dividend_per_share, "week_52_high": latest.week_52_high, "week_52_low": latest.week_52_low, "day_50_moving_avg": latest.day_50_moving_avg, "day_200_moving_avg": latest.day_200_moving_avg, "sector": latest.sector, "industry": latest.industry}}


@router.get("/compare")
def get_agriculture_comparison(ids: str = Query(..., description="Comma-separated company IDs"), db: Session = Depends(get_db)):
    company_ids = [cid.strip() for cid in ids.split(",") if cid.strip()]
    if not company_ids or len(company_ids) > 10: raise HTTPException(status_code=400, detail="Provide 2-10 company IDs")
    companies = {co.company_id: co for co in db.query(TrackedAgricultureCompany).filter(TrackedAgricultureCompany.company_id.in_(company_ids)).all()}
    contract_counts = dict(db.query(AgricultureGovernmentContract.company_id, func.count(AgricultureGovernmentContract.id)).filter(AgricultureGovernmentContract.company_id.in_(company_ids)).group_by(AgricultureGovernmentContract.company_id).all())
    contract_values = dict(db.query(AgricultureGovernmentContract.company_id, func.sum(AgricultureGovernmentContract.award_amount)).filter(AgricultureGovernmentContract.company_id.in_(company_ids)).group_by(AgricultureGovernmentContract.company_id).all())
    lobbying_totals = dict(db.query(AgricultureLobbyingRecord.company_id, func.sum(AgricultureLobbyingRecord.income)).filter(AgricultureLobbyingRecord.company_id.in_(company_ids)).group_by(AgricultureLobbyingRecord.company_id).all())
    enforcement_counts = dict(db.query(AgricultureEnforcement.company_id, func.count(AgricultureEnforcement.id)).filter(AgricultureEnforcement.company_id.in_(company_ids)).group_by(AgricultureEnforcement.company_id).all())
    penalty_totals = dict(db.query(AgricultureEnforcement.company_id, func.sum(AgricultureEnforcement.penalty_amount)).filter(AgricultureEnforcement.company_id.in_(company_ids)).group_by(AgricultureEnforcement.company_id).all())
    stock_map = {}
    for cid in company_ids:
        latest = db.query(StockFundamentals).filter_by(entity_type="agriculture_company", entity_id=cid).order_by(desc(StockFundamentals.snapshot_date)).first()
        if latest: stock_map[cid] = latest
    results = []
    for cid in company_ids:
        co = companies.get(cid)
        if not co: continue
        latest = stock_map.get(cid)
        results.append({"company_id": co.company_id, "display_name": co.display_name, "ticker": co.ticker, "sector_type": co.sector_type, "contract_count": contract_counts.get(cid, 0), "total_contract_value": float(contract_values.get(cid, 0) or 0), "lobbying_total": float(lobbying_totals.get(cid, 0) or 0), "enforcement_count": enforcement_counts.get(cid, 0), "total_penalties": float(penalty_totals.get(cid, 0) or 0), "market_cap": latest.market_cap if latest else None, "pe_ratio": latest.pe_ratio if latest else None, "profit_margin": latest.profit_margin if latest else None})
    return {"companies": results}


@router.get("/companies/{company_id}/donations")
def get_agriculture_company_donations(company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """PAC/corporate donations from a agriculture company to politicians."""
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    query = db.query(CompanyDonation).filter_by(entity_type="agriculture", entity_id=company_id)
    total = query.count()
    donations = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()
    total_amount = db.query(func.sum(CompanyDonation.amount)).filter_by(entity_type="agriculture", entity_id=company_id).scalar() or 0
    return {"total": total, "total_amount": total_amount, "limit": limit, "offset": offset, "donations": [{"id": d.id, "committee_name": d.committee_name, "committee_id": d.committee_id, "candidate_name": d.candidate_name, "candidate_id": d.candidate_id, "person_id": d.person_id, "amount": d.amount, "cycle": d.cycle, "donation_date": str(d.donation_date) if d.donation_date else None, "source_url": d.source_url} for d in donations]}


# ── Trend Data ──────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/trends")
def get_agriculture_company_trends(company_id: str, db: Session = Depends(get_db)):
    """Yearly trend data for a agriculture company: lobbying, contracts, enforcement.

    NOTE: func.strftime is SQLite-specific. PostgreSQL equivalent: func.extract('year', col)
    or func.to_char(col, 'YYYY'). If migrating to PostgreSQL, update these queries.
    """
    import datetime
    co = db.query(TrackedAgricultureCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Agriculture company not found")
    current_year = datetime.date.today().year
    min_year = 2018
    lobby_rows = db.query(AgricultureLobbyingRecord.filing_year, func.count(AgricultureLobbyingRecord.id)).filter_by(company_id=company_id).filter(AgricultureLobbyingRecord.filing_year.isnot(None)).group_by(AgricultureLobbyingRecord.filing_year).all()
    lobby_by_year = {int(r[0]): r[1] for r in lobby_rows if r[0]}
    contract_rows = db.query(extract_year(AgricultureGovernmentContract.start_date).label("yr"), func.count(AgricultureGovernmentContract.id)).filter_by(company_id=company_id).filter(AgricultureGovernmentContract.start_date.isnot(None)).group_by("yr").all()
    contracts_by_year = {int(r[0]): r[1] for r in contract_rows if r[0]}
    enforcement_rows = db.query(extract_year(AgricultureEnforcement.case_date).label("yr"), func.count(AgricultureEnforcement.id)).filter_by(company_id=company_id).filter(AgricultureEnforcement.case_date.isnot(None)).group_by("yr").all()
    enforcement_by_year = {int(r[0]): r[1] for r in enforcement_rows if r[0]}
    all_years_set = set(lobby_by_year) | set(contracts_by_year) | set(enforcement_by_year)
    all_years_set = {y for y in all_years_set if min_year <= y <= current_year}
    if not all_years_set: all_years_set = set(range(min_year, current_year + 1))
    years = sorted(all_years_set)
    return {"years": years, "series": {"lobbying": [lobby_by_year.get(y, 0) for y in years], "contracts": [contracts_by_year.get(y, 0) for y in years], "enforcement": [enforcement_by_year.get(y, 0) for y in years]}}
