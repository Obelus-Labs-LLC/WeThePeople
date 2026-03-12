"""
Health sector routes — Companies, adverse events, recalls, trials, payments, filings, stock.
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional

from models.database import SessionLocal
from models.health_models import (
    TrackedCompany,
    FDAAdverseEvent,
    FDARecall,
    ClinicalTrial,
    CMSPayment,
    SECHealthFiling,
)
from models.market_models import StockFundamentals

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/dashboard/stats")
def get_health_dashboard_stats():
    """Aggregate stats for the health dashboard."""
    db = SessionLocal()
    try:
        total_companies = db.query(func.count(TrackedCompany.id)).filter(TrackedCompany.is_active == 1).scalar() or 0
        total_events = db.query(func.count(FDAAdverseEvent.id)).scalar() or 0
        total_recalls = db.query(func.count(FDARecall.id)).scalar() or 0
        total_trials = db.query(func.count(ClinicalTrial.id)).scalar() or 0
        total_payments = db.query(func.count(CMSPayment.id)).scalar() or 0
        total_sec_filings = db.query(func.count(SECHealthFiling.id)).scalar() or 0

        by_sector = dict(
            db.query(TrackedCompany.sector_type, func.count(TrackedCompany.id))
            .filter(TrackedCompany.is_active == 1)
            .group_by(TrackedCompany.sector_type).all()
        )

        return {
            "total_companies": total_companies, "total_adverse_events": total_events,
            "total_recalls": total_recalls, "total_trials": total_trials,
            "total_payments": total_payments, "total_sec_filings": total_sec_filings,
            "by_sector": by_sector,
        }
    finally:
        db.close()


@router.get("/companies")
def get_health_companies(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None),
    sector_type: Optional[str] = Query(None),
):
    """List tracked healthcare companies."""
    db = SessionLocal()
    try:
        query = db.query(TrackedCompany).filter(TrackedCompany.is_active == 1)
        if q:
            like = f"%{q.strip().lower()}%"
            query = query.filter(
                func.lower(TrackedCompany.display_name).like(like)
                | func.lower(TrackedCompany.ticker).like(like)
            )
        if sector_type:
            query = query.filter(TrackedCompany.sector_type == sector_type)

        total = query.count()
        rows = query.order_by(TrackedCompany.display_name).offset(offset).limit(limit).all()

        companies = []
        for c in rows:
            event_count = db.query(func.count(FDAAdverseEvent.id)).filter_by(company_id=c.company_id).scalar() or 0
            recall_count = db.query(func.count(FDARecall.id)).filter_by(company_id=c.company_id).scalar() or 0
            trial_count = db.query(func.count(ClinicalTrial.id)).filter_by(company_id=c.company_id).scalar() or 0
            companies.append({
                "company_id": c.company_id, "display_name": c.display_name,
                "ticker": c.ticker, "sector_type": c.sector_type,
                "headquarters": c.headquarters, "logo_url": c.logo_url,
                "adverse_event_count": event_count, "recall_count": recall_count, "trial_count": trial_count,
            })

        return {"total": total, "limit": limit, "offset": offset, "companies": companies}
    finally:
        db.close()


@router.get("/companies/{company_id}")
def get_health_company(company_id: str):
    """Detail for a single tracked company."""
    db = SessionLocal()
    try:
        c = db.query(TrackedCompany).filter_by(company_id=company_id, is_active=1).first()
        if not c:
            raise HTTPException(status_code=404, detail="Company not found")

        event_count = db.query(func.count(FDAAdverseEvent.id)).filter_by(company_id=company_id).scalar() or 0
        recall_count = db.query(func.count(FDARecall.id)).filter_by(company_id=company_id).scalar() or 0
        trial_count = db.query(func.count(ClinicalTrial.id)).filter_by(company_id=company_id).scalar() or 0
        payment_count = db.query(func.count(CMSPayment.id)).filter_by(company_id=company_id).scalar() or 0
        filing_count = db.query(func.count(SECHealthFiling.id)).filter_by(company_id=company_id).scalar() or 0

        latest_recall = (
            db.query(FDARecall).filter_by(company_id=company_id)
            .order_by(desc(FDARecall.recall_initiation_date)).first()
        )
        trials_by_status = dict(
            db.query(ClinicalTrial.overall_status, func.count(ClinicalTrial.id))
            .filter_by(company_id=company_id).group_by(ClinicalTrial.overall_status).all()
        )
        serious_count = db.query(func.count(FDAAdverseEvent.id)).filter_by(company_id=company_id, serious=1).scalar() or 0

        latest_stock = (
            db.query(StockFundamentals).filter_by(entity_type="company", entity_id=company_id)
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
            "company_id": c.company_id, "display_name": c.display_name,
            "ticker": c.ticker, "sector_type": c.sector_type,
            "headquarters": c.headquarters, "logo_url": c.logo_url,
            "fda_manufacturer_name": c.fda_manufacturer_name,
            "ct_sponsor_name": c.ct_sponsor_name, "sec_cik": c.sec_cik,
            "adverse_event_count": event_count, "recall_count": recall_count,
            "trial_count": trial_count, "payment_count": payment_count,
            "filing_count": filing_count, "serious_event_count": serious_count,
            "trials_by_status": trials_by_status, "latest_stock": stock_data,
            "latest_recall": {
                "recall_number": latest_recall.recall_number,
                "classification": latest_recall.classification,
                "recall_initiation_date": str(latest_recall.recall_initiation_date) if latest_recall.recall_initiation_date else None,
                "product_description": latest_recall.product_description,
                "reason_for_recall": latest_recall.reason_for_recall,
                "status": latest_recall.status,
            } if latest_recall else None,
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/adverse-events")
def get_company_adverse_events(
    company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        query = db.query(FDAAdverseEvent).filter_by(company_id=company_id)
        total = query.count()
        rows = query.order_by(desc(FDAAdverseEvent.receive_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "adverse_events": [{
                "id": e.id, "report_id": e.report_id,
                "receive_date": str(e.receive_date) if e.receive_date else None,
                "serious": e.serious, "drug_name": e.drug_name,
                "reaction": e.reaction, "outcome": e.outcome,
            } for e in rows],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/recalls")
def get_company_recalls(
    company_id: str,
    classification: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        query = db.query(FDARecall).filter_by(company_id=company_id)
        if classification:
            query = query.filter(FDARecall.classification == classification)
        total = query.count()
        rows = query.order_by(desc(FDARecall.recall_initiation_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "recalls": [{
                "id": r.id, "recall_number": r.recall_number, "classification": r.classification,
                "recall_initiation_date": str(r.recall_initiation_date) if r.recall_initiation_date else None,
                "product_description": r.product_description,
                "reason_for_recall": r.reason_for_recall, "status": r.status,
            } for r in rows],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/trials")
def get_company_trials(
    company_id: str,
    status: Optional[str] = Query(None),
    phase: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        query = db.query(ClinicalTrial).filter_by(company_id=company_id)
        if status:
            query = query.filter(ClinicalTrial.overall_status == status)
        if phase:
            query = query.filter(ClinicalTrial.phase == phase)
        total = query.count()
        rows = query.order_by(desc(ClinicalTrial.start_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "trials": [{
                "id": t.id, "nct_id": t.nct_id, "title": t.title,
                "overall_status": t.overall_status, "phase": t.phase,
                "start_date": str(t.start_date) if t.start_date else None,
                "conditions": t.conditions, "interventions": t.interventions, "enrollment": t.enrollment,
            } for t in rows],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/payments")
def get_company_payments(
    company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        query = db.query(CMSPayment).filter_by(company_id=company_id)
        total = query.count()
        rows = query.order_by(desc(CMSPayment.payment_date)).offset(offset).limit(limit).all()
        return {
            "total": total, "limit": limit, "offset": offset,
            "payments": [{
                "id": p.id, "record_id": p.record_id,
                "payment_date": str(p.payment_date) if p.payment_date else None,
                "amount": p.amount, "payment_nature": p.payment_nature,
                "physician_name": p.physician_name, "physician_specialty": p.physician_specialty,
                "state": p.state,
            } for p in rows],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/payments/summary")
def get_company_payment_summary(company_id: str):
    db = SessionLocal()
    try:
        total = db.query(func.count(CMSPayment.id)).filter_by(company_id=company_id).scalar() or 0
        total_amount = db.query(func.sum(CMSPayment.amount)).filter_by(company_id=company_id).scalar() or 0.0
        by_nature = dict(
            db.query(CMSPayment.payment_nature, func.count(CMSPayment.id))
            .filter_by(company_id=company_id).group_by(CMSPayment.payment_nature).all()
        )
        by_specialty = dict(
            db.query(CMSPayment.physician_specialty, func.count(CMSPayment.id))
            .filter_by(company_id=company_id).group_by(CMSPayment.physician_specialty)
            .order_by(desc(func.count(CMSPayment.id))).limit(10).all()
        )
        return {
            "total_payments": total, "total_amount": round(float(total_amount), 2),
            "by_nature": by_nature, "by_specialty": by_specialty,
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/filings")
def get_company_filings(
    company_id: str,
    form_type: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        query = db.query(SECHealthFiling).filter_by(company_id=company_id)
        if form_type:
            query = query.filter(SECHealthFiling.form_type == form_type)
        total = query.count()
        rows = query.order_by(desc(SECHealthFiling.filing_date)).offset(offset).limit(limit).all()
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


@router.get("/companies/{company_id}/stock")
def get_company_stock(company_id: str):
    db = SessionLocal()
    try:
        latest = (
            db.query(StockFundamentals).filter_by(entity_type="company", entity_id=company_id)
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
