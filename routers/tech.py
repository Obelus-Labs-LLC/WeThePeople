"""
Technology sector routes — Companies, filings, patents, contracts, lobbying, enforcement, stock.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

from models.database import get_db, Bill
from utils.sanitize import escape_like
from models.tech_models import (
    TrackedTechCompany, SECTechFiling, TechPatent, GovernmentContract, LobbyingRecord, FTCEnforcement,
)
from models.market_models import StockFundamentals
from models.database import CompanyDonation
from utils.db_compat import extract_year, lobby_spend

router = APIRouter(prefix="/tech", tags=["technology"])


@router.get("/dashboard/stats")
def get_tech_dashboard_stats(db: Session = Depends(get_db)):
    total_companies = db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1).count()
    total_filings = db.query(SECTechFiling).count()
    total_patents = db.query(TechPatent).count()
    total_contracts = db.query(GovernmentContract).count()
    total_lobbying = db.query(func.count(LobbyingRecord.id)).scalar() or 0
    total_lobbying_spend = db.query(func.sum(lobby_spend(LobbyingRecord))).scalar() or 0
    total_enforcement = db.query(func.count(FTCEnforcement.id)).scalar() or 0
    total_penalties = db.query(func.sum(FTCEnforcement.penalty_amount)).scalar() or 0
    total_contract_value = db.query(func.sum(GovernmentContract.award_amount)).scalar() or 0
    by_sector = {}
    rows = db.query(TrackedTechCompany.sector_type, func.count()).filter(TrackedTechCompany.is_active == 1).group_by(TrackedTechCompany.sector_type).all()
    for sector_type, count in rows: by_sector[sector_type] = count
    return {"total_companies": total_companies, "total_filings": total_filings, "total_patents": total_patents, "total_contracts": total_contracts, "total_lobbying": total_lobbying, "total_lobbying_spend": total_lobbying_spend, "total_enforcement": total_enforcement, "total_penalties": total_penalties, "total_contract_value": total_contract_value, "by_sector": by_sector}


@router.get("/dashboard/recent-activity")
def get_tech_recent_activity(limit: int = Query(10, ge=1, le=30), db: Session = Depends(get_db)):
    """Return recent enforcement actions, patents, contracts, and lobbying filings across all tech companies."""
    items = []
    enforcements = db.query(FTCEnforcement).order_by(desc(FTCEnforcement.case_date)).limit(limit).all()
    patents = db.query(TechPatent).order_by(desc(TechPatent.patent_date)).limit(limit).all()
    contracts = db.query(GovernmentContract).order_by(desc(GovernmentContract.start_date)).limit(limit).all()
    lobbying = db.query(LobbyingRecord).order_by(desc(LobbyingRecord.filing_year), desc(LobbyingRecord.filing_period)).limit(limit).all()
    all_cids = set()
    for e in enforcements: all_cids.add(e.company_id)
    for p in patents: all_cids.add(p.company_id)
    for ct in contracts: all_cids.add(ct.company_id)
    for r in lobbying: all_cids.add(r.company_id)
    company_names = {}
    if all_cids:
        for co in db.query(TrackedTechCompany).filter(TrackedTechCompany.company_id.in_(list(all_cids))).all():
            company_names[co.company_id] = co.display_name
    for e in enforcements:
        items.append({"type": "enforcement", "title": e.case_title or "Enforcement Action", "description": e.description, "date": str(e.case_date) if e.case_date else None, "company_id": e.company_id, "company_name": company_names.get(e.company_id, e.company_id), "url": e.case_url, "meta": {"penalty_amount": e.penalty_amount, "enforcement_type": e.enforcement_type}})
    for p in patents:
        items.append({"type": "patent", "title": p.patent_title or f"Patent #{p.patent_number}", "description": p.patent_abstract[:200] + "..." if p.patent_abstract and len(p.patent_abstract) > 200 else p.patent_abstract, "date": str(p.patent_date) if p.patent_date else None, "company_id": p.company_id, "company_name": company_names.get(p.company_id, p.company_id), "url": None, "meta": {"patent_number": p.patent_number, "num_claims": p.num_claims}})
    for ct in contracts:
        items.append({"type": "contract", "title": ct.description or f"Contract Award — {ct.awarding_agency or 'Unknown Agency'}", "description": ct.description, "date": str(ct.start_date) if ct.start_date else None, "company_id": ct.company_id, "company_name": company_names.get(ct.company_id, ct.company_id), "url": None, "meta": {"award_amount": ct.award_amount, "awarding_agency": ct.awarding_agency}})
    for r in lobbying:
        period_str = f"{r.filing_year}" + (f" {r.filing_period}" if r.filing_period else "")
        items.append({"type": "lobbying", "title": f"Lobbying Filing — {r.client_name or r.registrant_name or 'Unknown'}", "description": r.lobbying_issues, "date": f"{r.filing_year}-01-01" if r.filing_year else None, "company_id": r.company_id, "company_name": company_names.get(r.company_id, r.company_id), "url": f"https://lda.senate.gov/filings/public/filing/{r.filing_uuid}/" if r.filing_uuid else None, "meta": {"income": r.income, "expenses": r.expenses, "total_spend": (r.income or 0) + (r.expenses or 0), "filing_period": period_str, "registrant_name": r.registrant_name}})
    items.sort(key=lambda x: x["date"] or "0000-00-00", reverse=True)
    return {"items": items[:limit]}


@router.get("/companies")
def get_tech_companies(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), q: Optional[str] = Query(None), sector_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1)
    if q:
        pattern = f"%{escape_like(q)}%"
        query = query.filter((TrackedTechCompany.display_name.ilike(pattern, escape="\\")) | (TrackedTechCompany.company_id.ilike(pattern, escape="\\")) | (TrackedTechCompany.ticker.ilike(pattern, escape="\\")))
    if sector_type: query = query.filter(TrackedTechCompany.sector_type == sector_type)
    total = query.count()
    companies = query.order_by(TrackedTechCompany.display_name).offset(offset).limit(limit).all()
    company_ids = [co.company_id for co in companies]
    patent_counts = dict(db.query(TechPatent.company_id, func.count(TechPatent.id)).filter(TechPatent.company_id.in_(company_ids)).group_by(TechPatent.company_id).all()) if company_ids else {}
    contract_counts = dict(db.query(GovernmentContract.company_id, func.count(GovernmentContract.id)).filter(GovernmentContract.company_id.in_(company_ids)).group_by(GovernmentContract.company_id).all()) if company_ids else {}
    filing_counts = dict(db.query(SECTechFiling.company_id, func.count(SECTechFiling.id)).filter(SECTechFiling.company_id.in_(company_ids)).group_by(SECTechFiling.company_id).all()) if company_ids else {}
    lobbying_counts = dict(db.query(LobbyingRecord.company_id, func.count(LobbyingRecord.id)).filter(LobbyingRecord.company_id.in_(company_ids)).group_by(LobbyingRecord.company_id).all()) if company_ids else {}
    enforcement_counts = dict(db.query(FTCEnforcement.company_id, func.count(FTCEnforcement.id)).filter(FTCEnforcement.company_id.in_(company_ids)).group_by(FTCEnforcement.company_id).all()) if company_ids else {}
    donation_counts = dict(db.query(CompanyDonation.entity_id, func.count(CompanyDonation.id)).filter(CompanyDonation.entity_type == "tech", CompanyDonation.entity_id.in_(company_ids)).group_by(CompanyDonation.entity_id).all()) if company_ids else {}
    results = []
    for co in companies:
        results.append({"company_id": co.company_id, "display_name": co.display_name, "ticker": co.ticker, "sector_type": co.sector_type, "headquarters": co.headquarters, "logo_url": co.logo_url, "patent_count": patent_counts.get(co.company_id, 0), "contract_count": contract_counts.get(co.company_id, 0), "filing_count": filing_counts.get(co.company_id, 0), "lobbying_count": lobbying_counts.get(co.company_id, 0), "enforcement_count": enforcement_counts.get(co.company_id, 0), "donation_count": donation_counts.get(co.company_id, 0)})
    return {"total": total, "limit": limit, "offset": offset, "companies": results}


@router.get("/companies/{company_id}")
def get_tech_company(company_id: str, db: Session = Depends(get_db)):
    logger.info("Tech company detail request: %s", company_id)
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    patent_count = db.query(TechPatent).filter_by(company_id=company_id).count()
    contract_count = db.query(GovernmentContract).filter_by(company_id=company_id).count()
    filing_count = db.query(SECTechFiling).filter_by(company_id=company_id).count()
    total_contract_value = db.query(func.sum(GovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0
    lobbying_count = db.query(func.count(LobbyingRecord.id)).filter(LobbyingRecord.company_id == company_id).scalar() or 0
    lobbying_spend_total = db.query(func.sum(lobby_spend(LobbyingRecord))).filter(LobbyingRecord.company_id == company_id).scalar() or 0.0
    enforcement_count = db.query(func.count(FTCEnforcement.id)).filter(FTCEnforcement.company_id == company_id).scalar() or 0
    penalty_total = db.query(func.sum(FTCEnforcement.penalty_amount)).filter(FTCEnforcement.company_id == company_id).scalar() or 0.0
    donation_count = db.query(func.count(CompanyDonation.id)).filter(CompanyDonation.entity_type == "tech", CompanyDonation.entity_id == company_id).scalar() or 0
    donation_total = db.query(func.sum(CompanyDonation.amount)).filter(CompanyDonation.entity_type == "tech", CompanyDonation.entity_id == company_id).scalar() or 0.0
    latest_stock = None
    latest = db.query(StockFundamentals).filter_by(entity_type="tech_company", entity_id=company_id).order_by(desc(StockFundamentals.snapshot_date)).first()
    if latest:
        latest_stock = {"snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None, "market_cap": latest.market_cap, "pe_ratio": latest.pe_ratio, "eps": latest.eps, "dividend_yield": latest.dividend_yield, "week_52_high": latest.week_52_high, "week_52_low": latest.week_52_low, "profit_margin": latest.profit_margin}
    ip_keywords = ["patent", "intellectual property", "copyright", "innovation", "technology transfer"]
    ip_lobby_filters = []
    for kw in ip_keywords:
        pattern = f"%{kw}%"
        ip_lobby_filters.append(LobbyingRecord.lobbying_issues.ilike(pattern))
        ip_lobby_filters.append(LobbyingRecord.specific_issues.ilike(pattern))
    lobbying_on_ip = db.query(func.count(LobbyingRecord.id)).filter(LobbyingRecord.company_id == company_id, or_(*ip_lobby_filters)).scalar() or 0
    related_bills_count = 0
    try:
        bill_filters = []
        for kw in ip_keywords:
            pattern = f"%{kw}%"
            bill_filters.append(Bill.title.ilike(pattern))
            bill_filters.append(Bill.policy_area.ilike(pattern))
        related_bills_count = db.query(func.count(Bill.bill_id)).filter(or_(*bill_filters)).scalar() or 0
    except Exception as e:
        logger.warning("Patent-policy bill query failed for %s: %s", company_id, e)
    patent_policy_summary = {"patent_count": patent_count, "lobbying_on_ip_policy": lobbying_on_ip, "related_bills": related_bills_count}
    return {"company_id": co.company_id, "display_name": co.display_name, "ticker": co.ticker, "sector_type": co.sector_type, "headquarters": co.headquarters, "logo_url": co.logo_url, "sec_cik": co.sec_cik, "patent_count": patent_count, "contract_count": contract_count, "filing_count": filing_count, "total_contract_value": total_contract_value, "lobbying_count": lobbying_count, "lobbying_spend": lobbying_spend_total, "enforcement_count": enforcement_count, "penalty_total": penalty_total, "donation_count": donation_count, "donation_total": donation_total, "latest_stock": latest_stock, "ai_profile_summary": co.ai_profile_summary, "sanctions_status": co.sanctions_status, "patent_policy_summary": patent_policy_summary}


@router.get("/companies/{company_id}/filings")
def get_tech_company_filings(company_id: str, form_type: Optional[str] = Query(None), limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    query = db.query(SECTechFiling).filter_by(company_id=company_id)
    if form_type: query = query.filter(SECTechFiling.form_type == form_type)
    total = query.count()
    filings = query.order_by(desc(SECTechFiling.filing_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "filings": [{"id": f.id, "accession_number": f.accession_number, "form_type": f.form_type, "filing_date": str(f.filing_date) if f.filing_date else None, "primary_doc_url": f.primary_doc_url, "filing_url": f.filing_url, "description": f.description} for f in filings]}


@router.get("/companies/{company_id}/patents")
def get_tech_company_patents(company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    query = db.query(TechPatent).filter_by(company_id=company_id)
    total = query.count()
    patents = query.order_by(desc(TechPatent.patent_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "patents": [{"id": p.id, "patent_number": p.patent_number, "patent_title": p.patent_title, "patent_date": str(p.patent_date) if p.patent_date else None, "patent_abstract": p.patent_abstract, "num_claims": p.num_claims, "cpc_codes": p.cpc_codes} for p in patents]}


@router.get("/companies/{company_id}/contracts")
def get_tech_company_contracts(company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    query = db.query(GovernmentContract).filter_by(company_id=company_id)
    total = query.count()
    contracts = query.order_by(desc(GovernmentContract.award_amount)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "contracts": [{"id": ct.id, "award_id": ct.award_id, "award_amount": ct.award_amount, "awarding_agency": ct.awarding_agency, "description": ct.description, "start_date": str(ct.start_date) if ct.start_date else None, "end_date": str(ct.end_date) if ct.end_date else None, "contract_type": ct.contract_type, "ai_summary": ct.ai_summary} for ct in contracts]}


@router.get("/companies/{company_id}/contracts/summary")
def get_tech_company_contract_summary(company_id: str, db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    total_contracts = db.query(GovernmentContract).filter_by(company_id=company_id).count()
    total_amount = db.query(func.sum(GovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0
    by_agency = {}
    rows = db.query(GovernmentContract.awarding_agency, func.count()).filter_by(company_id=company_id).group_by(GovernmentContract.awarding_agency).order_by(func.count().desc()).limit(10).all()
    for agency, count in rows:
        if agency: by_agency[agency] = count
    by_type = {}
    rows = db.query(GovernmentContract.contract_type, func.count()).filter_by(company_id=company_id).group_by(GovernmentContract.contract_type).all()
    for ctype, count in rows:
        if ctype: by_type[ctype] = count
    return {"total_contracts": total_contracts, "total_amount": total_amount, "by_agency": by_agency, "by_type": by_type}


@router.get("/companies/{company_id}/stock")
def get_tech_company_stock(company_id: str, db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    latest = db.query(StockFundamentals).filter_by(entity_type="tech_company", entity_id=company_id).order_by(desc(StockFundamentals.snapshot_date)).first()
    if not latest: return {"latest_stock": None}
    return {"latest_stock": {"snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None, "market_cap": latest.market_cap, "pe_ratio": latest.pe_ratio, "forward_pe": latest.forward_pe, "peg_ratio": latest.peg_ratio, "price_to_book": latest.price_to_book, "eps": latest.eps, "revenue_ttm": latest.revenue_ttm, "profit_margin": latest.profit_margin, "operating_margin": latest.operating_margin, "return_on_equity": latest.return_on_equity, "dividend_yield": latest.dividend_yield, "dividend_per_share": latest.dividend_per_share, "week_52_high": latest.week_52_high, "week_52_low": latest.week_52_low, "day_50_moving_avg": latest.day_50_moving_avg, "day_200_moving_avg": latest.day_200_moving_avg, "sector": latest.sector, "industry": latest.industry}}


@router.get("/companies/{company_id}/lobbying")
def get_tech_company_lobbying(company_id: str, filing_year: Optional[int] = Query(None), limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    query = db.query(LobbyingRecord).filter_by(company_id=company_id)
    if filing_year: query = query.filter(LobbyingRecord.filing_year == filing_year)
    total = query.count()
    records = query.order_by(desc(LobbyingRecord.filing_year), LobbyingRecord.filing_period).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "filings": [{"id": r.id, "filing_uuid": r.filing_uuid, "filing_year": r.filing_year, "filing_period": r.filing_period, "income": r.income, "expenses": r.expenses, "registrant_name": r.registrant_name, "client_name": r.client_name, "lobbying_issues": r.lobbying_issues, "government_entities": r.government_entities, "ai_summary": r.ai_summary} for r in records]}


@router.get("/companies/{company_id}/lobbying/summary")
def get_tech_company_lobbying_summary(company_id: str, db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    total_filings = db.query(LobbyingRecord).filter_by(company_id=company_id).count()
    total_income = db.query(func.sum(lobby_spend(LobbyingRecord))).filter_by(company_id=company_id).scalar() or 0
    by_year = {}
    rows = db.query(LobbyingRecord.filing_year, func.sum(lobby_spend(LobbyingRecord)), func.count()).filter_by(company_id=company_id).group_by(LobbyingRecord.filing_year).order_by(LobbyingRecord.filing_year).all()
    for year, income, count in rows: by_year[str(year)] = {"income": income or 0, "filings": count}
    top_firms = {}
    rows = db.query(LobbyingRecord.registrant_name, func.sum(lobby_spend(LobbyingRecord)), func.count()).filter_by(company_id=company_id).group_by(LobbyingRecord.registrant_name).order_by(func.sum(lobby_spend(LobbyingRecord)).desc()).limit(10).all()
    for name, income, count in rows:
        if name: top_firms[name] = {"income": income or 0, "filings": count}
    return {"total_filings": total_filings, "total_income": total_income, "by_year": by_year, "top_firms": top_firms}


@router.get("/companies/{company_id}/enforcement")
def get_tech_company_enforcement(company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    query = db.query(FTCEnforcement).filter_by(company_id=company_id)
    total = query.count()
    actions = query.order_by(desc(FTCEnforcement.case_date)).offset(offset).limit(limit).all()
    total_penalties = db.query(func.sum(FTCEnforcement.penalty_amount)).filter_by(company_id=company_id).scalar() or 0
    return {"total": total, "total_penalties": total_penalties, "limit": limit, "offset": offset, "actions": [{"id": a.id, "case_title": a.case_title, "case_date": str(a.case_date) if a.case_date else None, "case_url": a.case_url, "enforcement_type": a.enforcement_type, "penalty_amount": a.penalty_amount, "description": a.description, "source": a.source, "ai_summary": a.ai_summary} for a in actions]}


@router.get("/companies/{company_id}/contracts/trends")
def get_tech_company_contract_trends(company_id: str, db: Session = Depends(get_db)):
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    rows = db.query(extract_year(GovernmentContract.start_date).label("year"), func.sum(GovernmentContract.award_amount).label("total_amount"), func.count(GovernmentContract.id).label("count")).filter_by(company_id=company_id).filter(GovernmentContract.start_date.isnot(None)).group_by("year").order_by("year").all()
    sorted_years = [{"year": r.year, "total_amount": float(r.total_amount or 0), "count": r.count} for r in rows]
    unknown_row = db.query(func.sum(GovernmentContract.award_amount).label("total_amount"), func.count(GovernmentContract.id).label("count")).filter_by(company_id=company_id).filter(GovernmentContract.start_date.is_(None)).first()
    if unknown_row and unknown_row.count > 0:
        sorted_years.append({"year": "Unknown", "total_amount": float(unknown_row.total_amount or 0), "count": unknown_row.count})
    return {"trends": sorted_years}


@router.get("/compare")
def get_tech_comparison(ids: str = Query(..., description="Comma-separated company IDs"), db: Session = Depends(get_db)):
    company_ids = [cid.strip() for cid in ids.split(",") if cid.strip()]
    if not company_ids or len(company_ids) > 10: raise HTTPException(status_code=400, detail="Provide 2-10 company IDs")
    companies = {co.company_id: co for co in db.query(TrackedTechCompany).filter(TrackedTechCompany.company_id.in_(company_ids)).all()}
    patent_counts = dict(db.query(TechPatent.company_id, func.count(TechPatent.id)).filter(TechPatent.company_id.in_(company_ids)).group_by(TechPatent.company_id).all())
    contract_counts = dict(db.query(GovernmentContract.company_id, func.count(GovernmentContract.id)).filter(GovernmentContract.company_id.in_(company_ids)).group_by(GovernmentContract.company_id).all())
    filing_counts = dict(db.query(SECTechFiling.company_id, func.count(SECTechFiling.id)).filter(SECTechFiling.company_id.in_(company_ids)).group_by(SECTechFiling.company_id).all())
    contract_values = dict(db.query(GovernmentContract.company_id, func.sum(GovernmentContract.award_amount)).filter(GovernmentContract.company_id.in_(company_ids)).group_by(GovernmentContract.company_id).all())
    lobbying_totals = dict(db.query(LobbyingRecord.company_id, func.sum(lobby_spend(LobbyingRecord))).filter(LobbyingRecord.company_id.in_(company_ids)).group_by(LobbyingRecord.company_id).all())
    enforcement_counts = dict(db.query(FTCEnforcement.company_id, func.count(FTCEnforcement.id)).filter(FTCEnforcement.company_id.in_(company_ids)).group_by(FTCEnforcement.company_id).all())
    penalty_totals = dict(db.query(FTCEnforcement.company_id, func.sum(FTCEnforcement.penalty_amount)).filter(FTCEnforcement.company_id.in_(company_ids)).group_by(FTCEnforcement.company_id).all())
    from sqlalchemy import func as sa_func
    stock_subq = (
        db.query(StockFundamentals.entity_id, sa_func.max(StockFundamentals.snapshot_date).label("max_date"))
        .filter(StockFundamentals.entity_type == "tech_company", StockFundamentals.entity_id.in_(company_ids))
        .group_by(StockFundamentals.entity_id)
        .subquery()
    )
    stock_rows = (
        db.query(StockFundamentals)
        .join(stock_subq, (StockFundamentals.entity_id == stock_subq.c.entity_id) & (StockFundamentals.snapshot_date == stock_subq.c.max_date))
        .filter(StockFundamentals.entity_type == "tech_company")
        .all()
    )
    stock_map = {s.entity_id: s for s in stock_rows}
    results = []
    for cid in company_ids:
        co = companies.get(cid)
        if not co: continue
        latest = stock_map.get(cid)
        results.append({"company_id": co.company_id, "display_name": co.display_name, "ticker": co.ticker, "sector_type": co.sector_type, "patent_count": patent_counts.get(cid, 0), "contract_count": contract_counts.get(cid, 0), "filing_count": filing_counts.get(cid, 0), "total_contract_value": float(contract_values.get(cid, 0) or 0), "lobbying_total": float(lobbying_totals.get(cid, 0) or 0), "enforcement_count": enforcement_counts.get(cid, 0), "total_penalties": float(penalty_totals.get(cid, 0) or 0), "market_cap": latest.market_cap if latest else None, "pe_ratio": latest.pe_ratio if latest else None, "profit_margin": latest.profit_margin if latest else None})
    return {"companies": results}


@router.get("/companies/{company_id}/patent-policy")
def get_tech_company_patent_policy(company_id: str, db: Session = Depends(get_db)):
    """Link a company's patents to lobbying filings and IP/tech policy bills in Congress."""
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    patent_count = db.query(func.count(TechPatent.id)).filter_by(company_id=company_id).scalar() or 0
    # Count categories from cpc_codes without loading all patents into memory
    cpc_rows = db.query(TechPatent.cpc_codes).filter(TechPatent.company_id == company_id, TechPatent.cpc_codes.isnot(None)).all()
    patent_categories: Dict[str, int] = {}
    for (cpc_codes,) in cpc_rows:
        if cpc_codes:
            for code in cpc_codes.split(","):
                prefix = code.strip()[:3] if len(code.strip()) >= 3 else code.strip()
                if prefix: patent_categories[prefix] = patent_categories.get(prefix, 0) + 1
    ip_keywords = ["patent", "intellectual property", "copyright", "innovation", "technology transfer", "trade secret", "trademark", "IP rights"]
    ip_lobby_filters = []
    for kw in ip_keywords:
        pattern = f"%{kw}%"
        ip_lobby_filters.append(LobbyingRecord.lobbying_issues.ilike(pattern))
        ip_lobby_filters.append(LobbyingRecord.specific_issues.ilike(pattern))
    ip_lobbying = db.query(LobbyingRecord).filter(LobbyingRecord.company_id == company_id, or_(*ip_lobby_filters)).order_by(desc(LobbyingRecord.filing_year)).all()
    total_lobbying_on_ip = len(ip_lobbying)
    # Aggregate via the prefer-expenses-per-year helper so we don't
    # double-count outside-firm fees against in-house expenses (which
    # already include them). See services/lobby_spend.py for details.
    from services.lobby_spend import python_aggregate_filings
    total_ip_lobbying_spend = python_aggregate_filings(ip_lobbying)
    ip_lobbying_items = [{"id": r.id, "filing_uuid": r.filing_uuid, "filing_year": r.filing_year, "filing_period": r.filing_period, "income": r.income, "expenses": r.expenses, "registrant_name": r.registrant_name, "lobbying_issues": r.lobbying_issues} for r in ip_lobbying[:20]]
    bill_keywords = ["patent", "intellectual property", "copyright", "innovation", "technology transfer"]
    bill_filters = []
    for kw in bill_keywords:
        pattern = f"%{kw}%"
        bill_filters.append(Bill.title.ilike(pattern))
        bill_filters.append(Bill.policy_area.ilike(pattern))
    related_bills = db.query(Bill).filter(or_(*bill_filters)).order_by(desc(Bill.latest_action_date)).limit(25).all()
    bill_items = [{"bill_id": b.bill_id, "title": b.title, "congress": b.congress, "bill_type": b.bill_type, "bill_number": b.bill_number, "policy_area": b.policy_area, "status_bucket": b.status_bucket, "latest_action_text": b.latest_action_text, "latest_action_date": str(b.latest_action_date) if b.latest_action_date else None} for b in related_bills]
    return {"company_id": company_id, "display_name": co.display_name, "patent_count": patent_count, "patent_categories": patent_categories, "lobbying_on_ip_policy": total_lobbying_on_ip, "ip_lobbying_spend": total_ip_lobbying_spend, "ip_lobbying_filings": ip_lobbying_items, "related_bills_count": len(related_bills), "related_bills": bill_items}


