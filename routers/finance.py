"""
Finance sector routes — Institutions, filings, complaints, FRED, press releases, stock.
"""

import logging

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional

logger = logging.getLogger(__name__)

from models.database import get_db
from utils.sanitize import escape_like
from models.finance_models import (
    TrackedInstitution, SECFiling, SECInsiderTrade, FDICFinancial, CFPBComplaint,
    FREDObservation, FedPressRelease, FinanceLobbyingRecord, FinanceGovernmentContract, FinanceEnforcement,
)
from models.database import CompanyDonation
from models.market_models import StockFundamentals
from utils.db_compat import extract_year, lobby_spend
from models.response_schemas import FinanceDashboardStats

router = APIRouter(prefix="/finance", tags=["finance"])


def _looks_like_name_token(token: str) -> bool:
    """Return True if `token` plausibly belongs in a person's name.

    Used by `_format_filer_name` to decide whether mixed-case input
    matches the SEC Form 4 LAST FIRST [MI] pattern. We accept:
      - Alphabetic words (Murtagh, Erdoes, Mary, Frank)
      - Single letters with optional trailing period (J, J., E.)
      - Hyphenated and apostrophe names (O'Brien, Smith-Jones)
    Reject anything containing digits or punctuation other than . ' -.
    """
    if not token:
        return False
    stripped = token.strip(".'-")
    if not stripped:
        return False
    return all(c.isalpha() or c in ".-'" for c in token)


def _format_filer_name(raw: Optional[str]) -> Optional[str]:
    """Reformat SEC Form 4 filer names for display.

    SEC Form 4 stores beneficial-owner names in uppercase, last-name-first
    (e.g. "DIMON JAMES", "FRASER JANE"). Rendering that verbatim in a
    journalist-facing UI looks like a database leak. Convert to a human
    "Firstname Lastname" with title case while preserving suffixes
    (JR, SR, II, III, IV) and quoted nicknames.
    """
    if not raw:
        return raw
    name = raw.strip()
    if not name:
        return raw

    # Comma form ("LAST, FIRST MI") is unambiguous and gets handled the
    # same way regardless of casing.
    if "," in name:
        last, _, rest = name.partition(",")
        parts = rest.strip().split() + [last.strip()]
    elif any(c.islower() for c in name):
        # Mixed-case input. SEC Form 4 occasionally arrives pre-cased,
        # but still in LAST FIRST [MI] order (e.g. "Murtagh Nigel J",
        # "Erdoes Mary E.", "Keller Frank"). The earlier version
        # bailed out and rendered these reversed. Apply the same
        # last-first → first-last swap when the name has 2-4 tokens
        # and looks like the SEC pattern: tokens are alphabetic words
        # or single letters / single-letter-with-period (middle initials).
        # A 1-token mixed-case name (just "Madonna") falls through
        # unchanged.
        tokens = name.split()
        if 2 <= len(tokens) <= 4 and all(_looks_like_name_token(t) for t in tokens):
            last = tokens[0]
            parts = tokens[1:] + [last]
        else:
            return name
    else:
        tokens = name.split()
        if len(tokens) < 2:
            return name.title()
        # SEC Form 4 convention: LAST FIRST [MI [SUFFIX]].
        last = tokens[0]
        parts = tokens[1:] + [last]

    SUFFIXES = {"JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"}

    def _cap(token: str) -> str:
        if not token:
            return token
        upper = token.upper().rstrip(".")
        if upper in SUFFIXES:
            return token.upper()
        # Mc/Mac handling: "MCDONALD" -> "McDonald"
        if upper.startswith("MC") and len(upper) > 2:
            return "Mc" + token[2:].capitalize()
        if upper.startswith("MAC") and len(upper) > 3 and not upper[3].isdigit():
            return "Mac" + token[3:].capitalize()
        # O'Brien
        if "'" in token:
            return "'".join(p.capitalize() for p in token.split("'"))
        # Hyphenated names: SMITH-JONES -> Smith-Jones
        if "-" in token:
            return "-".join(p.capitalize() for p in token.split("-"))
        return token.capitalize()

    return " ".join(_cap(p) for p in parts if p)


