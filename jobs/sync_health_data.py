"""
Health Sector Data Sync Job

Fetches data from FDA openFDA, ClinicalTrials.gov, CMS Open Payments,
SEC EDGAR, and Alpha Vantage. Ingests with deduplication.

Usage:
    python jobs/sync_health_data.py
    python jobs/sync_health_data.py --company-id pfizer
    python jobs/sync_health_data.py --skip-fda --skip-trials
    python jobs/sync_health_data.py --company-id unitedhealth --skip-fda --skip-trials --skip-cms
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime, date

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

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
from connectors.openfda import fetch_adverse_events, fetch_recalls
from connectors.clinicaltrials import fetch_trials
from connectors.cms_payments import fetch_payments
from connectors.sec_edgar import fetch_company_submissions, extract_filings
from connectors.alpha_vantage import fetch_company_overview
from utils.logging import get_logger, setup_logging

setup_logging()
logger = get_logger(__name__)


def _parse_date(val) -> date | None:
    """Parse YYYY-MM-DD string or return None. Handles YYYYMMDD too."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()
    # Try YYYY-MM-DD
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        pass
    # Try YYYYMMDD
    try:
        if len(s) >= 8 and s[:8].isdigit():
            return datetime.strptime(s[:8], "%Y%m%d").date()
    except (ValueError, TypeError):
        pass
    return None