@router.get("/companies/{company_id}/donations")
def get_tech_company_donations(company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """PAC/corporate donations from a tech company to politicians."""
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    query = db.query(CompanyDonation).filter_by(entity_type="tech", entity_id=company_id)
    total = query.count()
    donations = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()
    total_amount = db.query(func.sum(CompanyDonation.amount)).filter_by(entity_type="tech", entity_id=company_id).scalar() or 0
    return {"total": total, "total_amount": total_amount, "limit": limit, "offset": offset, "donations": [{"id": d.id, "committee_name": d.committee_name, "committee_id": d.committee_id, "candidate_name": d.candidate_name, "candidate_id": d.candidate_id, "person_id": d.person_id, "amount": d.amount, "cycle": d.cycle, "donation_date": str(d.donation_date) if d.donation_date else None, "source_url": d.source_url} for d in donations]}


# ── Trend Data ──────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/trends")
def get_tech_company_trends(company_id: str, db: Session = Depends(get_db)):
    """Yearly trend data for a tech company: lobbying, contracts, enforcement, patents.

    NOTE: func.strftime is SQLite-specific. PostgreSQL equivalent: func.extract('year', col)
    or func.to_char(col, 'YYYY'). If migrating to PostgreSQL, update these queries.
    """
    import datetime
    co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
    if not co: raise HTTPException(status_code=404, detail="Tech company not found")
    current_year = datetime.date.today().year
    min_year = 2018
    lobby_rows = db.query(LobbyingRecord.filing_year, func.count(LobbyingRecord.id)).filter_by(company_id=company_id).filter(LobbyingRecord.filing_year.isnot(None)).group_by(LobbyingRecord.filing_year).all()
    lobby_by_year = {int(r[0]): r[1] for r in lobby_rows if r[0]}
    contract_rows = db.query(extract_year(GovernmentContract.start_date).label("yr"), func.count(GovernmentContract.id)).filter_by(company_id=company_id).filter(GovernmentContract.start_date.isnot(None)).group_by("yr").all()
    contracts_by_year = {int(r[0]): r[1] for r in contract_rows if r[0]}
    enforcement_rows = db.query(extract_year(FTCEnforcement.case_date).label("yr"), func.count(FTCEnforcement.id)).filter_by(company_id=company_id).filter(FTCEnforcement.case_date.isnot(None)).group_by("yr").all()
    enforcement_by_year = {int(r[0]): r[1] for r in enforcement_rows if r[0]}
    patent_rows = db.query(extract_year(TechPatent.filing_date).label("yr"), func.count(TechPatent.id)).filter_by(company_id=company_id).filter(TechPatent.filing_date.isnot(None)).group_by("yr").all()
    patents_by_year = {int(r[0]): r[1] for r in patent_rows if r[0]}
    all_years_set = set(lobby_by_year) | set(contracts_by_year) | set(enforcement_by_year) | set(patents_by_year)
    all_years_set = {y for y in all_years_set if min_year <= y <= current_year}
    if not all_years_set: all_years_set = set(range(min_year, current_year + 1))
    years = sorted(all_years_set)
    return {"years": years, "series": {"lobbying": [lobby_by_year.get(y, 0) for y in years], "contracts": [contracts_by_year.get(y, 0) for y in years], "enforcement": [enforcement_by_year.get(y, 0) for y in years], "patents": [patents_by_year.get(y, 0) for y in years]}}
