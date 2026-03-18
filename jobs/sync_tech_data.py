"""
Technology Sector Data Sync Job

Fetches data from SEC EDGAR, USPTO PatentsView, USASpending.gov,
and Alpha Vantage. Ingests with deduplication.

Usage:
    python jobs/sync_tech_data.py
    python jobs/sync_tech_data.py --company-id apple
    python jobs/sync_tech_data.py --skip-sec --skip-patents
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime, date

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models import database  # noqa: F401
import models.tech_models  # noqa: F401
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
from connectors.sec_edgar import fetch_company_submissions, extract_filings
from connectors.patentsview import fetch_patents
from connectors.usaspending import fetch_contracts
from connectors.alpha_vantage import fetch_company_overview
from connectors.senate_lda import fetch_lobbying_filings
from connectors.ftc_cases import fetch_ftc_cases, get_curated_enforcement_actions
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
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        pass
    try:
        if len(s) >= 8 and s[:8].isdigit():
            return datetime.strptime(s[:8], "%Y%m%d").date()
    except (ValueError, TypeError):
        pass
    return None


def sync_sec_filings(company: TrackedTechCompany, db) -> int:
    """Sync SEC filings for tech companies with sec_cik."""
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
        exists = db.query(SECTechFiling).filter_by(dedupe_hash=dedupe).first()
        if exists:
            continue

        record = SECTechFiling(
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


def sync_patents(company: TrackedTechCompany, db) -> int:
    """Sync USPTO patents from PatentsView for tech companies."""
    if not company.uspto_assignee_name:
        logger.info("Skipping patents for %s (no assignee name)", company.company_id)
        return 0

    patents = fetch_patents(company.uspto_assignee_name)
    inserted = 0
    for p in patents:
        # Dedupe on patent_number (unique constraint)
        exists = db.query(TechPatent).filter_by(patent_number=p["patent_number"]).first()
        if exists:
            continue

        record = TechPatent(
            company_id=company.company_id,
            patent_number=p["patent_number"],
            patent_title=p.get("patent_title"),
            patent_date=_parse_date(p.get("patent_date")),
            patent_abstract=p.get("patent_abstract"),
            num_claims=p.get("num_claims"),
            cpc_codes=p.get("cpc_codes"),
            dedupe_hash=p["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("Patents for %s: %d new of %d total", company.company_id, inserted, len(patents))
    return inserted


def sync_government_contracts(company: TrackedTechCompany, db) -> int:
    """Sync federal government contracts from USASpending.gov."""
    if not company.usaspending_recipient_name:
        logger.info("Skipping contracts for %s (no recipient name)", company.company_id)
        return 0

    contracts = fetch_contracts(company.usaspending_recipient_name)
    inserted = 0
    for c in contracts:
        # Dedupe on hash
        exists = db.query(GovernmentContract).filter_by(dedupe_hash=c["dedupe_hash"]).first()
        if exists:
            continue

        record = GovernmentContract(
            company_id=company.company_id,
            award_id=c.get("award_id"),
            award_amount=c.get("award_amount"),
            awarding_agency=c.get("awarding_agency"),
            description=c.get("description"),
            start_date=_parse_date(c.get("start_date")),
            end_date=_parse_date(c.get("end_date")),
            contract_type=c.get("contract_type"),
            dedupe_hash=c["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("Contracts for %s: %d new of %d total", company.company_id, inserted, len(contracts))
    return inserted


def sync_stock_fundamentals(company: TrackedTechCompany, db) -> int:
    """Ingest stock fundamentals from Alpha Vantage for tech companies with tickers."""
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
        entity_type="tech_company",
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


def sync_lobbying(company: TrackedTechCompany, db) -> int:
    """Sync lobbying disclosure filings from Senate LDA."""
    # Use the usaspending_recipient_name as-is for LDA client_name lookup
    # (these are typically uppercase corporate names like 'APPLE INC.')
    client_name = company.usaspending_recipient_name or company.display_name
    filings = fetch_lobbying_filings(client_name)
    inserted = 0
    for f in filings:
        exists = db.query(LobbyingRecord).filter_by(dedupe_hash=f["dedupe_hash"]).first()
        if exists:
            continue

        record = LobbyingRecord(
            company_id=company.company_id,
            filing_uuid=f.get("filing_uuid"),
            filing_year=f.get("filing_year"),
            filing_period=f.get("filing_period"),
            income=f.get("income"),
            expenses=f.get("expenses"),
            registrant_name=f.get("registrant_name"),
            client_name=f.get("client_name"),
            lobbying_issues=f.get("lobbying_issues"),
            government_entities=f.get("government_entities"),
            dedupe_hash=f["dedupe_hash"],
        )
        db.add(record)
        inserted += 1

    if inserted:
        db.commit()
    logger.info("Lobbying for %s: %d new of %d total", company.company_id, inserted, len(filings))
    return inserted


def sync_ftc_enforcement(company: TrackedTechCompany, db) -> int:
    """Sync FTC/DOJ enforcement actions from curated data + scraping."""
    inserted = 0
    seen_hashes = set()

    # 1. Load curated seed data first
    curated = get_curated_enforcement_actions(company.company_id)
    for a in curated:
        h = a["dedupe_hash"]
        if h in seen_hashes:
            continue
        exists = db.query(FTCEnforcement).filter_by(dedupe_hash=h).first()
        if exists:
            seen_hashes.add(h)
            continue

        record = FTCEnforcement(
            company_id=company.company_id,
            case_title=a["case_title"],
            case_date=_parse_date(a.get("case_date")),
            case_url=a.get("case_url"),
            enforcement_type=a.get("enforcement_type"),
            penalty_amount=a.get("penalty_amount"),
            description=a.get("description"),
            source=a.get("source"),
            dedupe_hash=h,
        )
        db.add(record)
        seen_hashes.add(h)
        inserted += 1

    # Commit curated before scraping to avoid unique constraint issues
    if inserted:
        db.commit()

    # 2. Scrape FTC Legal Library for additional cases
    search_name = company.display_name.split(",")[0].strip()
    scraped = fetch_ftc_cases(search_name)
    scraped_inserted = 0
    for s in scraped:
        h = s["dedupe_hash"]
        if h in seen_hashes:
            continue
        exists = db.query(FTCEnforcement).filter_by(dedupe_hash=h).first()
        if exists:
            seen_hashes.add(h)
            continue

        record = FTCEnforcement(
            company_id=company.company_id,
            case_title=s["case_title"],
            case_date=_parse_date(s.get("case_date")),
            case_url=s.get("case_url"),
            enforcement_type=s.get("enforcement_type"),
            penalty_amount=s.get("penalty_amount"),
            description=s.get("description"),
            source="FTC",
            dedupe_hash=h,
        )
        db.add(record)
        seen_hashes.add(h)
        scraped_inserted += 1

    if scraped_inserted:
        db.commit()
    inserted += scraped_inserted
    logger.info("FTC enforcement for %s: %d new (%d curated + %d scraped)",
                company.company_id, inserted, len(curated), len(scraped))
    return inserted


def sync_all(
    company_id: str = None,
    skip_sec: bool = False,
    skip_patents: bool = False,
    skip_contracts: bool = False,
    skip_stocks: bool = False,
    skip_lobbying: bool = False,
    skip_ftc: bool = False,
):
    """Run full sync for all (or one) tracked tech companies."""
    db = SessionLocal()
    try:
        query = db.query(TrackedTechCompany).filter(TrackedTechCompany.is_active == 1)
        if company_id:
            query = query.filter(TrackedTechCompany.company_id == company_id)

        companies = query.all()
        logger.info("Syncing %d tech company(ies)...", len(companies))

        totals = {"sec_filings": 0, "patents": 0, "contracts": 0, "stocks": 0, "lobbying": 0, "ftc": 0}

        for company in companies:
            logger.info("--- %s (%s) ---", company.display_name, company.company_id)

            if not skip_sec:
                totals["sec_filings"] += sync_sec_filings(company, db)

            if not skip_patents:
                totals["patents"] += sync_patents(company, db)

            if not skip_contracts:
                totals["contracts"] += sync_government_contracts(company, db)

            if not skip_stocks:
                totals["stocks"] += sync_stock_fundamentals(company, db)

            if not skip_lobbying:
                totals["lobbying"] += sync_lobbying(company, db)

            if not skip_ftc:
                totals["ftc"] += sync_ftc_enforcement(company, db)

            # Update scheduling state
            company.needs_ingest = 0
            company.last_full_refresh_at = datetime.utcnow()
            db.commit()

        logger.info("=== TECH SYNC COMPLETE ===")
        for k, v in totals.items():
            logger.info("New %s: %d", k, v)

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync tech sector data")
    parser.add_argument("--company-id", type=str, help="Sync a single company")
    parser.add_argument("--skip-sec", action="store_true", help="Skip SEC EDGAR filings")
    parser.add_argument("--skip-patents", action="store_true", help="Skip USPTO patents")
    parser.add_argument("--skip-contracts", action="store_true", help="Skip USASpending contracts")
    parser.add_argument("--skip-stocks", action="store_true", help="Skip Alpha Vantage stock fundamentals")
    parser.add_argument("--skip-lobbying", action="store_true", help="Skip Senate LDA lobbying data")
    parser.add_argument("--skip-ftc", action="store_true", help="Skip FTC/DOJ enforcement actions")
    args = parser.parse_args()

    sync_all(
        company_id=args.company_id,
        skip_sec=args.skip_sec,
        skip_patents=args.skip_patents,
        skip_contracts=args.skip_contracts,
        skip_stocks=args.skip_stocks,
        skip_lobbying=args.skip_lobbying,
        skip_ftc=args.skip_ftc,
    )