@router.get("/dashboard/stats", response_model=FinanceDashboardStats)
def get_finance_dashboard_stats(db: Session = Depends(get_db)):
    """Aggregate stats for the finance dashboard."""
    total_institutions = db.query(func.count(TrackedInstitution.id)).filter(TrackedInstitution.is_active == 1).scalar() or 0
    total_filings = db.query(func.count(SECFiling.id)).scalar() or 0
    total_financials = db.query(func.count(FDICFinancial.id)).scalar() or 0
    total_complaints = db.query(func.count(CFPBComplaint.id)).scalar() or 0
    total_fred = db.query(func.count(FREDObservation.id)).scalar() or 0
    total_press = db.query(func.count(FedPressRelease.id)).scalar() or 0
    total_lobbying = db.query(func.count(FinanceLobbyingRecord.id)).scalar() or 0
    total_lobbying_spend = db.query(func.sum(lobby_spend(FinanceLobbyingRecord))).scalar() or 0
    total_contracts = db.query(func.count(FinanceGovernmentContract.id)).scalar() or 0
    total_contract_value = db.query(func.sum(FinanceGovernmentContract.award_amount)).scalar() or 0
    total_enforcement = db.query(func.count(FinanceEnforcement.id)).scalar() or 0
    total_penalties = db.query(func.sum(FinanceEnforcement.penalty_amount)).scalar() or 0
    total_insider_trades = db.query(func.count(SECInsiderTrade.id)).scalar() or 0
    by_sector = dict(db.query(TrackedInstitution.sector_type, func.count(TrackedInstitution.id)).filter(TrackedInstitution.is_active == 1).group_by(TrackedInstitution.sector_type).all())
    return {"total_institutions": total_institutions, "total_filings": total_filings, "total_financials": total_financials, "total_complaints": total_complaints, "total_fred_observations": total_fred, "total_press_releases": total_press, "total_lobbying": total_lobbying, "total_lobbying_spend": total_lobbying_spend, "total_contracts": total_contracts, "total_contract_value": total_contract_value, "total_enforcement": total_enforcement, "total_penalties": total_penalties, "total_insider_trades": total_insider_trades, "by_sector": by_sector}


@router.get("/companies")
@router.get("/institutions")
def get_finance_institutions(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), q: Optional[str] = Query(None, description="Search by name or ticker"), sector_type: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """List tracked financial institutions. Also available at /finance/companies for consistency."""
    query = db.query(TrackedInstitution).filter(TrackedInstitution.is_active == 1)
    if q:
        like = f"%{escape_like(q.strip().lower())}%"
        query = query.filter(func.lower(TrackedInstitution.display_name).like(like, escape="\\") | func.lower(TrackedInstitution.ticker).like(like, escape="\\") | func.lower(TrackedInstitution.institution_id).like(like, escape="\\"))
    if sector_type: query = query.filter(TrackedInstitution.sector_type == sector_type)
    total = query.count()
    rows = query.order_by(TrackedInstitution.display_name).offset(offset).limit(limit).all()
    inst_ids = [r.institution_id for r in rows]
    filing_counts = dict(db.query(SECFiling.institution_id, func.count(SECFiling.id)).filter(SECFiling.institution_id.in_(inst_ids)).group_by(SECFiling.institution_id).all()) if inst_ids else {}
    complaint_counts = dict(db.query(CFPBComplaint.institution_id, func.count(CFPBComplaint.id)).filter(CFPBComplaint.institution_id.in_(inst_ids)).group_by(CFPBComplaint.institution_id).all()) if inst_ids else {}
    lobbying_counts = dict(db.query(FinanceLobbyingRecord.institution_id, func.count(FinanceLobbyingRecord.id)).filter(FinanceLobbyingRecord.institution_id.in_(inst_ids)).group_by(FinanceLobbyingRecord.institution_id).all()) if inst_ids else {}
    contract_counts = dict(db.query(FinanceGovernmentContract.institution_id, func.count(FinanceGovernmentContract.id)).filter(FinanceGovernmentContract.institution_id.in_(inst_ids)).group_by(FinanceGovernmentContract.institution_id).all()) if inst_ids else {}
    enforcement_counts = dict(db.query(FinanceEnforcement.institution_id, func.count(FinanceEnforcement.id)).filter(FinanceEnforcement.institution_id.in_(inst_ids)).group_by(FinanceEnforcement.institution_id).all()) if inst_ids else {}
    donation_counts = dict(db.query(CompanyDonation.entity_id, func.count(CompanyDonation.id)).filter(CompanyDonation.entity_type == "finance", CompanyDonation.entity_id.in_(inst_ids)).group_by(CompanyDonation.entity_id).all()) if inst_ids else {}
    insider_counts = dict(db.query(SECInsiderTrade.institution_id, func.count(SECInsiderTrade.id)).filter(SECInsiderTrade.institution_id.in_(inst_ids)).group_by(SECInsiderTrade.institution_id).all()) if inst_ids else {}
    institutions = []
    for r in rows:
        institutions.append({"institution_id": r.institution_id, "display_name": r.display_name, "ticker": r.ticker, "sector_type": r.sector_type, "headquarters": r.headquarters, "logo_url": r.logo_url, "filing_count": filing_counts.get(r.institution_id, 0), "complaint_count": complaint_counts.get(r.institution_id, 0), "lobbying_count": lobbying_counts.get(r.institution_id, 0), "contract_count": contract_counts.get(r.institution_id, 0), "enforcement_count": enforcement_counts.get(r.institution_id, 0), "donation_count": donation_counts.get(r.institution_id, 0), "insider_trade_count": insider_counts.get(r.institution_id, 0)})
    return {"total": total, "limit": limit, "offset": offset, "institutions": institutions}


