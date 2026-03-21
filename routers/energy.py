"""
Energy sector routes — Companies, emissions, contracts, lobbying, enforcement, SEC filings, stock.
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import func, desc
from typing import Optional, Dict, Any

from models.database import SessionLocal
from models.energy_models import (
    TrackedEnergyCompany,
    SECEnergyFiling,
    EnergyEmission,
    EnergyGovernmentContract,
    EnergyLobbyingRecord,
    EnergyEnforcement,
)
from models.market_models import StockFundamentals
from models.database import CompanyDonation

router = APIRouter(prefix="/energy", tags=["energy"])


@router.get("/dashboard/stats")
def get_energy_dashboard_stats():
    db = SessionLocal()
    try:
        total_companies = db.query(TrackedEnergyCompany).filter(TrackedEnergyCompany.is_active == 1).count()
        total_filings = db.query(SECEnergyFiling).count()
        total_emissions = db.query(EnergyEmission).count()
        total_contracts = db.query(EnergyGovernmentContract).count()
        total_enforcement = db.query(EnergyEnforcement).count()

        # Political data totals
        total_lobbying = db.query(func.count(EnergyLobbyingRecord.id)).scalar() or 0
        total_lobbying_spend = db.query(func.sum(EnergyLobbyingRecord.income)).scalar() or 0
        total_contract_value = db.query(func.sum(EnergyGovernmentContract.award_amount)).scalar() or 0
        total_penalties = db.query(func.sum(EnergyEnforcement.penalty_amount)).scalar() or 0

        by_sector = {}
        rows = db.query(TrackedEnergyCompany.sector_type, func.count()).filter(
            TrackedEnergyCompany.is_active == 1
        ).group_by(TrackedEnergyCompany.sector_type).all()
        for sector_type, count in rows:
            by_sector[sector_type] = count

        return {
            "total_companies": total_companies, "total_filings": total_filings,
            "total_emissions_records": total_emissions, "total_contracts": total_contracts,
            "total_enforcement": total_enforcement,
            "total_lobbying": total_lobbying, "total_lobbying_spend": total_lobbying_spend,
            "total_contract_value": total_contract_value, "total_penalties": total_penalties,
            "by_sector": by_sector,
        }
    finally:
        db.close()


@router.get("/dashboard/recent-activity")
def get_energy_recent_activity(limit: int = Query(10, ge=1, le=30)):
    """Return recent enforcement actions, contracts, and lobbying filings across all energy companies."""
    db = SessionLocal()
    try:
        items = []

        # Recent enforcement actions
        enforcements = db.query(EnergyEnforcement).order_by(desc(EnergyEnforcement.case_date)).limit(limit).all()
        # Recent contracts (by start_date)
        contracts = db.query(EnergyGovernmentContract).order_by(desc(EnergyGovernmentContract.start_date)).limit(limit).all()
        # Recent lobbying filings (by filing_year + filing_period)
        lobbying = db.query(EnergyLobbyingRecord).order_by(desc(EnergyLobbyingRecord.filing_year), desc(EnergyLobbyingRecord.filing_period)).limit(limit).all()

        # Bulk-fetch company names
        all_cids = set()
        for e in enforcements:
            all_cids.add(e.company_id)
        for ct in contracts:
            all_cids.add(ct.company_id)
        for r in lobbying:
            all_cids.add(r.company_id)
        company_names = {}
        if all_cids:
            for co in db.query(TrackedEnergyCompany).filter(TrackedEnergyCompany.company_id.in_(list(all_cids))).all():
                company_names[co.company_id] = co.display_name

        for e in enforcements:
            items.append({
                "type": "enforcement",
                "title": e.case_title or "Enforcement Action",
                "description": e.description,
                "date": str(e.case_date) if e.case_date else None,
                "company_id": e.company_id,
                "company_name": company_names.get(e.company_id, e.company_id),
                "url": e.case_url,
                "meta": {"penalty_amount": e.penalty_amount, "enforcement_type": e.enforcement_type},
            })

        for ct in contracts:
            items.append({
                "type": "contract",
                "title": ct.description or f"Contract Award — {ct.awarding_agency or 'Unknown Agency'}",
                "description": ct.description,
                "date": str(ct.start_date) if ct.start_date else None,
                "company_id": ct.company_id,
                "company_name": company_names.get(ct.company_id, ct.company_id),
                "url": None,
                "meta": {"award_amount": ct.award_amount, "awarding_agency": ct.awarding_agency},
            })

        for r in lobbying:
            period_str = f"{r.filing_year}" + (f" {r.filing_period}" if r.filing_period else "")
            items.append({
                "type": "lobbying",
                "title": f"Lobbying Filing — {r.client_name or r.registrant_name or 'Unknown'}",
                "description": r.lobbying_issues,
                "date": f"{r.filing_year}-01-01" if r.filing_year else None,
                "company_id": r.company_id,
                "company_name": company_names.get(r.company_id, r.company_id),
                "url": f"https://lda.senate.gov/filings/public/filing/{r.filing_uuid}/" if r.filing_uuid else None,
                "meta": {"income": r.income, "filing_period": period_str, "registrant_name": r.registrant_name},
            })

        # Sort all items by date descending, nulls last
        items.sort(key=lambda x: x["date"] or "0000-00-00", reverse=True)
        return {"items": items[:limit]}
    finally:
        db.close()


@router.get("/companies")
def get_energy_companies(
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None), sector_type: Optional[str] = Query(None),
):
    db = SessionLocal()
    try:
        query = db.query(TrackedEnergyCompany).filter(TrackedEnergyCompany.is_active == 1)
        if q:
            pattern = f"%{q}%"
            query = query.filter(
                (TrackedEnergyCompany.display_name.ilike(pattern))
                | (TrackedEnergyCompany.company_id.ilike(pattern))
                | (TrackedEnergyCompany.ticker.ilike(pattern))
            )
        if sector_type:
            query = query.filter(TrackedEnergyCompany.sector_type == sector_type)

        total = query.count()
        companies = query.order_by(TrackedEnergyCompany.display_name).offset(offset).limit(limit).all()

        company_ids = [co.company_id for co in companies]
        emission_counts = dict(db.query(EnergyEmission.company_id, func.count(EnergyEmission.id)).filter(EnergyEmission.company_id.in_(company_ids)).group_by(EnergyEmission.company_id).all()) if company_ids else {}
        contract_counts = dict(db.query(EnergyGovernmentContract.company_id, func.count(EnergyGovernmentContract.id)).filter(EnergyGovernmentContract.company_id.in_(company_ids)).group_by(EnergyGovernmentContract.company_id).all()) if company_ids else {}
        filing_counts = dict(db.query(SECEnergyFiling.company_id, func.count(SECEnergyFiling.id)).filter(SECEnergyFiling.company_id.in_(company_ids)).group_by(SECEnergyFiling.company_id).all()) if company_ids else {}
        enforcement_counts = dict(db.query(EnergyEnforcement.company_id, func.count(EnergyEnforcement.id)).filter(EnergyEnforcement.company_id.in_(company_ids)).group_by(EnergyEnforcement.company_id).all()) if company_ids else {}

        results = []
        for co in companies:
            results.append({
                "company_id": co.company_id, "display_name": co.display_name,
                "ticker": co.ticker, "sector_type": co.sector_type,
                "headquarters": co.headquarters, "logo_url": co.logo_url,
                "emission_count": emission_counts.get(co.company_id, 0),
                "contract_count": contract_counts.get(co.company_id, 0),
                "filing_count": filing_counts.get(co.company_id, 0),
                "enforcement_count": enforcement_counts.get(co.company_id, 0),
            })

        return {"total": total, "limit": limit, "offset": offset, "companies": results}
    finally:
        db.close()


@router.get("/companies/{company_id}")
def get_energy_company(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")

        emission_count = db.query(EnergyEmission).filter_by(company_id=company_id).count()
        contract_count = db.query(EnergyGovernmentContract).filter_by(company_id=company_id).count()
        filing_count = db.query(SECEnergyFiling).filter_by(company_id=company_id).count()
        enforcement_count = db.query(EnergyEnforcement).filter_by(company_id=company_id).count()
        lobbying_count = db.query(EnergyLobbyingRecord).filter_by(company_id=company_id).count()
        total_contract_value = db.query(func.sum(EnergyGovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0
        total_penalties = db.query(func.sum(EnergyEnforcement.penalty_amount)).filter_by(company_id=company_id).scalar() or 0

        latest_stock = None
        latest = db.query(StockFundamentals).filter_by(
            entity_type="energy_company", entity_id=company_id
        ).order_by(desc(StockFundamentals.snapshot_date)).first()
        if latest:
            latest_stock = {
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

        return {
            "company_id": co.company_id, "display_name": co.display_name,
            "ticker": co.ticker, "sector_type": co.sector_type,
            "headquarters": co.headquarters, "logo_url": co.logo_url, "sec_cik": co.sec_cik,
            "emission_count": emission_count, "contract_count": contract_count,
            "filing_count": filing_count, "enforcement_count": enforcement_count,
            "lobbying_count": lobbying_count,
            "total_contract_value": total_contract_value, "total_penalties": total_penalties,
            "latest_stock": latest_stock,
            "ai_profile_summary": co.ai_profile_summary,
            "sanctions_status": co.sanctions_status,
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/filings")
def get_energy_company_filings(
    company_id: str, form_type: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")
        query = db.query(SECEnergyFiling).filter_by(company_id=company_id)
        if form_type:
            query = query.filter(SECEnergyFiling.form_type == form_type)
        total = query.count()
        filings = query.order_by(desc(SECEnergyFiling.filing_date)).offset(offset).limit(limit).all()
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


@router.get("/companies/{company_id}/emissions")
def get_energy_company_emissions(
    company_id: str, reporting_year: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")
        query = db.query(EnergyEmission).filter_by(company_id=company_id)
        if reporting_year:
            query = query.filter(EnergyEmission.reporting_year == reporting_year)
        total = query.count()
        records = query.order_by(desc(EnergyEmission.reporting_year)).offset(offset).limit(limit).all()

        total_co2e = db.query(func.sum(EnergyEmission.total_emissions)).filter_by(company_id=company_id).scalar() or 0

        return {
            "total": total, "total_co2e": total_co2e, "limit": limit, "offset": offset,
            "emissions": [{
                "id": e.id, "facility_name": e.facility_name, "facility_state": e.facility_state,
                "reporting_year": e.reporting_year, "total_emissions": e.total_emissions,
                "emission_type": e.emission_type, "industry_type": e.industry_type,
                "source_url": e.source_url,
            } for e in records],
        }
    finally:
        db.close()


@router.get("/companies/{company_id}/emissions/summary")
def get_energy_company_emissions_summary(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")

        total_records = db.query(EnergyEmission).filter_by(company_id=company_id).count()
        total_co2e = db.query(func.sum(EnergyEmission.total_emissions)).filter_by(company_id=company_id).scalar() or 0

        by_year = {}
        rows = db.query(
            EnergyEmission.reporting_year, func.sum(EnergyEmission.total_emissions), func.count(),
        ).filter_by(company_id=company_id).group_by(EnergyEmission.reporting_year).order_by(EnergyEmission.reporting_year).all()
        for year, emissions, count in rows:
            by_year[str(year)] = {"total_emissions": emissions or 0, "facilities": count}

        by_state = {}
        rows = db.query(
            EnergyEmission.facility_state, func.sum(EnergyEmission.total_emissions), func.count(),
        ).filter_by(company_id=company_id).group_by(EnergyEmission.facility_state).order_by(func.sum(EnergyEmission.total_emissions).desc()).limit(10).all()
        for state, emissions, count in rows:
            if state:
                by_state[state] = {"total_emissions": emissions or 0, "facilities": count}

        return {"total_records": total_records, "total_co2e": total_co2e, "by_year": by_year, "by_state": by_state}
    finally:
        db.close()


@router.get("/companies/{company_id}/contracts")
def get_energy_company_contracts(
    company_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")
        query = db.query(EnergyGovernmentContract).filter_by(company_id=company_id)
        total = query.count()
        contracts = query.order_by(desc(EnergyGovernmentContract.award_amount)).offset(offset).limit(limit).all()
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


@router.get("/companies/{company_id}/contracts/summary")
def get_energy_company_contract_summary(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")

        total_contracts = db.query(EnergyGovernmentContract).filter_by(company_id=company_id).count()
        total_amount = db.query(func.sum(EnergyGovernmentContract.award_amount)).filter_by(company_id=company_id).scalar() or 0

        by_agency = {}
        rows = db.query(EnergyGovernmentContract.awarding_agency, func.count()).filter_by(
            company_id=company_id
        ).group_by(EnergyGovernmentContract.awarding_agency).order_by(func.count().desc()).limit(10).all()
        for agency, count in rows:
            if agency:
                by_agency[agency] = count

        return {"total_contracts": total_contracts, "total_amount": total_amount, "by_agency": by_agency}
    finally:
        db.close()


@router.get("/companies/{company_id}/lobbying")
def get_energy_company_lobbying(
    company_id: str, filing_year: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")
        query = db.query(EnergyLobbyingRecord).filter_by(company_id=company_id)
        if filing_year:
            query = query.filter(EnergyLobbyingRecord.filing_year == filing_year)
        total = query.count()
        records = query.order_by(desc(EnergyLobbyingRecord.filing_year), EnergyLobbyingRecord.filing_period).offset(offset).limit(limit).all()
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


@router.get("/companies/{company_id}/lobbying/summary")
def get_energy_company_lobbying_summary(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")

        total_filings = db.query(EnergyLobbyingRecord).filter_by(company_id=company_id).count()
        total_income = db.query(func.sum(EnergyLobbyingRecord.income)).filter_by(company_id=company_id).scalar() or 0

        by_year = {}
        rows = db.query(
            EnergyLobbyingRecord.filing_year, func.sum(EnergyLobbyingRecord.income), func.count(),
        ).filter_by(company_id=company_id).group_by(EnergyLobbyingRecord.filing_year).order_by(EnergyLobbyingRecord.filing_year).all()
        for year, income, count in rows:
            by_year[str(year)] = {"income": income or 0, "filings": count}

        top_firms = {}
        rows = db.query(
            EnergyLobbyingRecord.registrant_name, func.sum(EnergyLobbyingRecord.income), func.count(),
        ).filter_by(company_id=company_id).group_by(EnergyLobbyingRecord.registrant_name).order_by(func.sum(EnergyLobbyingRecord.income).desc()).limit(10).all()
        for name, income, count in rows:
            if name:
                top_firms[name] = {"income": income or 0, "filings": count}

        return {"total_filings": total_filings, "total_income": total_income, "by_year": by_year, "top_firms": top_firms}
    finally:
        db.close()


@router.get("/companies/{company_id}/enforcement")
def get_energy_company_enforcement(
    company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")
        query = db.query(EnergyEnforcement).filter_by(company_id=company_id)
        total = query.count()
        actions = query.order_by(desc(EnergyEnforcement.case_date)).offset(offset).limit(limit).all()
        total_penalties = db.query(func.sum(EnergyEnforcement.penalty_amount)).filter_by(company_id=company_id).scalar() or 0
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


@router.get("/companies/{company_id}/stock")
def get_energy_company_stock(company_id: str):
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")
        latest = db.query(StockFundamentals).filter_by(
            entity_type="energy_company", entity_id=company_id
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


@router.get("/compare")
def get_energy_comparison(ids: str = Query(..., description="Comma-separated company IDs")):
    db = SessionLocal()
    try:
        company_ids = [cid.strip() for cid in ids.split(",") if cid.strip()]
        if not company_ids or len(company_ids) > 10:
            raise HTTPException(status_code=400, detail="Provide 2-10 company IDs")

        results = []
        for cid in company_ids:
            co = db.query(TrackedEnergyCompany).filter_by(company_id=cid).first()
            if not co:
                continue
            emission_count = db.query(EnergyEmission).filter_by(company_id=cid).count()
            total_emissions = db.query(func.sum(EnergyEmission.total_emissions)).filter_by(company_id=cid).scalar() or 0
            contract_count = db.query(EnergyGovernmentContract).filter_by(company_id=cid).count()
            total_contract_value = db.query(func.sum(EnergyGovernmentContract.award_amount)).filter_by(company_id=cid).scalar() or 0
            lobbying_total = db.query(func.sum(EnergyLobbyingRecord.income)).filter_by(company_id=cid).scalar() or 0
            enforcement_count = db.query(EnergyEnforcement).filter_by(company_id=cid).count()
            total_penalties = db.query(func.sum(EnergyEnforcement.penalty_amount)).filter_by(company_id=cid).scalar() or 0

            latest = db.query(StockFundamentals).filter_by(
                entity_type="energy_company", entity_id=cid
            ).order_by(desc(StockFundamentals.snapshot_date)).first()

            results.append({
                "company_id": co.company_id, "display_name": co.display_name,
                "ticker": co.ticker, "sector_type": co.sector_type,
                "emission_count": emission_count, "total_emissions": total_emissions,
                "contract_count": contract_count, "total_contract_value": total_contract_value,
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
def get_energy_company_donations(
    company_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
):
    """PAC/corporate donations from an energy company to politicians."""
    db = SessionLocal()
    try:
        co = db.query(TrackedEnergyCompany).filter_by(company_id=company_id).first()
        if not co:
            raise HTTPException(status_code=404, detail="Energy company not found")
        query = db.query(CompanyDonation).filter_by(entity_type="energy", entity_id=company_id)
        total = query.count()
        donations = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()
        total_amount = db.query(func.sum(CompanyDonation.amount)).filter_by(entity_type="energy", entity_id=company_id).scalar() or 0
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
