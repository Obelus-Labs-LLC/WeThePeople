"""
Technology sector routes — Companies, filings, patents, contracts, lobbying, enforcement, stock.
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional, Dict, Any

from models.database import SessionLocal
from models.tech_models import (
    TrackedTechCompany,
    SECTechFiling,
    TechPatent,
    GovernmentContract,
    LobbyingRecord,
    FTCEnforcement,
)
from models.market_models import StockFundamentals
from models.database import CompanyDonation

router = APIRouter(prefix="/tech", tags=["technology"])


@router.get("/dashboard/stats")
def get_tech_dashboard_stats():
    db = SessionLocal()
    try:
        total_companies = db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1).count()
        total_filings = db.query(SECTechFiling).count()
        total_patents = db.query(TechPatent).count()
        total_contracts = db.query(GovernmentContract).count()

        # Political data totals
        total_lobbying = db.query(func.count(LobbyingRecord.id)).scalar() or 0
        total_lobbying_spend = db.query(func.sum(LobbyingRecord.income)).scalar() or 0
        total_enforcement = db.query(func.count(FTCEnforcement.id)).scalar() or 0
        total_penalties = db.query(func.sum(FTCEnforcement.penalty_amount)).scalar() or 0
        total_contract_value = db.query(func.sum(GovernmentContract.award_amount)).scalar() or 0

        by_sector = {}
        rows = db.query(TrackedTechCompany.sector_type, func.count()).filter(
            TrackedTechCompany.is_active == 1
        ).group_by(TrackedTechCompany.sector_type).all()
        for sector_type, count in rows:
            by_sector[sector_type] = count

        return {
            "total_companies": total_companies, "total_filings": total_filings,
            "total_patents": total_patents, "total_contracts": total_contracts,
            "total_lobbying": total_lobbying, "total_lobbying_spend": total_lobbying_spend,
            "total_enforcement": total_enforcement, "total_penalties": total_penalties,
            "total_contract_value": total_contract_value,
            "by_sector": by_sector,
        }
    finally:
        db.close()


@router.get("/dashboard/recent-activity")
def get_tech_recent_activity(limit: int = Query(10, ge=1, le=30)):
    """Return recent enforcement actions, patents, contracts, and lobbying filings across all tech companies."""
    db = SessionLocal()
    try:
        items = []

        # Recent enforcement actions
        enforcements = db.query(FTCEnforcement).order_by(desc(FTCEnforcement.case_date)).limit(limit).all()
        for e in enforcements:
            co = db.query(TrackedTechCompany).filter_by(company_id=e.company_id).first()
            items.append({
                "type": "enforcement",
                "title": e.case_title or "Enforcement Action",
                "description": e.description,
                "date": str(e.case_date) if e.case_date else None,
                "company_id": e.company_id,
                "company_name": co.display_name if co else e.company_id,
                "url": e.case_url,
                "meta": {"penalty_amount": e.penalty_amount, "enforcement_type": e.enforcement_type},
            })

        # Recent patents
        patents = db.query(TechPatent).order_by(desc(TechPatent.patent_date)).limit(limit).all()
        for p in patents:
            co = db.query(TrackedTechCompany).filter_by(company_id=p.company_id).first()
            items.append({
                "type": "patent",
                "title": p.patent_title or f"Patent #{p.patent_number}",
                "description": p.patent_abstract[:200] + "..." if p.patent_abstract and len(p.patent_abstract) > 200 else p.patent_abstract,
                "date": str(p.patent_date) if p.patent_date else None,
                "company_id": p.company_id,
                "company_name": co.display_name if co else p.company_id,
                "url": None,
                "meta": {"patent_number": p.patent_number, "num_claims": p.num_claims},
            })

        # Recent contracts (by start_date)
        contracts = db.query(GovernmentContract).order_by(desc(GovernmentContract.start_date)).limit(limit).all()
        for ct in contracts:
            co = db.query(TrackedTechCompany).filter_by(company_id=ct.company_id).first()
            items.append({
                "type": "contract",
                "title": ct.description or f"Contract Award — {ct.awarding_agency or 'Unknown Agency'}",
                "description": ct.description,
                "date": str(ct.start_date) if ct.start_date else None,
                "company_id": ct.company_id,
                "company_name": co.display_name if co else ct.company_id,
                "url": None,
                "meta": {"award_amount": ct.award_amount, "awarding_agency": ct.awarding_agency},
            })

        # Recent lobbying filings
        lobbying = db.query(LobbyingRecord).order_by(desc(LobbyingRecord.filing_year), desc(LobbyingRecord.filing_period)).limit(limit).all()
        for r in lobbying:
            co = db.query(TrackedTechCompany).filter_by(company_id=r.company_id).first()
            period_str = f"{r.filing_year}" + (f" {r.filing_period}" if r.filing_period else "")
            items.append({
                "type": "lobbying",
                "title": f"Lobbying Filing — {r.client_name or r.registrant_name or 'Unknown'}",
                "description": r.lobbying_issues,
                "date": f"{r.filing_year}-01-01" if r.filing_year else None,
                "company_id": r.company_id,
                "company_name": co.display_name if co else r.company_id,
                "url": f"https://lda.senate.gov/filings/public/filing/{r.filing_uuid}/" if r.filing_uuid else None,
                "meta": {"income": r.income, "filing_period": period_str, "registrant_name": r.registrant_name},
            })

        # Sort all items by date descending, nulls last
        items.sort(key=lambda x: x["date"] or "0000-00-00", reverse=True)
        return {"items": items[:limit]}
    finally:
        db.close()


@router.get("/companies")
def get_tech_companies(
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None), sector_type: Optional[str] = Query(None),
):
    db = SessionLocal()
    try:
        query = db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1)
        if q:
            pattern = f"%{q}%"
            query = query.filter(
                (TrackedTechCompany.display_name.ilike(pattern))
                | (TrackedTechCompany.company_id.ilike(pattern))
                | (TrackedTechCompany.ticker.ilike(pattern))
            )
        if sector_type:
            query = query.filter(TrackedTechCompany.sector_type == sector_type)

        total = query.count()
        companies = query.order_by(TrackedTechCompany.display_name).offset(offset).limit(limit).all()

        results = []
        for co in companies:
            patent_count = db.query(TechPatent).filter_by(company_id=co.company_id).count()
            contract_count = db.query(GovernmentContract).filter_by(company_id=co.company_id).count()
            filing_count = db.query(SECTechFiling).filter_by(company_id=co.company_id).count()
            results.append({
                "company_id": co.company_id, "display_name": co.display_name,
                "ticker": co.ticker, "sector_type": co.sector_type,
                "headquarters": co.headquarters, "logo_url": co.logo_url,
                "patent_count": patent_count, "contract_count": contract_count, "filing_count": filing_count,
            })

        return {"total": total, "limit": limit, "offset": offset, "companies": results}
    finally:
        db.close()


@router.get("/companies/{company_id}")
def get_tech_company(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        patent_count = db.query(TechPatent).filter_by(company_id=company_id).count()
        contract_count = db.query(GovernmentContract).filter_by(company_id=company_id).count()
        filing_count = db.query(SECTechFiling).filter_by(company_id=company_id).count()
        total_contract_value = db.query(func.sum(GovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0

        latest_stock = None
        latest = db.query(StockFundamentals).filter_by(
            entity_type="tech_company", entity_id=company_id
        ).order_by(desc(StockFundamentals.snapshot_date)).first()
        if latest:
            latest_stock = {
                "snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None,
                "market_cap": latest.market_cap, "pe_ratio": latest.pe_ratio,
                "eps": latest.eps, "dividend_yield": latest.dividend_yield,
                "week_52_high": latest.week_52_high, "week_52_low": latest.week_52_low,
                "profit_margin": latest.profit_margin,
            }

        return {
            "company_id": co.company_id, "display_name": co.display_name,
            "ticker": co.ticker, "sector_type": co.sector_type,
            "headquarters": co.headquarters, "logo_url": co.logo_url, "sec_cik": co.sec_cik,
            "patent_count": patent_count, "contract_count": contract_count,
            "filing_count": filing_count, "total_contract_value": total_contract_value,
            "latest_stock": latest_stock,
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/filings")
def get_tech_company_filings(
    company_id: str, form_type: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        query = db.query(SECTechFiling).filter_by(company_id=company_id)
        if form_type:
            query = query.filter(SECTechFiling.form_type == form_type)
        total = query.count()
        filings = query.order_by(desc(SECTechFiling.filing_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "filings": [{
                "id": f.id, "accession_number": f.accession_number, "form_type": f.form_type,
                "filing_date": str(f.filing_date) if f.filing_date else None,
                "primary_doc_url": f.primary_doc_url, "filing_url": f.filing_url, "description": f.description,
            } for f in filings],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/patents")
def get_tech_company_patents(
    company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        query = db.query(TechPatent).filter_by(company_id=company_id)
        total = query.count()
        patents = query.order_by(desc(TechPatent.patent_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "patents": [{
                "id": p.id, "patent_number": p.patent_number, "patent_title": p.patent_title,
                "patent_date": str(p.patent_date) if p.patent_date else None,
                "patent_abstract": p.patent_abstract, "num_claims": p.num_claims, "cpc_codes": p.cpc_codes,
            } for p in patents],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/contracts")
def get_tech_company_contracts(
    company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        query = db.query(GovernmentContract).filter_by(company_id=company_id)
        total = query.count()
        contracts = query.order_by(desc(GovernmentContract.award_amount)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "contracts": [{
                "id": ct.id, "award_id": ct.award_id, "award_amount": ct.award_amount,
                "awarding_agency": ct.awarding_agency, "description": ct.description,
                "start_date": str(ct.start_date) if ct.start_date else None,
                "end_date": str(ct.end_date) if ct.end_date else None, "contract_type": ct.contract_type,
            } for ct in contracts],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/contracts/summary")
def get_tech_company_contract_summary(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        total_contracts = db.query(GovernmentContract).filter_by(company_id=company_id).count()
        total_amount = db.query(func.sum(GovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0

        by_agency = {}
        rows = db.query(GovernmentContract.awarding_agency, func.count()).filter_by(
            company_id=company_id
        ).group_by(GovernmentContract.awarding_agency).order_by(func.count().desc()).limit(10).all()
        for agency, count in rows:
            if agency:
                by_agency[agency] = count

        by_type = {}
        rows = db.query(GovernmentContract.contract_type, func.count()).filter_by(
            company_id=company_id
        ).group_by(GovernmentContract.contract_type).all()
        for ctype, count in rows:
            if ctype:
                by_type[ctype] = count

        return {"total_contracts": total_contracts, "total_amount": total_amount, "by_agency": by_agency, "by_type": by_type}
    finally:
        db.close()


@router.get("/companies/{company_id}/stock")
def get_tech_company_stock(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        latest = db.query(StockFundamentals).filter_by(
            entity_type="tech_company", entity_id=company_id
        ).order_by(desc(StockFundamentals.snapshot_date)).first()
        if not latest:
            return {"latest_stock": None}
        return {
            "latest_stock": {
                "snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None,
                "market_cap": latest.market_cap, "pe_ratio": latest.pe_ratio,
                "forward_pe": latest.forward_pe, "peg_ratio": latest.peg_ratio,
                "price_to_book": latest.price_to_book, "eps": latest.eps,
                "revenue_ttm": latest.revenue_ttm, "profit_margin": latest.profit_margin,
                "operating_margin": latest.operating_margin, "return_on_equity": latest.return_on_equity,
                "dividend_yield": latest.dividend_yield, "dividend_per_share": latest.dividend_per_share,
                "week_52_high": latest.week_52_high, "week_52_low": latest.week_52_low,
                "day_50_moving_avg": latest.day_50_moving_avg, "day_200_moving_avg": latest.day_200_moving_avg,
                "sector": latest.sector, "industry": latest.industry,
            }
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/lobbying")
def get_tech_company_lobbying(
    company_id: str, filing_year: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        query = db.query(LobbyingRecord).filter_by(company_id=company_id)
        if filing_year:
            query = query.filter(LobbyingRecord.filing_year == filing_year)
        total = query.count()
        records = query.order_by(desc(LobbyingRecord.filing_year), LobbyingRecord.filing_period).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "filings": [{
                "id": r.id, "filing_uuid": r.filing_uuid, "filing_year": r.filing_year,
                "filing_period": r.filing_period, "income": r.income, "expenses": r.expenses,
                "registrant_name": r.registrant_name, "client_name": r.client_name,
                "lobbying_issues": r.lobbying_issues, "government_entities": r.government_entities,
            } for r in records],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/lobbying/summary")
def get_tech_company_lobbying_summary(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")

        total_filings = db.query(LobbyingRecord).filter_by(company_id=company_id).count()
        total_income = db.query(func.sum(LobbyingRecord.income)).filter_by(company_id=company_id).scalar() or 0

        by_year = {}
        rows = db.query(
            LobbyingRecord.filing_year, func.sum(LobbyingRecord.income), func.count(),
        ).filter_by(company_id=company_id).group_by(LobbyingRecord.filing_year).order_by(LobbyingRecord.filing_year).all()
        for year, income, count in rows:
            by_year[str(year)] = {"income": income or 0, "filings": count}

        top_firms = {}
        rows = db.query(
            LobbyingRecord.registrant_name, func.sum(LobbyingRecord.income), func.count(),
        ).filter_by(company_id=company_id).group_by(LobbyingRecord.registrant_name).order_by(func.sum(LobbyingRecord.income).desc()).limit(10).all()
        for name, income, count in rows:
            if name:
                top_firms[name] = {"income": income or 0, "filings": count}

        return {"total_filings": total_filings, "total_income": total_income, "by_year": by_year, "top_firms": top_firms}
    finally:
        db.close()


@router.get("/companies/{company_id}/enforcement")
def get_tech_company_enforcement(
    company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        query = db.query(FTCEnforcement).filter_by(company_id=company_id)
        total = query.count()
        actions = query.order_by(desc(FTCEnforcement.case_date)).offset(offset).limit(limit).all()
        total_penalties = db.query(func.sum(FTCEnforcement.penalty_amount)).filter_by(company_id=company_id).scalar() or 0
        return {
            "total": total, "total_penalties": total_penalties, "limit": limit, "offset": offset,
            "actions": [{
                "id": a.id, "case_title": a.case_title,
                "case_date": str(a.case_date) if a.case_date else None,
                "case_url": a.case_url, "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount, "description": a.description, "source": a.source,
            } for a in actions],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/contracts/trends")
def get_tech_company_contract_trends(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        contracts = db.query(GovernmentContract).filter_by(company_id=company_id).all()
        by_year: Dict[str, Any] = {}
        for ct in contracts:
            year = str(ct.start_date.year) if ct.start_date else "Unknown"
            if year not in by_year:
                by_year[year] = {"total_amount": 0, "count": 0}
            by_year[year]["total_amount"] += ct.award_amount or 0
            by_year[year]["count"] += 1
        sorted_years = sorted(
            [{"year": y, **d} for y, d in by_year.items() if y != "Unknown"],
            key=lambda x: x["year"],
        )
        if "Unknown" in by_year:
            sorted_years.append({"year": "Unknown", **by_year["Unknown"]})
        return {"trends": sorted_years}
    finally:
        db.close()


@router.get("/compare")
def get_tech_comparison(ids: str = Query(..., description="Comma-separated company IDs")):
    db = SessionLocal()
    try:
        company_ids = [cid.strip() for cid in ids.split(",") if cid.strip()]
        if not company_ids or len(company_ids) > 10:
            raise HTTPException(status_code=400, detail="Provide 2-10 company IDs")

        results = []
        for cid in company_ids:
            co = db.query(TrackedTechCompany).filter_by(company_id=cid).first()
            if not co:
                continue
            patent_count = db.query(TechPatent).filter_by(company_id=cid).count()
            contract_count = db.query(GovernmentContract).filter_by(company_id=cid).count()
            filing_count = db.query(SECTechFiling).filter_by(company_id=cid).count()
            total_contract_value = db.query(func.sum(GovernmentContract.award_amount)).filter_by(company_id=cid).scalar() or 0
            lobbying_total = db.query(func.sum(LobbyingRecord.income)).filter_by(company_id=cid).scalar() or 0
            enforcement_count = db.query(FTCEnforcement).filter_by(company_id=cid).count()
            total_penalties = db.query(func.sum(FTCEnforcement.penalty_amount)).filter_by(company_id=cid).scalar() or 0

            latest = db.query(StockFundamentals).filter_by(
                entity_type="tech_company", entity_id=cid
            ).order_by(desc(StockFundamentals.snapshot_date)).first()

            results.append({
                "company_id": co.company_id, "display_name": co.display_name,
                "ticker": co.ticker, "sector_type": co.sector_type,
                "patent_count": patent_count, "contract_count": contract_count,
                "filing_count": filing_count, "total_contract_value": total_contract_value,
                "lobbying_total": lobbying_total, "enforcement_count": enforcement_count,
                "total_penalties": total_penalties,
                "market_cap": latest.market_cap if latest else None,
                "pe_ratio": latest.pe_ratio if latest else None,
                "profit_margin": latest.profit_margin if latest else None,
            })

        return {"companies": results}
    finally:
        db.close()


@router.get("/companies/{company_id}/donations")
def get_tech_company_donations(
    company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    """PAC/corporate donations from a tech company to politicians."""
    db = SessionLocal()
    try:
        co = db.query(TrackedTechCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Tech company not found")
        query = db.query(CompanyDonation).filter_by(entity_type="tech", entity_id=company_id)
        total = query.count()
        donations = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()
        total_amount = db.query(func.sum(CompanyDonation.amount)).filter_by(entity_type="tech", entity_id=company_id).scalar() or 0
        return {
            "total": total, "total_amount": total_amount, "limit": limit, "offset": offset,
            "donations": [{
                "id": d.id, "committee_name": d.committee_name, "committee_id": d.committee_id,
                "candidate_name": d.candidate_name, "candidate_id": d.candidate_id,
                "person_id": d.person_id, "amount": d.amount, "cycle": d.cycle,
                "donation_date": str(d.donation_date) if d.donation_date else None,
                "source_url": d.source_url,
            } for d in donations],
        }
    finally:
        db.close()
