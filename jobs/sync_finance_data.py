"""
Finance Data Ingestion Job

Syncs SEC filings, FDIC financials, CFPB complaints, FRED observations,
Fed press releases, and stock fundamentals for tracked institutions.

Usage:
    python jobs/sync_finance_data.py
    python jobs/sync_finance_data.py --institution-id jpmorgan
    python jobs/sync_finance_data.py --skip-sec --skip-fdic
    python jobs/sync_finance_data.py --institution-id federal-reserve --skip-sec --skip-fdic --skip-cfpb
"""

import argparse
import sys
import hashlib
from pathlib import Path
from datetime import datetime, date

# Add project root to path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models import database  # noqa: F401
import models.finance_models  # noqa: F401
from models.database import SessionLocal
from models.finance_models import (
    TrackedInstitution,
    SECFiling,
    FDICFinancial,
    CFPBComplaint,
    FREDObservation,
    FedPressRelease,
)
from models.market_models import StockFundamentals
from connectors.sec_edgar import fetch_company_submissions, extract_filings
from connectors.fdic_bankfind import fetch_quarterly_financials
from connectors.cfpb_complaints import fetch_complaints
from connectors.fred import fetch_series_observations, TRACKED_SERIES
from connectors.fed_press import fetch_press_releases
from connectors.alpha_vantage import fetch_company_overview
from utils.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)


def _compute_hash(*parts) -> str:
    raw = "|".join(str(p) for p in parts)
    return hashlib.md5(raw.encode()).hexdigest()