@router.get("/institutions/{institution_id}")
def get_institution_detail(institution_id: str, db: Session = Depends(get_db)):
    """Detail for a single tracked institution."""
    logger.info("Institution detail request: %s", institution_id)
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id, is_active=1).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    filing_count = db.query(func.count(SECFiling.id)).filter(SECFiling.institution_id == institution_id).scalar() or 0
    financial_count = db.query(func.count(FDICFinancial.id)).filter(FDICFinancial.institution_id == institution_id).scalar() or 0
    complaint_count = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.institution_id == institution_id).scalar() or 0
    fred_count = db.query(func.count(FREDObservation.id)).filter(FREDObservation.institution_id == institution_id).scalar() or 0
    press_count = db.query(func.count(FedPressRelease.id)).filter(FedPressRelease.institution_id == institution_id).scalar() or 0
    lobbying_count = db.query(func.count(FinanceLobbyingRecord.id)).filter(FinanceLobbyingRecord.institution_id == institution_id).scalar() or 0
    lobbying_spend = db.query(func.sum(lobby_spend(FinanceLobbyingRecord))).filter(FinanceLobbyingRecord.institution_id == institution_id).scalar() or 0.0
    contract_count = db.query(func.count(FinanceGovernmentContract.id)).filter(FinanceGovernmentContract.institution_id == institution_id).scalar() or 0
    contract_value = db.query(func.sum(FinanceGovernmentContract.award_amount)).filter(FinanceGovernmentContract.institution_id == institution_id).scalar() or 0.0
    enforcement_count = db.query(func.count(FinanceEnforcement.id)).filter(FinanceEnforcement.institution_id == institution_id).scalar() or 0
    penalty_total = db.query(func.sum(FinanceEnforcement.penalty_amount)).filter(FinanceEnforcement.institution_id == institution_id).scalar() or 0.0
    donation_count = db.query(func.count(CompanyDonation.id)).filter(CompanyDonation.entity_type == "finance", CompanyDonation.entity_id == institution_id).scalar() or 0
    donation_total = db.query(func.sum(CompanyDonation.amount)).filter(CompanyDonation.entity_type == "finance", CompanyDonation.entity_id == institution_id).scalar() or 0.0
    insider_trade_count = db.query(func.count(SECInsiderTrade.id)).filter(SECInsiderTrade.institution_id == institution_id).scalar() or 0
    latest_stock = db.query(StockFundamentals).filter_by(entity_type="institution", entity_id=institution_id).order_by(desc(StockFundamentals.snapshot_date)).first()
    stock_data = None
    if latest_stock:
        stock_data = {"snapshot_date": str(latest_stock.snapshot_date) if latest_stock.snapshot_date else None, "market_cap": latest_stock.market_cap, "pe_ratio": latest_stock.pe_ratio, "eps": latest_stock.eps, "dividend_yield": latest_stock.dividend_yield, "week_52_high": latest_stock.week_52_high, "week_52_low": latest_stock.week_52_low, "profit_margin": latest_stock.profit_margin}
    return {"institution_id": inst.institution_id, "display_name": inst.display_name, "ticker": inst.ticker, "sector_type": inst.sector_type, "headquarters": inst.headquarters, "logo_url": inst.logo_url, "sec_cik": inst.sec_cik, "fdic_cert": inst.fdic_cert, "filing_count": filing_count, "financial_count": financial_count, "complaint_count": complaint_count, "fred_count": fred_count, "press_count": press_count, "lobbying_count": lobbying_count, "lobbying_spend": lobbying_spend, "contract_count": contract_count, "contract_value": contract_value, "enforcement_count": enforcement_count, "penalty_total": penalty_total, "donation_count": donation_count, "donation_total": donation_total, "insider_trade_count": insider_trade_count, "latest_stock": stock_data, "ai_profile_summary": inst.ai_profile_summary, "sanctions_status": inst.sanctions_status}