def sync_fda_adverse_events(company: TrackedCompany, db) -> int:
    """Sync FDA adverse event reports for a company."""
    if not company.fda_manufacturer_name:
        logger.info("Skipping FDA events for %s (no manufacturer name)", company.company_id)
        return 0

    events = fetch_adverse_events(company.fda_manufacturer_name)
    inserted = 0
    for ev in events:
        # Dedupe check
        exists = db.query(FDAAdverseEvent).filter_by(report_id=ev["report_id"]).first()
        if exists:
            continue

        record = FDAAdverseEvent(
            company_id=company.company_id,
            report_id=ev["report_id"],
            receive_date=_parse_date(ev.get("receive_date")),
            serious=ev.get("serious"),
            drug_name=ev.get("drug_name"),
            reaction=ev.get("reaction"),
            outcome=ev.get("outcome"),
            raw_json=ev.get("raw_json"),
            dedupe_hash=ev["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("FDA events for %s: %d new of %d total", company.company_id, inserted, len(events))
    return inserted


def sync_fda_recalls(company: TrackedCompany, db) -> int:
    """Sync FDA recall/enforcement actions for a company."""
    if not company.fda_manufacturer_name:
        logger.info("Skipping FDA recalls for %s (no manufacturer name)", company.company_id)
        return 0

    recalls = fetch_recalls(company.fda_manufacturer_name)
    inserted = 0
    for rc in recalls:
        # Dedupe check
        exists = db.query(FDARecall).filter_by(dedupe_hash=rc["dedupe_hash"]).first()
        if exists:
            continue

        record = FDARecall(
            company_id=company.company_id,
            recall_number=rc.get("recall_number"),
            classification=rc.get("classification"),
            recall_initiation_date=_parse_date(rc.get("recall_initiation_date")),
            product_description=rc.get("product_description"),
            reason_for_recall=rc.get("reason_for_recall"),
            status=rc.get("status"),
            raw_json=rc.get("raw_json"),
            dedupe_hash=rc["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("FDA recalls for %s: %d new of %d total", company.company_id, inserted, len(recalls))
    return inserted


def sync_clinical_trials(company: TrackedCompany, db) -> int:
    """Sync clinical trials from ClinicalTrials.gov for a company."""
    if not company.ct_sponsor_name:
        logger.info("Skipping trials for %s (no sponsor name)", company.company_id)
        return 0

    trials = fetch_trials(company.ct_sponsor_name)
    inserted = 0
    for tr in trials:
        # Dedupe on nct_id
        exists = db.query(ClinicalTrial).filter_by(nct_id=tr["nct_id"]).first()
        if exists:
            continue

        record = ClinicalTrial(
            company_id=company.company_id,
            nct_id=tr["nct_id"],
            title=tr.get("title"),
            overall_status=tr.get("overall_status"),
            phase=tr.get("phase"),
            start_date=_parse_date(tr.get("start_date")),
            conditions=tr.get("conditions"),
            interventions=tr.get("interventions"),
            enrollment=tr.get("enrollment"),
            dedupe_hash=tr["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("Trials for %s: %d new of %d total", company.company_id, inserted, len(trials))
    return inserted


def sync_cms_payments(company: TrackedCompany, db) -> int:
    """Sync CMS Open Payments records for a company."""
    if not company.cms_company_name:
        logger.info("Skipping CMS payments for %s (no company name)", company.company_id)
        return 0

    payments = fetch_payments(company.cms_company_name)
    inserted = 0
    for pay in payments:
        # Dedupe on record_id
        exists = db.query(CMSPayment).filter_by(record_id=pay["record_id"]).first()
        if exists:
            continue

        record = CMSPayment(
            company_id=company.company_id,
            record_id=pay["record_id"],
            payment_date=_parse_date(pay.get("payment_date")),
            amount=pay.get("amount"),
            payment_nature=pay.get("payment_nature"),
            physician_name=pay.get("physician_name"),
            physician_specialty=pay.get("physician_specialty"),
            state=pay.get("state"),
            dedupe_hash=pay["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("CMS payments for %s: %d new of %d total", company.company_id, inserted, len(payments))
    return inserted


def sync_sec_filings(company: TrackedCompany, db) -> int:
    """Sync SEC filings for companies with sec_cik (insurers, pharma, etc.)."""
    if not company.sec_cik:
        logger.info("Skipping SEC for %s (no CIK)", company.company_id)
        return 0

    submissions = fetch_company_submissions(company.sec_cik)
    if not submissions:
        return 0

    filings = extract_filings(
        submissions,
        form_types=["10-K", "10-Q", "8-K", "DEF 14A", "S-1"],
    )

    inserted = 0
    for f in filings:
        dedupe = f["dedupe_hash"]
        exists = db.query(SECHealthFiling).filter_by(accession_number=f["accession_number"]).first()
        if exists:
            continue

        record = SECHealthFiling(
            company_id=company.company_id,
            accession_number=f["accession_number"],
            form_type=f["form_type"],
            filing_date=_parse_date(f.get("filing_date")),
            primary_doc_url=f.get("filing_url"),
            filing_url=f.get("index_url"),
            description=f.get("description"),
            dedupe_hash=dedupe,
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("SEC filings for %s: %d new of %d total", company.company_id, inserted, len(filings))
    return inserted


def sync_stock_fundamentals(company: TrackedCompany, db) -> int:
    """Ingest stock fundamentals from Alpha Vantage for companies with tickers."""
    if not company.ticker:
        logger.info("Skipping stock for %s (no ticker)", company.company_id)
        return 0

    overview = fetch_company_overview(company.ticker)
    if not overview:
        return 0

    dedupe = overview["dedupe_hash"]
    exists = db.query(StockFundamentals).filter_by(dedupe_hash=dedupe).first()
    if exists:
        return 0

    record = StockFundamentals(
        entity_type="company",
        entity_id=company.company_id,
        ticker=company.ticker,
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
    logger.info("Stock fundamentals for %s (%s): saved", company.company_id, company.ticker)
    return 1


def sync_all(
    company_id: str = None,
    skip_fda: bool = False,
    skip_trials: bool = False,
    skip_cms: bool = False,
    skip_sec: bool = False,
    skip_stocks: bool = False,
):
    """Run full sync for all (or one) tracked companies."""
    db = SessionLocal()
    try:
        query = db.query(TrackedCompany).filter(TrackedCompany.is_active == 1)
        if company_id:
            query = query.filter(TrackedCompany.company_id == company_id)

        companies = query.all()
        logger.info("Syncing %d company(ies)...", len(companies))

        totals = {"fda_events": 0, "fda_recalls": 0, "trials": 0, "cms_payments": 0, "sec_filings": 0, "stocks": 0}

        for company in companies:
            cid = company.company_id
            logger.info("--- %s (%s) ---", company.display_name, cid)
            try:
                if not skip_fda:
                    totals["fda_events"] += sync_fda_adverse_events(company, db)
                    totals["fda_recalls"] += sync_fda_recalls(company, db)

                if not skip_trials:
                    totals["trials"] += sync_clinical_trials(company, db)

                if not skip_cms:
                    totals["cms_payments"] += sync_cms_payments(company, db)

                if not skip_sec:
                    totals["sec_filings"] += sync_sec_filings(company, db)

                if not skip_stocks:
                    totals["stocks"] += sync_stock_fundamentals(company, db)

                # Update scheduling state
                company.needs_ingest = 0
                company.last_full_refresh_at = datetime.utcnow()
                db.commit()
            except Exception as e:
                logger.error("FAILED %s: %s", cid, e)
                db.rollback()

        logger.info("=== SYNC COMPLETE ===")
        logger.info("New FDA adverse events: %d", totals["fda_events"])
        logger.info("New FDA recalls: %d", totals["fda_recalls"])
        logger.info("New clinical trials: %d", totals["trials"])
        logger.info("New CMS payments: %d", totals["cms_payments"])
        logger.info("New SEC filings: %d", totals["sec_filings"])
        logger.info("New stock fundamentals: %d", totals["stocks"])

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync health sector data")
    parser.add_argument("--company-id", type=str, help="Sync a single company")
    parser.add_argument("--skip-fda", action="store_true", help="Skip FDA data")
    parser.add_argument("--skip-trials", action="store_true", help="Skip ClinicalTrials.gov")
    parser.add_argument("--skip-cms", action="store_true", help="Skip CMS Open Payments")
    parser.add_argument("--skip-sec", action="store_true", help="Skip SEC EDGAR filings")
    parser.add_argument("--skip-stocks", action="store_true", help="Skip Alpha Vantage stock fundamentals")
    args = parser.parse_args()

    sync_all(
        company_id=args.company_id,
        skip_fda=args.skip_fda,
        skip_trials=args.skip_trials,
        skip_cms=args.skip_cms,
        skip_sec=args.skip_sec,
        skip_stocks=args.skip_stocks,
    )