def _parse_date(val) -> date | None:
    """Parse a date string (YYYY-MM-DD) or return None."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    try:
        return datetime.strptime(str(val)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


# ============================================================================
# SEC FILINGS SYNC
# ============================================================================

def sync_sec_filings(institution: TrackedInstitution, db) -> int:
    """Ingest SEC filings for an institution. Returns count of new filings."""
    if not institution.sec_cik:
        logger.info("Skipping SEC for %s (no CIK)", institution.institution_id)
        return 0

    submissions = fetch_company_submissions(institution.sec_cik)
    if not submissions:
        return 0

    # Get major filing types
    filings = extract_filings(
        submissions,
        form_types=["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "4", "4/A"],
    )

    inserted = 0
    for f in filings:
        dedupe = f["dedupe_hash"]

        # Check for existing
        exists = db.query(SECFiling).filter_by(accession_number=f["accession_number"]).first()
        if exists:
            continue

        filing = SECFiling(
            institution_id=institution.institution_id,
            accession_number=f["accession_number"],
            form_type=f["form_type"],
            filing_date=_parse_date(f.get("filing_date")),
            primary_doc_url=f.get("filing_url"),
            filing_url=f.get("index_url"),
            description=f.get("description"),
            dedupe_hash=dedupe,
        )
        db.add(filing)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("SEC filings for %s: %d new of %d total", institution.institution_id, inserted, len(filings))
    return inserted


# ============================================================================
# FDIC FINANCIALS SYNC
# ============================================================================

def sync_fdic_financials(institution: TrackedInstitution, db) -> int:
    """Ingest FDIC quarterly financials. Returns count of new records."""
    if not institution.fdic_cert:
        logger.info("Skipping FDIC for %s (no cert)", institution.institution_id)
        return 0

    quarters = fetch_quarterly_financials(institution.fdic_cert)

    inserted = 0
    for q in quarters:
        report_date = _parse_date(q.get("report_date"))
        if not report_date:
            continue

        dedupe = q["dedupe_hash"]

        exists = db.query(FDICFinancial).filter_by(dedupe_hash=dedupe).first()
        if exists:
            continue

        record = FDICFinancial(
            institution_id=institution.institution_id,
            report_date=report_date,
            total_assets=q.get("total_assets"),
            total_deposits=q.get("total_deposits"),
            net_income=q.get("net_income"),
            net_loans=q.get("net_loans"),
            roa=q.get("roa"),
            roe=q.get("roe"),
            tier1_capital_ratio=q.get("tier1_capital_ratio"),
            efficiency_ratio=q.get("efficiency_ratio"),
            noncurrent_loan_ratio=q.get("noncurrent_loan_ratio"),
            net_charge_off_ratio=q.get("net_charge_off_ratio"),
            dedupe_hash=dedupe,
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("FDIC financials for %s: %d new of %d total", institution.institution_id, inserted, len(quarters))
    return inserted


# ============================================================================
# CFPB COMPLAINTS SYNC
# ============================================================================

def sync_cfpb_complaints(institution: TrackedInstitution, db) -> int:
    """Ingest CFPB complaints. Returns count of new complaints."""
    if not institution.cfpb_company_name:
        logger.info("Skipping CFPB for %s (no company name)", institution.institution_id)
        return 0

    result = fetch_complaints(institution.cfpb_company_name)
    complaints = result.get("complaints", [])

    inserted = 0
    for c in complaints:
        complaint_id = c.get("complaint_id")
        if not complaint_id:
            continue

        exists = db.query(CFPBComplaint).filter_by(complaint_id=complaint_id).first()
        if exists:
            continue

        record = CFPBComplaint(
            institution_id=institution.institution_id,
            complaint_id=complaint_id,
            date_received=_parse_date(c.get("date_received")),
            product=c.get("product"),
            sub_product=c.get("sub_product"),
            issue=c.get("issue"),
            sub_issue=c.get("sub_issue"),
            company_response=c.get("company_response"),
            timely_response=c.get("timely_response"),
            consumer_disputed=c.get("consumer_disputed"),
            complaint_narrative=c.get("complaint_narrative"),
            state=c.get("state"),
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("CFPB complaints for %s: %d new of %d fetched", institution.institution_id, inserted, len(complaints))
    return inserted


# ============================================================================
# FRED OBSERVATIONS SYNC (Federal Reserve only)
# ============================================================================

def sync_fred_observations(institution: TrackedInstitution, db) -> int:
    """Ingest FRED economic observations. Only runs for federal-reserve."""
    if institution.institution_id != "federal-reserve":
        return 0

    inserted = 0
    for series_id in TRACKED_SERIES:
        observations = fetch_series_observations(series_id)

        for obs in observations:
            dedupe = obs["dedupe_hash"]
            exists = db.query(FREDObservation).filter_by(dedupe_hash=dedupe).first()
            if exists:
                continue

            record = FREDObservation(
                institution_id=institution.institution_id,
                series_id=obs["series_id"],
                series_title=obs.get("series_title"),
                observation_date=_parse_date(obs.get("observation_date")),
                value=obs.get("value"),
                units=obs.get("units"),
                dedupe_hash=dedupe,
            )
            db.add(record)
            inserted += 1

    if inserted:
        db.commit()
    logger.info("FRED observations for %s: %d new", institution.institution_id, inserted)
    return inserted


# ============================================================================
# FED PRESS RELEASES SYNC (Federal Reserve only)
# ============================================================================

def sync_fed_press(institution: TrackedInstitution, db) -> int:
    """Ingest Fed press releases from RSS. Only runs for federal-reserve."""
    if institution.institution_id != "federal-reserve":
        return 0

    releases = fetch_press_releases()
    inserted = 0

    for rel in releases:
        link = rel.get("link")
        if not link:
            continue

        exists = db.query(FedPressRelease).filter_by(link=link).first()
        if exists:
            continue

        record = FedPressRelease(
            institution_id=institution.institution_id,
            title=rel["title"],
            link=link,
            published_at=rel.get("published_at"),
            category=rel.get("category"),
            summary=rel.get("summary"),
            dedupe_hash=rel["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("Fed press releases for %s: %d new of %d fetched", institution.institution_id, inserted, len(releases))
    return inserted


# ============================================================================
# STOCK FUNDAMENTALS SYNC (Alpha Vantage)
# ============================================================================

def sync_stock_fundamentals(institution: TrackedInstitution, db) -> int:
    """Ingest stock fundamentals from Alpha Vantage for institutions with tickers."""
    if not institution.ticker:
        logger.info("Skipping stock for %s (no ticker)", institution.institution_id)
        return 0

    overview = fetch_company_overview(institution.ticker)
    if not overview:
        return 0

    dedupe = overview["dedupe_hash"]
    exists = db.query(StockFundamentals).filter_by(dedupe_hash=dedupe).first()
    if exists:
        return 0

    record = StockFundamentals(
        entity_type="institution",
        entity_id=institution.institution_id,
        ticker=institution.ticker,
        snapshot_date=_parse_date(overview.get("snapshot_date")),
        market_cap=overview.get("market_cap"),
        pe_ratio=overview.get("pe_ratio"),
        forward_pe=overview.get("forward_pe"),
        peg_ratio=overview.get("peg_ratio"),
        price_to_book=overview.get("price_to_book"),
        eps=overview.get("eps"),
        revenue_ttm=overview.get("revenue_ttm"),
        profit_margin=overview.get("profit_margin"),
        operating_margin=overview.get("operating_margin"),
        return_on_equity=overview.get("return_on_equity"),
        dividend_yield=overview.get("dividend_yield"),
        dividend_per_share=overview.get("dividend_per_share"),
        week_52_high=overview.get("week_52_high"),
        week_52_low=overview.get("week_52_low"),
        day_50_moving_avg=overview.get("day_50_moving_avg"),
        day_200_moving_avg=overview.get("day_200_moving_avg"),
        sector=overview.get("sector"),
        industry=overview.get("industry"),
        description=overview.get("description"),
        dedupe_hash=dedupe,
    )
    db.add(record)
    db.commit()
    logger.info("Stock fundamentals for %s (%s): saved", institution.institution_id, institution.ticker)
    return 1


# ============================================================================
# MAIN ORCHESTRATOR
# ============================================================================

def sync_all(
    institution_id: str = None,
    skip_sec: bool = False,
    skip_fdic: bool = False,
    skip_cfpb: bool = False,
    skip_fred: bool = False,
    skip_press: bool = False,
    skip_stocks: bool = False,
):
    """Run full finance data sync."""
    db = SessionLocal()
    try:
        query = db.query(TrackedInstitution).filter(TrackedInstitution.is_active == 1)
        if institution_id:
            query = query.filter(TrackedInstitution.institution_id == institution_id)

        institutions = query.all()
        if not institutions:
            logger.warning("No institutions found%s", f" for id={institution_id}" if institution_id else "")
            return

        logger.info("Syncing %d institution(s)...", len(institutions))

        totals = {"sec": 0, "fdic": 0, "cfpb": 0, "fred": 0, "press": 0, "stocks": 0}

        for inst in institutions:
            logger.info("--- %s (%s) ---", inst.display_name, inst.institution_id)
            try:
                if not skip_sec:
                    totals["sec"] += sync_sec_filings(inst, db)

                if not skip_fdic:
                    totals["fdic"] += sync_fdic_financials(inst, db)

                if not skip_cfpb:
                    totals["cfpb"] += sync_cfpb_complaints(inst, db)

                if not skip_fred:
                    totals["fred"] += sync_fred_observations(inst, db)

                if not skip_press:
                    totals["press"] += sync_fed_press(inst, db)

                if not skip_stocks:
                    totals["stocks"] += sync_stock_fundamentals(inst, db)

                # Update scheduling state
                inst.needs_ingest = 0
                inst.last_full_refresh_at = datetime.utcnow()
                db.commit()
            except Exception as e:
                logger.error("FAILED %s: %s", inst.institution_id, e)
                db.rollback()

        logger.info("=== SYNC COMPLETE ===")
        logger.info("New SEC filings: %d", totals["sec"])
        logger.info("New FDIC financials: %d", totals["fdic"])
        logger.info("New CFPB complaints: %d", totals["cfpb"])
        logger.info("New FRED observations: %d", totals["fred"])
        logger.info("New Fed press releases: %d", totals["press"])
        logger.info("New stock fundamentals: %d", totals["stocks"])

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync finance data from SEC, FDIC, CFPB, FRED, Fed RSS, Alpha Vantage")
    parser.add_argument("--institution-id", type=str, help="Sync only this institution")
    parser.add_argument("--skip-sec", action="store_true", help="Skip SEC EDGAR sync")
    parser.add_argument("--skip-fdic", action="store_true", help="Skip FDIC BankFind sync")
    parser.add_argument("--skip-cfpb", action="store_true", help="Skip CFPB Complaints sync")
    parser.add_argument("--skip-fred", action="store_true", help="Skip FRED observations sync")
    parser.add_argument("--skip-press", action="store_true", help="Skip Fed press releases sync")
    parser.add_argument("--skip-stocks", action="store_true", help="Skip Alpha Vantage stock fundamentals sync")
    args = parser.parse_args()

    sync_all(
        institution_id=args.institution_id,
        skip_sec=args.skip_sec,
        skip_fdic=args.skip_fdic,
        skip_cfpb=args.skip_cfpb,
        skip_fred=args.skip_fred,
        skip_press=args.skip_press,
        skip_stocks=args.skip_stocks,
    )