@router.get("/institutions/{institution_id}/filings")
def get_institution_filings(institution_id: str, form_type: Optional[str] = Query(None), limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """SEC EDGAR filings for an institution."""
    query = db.query(SECFiling).filter_by(institution_id=institution_id)
    if form_type: query = query.filter(SECFiling.form_type == form_type)
    total = query.count()
    rows = query.order_by(desc(SECFiling.filing_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "filings": [{"id": f.id, "accession_number": f.accession_number, "form_type": f.form_type, "filing_date": str(f.filing_date) if f.filing_date else None, "primary_doc_url": f.primary_doc_url, "filing_url": f.filing_url, "description": f.description} for f in rows]}


@router.get("/institutions/{institution_id}/financials")
def get_institution_financials(institution_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """FDIC quarterly financials for an institution."""
    query = db.query(FDICFinancial).filter_by(institution_id=institution_id)
    total = query.count()
    rows = query.order_by(desc(FDICFinancial.report_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "financials": [{"id": f.id, "report_date": str(f.report_date) if f.report_date else None, "total_assets": f.total_assets, "total_deposits": f.total_deposits, "net_income": f.net_income, "net_loans": f.net_loans, "roa": f.roa, "roe": f.roe, "tier1_capital_ratio": f.tier1_capital_ratio, "efficiency_ratio": f.efficiency_ratio, "noncurrent_loan_ratio": f.noncurrent_loan_ratio, "net_charge_off_ratio": f.net_charge_off_ratio} for f in rows]}


@router.get("/institutions/{institution_id}/complaints")
def get_institution_complaints(institution_id: str, product: Optional[str] = Query(None), limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """CFPB complaints for an institution."""
    query = db.query(CFPBComplaint).filter_by(institution_id=institution_id)
    if product: query = query.filter(CFPBComplaint.product == product)
    total = query.count()
    rows = query.order_by(desc(CFPBComplaint.date_received)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "complaints": [{"id": c.id, "complaint_id": c.complaint_id, "date_received": str(c.date_received) if c.date_received else None, "product": c.product, "sub_product": c.sub_product, "issue": c.issue, "company_response": c.company_response, "state": c.state} for c in rows]}


@router.get("/institutions/{institution_id}/complaints/summary")
def get_institution_complaint_summary(institution_id: str, db: Session = Depends(get_db)):
    """Aggregated complaint stats for an institution."""
    total = db.query(func.count(CFPBComplaint.id)).filter_by(institution_id=institution_id).scalar() or 0
    by_product = dict(db.query(CFPBComplaint.product, func.count(CFPBComplaint.id)).filter_by(institution_id=institution_id).group_by(CFPBComplaint.product).all())
    by_response = dict(db.query(CFPBComplaint.company_response, func.count(CFPBComplaint.id)).filter_by(institution_id=institution_id).group_by(CFPBComplaint.company_response).all())
    return {"total_complaints": total, "by_product": by_product, "by_response": by_response}


@router.get("/institutions/{institution_id}/fred")
def get_institution_fred(institution_id: str, series_id: Optional[str] = Query(None), limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """FRED economic observations for an institution."""
    query = db.query(FREDObservation).filter_by(institution_id=institution_id)
    if series_id: query = query.filter(FREDObservation.series_id == series_id)
    total = query.count()
    rows = query.order_by(desc(FREDObservation.observation_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "observations": [{"id": o.id, "series_id": o.series_id, "observation_date": str(o.observation_date) if o.observation_date else None, "value": o.value} for o in rows]}


@router.get("/institutions/{institution_id}/press-releases")
def get_institution_press_releases(institution_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Federal Reserve press releases for an institution."""
    query = db.query(FedPressRelease).filter_by(institution_id=institution_id)
    total = query.count()
    rows = query.order_by(desc(FedPressRelease.published_at)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "press_releases": [{"id": p.id, "title": p.title, "release_date": str(p.published_at) if p.published_at else None, "url": p.link, "category": p.category, "summary": p.summary} for p in rows]}


@router.get("/institutions/{institution_id}/stock")
def get_institution_stock(institution_id: str, db: Session = Depends(get_db)):
    """Latest stock fundamentals for an institution."""
    latest = db.query(StockFundamentals).filter_by(entity_type="institution", entity_id=institution_id).order_by(desc(StockFundamentals.snapshot_date)).first()
    if not latest: return {"stock": None}
    return {"stock": {"ticker": latest.ticker, "snapshot_date": str(latest.snapshot_date) if latest.snapshot_date else None, "market_cap": latest.market_cap, "pe_ratio": latest.pe_ratio, "forward_pe": latest.forward_pe, "peg_ratio": latest.peg_ratio, "price_to_book": latest.price_to_book, "eps": latest.eps, "revenue_ttm": latest.revenue_ttm, "profit_margin": latest.profit_margin, "operating_margin": latest.operating_margin, "return_on_equity": latest.return_on_equity, "dividend_yield": latest.dividend_yield, "dividend_per_share": latest.dividend_per_share, "week_52_high": latest.week_52_high, "week_52_low": latest.week_52_low, "day_50_moving_avg": latest.day_50_moving_avg, "day_200_moving_avg": latest.day_200_moving_avg, "sector": latest.sector, "industry": latest.industry}}


@router.get("/institutions/{institution_id}/insider-trades")
def get_institution_insider_trades(institution_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), transaction_type: Optional[str] = Query(None, description="P=Purchase, S=Sale, A=Award"), db: Session = Depends(get_db)):
    """SEC Form 4 insider trading disclosures for an institution."""
    q = db.query(SECInsiderTrade).filter_by(institution_id=institution_id)
    if transaction_type: q = q.filter(SECInsiderTrade.transaction_type == transaction_type)
    total = q.count()
    trades = q.order_by(desc(SECInsiderTrade.transaction_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "trades": [{"id": t.id, "filer_name": _format_filer_name(t.filer_name), "filer_title": t.filer_title, "transaction_date": str(t.transaction_date) if t.transaction_date else None, "transaction_type": t.transaction_type, "shares": t.shares, "price_per_share": t.price_per_share, "total_value": t.total_value, "filing_url": t.filing_url, "accession_number": t.accession_number} for t in trades]}


@router.get("/complaints")
def get_all_complaints(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), product: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """All CFPB complaints across all institutions, newest first."""
    q = db.query(CFPBComplaint, TrackedInstitution.display_name).join(TrackedInstitution, CFPBComplaint.institution_id == TrackedInstitution.institution_id)
    if product: q = q.filter(CFPBComplaint.product == product)
    total = q.count()
    rows = q.order_by(desc(CFPBComplaint.date_received)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "complaints": [{"id": c.id, "complaint_id": c.complaint_id, "institution_id": c.institution_id, "company_name": name, "date_received": str(c.date_received) if c.date_received else None, "product": c.product, "sub_product": c.sub_product, "issue": c.issue, "sub_issue": c.sub_issue, "company_response": c.company_response, "timely_response": c.timely_response, "consumer_disputed": c.consumer_disputed, "complaint_narrative": c.complaint_narrative, "state": c.state} for c, name in rows]}


@router.get("/complaints/summary")
def get_global_complaint_summary(db: Session = Depends(get_db)):
    """Aggregate complaint stats across all institutions."""
    total = db.query(func.count(CFPBComplaint.id)).scalar() or 0
    by_product = dict(db.query(CFPBComplaint.product, func.count(CFPBComplaint.id)).filter(CFPBComplaint.product.isnot(None)).group_by(CFPBComplaint.product).order_by(desc(func.count(CFPBComplaint.id))).all())
    by_response = dict(db.query(CFPBComplaint.company_response, func.count(CFPBComplaint.id)).filter(CFPBComplaint.company_response.isnot(None)).group_by(CFPBComplaint.company_response).order_by(desc(func.count(CFPBComplaint.id))).all())
    timely_yes = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.timely_response == "Yes").scalar() or 0
    timely_total = db.query(func.count(CFPBComplaint.id)).filter(CFPBComplaint.timely_response.isnot(None)).scalar() or 0
    timely_pct = round(timely_yes / timely_total * 100, 1) if timely_total > 0 else None
    return {"total_complaints": total, "by_product": by_product, "by_response": by_response, "timely_response_pct": timely_pct}


@router.get("/macro-indicators")
def get_macro_indicators(db: Session = Depends(get_db)):
    """Latest value for each FRED series (macro indicators)."""
    from sqlalchemy import distinct
    latest_sub = db.query(FREDObservation.series_id, func.max(FREDObservation.observation_date).label("max_date")).filter(FREDObservation.value.isnot(None)).group_by(FREDObservation.series_id).subquery()
    rows = db.query(FREDObservation).join(latest_sub, (FREDObservation.series_id == latest_sub.c.series_id) & (FREDObservation.observation_date == latest_sub.c.max_date)).filter(FREDObservation.value.isnot(None)).all()
    indicators = []
    seen = set()
    for latest in rows:
        if latest.series_id in seen: continue
        seen.add(latest.series_id)
        indicators.append({"series_id": latest.series_id, "series_title": latest.series_title, "value": latest.value, "units": latest.units, "observation_date": str(latest.observation_date) if latest.observation_date else None})
    return {"indicators": indicators}


@router.get("/sector-news")
def get_sector_news(limit: int = Query(20, ge=1, le=50), db: Session = Depends(get_db)):
    """Recent Fed press releases across all institutions (sector news)."""
    rows = db.query(FedPressRelease).order_by(desc(FedPressRelease.published_at)).limit(limit).all()
    return {"news": [{"id": p.id, "title": p.title, "release_date": str(p.published_at) if p.published_at else None, "url": p.link, "category": p.category, "summary": p.summary} for p in rows]}


@router.get("/insider-trades")
def get_all_insider_trades(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), transaction_type: Optional[str] = Query(None, description="P=Purchase, S=Sale, A=Award"), db: Session = Depends(get_db)):
    """All insider trades across all institutions, newest first."""
    q = db.query(SECInsiderTrade, TrackedInstitution.display_name, TrackedInstitution.ticker).join(TrackedInstitution, SECInsiderTrade.institution_id == TrackedInstitution.institution_id)
    if transaction_type: q = q.filter(SECInsiderTrade.transaction_type == transaction_type)
    total = q.count()
    trades = q.order_by(desc(SECInsiderTrade.transaction_date)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "trades": [{"id": t.id, "institution_id": t.institution_id, "company_name": name, "ticker": ticker, "filer_name": _format_filer_name(t.filer_name), "filer_title": t.filer_title, "transaction_date": str(t.transaction_date) if t.transaction_date else None, "transaction_type": t.transaction_type, "shares": t.shares, "price_per_share": t.price_per_share, "total_value": t.total_value, "filing_url": t.filing_url} for t, name, ticker in trades]}


@router.get("/compare")
def get_finance_comparison(ids: str = Query(..., description="Comma-separated institution IDs"), db: Session = Depends(get_db)):
    """Cross-institution comparison for key financial metrics."""
    institution_ids = [iid.strip() for iid in ids.split(",") if iid.strip()]
    if not institution_ids or len(institution_ids) > 10: raise HTTPException(status_code=400, detail="Provide 2-10 institution IDs")

    # Batch the per-institution aggregations in one query per table instead
    # of N+1 per institution. Matches the factory-router pattern.
    filing_counts = dict(db.query(SECFiling.institution_id, func.count(SECFiling.id)).filter(SECFiling.institution_id.in_(institution_ids)).group_by(SECFiling.institution_id).all())
    complaint_counts = dict(db.query(CFPBComplaint.institution_id, func.count(CFPBComplaint.id)).filter(CFPBComplaint.institution_id.in_(institution_ids)).group_by(CFPBComplaint.institution_id).all())
    lobbying_counts = dict(db.query(FinanceLobbyingRecord.institution_id, func.count(FinanceLobbyingRecord.id)).filter(FinanceLobbyingRecord.institution_id.in_(institution_ids)).group_by(FinanceLobbyingRecord.institution_id).all())
    lobbying_totals = dict(db.query(FinanceLobbyingRecord.institution_id, func.sum(lobby_spend(FinanceLobbyingRecord))).filter(FinanceLobbyingRecord.institution_id.in_(institution_ids)).group_by(FinanceLobbyingRecord.institution_id).all())
    contract_counts = dict(db.query(FinanceGovernmentContract.institution_id, func.count(FinanceGovernmentContract.id)).filter(FinanceGovernmentContract.institution_id.in_(institution_ids)).group_by(FinanceGovernmentContract.institution_id).all())
    contract_totals = dict(db.query(FinanceGovernmentContract.institution_id, func.sum(FinanceGovernmentContract.award_amount)).filter(FinanceGovernmentContract.institution_id.in_(institution_ids)).group_by(FinanceGovernmentContract.institution_id).all())
    enforcement_counts = dict(db.query(FinanceEnforcement.institution_id, func.count(FinanceEnforcement.id)).filter(FinanceEnforcement.institution_id.in_(institution_ids)).group_by(FinanceEnforcement.institution_id).all())
    penalty_totals = dict(db.query(FinanceEnforcement.institution_id, func.sum(FinanceEnforcement.penalty_amount)).filter(FinanceEnforcement.institution_id.in_(institution_ids)).group_by(FinanceEnforcement.institution_id).all())
    donation_counts = dict(db.query(CompanyDonation.entity_id, func.count(CompanyDonation.id)).filter(CompanyDonation.entity_type == "finance", CompanyDonation.entity_id.in_(institution_ids)).group_by(CompanyDonation.entity_id).all())
    insider_counts = dict(db.query(SECInsiderTrade.institution_id, func.count(SECInsiderTrade.id)).filter(SECInsiderTrade.institution_id.in_(institution_ids)).group_by(SECInsiderTrade.institution_id).all())

    results = []
    for iid in institution_ids:
        inst = db.query(TrackedInstitution).filter(TrackedInstitution.institution_id == iid).first()
        if not inst: continue
        latest_fin = db.query(FDICFinancial).filter(FDICFinancial.institution_id == iid).order_by(desc(FDICFinancial.report_date)).first()
        latest_stock = db.query(StockFundamentals).filter_by(entity_type="institution", entity_id=iid).order_by(desc(StockFundamentals.snapshot_date)).first()
        results.append({
            "institution_id": iid, "display_name": inst.display_name, "ticker": inst.ticker,
            "sector_type": inst.sector_type, "headquarters": inst.headquarters,
            "industry": latest_stock.industry if latest_stock else None,
            "filing_count": filing_counts.get(iid, 0),
            "complaint_count": complaint_counts.get(iid, 0),
            "lobbying_count": lobbying_counts.get(iid, 0),
            "lobbying_spend": lobbying_totals.get(iid) or 0.0,
            "contract_count": contract_counts.get(iid, 0),
            "contract_value": contract_totals.get(iid) or 0.0,
            "enforcement_count": enforcement_counts.get(iid, 0),
            "penalty_total": penalty_totals.get(iid) or 0.0,
            "donation_count": donation_counts.get(iid, 0),
            "insider_trade_count": insider_counts.get(iid, 0),
            "total_assets": latest_fin.total_assets if latest_fin else None, "total_deposits": latest_fin.total_deposits if latest_fin else None, "net_income": latest_fin.net_income if latest_fin else None, "net_loans": latest_fin.net_loans if latest_fin else None, "roa": latest_fin.roa if latest_fin else None, "roe": latest_fin.roe if latest_fin else None, "tier1_capital_ratio": latest_fin.tier1_capital_ratio if latest_fin else None, "efficiency_ratio": latest_fin.efficiency_ratio if latest_fin else None, "noncurrent_loan_ratio": latest_fin.noncurrent_loan_ratio if latest_fin else None, "net_charge_off_ratio": latest_fin.net_charge_off_ratio if latest_fin else None, "market_cap": latest_stock.market_cap if latest_stock else None, "pe_ratio": latest_stock.pe_ratio if latest_stock else None, "forward_pe": latest_stock.forward_pe if latest_stock else None, "peg_ratio": latest_stock.peg_ratio if latest_stock else None, "price_to_book": latest_stock.price_to_book if latest_stock else None, "eps": latest_stock.eps if latest_stock else None, "revenue_ttm": latest_stock.revenue_ttm if latest_stock else None, "profit_margin": latest_stock.profit_margin if latest_stock else None, "operating_margin": latest_stock.operating_margin if latest_stock else None, "return_on_equity": latest_stock.return_on_equity if latest_stock else None, "dividend_yield": latest_stock.dividend_yield if latest_stock else None, "dividend_per_share": latest_stock.dividend_per_share if latest_stock else None, "week_52_high": latest_stock.week_52_high if latest_stock else None, "week_52_low": latest_stock.week_52_low if latest_stock else None,
        })
    return {"institutions": results}


# ── Political data endpoints ──────────────────────────────────────────────

@router.get("/institutions/{institution_id}/lobbying")
def get_institution_lobbying(institution_id: str, filing_year: Optional[int] = Query(None), limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Lobbying disclosure filings for an institution."""
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    query = db.query(FinanceLobbyingRecord).filter_by(institution_id=institution_id)
    if filing_year: query = query.filter(FinanceLobbyingRecord.filing_year == filing_year)
    total = query.count()
    records = query.order_by(desc(FinanceLobbyingRecord.filing_year), FinanceLobbyingRecord.filing_period).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "filings": [{"id": r.id, "filing_uuid": r.filing_uuid, "filing_year": r.filing_year, "filing_period": r.filing_period, "income": r.income, "expenses": r.expenses, "registrant_name": r.registrant_name, "client_name": r.client_name, "lobbying_issues": r.lobbying_issues, "government_entities": r.government_entities, "ai_summary": r.ai_summary} for r in records]}


@router.get("/institutions/{institution_id}/lobbying/summary")
def get_institution_lobbying_summary(institution_id: str, db: Session = Depends(get_db)):
    """Lobbying spend summary by year and top firms."""
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    total_filings = db.query(FinanceLobbyingRecord).filter_by(institution_id=institution_id).count()
    total_income = db.query(func.sum(lobby_spend(FinanceLobbyingRecord))).filter_by(institution_id=institution_id).scalar() or 0
    by_year = {}
    rows = db.query(FinanceLobbyingRecord.filing_year, func.sum(lobby_spend(FinanceLobbyingRecord)), func.count()).filter_by(institution_id=institution_id).group_by(FinanceLobbyingRecord.filing_year).order_by(FinanceLobbyingRecord.filing_year).all()
    for year, income, count in rows: by_year[str(year)] = {"income": income or 0, "filings": count}
    top_firms = {}
    rows = db.query(FinanceLobbyingRecord.registrant_name, func.sum(lobby_spend(FinanceLobbyingRecord)), func.count()).filter_by(institution_id=institution_id).group_by(FinanceLobbyingRecord.registrant_name).order_by(func.sum(lobby_spend(FinanceLobbyingRecord)).desc()).limit(10).all()
    for name, income, count in rows:
        if name: top_firms[name] = {"income": income or 0, "filings": count}
    return {"total_filings": total_filings, "total_income": total_income, "by_year": by_year, "top_firms": top_firms}


@router.get("/institutions/{institution_id}/contracts")
def get_institution_contracts(institution_id: str, limit: int = Query(25, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Government contracts awarded to an institution."""
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    query = db.query(FinanceGovernmentContract).filter_by(institution_id=institution_id)
    total = query.count()
    contracts = query.order_by(desc(FinanceGovernmentContract.award_amount)).offset(offset).limit(limit).all()
    return {"total": total, "limit": limit, "offset": offset, "contracts": [{"id": ct.id, "award_id": ct.award_id, "award_amount": ct.award_amount, "awarding_agency": ct.awarding_agency, "description": ct.description, "start_date": str(ct.start_date) if ct.start_date else None, "end_date": str(ct.end_date) if ct.end_date else None, "contract_type": ct.contract_type, "ai_summary": ct.ai_summary} for ct in contracts]}


@router.get("/institutions/{institution_id}/contracts/summary")
def get_institution_contract_summary(institution_id: str, db: Session = Depends(get_db)):
    """Contract summary with totals and breakdown by agency."""
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    total_contracts = db.query(FinanceGovernmentContract).filter_by(institution_id=institution_id).count()
    total_amount = db.query(func.sum(FinanceGovernmentContract.award_amount)).filter_by(institution_id=institution_id).scalar() or 0
    by_agency = {}
    rows = db.query(FinanceGovernmentContract.awarding_agency, func.count()).filter_by(institution_id=institution_id).group_by(FinanceGovernmentContract.awarding_agency).order_by(func.count().desc()).limit(10).all()
    for agency, count in rows:
        if agency: by_agency[agency] = count
    return {"total_contracts": total_contracts, "total_amount": total_amount, "by_agency": by_agency}


@router.get("/institutions/{institution_id}/enforcement")
def get_institution_enforcement(institution_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """Enforcement actions against an institution (CFPB, SEC, OCC, DOJ)."""
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    query = db.query(FinanceEnforcement).filter_by(institution_id=institution_id)
    total = query.count()
    actions = query.order_by(desc(FinanceEnforcement.case_date)).offset(offset).limit(limit).all()
    total_penalties = db.query(func.sum(FinanceEnforcement.penalty_amount)).filter_by(institution_id=institution_id).scalar() or 0
    return {"total": total, "total_penalties": total_penalties, "limit": limit, "offset": offset, "actions": [{"id": a.id, "case_title": a.case_title, "case_date": str(a.case_date) if a.case_date else None, "case_url": a.case_url, "enforcement_type": a.enforcement_type, "penalty_amount": a.penalty_amount, "description": a.description, "source": a.source, "ai_summary": a.ai_summary} for a in actions]}


@router.get("/institutions/{institution_id}/donations")
def get_institution_donations(institution_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    """PAC/corporate donations from an institution to politicians."""
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    query = db.query(CompanyDonation).filter_by(entity_type="finance", entity_id=institution_id)
    total = query.count()
    donations = query.order_by(desc(CompanyDonation.amount)).offset(offset).limit(limit).all()
    total_amount = db.query(func.sum(CompanyDonation.amount)).filter_by(entity_type="finance", entity_id=institution_id).scalar() or 0
    return {"total": total, "total_amount": total_amount, "limit": limit, "offset": offset, "donations": [{"id": d.id, "committee_name": d.committee_name, "committee_id": d.committee_id, "candidate_name": d.candidate_name, "candidate_id": d.candidate_id, "person_id": d.person_id, "amount": d.amount, "cycle": d.cycle, "donation_date": str(d.donation_date) if d.donation_date else None, "source_url": d.source_url} for d in donations]}


# ── Trend Data ──────────────────────────────────────────────────────────

@router.get("/institutions/{institution_id}/trends")
def get_institution_trends(institution_id: str, db: Session = Depends(get_db)):
    """Yearly trend data for a finance institution: lobbying, contracts, enforcement.

    NOTE: func.strftime is SQLite-specific. PostgreSQL equivalent: func.extract('year', col)
    or func.to_char(col, 'YYYY'). If migrating to PostgreSQL, update these queries.
    """
    import datetime
    inst = db.query(TrackedInstitution).filter_by(institution_id=institution_id).first()
    if not inst: raise HTTPException(status_code=404, detail="Institution not found")
    current_year = datetime.date.today().year
    min_year = 2018
    lobby_rows = db.query(FinanceLobbyingRecord.filing_year, func.count(FinanceLobbyingRecord.id)).filter_by(institution_id=institution_id).filter(FinanceLobbyingRecord.filing_year.isnot(None)).group_by(FinanceLobbyingRecord.filing_year).all()
    lobby_by_year = {int(r[0]): r[1] for r in lobby_rows if r[0]}
    contract_rows = db.query(extract_year(FinanceGovernmentContract.start_date).label("yr"), func.count(FinanceGovernmentContract.id)).filter_by(institution_id=institution_id).filter(FinanceGovernmentContract.start_date.isnot(None)).group_by("yr").all()
    contracts_by_year = {int(r[0]): r[1] for r in contract_rows if r[0]}
    enforcement_rows = db.query(extract_year(FinanceEnforcement.case_date).label("yr"), func.count(FinanceEnforcement.id)).filter_by(institution_id=institution_id).filter(FinanceEnforcement.case_date.isnot(None)).group_by("yr").all()
    enforcement_by_year = {int(r[0]): r[1] for r in enforcement_rows if r[0]}
    all_years_set = set(lobby_by_year) | set(contracts_by_year) | set(enforcement_by_year)
    all_years_set = {y for y in all_years_set if min_year <= y <= current_year}
    if not all_years_set: all_years_set = set(range(min_year, current_year + 1))
    years = sorted(all_years_set)
    return {"years": years, "series": {"lobbying": [lobby_by_year.get(y, 0) for y in years], "contracts": [contracts_by_year.get(y, 0) for y in years], "enforcement": [enforcement_by_year.get(y, 0) for y in years]}}
