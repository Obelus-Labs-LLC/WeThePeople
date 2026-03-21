"""
Finance sector routes — Institutions, filings, complaints, FRED, press releases, stock.
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional

from models.database import SessionLocal
from models.finance_models import (
    TrackedInstitution,
    SECFiling,
    SECInsiderTrade,
    FDICFinancial,
    CFPBComplaint,
    FREDObservation,
    FedPressRelease,
    FinanceLobbyingRecord,
    FinanceGovernmentContract,
    FinanceEnforcement,
)
from models.database import CompanyDonation
from models.market_models import StockFundamentals

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/dashboard/stats")
def get_finance_dashboard_stats():
    """Aggregate stats for the finance dashboard."""
    db = SessionLocal()
    try:
        total_institutions = db.query(func.count(TrackedInstitution.id)).filter(TrackedInstitution.is_active == 1).scalar() or 0
        total_filings = db.query(func.count(SECFiling.id)).scalar() or 0
        total_financials = db.query(func.count(FDICFinancial.id)).scalar() or 0
        total_complaints = db.query(func.count(CFPBComplaint.id)).scalar() or 0
        total_fred = db.query(func.count(FREDObservation.id)).scalar() or 0
        total_press = db.query(func.count(FedPressRelease.id)).scalar() or 0

        # Political data counts
        total_lobbying = db.query(func.count(FinanceLobbyingRecord.id)).scalar() or 0
        total_lobbying_spend = db.query(func.sum(FinanceLobbyingRecord.income)).scalar() or 0
        total_contracts = db.query(func.count(FinanceGovernmentContract.id)).scalar() or 0
        total_contract_value = db.query(func.sum(FinanceGovernmentContract.award_amount)).scalar() or 0
        total_enforcement = db.query(func.count(FinanceEnforcement.id)).scalar() or 0
        total_penalties = db.query(func.sum(FinanceEnforcement.penalty_amount)).scalar() or 0
        total_insider_trades = db.query(func.count(SECInsiderTrade.id)).scalar() or 0

        by_sector = dict(
            db.query(TrackedInstitution.sector_type, func.count(TrackedInstitution.id))
            .filter(TrackedInstitution.is_active == 1)
            .group_by(TrackedInstitution.sector_type).all()
        )

        return {
            "total_institutions": total_institutions, "total_filings": total_filings,
            "total_financials": total_financials, "total_complaints": total_complaints,
            "total_fred_observations": total_fred, "total_press_releases": total_press,
            "total_lobbying": total_lobbying, "total_lobbying_spend": total_lobbying_spend,
            "total_contracts": total_contracts, "total_contract_value": total_contract_value,
            "total_enforcement": total_enforcement, "total_penalties": total_penalties,
            "total_insider_trades": total_insider_trades,
            "by_sector": by_sector,
        }
    finally:
        db.close()


@router.get("/institutions")
def get_finance_institutions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Search by name or ticker"),
    sector_type: Optional[str] = Query(None),
):
    """List tracked financial institutions."""
    db = SessionLocal()
    try:
        query = db.query(TrackedInstitution).filter(TrackedInstitution.is_active == 1)
        if q:
            like = f"%{q.strip().lower()}%"
            query = query.filter(
                func.lower(TrackedInstitution.display_name).like(like)
                | func.lower(TrackedInstitution.ticker).like(like)
                | func.lower(TrackedInstitution.institution_id).like(like)
            )
        if sector_type:
            query = query.filter(TrackedInstitution.sector_type == sector_type)

        total = query.count()
        rows = query.order_by(TrackedInstitution.display_name).offset(offset).limit(limit).all()

        inst_ids = [r.institution_id for r in rows]
        filing_counts = dict(db.query(SECFiling.institution_id, func.count(SECFiling.id)).filter(SECFiling.institution_id.in_(inst_ids)).group_by(SECFiling.institution_id).all()) if inst_ids else {}
        complaint_counts = dict(db.query(CFPBComplaint.institution_id, func.count(CFPBComplaint.id)).filter(CFPBComplaint.institution_id.in_(inst_ids)).group_by(CFPBComplaint.institution_id).all()) if inst_ids else {}

        institutions = []
        for r in rows:
            institutions.append({
                "institution_id": r.institution_id, "display_name": r.display_name,
                "ticker": r.ticker, "sector_type": r.sector_type,
                "headquarters": r.headquarters, "logo_url": r.logo_url,
                "filing_count": filing_counts.get(r.institution_id, 0),
                "complaint_count": complaint_counts.get(r.institution_id, 0),
            })

        return {"total": total, "limit": limit, "offset": offset, "institutions": institutions}
    finally:
        db.close()


@router.get("/institutions/{institution_id}")
def get_institution_detail(institution_id: str):
    """Detail for a single tracked institution."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id, is_active=1).first()
        if not inst:
            raise HTTPException(status_code=404, detail="Institution not found")

        filing_count = db.query(func.count(SECFiling.id)).filter(SECFiling.institution_id == institution_id).scalar() or 0
        financial_count = db.query(func.count(FDICFinancial.id)).filter(FDICFinancial.institution_id == institution_id).scalar() or 0
        complaint_count = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.institution_id == institution_id).scalar() or 0
        fred_count = db.query(func.count(FREDObservation.id)).filter(FREDObservation.institution_id == institution_id).scalar() or 0
        press_count = db.query(func.count(FedPressRelease.id)).filter(FedPressRelease.institution_id == institution_id).scalar() or 0

        latest_stock = (
            db.query(StockFundamentals)
            .filter_by(entity_type="institution", entity_id=institution_id)
            .order_by(desc(StockFundamentals.snapshot_date)).first()
        )
        stock_data = None
        if latest_stock:
            stock_data = {
                "snapshot_date": str(latest_stock.snapshot_date) if latest_stock.snapshot_date else None,
                "market_cap": latest_stock.market_cap, "pe_ratio": latest_stock.pe_ratio,
                "eps": latest_stock.eps, "dividend_yield": latest_stock.dividend_yield,
                "week_52_high": latest_stock.week_52_high, "week_52_low": latest_stock.week_52_low,
                "profit_margin": latest_stock.profit_margin,
            }

        return {
            "institution_id": inst.institution_id, "display_name": inst.display_name,
            "ticker": inst.ticker, "sector_type": inst.sector_type,
            "headquarters": inst.headquarters, "logo_url": inst.logo_url,
            "sec_cik": inst.sec_cik, "fdic_cert": inst.fdic_cert,
            "filing_count": filing_count, "financial_count": financial_count,
            "complaint_count": complaint_count, "fred_count": fred_count,
            "press_count": press_count, "latest_stock": stock_data,
            "ai_profile_summary": inst.ai_profile_summary,
            "sanctions_status": inst.sanctions_status,
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/filings")
def get_institution_filings(
    institution_id: str,
    form_type: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """SEC EDGAR filings for an institution."""
    db = SessionLocal()
    try:
        query = db.query(SECFiling).filter_by(institution_id=institution_id)
        if form_type:
            query = query.filter(SECFiling.form_type == form_type)
        total = query.count()
        rows = query.order_by(desc(SECFiling.filing_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "filings": [{
                "id": f.id, "accession_number": f.accession_number, "form_type": f.form_type,
                "filing_date": str(f.filing_date) if f.filing_date else None,
                "primary_doc_url": f.primary_doc_url, "filing_url": f.filing_url,
                "description": f.description,
            } for f in rows],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/financials")
def get_institution_financials(
    institution_id: str,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """FDIC quarterly financials for an institution."""
    db = SessionLocal()
    try:
        query = db.query(FDICFinancial).filter_by(institution_id=institution_id)
        total = query.count()
        rows = query.order_by(desc(FDICFinancial.report_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "financials": [{
                "id": f.id, "report_date": str(f.report_date) if f.report_date else None,
                "total_assets": f.total_assets, "total_deposits": f.total_deposits,
                "net_income": f.net_income, "net_loans": f.net_loans,
                "roa": f.roa, "roe": f.roe,
                "tier1_capital_ratio": f.tier1_capital_ratio,
                "efficiency_ratio": f.efficiency_ratio,
                "noncurrent_loan_ratio": f.noncurrent_loan_ratio,
                "net_charge_off_ratio": f.net_charge_off_ratio,
            } for f in rows],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/complaints")
def get_institution_complaints(
    institution_id: str,
    product: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """CFPB complaints for an institution."""
    db = SessionLocal()
    try:
        query = db.query(CFPBComplaint).filter_by(institution_id=institution_id)
        if product:
            query = query.filter(CFPBComplaint.product == product)
        total = query.count()
        rows = query.order_by(desc(CFPBComplaint.date_received)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "complaints": [{
                "id": c.id, "complaint_id": c.complaint_id,
                "date_received": str(c.date_received) if c.date_received else None,
                "product": c.product, "sub_product": c.sub_product,
                "issue": c.issue, "company_response": c.company_response,
                "state": c.state,
            } for c in rows],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/complaints/summary")
def get_institution_complaint_summary(institution_id: str):
    """Aggregated complaint stats for an institution."""
    db = SessionLocal()
    try:
        total = db.query(func.count(CFPBComplaint.id)).filter_by(institution_id=institution_id).scalar() or 0
        by_product = dict(
            db.query(CFPBComplaint.product, func.count(CFPBComplaint.id))
            .filter_by(institution_id=institution_id)
            .group_by(CFPBComplaint.product).all()
        )
        by_response = dict(
            db.query(CFPBComplaint.company_response, func.count(CFPBComplaint.id))
            .filter_by(institution_id=institution_id)
            .group_by(CFPBComplaint.company_response).all()
        )
        return {"total_complaints": total, "by_product": by_product, "by_response": by_response}
    finally:
        db.close()


@router.get("/institutions/{institution_id}/fred")
def get_institution_fred(
    institution_id: str,
    series_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """FRED economic observations for an institution."""
    db = SessionLocal()
    try:
        query = db.query(FREDObservation).filter_by(institution_id=institution_id)
        if series_id:
            query = query.filter(FREDObservation.series_id == series_id)
        total = query.count()
        rows = query.order_by(desc(FREDObservation.observation_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "observations": [{
                "id": o.id, "series_id": o.series_id,
                "observation_date": str(o.observation_date) if o.observation_date else None,
                "value": o.value,
            } for o in rows],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/press-releases")
def get_institution_press_releases(
    institution_id: str,
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Federal Reserve press releases for an institution."""
    db = SessionLocal()
    try:
        query = db.query(FedPressRelease).filter_by(institution_id=institution_id)
        total = query.count()
        rows = query.order_by(desc(FedPressRelease.published_at)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "press_releases": [{
                "id": p.id, "title": p.title,
                "release_date": str(p.published_at) if p.published_at else None,
                "url": p.link, "category": p.category,
                "summary": p.summary,
            } for p in rows],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/stock")
def get_institution_stock(institution_id: str):
    """Latest stock fundamentals for an institution."""
    db = SessionLocal()
    try:
        latest = (
            db.query(StockFundamentals)
            .filter_by(entity_type="institution", entity_id=institution_id)
            .order_by(desc(StockFundamentals.snapshot_date)).first()
        )
        if not latest:
            return {"stock": None}
        return {
            "stock": {
                "ticker": latest.ticker,
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


@router.get("/institutions/{institution_id}/insider-trades")
def get_institution_insider_trades(
    institution_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    transaction_type: Optional[str] = Query(None, description="P=Purchase, S=Sale, A=Award"),
):
    """SEC Form 4 insider trading disclosures for an institution."""
    db = SessionLocal()
    try:
        q = db.query(SECInsiderTrade).filter_by(institution_id=institution_id)
        if transaction_type:
            q = q.filter(SECInsiderTrade.transaction_type == transaction_type)
        total = q.count()
        trades = q.order_by(desc(SECInsiderTrade.transaction_date)).offset(offset).limit(limit).all()
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "trades": [
                {
                    "id": t.id,
                    "filer_name": t.filer_name,
                    "filer_title": t.filer_title,
                    "transaction_date": str(t.transaction_date) if t.transaction_date else None,
                    "transaction_type": t.transaction_type,
                    "shares": t.shares,
                    "price_per_share": t.price_per_share,
                    "total_value": t.total_value,
                    "filing_url": t.filing_url,
                    "accession_number": t.accession_number,
                }
                for t in trades
            ],
        }
    finally:
        db.close()


@router.get("/complaints")
def get_all_complaints(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    product: Optional[str] = Query(None),
):
    """All CFPB complaints across all institutions, newest first."""
    db = SessionLocal()
    try:
        q = db.query(CFPBComplaint, TrackedInstitution.display_name).join(
            TrackedInstitution, CFPBComplaint.institution_id == TrackedInstitution.institution_id
        )
        if product:
            q = q.filter(CFPBComplaint.product == product)
        total = q.count()
        rows = q.order_by(desc(CFPBComplaint.date_received)).offset(offset).limit(limit).all()
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "complaints": [
                {
                    "id": c.id,
                    "complaint_id": c.complaint_id,
                    "institution_id": c.institution_id,
                    "company_name": name,
                    "date_received": str(c.date_received) if c.date_received else None,
                    "product": c.product,
                    "sub_product": c.sub_product,
                    "issue": c.issue,
                    "sub_issue": c.sub_issue,
                    "company_response": c.company_response,
                    "timely_response": c.timely_response,
                    "consumer_disputed": c.consumer_disputed,
                    "complaint_narrative": c.complaint_narrative,
                    "state": c.state,
                }
                for c, name in rows
            ],
        }
    finally:
        db.close()


@router.get("/complaints/summary")
def get_global_complaint_summary():
    """Aggregate complaint stats across all institutions."""
    db = SessionLocal()
    try:
        total = db.query(func.count(CFPBComplaint.id)).scalar() or 0
        by_product = dict(
            db.query(CFPBComplaint.product, func.count(CFPBComplaint.id))
            .filter(CFPBComplaint.product.isnot(None))
            .group_by(CFPBComplaint.product)
            .order_by(desc(func.count(CFPBComplaint.id)))
            .all()
        )
        by_response = dict(
            db.query(CFPBComplaint.company_response, func.count(CFPBComplaint.id))
            .filter(CFPBComplaint.company_response.isnot(None))
            .group_by(CFPBComplaint.company_response)
            .order_by(desc(func.count(CFPBComplaint.id)))
            .all()
        )
        timely_yes = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.timely_response == "Yes").scalar() or 0
        timely_total = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.timely_response.isnot(None)).scalar() or 0
        timely_pct = round(timely_yes / timely_total * 100, 1) if timely_total > 0 else None
        return {
            "total_complaints": total,
            "by_product": by_product,
            "by_response": by_response,
            "timely_response_pct": timely_pct,
        }
    finally:
        db.close()


@router.get("/macro-indicators")
def get_macro_indicators():
    """Latest value for each FRED series (macro indicators)."""
    db = SessionLocal()
    try:
        from sqlalchemy import distinct
        from sqlalchemy.orm import aliased

        # Subquery: max observation_date per series_id (where value is not null)
        latest_sub = (
            db.query(
                FREDObservation.series_id,
                func.max(FREDObservation.observation_date).label("max_date"),
            )
            .filter(FREDObservation.value.isnot(None))
            .group_by(FREDObservation.series_id)
            .subquery()
        )

        rows = (
            db.query(FREDObservation)
            .join(
                latest_sub,
                (FREDObservation.series_id == latest_sub.c.series_id)
                & (FREDObservation.observation_date == latest_sub.c.max_date),
            )
            .filter(FREDObservation.value.isnot(None))
            .all()
        )

        indicators = []
        seen = set()
        for latest in rows:
            if latest.series_id in seen:
                continue
            seen.add(latest.series_id)
            indicators.append({
                "series_id": latest.series_id,
                "series_title": latest.series_title,
                "value": latest.value,
                "units": latest.units,
                "observation_date": str(latest.observation_date) if latest.observation_date else None,
            })
        return {"indicators": indicators}
    finally:
        db.close()


@router.get("/sector-news")
def get_sector_news(limit: int = Query(20, ge=1, le=50)):
    """Recent Fed press releases across all institutions (sector news)."""
    db = SessionLocal()
    try:
        rows = (
            db.query(FedPressRelease)
            .order_by(desc(FedPressRelease.published_at))
            .limit(limit)
            .all()
        )
        return {
            "news": [
                {
                    "id": p.id,
                    "title": p.title,
                    "release_date": str(p.published_at) if p.published_at else None,
                    "url": p.link,
                    "category": p.category,
                    "summary": p.summary,
                }
                for p in rows
            ]
        }
    finally:
        db.close()


@router.get("/insider-trades")
def get_all_insider_trades(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    transaction_type: Optional[str] = Query(None, description="P=Purchase, S=Sale, A=Award"),
):
    """All insider trades across all institutions, newest first."""
    db = SessionLocal()
    try:
        q = db.query(SECInsiderTrade, TrackedInstitution.display_name, TrackedInstitution.ticker).join(
            TrackedInstitution, SECInsiderTrade.institution_id == TrackedInstitution.institution_id
        )
        if transaction_type:
            q = q.filter(SECInsiderTrade.transaction_type == transaction_type)
        total = q.count()
        trades = q.order_by(desc(SECInsiderTrade.transaction_date)).offset(offset).limit(limit).all()
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "trades": [
                {
                    "id": t.id,
                    "institution_id": t.institution_id,
                    "company_name": name,
                    "ticker": ticker,
                    "filer_name": t.filer_name,
                    "filer_title": t.filer_title,
                    "transaction_date": str(t.transaction_date) if t.transaction_date else None,
                    "transaction_type": t.transaction_type,
                    "shares": t.shares,
                    "price_per_share": t.price_per_share,
                    "total_value": t.total_value,
                    "filing_url": t.filing_url,
                }
                for t, name, ticker in trades
            ],
        }
    finally:
        db.close()


@router.get("/compare")
def get_finance_comparison(ids: str = Query(..., description="Comma-separated institution IDs")):
    """Cross-institution comparison for key financial metrics."""
    db = SessionLocal()
    try:
        institution_ids = [iid.strip() for iid in ids.split(",") if iid.strip()]
        if not institution_ids or len(institution_ids) > 10:
            raise HTTPException(status_code=400, detail="Provide 2-10 institution IDs")

        results = []
        for iid in institution_ids:
            inst = db.query(TrackedInstitution).filter(
                TrackedInstitution.institution_id == iid
            ).first()
            if not inst:
                continue

            filing_count = db.query(func.count(SECFiling.id)).filter(
                SECFiling.institution_id == iid
            ).scalar() or 0

            complaint_count = db.query(func.count(CFPBComplaint.id)).filter(
                CFPBComplaint.institution_id == iid
            ).scalar() or 0

            latest_fin = (
                db.query(FDICFinancial)
                .filter(FDICFinancial.institution_id == iid)
                .order_by(desc(FDICFinancial.report_date)).first()
            )

            latest_stock = (
                db.query(StockFundamentals)
                .filter_by(entity_type="institution", entity_id=iid)
                .order_by(desc(StockFundamentals.snapshot_date)).first()
            )

            results.append({
                "institution_id": iid,
                "display_name": inst.display_name,
                "ticker": inst.ticker,
                "sector_type": inst.sector_type,
                "headquarters": inst.headquarters,
                "industry": latest_stock.industry if latest_stock else None,
                "filing_count": filing_count,
                "complaint_count": complaint_count,
                # FDIC financials
                "total_assets": latest_fin.total_assets if latest_fin else None,
                "total_deposits": latest_fin.total_deposits if latest_fin else None,
                "net_income": latest_fin.net_income if latest_fin else None,
                "net_loans": latest_fin.net_loans if latest_fin else None,
                "roa": latest_fin.roa if latest_fin else None,
                "roe": latest_fin.roe if latest_fin else None,
                "tier1_capital_ratio": latest_fin.tier1_capital_ratio if latest_fin else None,
                "efficiency_ratio": latest_fin.efficiency_ratio if latest_fin else None,
                "noncurrent_loan_ratio": latest_fin.noncurrent_loan_ratio if latest_fin else None,
                "net_charge_off_ratio": latest_fin.net_charge_off_ratio if latest_fin else None,
                # Stock fundamentals
                "market_cap": latest_stock.market_cap if latest_stock else None,
                "pe_ratio": latest_stock.pe_ratio if latest_stock else None,
                "forward_pe": latest_stock.forward_pe if latest_stock else None,
                "peg_ratio": latest_stock.peg_ratio if latest_stock else None,
                "price_to_book": latest_stock.price_to_book if latest_stock else None,
                "eps": latest_stock.eps if latest_stock else None,
                "revenue_ttm": latest_stock.revenue_ttm if latest_stock else None,
                "profit_margin": latest_stock.profit_margin if latest_stock else None,
                "operating_margin": latest_stock.operating_margin if latest_stock else None,
                "return_on_equity": latest_stock.return_on_equity if latest_stock else None,
                "dividend_yield": latest_stock.dividend_yield if latest_stock else None,
                "dividend_per_share": latest_stock.dividend_per_share if latest_stock else None,
                "week_52_high": latest_stock.week_52_high if latest_stock else None,
                "week_52_low": latest_stock.week_52_low if latest_stock else None,
            })

        return {"institutions": results}
    finally:
        db.close()


# ── Political data endpoints ──────────────────────────────────────────────


@router.get("/institutions/{institution_id}/lobbying")
def get_institution_lobbying(
    institution_id: str, filing_year: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    """Lobbying disclosure filings for an institution."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
        if not inst:
            raise HTTPException(status_code=404, detail="Institution not found")
        query = db.query(FinanceLobbyingRecord).filter_by(institution_id=institution_id)
        if filing_year:
            query = query.filter(FinanceLobbyingRecord.filing_year == filing_year)
        total = query.count()
        records = query.order_by(desc(FinanceLobbyingRecord.filing_year), FinanceLobbyingRecord.filing_period).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "filings": [{
                "id": r.id, "filing_uuid": r.filing_uuid, "filing_year": r.filing_year,
                "filing_period": r.filing_period, "income": r.income, "expenses": r.expenses,
                "registrant_name": r.registrant_name, "client_name": r.client_name,
                "lobbying_issues": r.lobbying_issues, "government_entities": r.government_entities,
                "ai_summary": r.ai_summary,
            } for r in records],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/lobbying/summary")
def get_institution_lobbying_summary(institution_id: str):
    """Lobbying spend summary by year and top firms."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
        if not inst:
            raise HTTPException(status_code=404, detail="Institution not found")
        total_filings = db.query(FinanceLobbyingRecord).filter_by(institution_id=institution_id).count()
        total_income = db.query(func.sum(FinanceLobbyingRecord.income)).filter_by(institution_id=institution_id).scalar() or 0
        by_year = {}
        rows = db.query(
            FinanceLobbyingRecord.filing_year, func.sum(FinanceLobbyingRecord.income), func.count(),
        ).filter_by(institution_id=institution_id).group_by(FinanceLobbyingRecord.filing_year).order_by(FinanceLobbyingRecord.filing_year).all()
        for year, income, count in rows:
            by_year[str(year)] = {"income": income or 0, "filings": count}
        top_firms = {}
        rows = db.query(
            FinanceLobbyingRecord.registrant_name, func.sum(FinanceLobbyingRecord.income), func.count(),
        ).filter_by(institution_id=institution_id).group_by(FinanceLobbyingRecord.registrant_name).order_by(func.sum(FinanceLobbyingRecord.income).desc()).limit(10).all()
        for name, income, count in rows:
            if name:
                top_firms[name] = {"income": income or 0, "filings": count}
        return {"total_filings": total_filings, "total_income": total_income, "by_year": by_year, "top_firms": top_firms}
    finally:
        db.close()


@router.get("/institutions/{institution_id}/contracts")
def get_institution_contracts(
    institution_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    """Government contracts awarded to an institution."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
        if not inst:
            raise HTTPException(status_code=404, detail="Institution not found")
        query = db.query(FinanceGovernmentContract).filter_by(institution_id=institution_id)
        total = query.count()
        contracts = query.order_by(desc(FinanceGovernmentContract.award_amount)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "contracts": [{
                "id": ct.id, "award_id": ct.award_id, "award_amount": ct.award_amount,
                "awarding_agency": ct.awarding_agency, "description": ct.description,
                "start_date": str(ct.start_date) if ct.start_date else None,
                "end_date": str(ct.end_date) if ct.end_date else None, "contract_type": ct.contract_type,
                "ai_summary": ct.ai_summary,
            } for ct in contracts],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/contracts/summary")
def get_institution_contract_summary(institution_id: str):
    """Contract summary with totals and breakdown by agency."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
        if not inst:
            raise HTTPException(status_code=404, detail="Institution not found")
        total_contracts = db.query(FinanceGovernmentContract).filter_by(institution_id=institution_id).count()
        total_amount = db.query(func.sum(FinanceGovernmentContract.award_amount)).filter_by(institution_id=institution_id).scalar() or 0
        by_agency = {}
        rows = db.query(FinanceGovernmentContract.awarding_agency, func.count()).filter_by(
            institution_id=institution_id
        ).group_by(FinanceGovernmentContract.awarding_agency).order_by(func.count().desc()).limit(10).all()
        for agency, count in rows:
            if agency:
                by_agency[agency] = count
        return {"total_contracts": total_contracts, "total_amount": total_amount, "by_agency": by_agency}
    finally:
        db.close()


@router.get("/institutions/{institution_id}/enforcement")
def get_institution_enforcement(
    institution_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    """Enforcement actions against an institution (CFPB, SEC, OCC, DOJ)."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
        if not inst:
            raise HTTPException(status_code=404, detail="Institution not found")
        query = db.query(FinanceEnforcement).filter_by(institution_id=institution_id)
        total = query.count()
        actions = query.order_by(desc(FinanceEnforcement.case_date)).offset(offset).limit(limit).all()
        total_penalties = db.query(func.sum(FinanceEnforcement.penalty_amount)).filter_by(institution_id=institution_id).scalar() or 0
        return {
            "total": total, "total_penalties": total_penalties, "limit": limit, "offset": offset,
            "actions": [{
                "id": a.id, "case_title": a.case_title,
                "case_date": str(a.case_date) if a.case_date else None,
                "case_url": a.case_url, "enforcement_type": a.enforcement_type,
                "penalty_amount": a.penalty_amount, "description": a.description, "source": a.source,
                "ai_summary": a.ai_summary,
            } for a in actions],
        }
    finally:
        db.close()


@router.get("/institutions/{institution_id}/donations")
def get_institution_donations(
    institution_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    """PAC/corporate donations from an institution to politicians."""
    db = SessionLocal()
    try:
        inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
        if not inst:
            raise HTTPException(status_code=404, detail="Institution not found")
        query = db.query(CompanyDonation).filter_by(entity_type="finance", entity_id=institution_id)
        total = query.count()
        donations = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()
        total_amount = db.query(func.sum(CompanyDonation.amount)).filter_by(entity_type="finance", entity_id=institution_id).scalar() or 0
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
