"""
Finance Sector Models

Tables for tracking financial institutions, SEC filings,
FDIC quarterly financials, and CFPB consumer complaints.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date,
    ForeignKey, UniqueConstraint, JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class TrackedInstitution(Base):
    """
    Curated list of financial institutions to monitor.
    Mirrors TrackedMember pattern from politics sector.
    """
    __tablename__ = "tracked_institutions"

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, unique=True, nullable=False, index=True)  # 'jpmorgan', 'goldman-sachs'
    display_name = Column(String, nullable=False, index=True)  # 'JPMorgan Chase & Co.'
    ticker = Column(String, nullable=True, index=True)  # 'JPM'
    sector_type = Column(String, nullable=False, index=True)  # 'bank', 'investment', 'insurance', 'fintech'

    # Cross-reference IDs for API lookups
    sec_cik = Column(String, nullable=True, index=True)  # SEC EDGAR CIK number (zero-padded 10 digits)
    fdic_cert = Column(String, nullable=True, index=True)  # FDIC certificate number
    cfpb_company_name = Column(String, nullable=True)  # Exact name used in CFPB database

    # Metadata
    logo_url = Column(String, nullable=True)
    headquarters = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, server_default="1", index=True)  # SQLite: 0=inactive, 1=active

    # AI-generated profile summary
    ai_profile_summary = Column(Text, nullable=True)

    # OpenSanctions status
    sanctions_status = Column(String, nullable=True)
    sanctions_data = Column(Text, nullable=True)
    sanctions_checked_at = Column(DateTime(timezone=True), nullable=True)

    # Scheduling state
    needs_ingest = Column(Integer, nullable=False, server_default="1", index=True)
    last_full_refresh_at = Column(DateTime(timezone=True), nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SECFiling(Base):
    """
    SEC EDGAR filings (10-K, 10-Q, 8-K, etc.) for tracked institutions.
    """
    __tablename__ = "sec_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_filings_accession"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    accession_number = Column(String, nullable=False, index=True)  # '0000019617-24-000032'
    form_type = Column(String, nullable=False, index=True)  # '10-K', '10-Q', '8-K', 'DEF 14A'
    filing_date = Column(Date, nullable=False, index=True)
    primary_doc_url = Column(String, nullable=True)  # Direct link to filing document
    filing_url = Column(String, nullable=True)  # SEC EDGAR index page URL

    # Optional extracted metadata
    description = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=True)  # Raw API response for debugging

    # Deduplication
    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    institution = relationship("TrackedInstitution", backref="sec_filings")


class SECInsiderTrade(Base):
    """
    SEC Form 4 insider trading disclosures.
    """
    __tablename__ = "sec_insider_trades"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_sec_insider_trades_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    filer_name = Column(String, nullable=False)
    filer_title = Column(String, nullable=True)  # 'CEO', 'CFO', 'Director'
    transaction_date = Column(Date, nullable=False, index=True)
    transaction_type = Column(String, nullable=True)  # 'P' (purchase), 'S' (sale), 'A' (award)
    shares = Column(Float, nullable=True)
    price_per_share = Column(Float, nullable=True)
    total_value = Column(Float, nullable=True)

    # Filing reference
    accession_number = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)

    metadata_json = Column(JSON, nullable=True)
    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    institution = relationship("TrackedInstitution", backref="insider_trades")


class FDICFinancial(Base):
    """
    FDIC BankFind quarterly financial snapshots.
    """
    __tablename__ = "fdic_financials"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_fdic_financials_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    report_date = Column(Date, nullable=False, index=True)  # End of quarter date

    # Key financial metrics (in thousands USD)
    total_assets = Column(Float, nullable=True)
    total_deposits = Column(Float, nullable=True)
    net_income = Column(Float, nullable=True)
    net_loans = Column(Float, nullable=True)

    # Performance ratios
    roa = Column(Float, nullable=True)  # Return on assets
    roe = Column(Float, nullable=True)  # Return on equity
    tier1_capital_ratio = Column(Float, nullable=True)
    efficiency_ratio = Column(Float, nullable=True)

    # Risk indicators
    noncurrent_loan_ratio = Column(Float, nullable=True)
    net_charge_off_ratio = Column(Float, nullable=True)

    metadata_json = Column(JSON, nullable=True)
    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    institution = relationship("TrackedInstitution", backref="fdic_financials")


class CFPBComplaint(Base):
    """
    CFPB consumer complaints filed against institutions.
    """
    __tablename__ = "cfpb_complaints"

    __table_args__ = (
        UniqueConstraint("complaint_id", name="uq_cfpb_complaints_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    complaint_id = Column(String, nullable=False, index=True)  # CFPB unique complaint ID
    date_received = Column(Date, nullable=False, index=True)
    product = Column(String, nullable=True, index=True)  # 'Credit card', 'Mortgage', etc.
    sub_product = Column(String, nullable=True)
    issue = Column(String, nullable=True, index=True)
    sub_issue = Column(String, nullable=True)

    # Company response
    company_response = Column(String, nullable=True)  # 'Closed with explanation', etc.
    timely_response = Column(String, nullable=True)  # 'Yes' or 'No'
    consumer_disputed = Column(String, nullable=True)

    # Optional narrative
    complaint_narrative = Column(Text, nullable=True)

    # State where complaint originated
    state = Column(String, nullable=True, index=True)

    metadata_json = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    institution = relationship("TrackedInstitution", backref="cfpb_complaints")


class FinanceLobbyingRecord(Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked financial institutions.
    """
    __tablename__ = "finance_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_finance_lobbying_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    filing_uuid = Column(String, nullable=True, index=True)
    filing_year = Column(Integer, nullable=False, index=True)
    filing_period = Column(String, nullable=True)  # 'Q1', 'Q2', 'H1', 'H2'
    income = Column(Float, nullable=True)
    expenses = Column(Float, nullable=True)
    registrant_name = Column(String, nullable=True, index=True)
    client_name = Column(String, nullable=True)
    lobbying_issues = Column(Text, nullable=True)
    government_entities = Column(Text, nullable=True)
    specific_issues = Column(Text, nullable=True)

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    institution = relationship("TrackedInstitution", backref="lobbying_records")


class FinanceGovernmentContract(Base):
    """
    Federal government contracts awarded to tracked financial institutions.
    Data from USASpending.gov.
    """
    __tablename__ = "finance_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_finance_gov_contracts_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    award_id = Column(String, nullable=True, index=True)
    award_amount = Column(Float, nullable=True, index=True)
    awarding_agency = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True)
    contract_type = Column(String, nullable=True, index=True)

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    institution = relationship("TrackedInstitution", backref="government_contracts")


class FinanceEnforcement(Base):
    """
    Enforcement actions against tracked financial institutions.
    Sources: CFPB enforcement, SEC enforcement, OCC consent orders.
    """
    __tablename__ = "finance_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_finance_enforcement_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)  # 'Civil Penalty', 'Consent Order', 'Cease and Desist'
    penalty_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # 'CFPB', 'SEC', 'OCC', 'DOJ'

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    institution = relationship("TrackedInstitution", backref="enforcement_actions")


class FREDObservation(Base):
    """
    FRED economic time series observations for the Federal Reserve.
    Tracks key macro indicators: fed funds rate, CPI, unemployment, etc.
    """
    __tablename__ = "fred_observations"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_fred_observations_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    series_id = Column(String, nullable=False, index=True)  # 'FEDFUNDS', 'CPIAUCSL', 'UNRATE'
    series_title = Column(String, nullable=True)  # Human-readable series name
    observation_date = Column(Date, nullable=False, index=True)
    value = Column(Float, nullable=True)  # The observation value (null for missing periods)
    units = Column(String, nullable=True)  # 'Percent', 'Index', etc.

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    institution = relationship("TrackedInstitution", backref="fred_observations")


class FedPressRelease(Base):
    """
    Federal Reserve press releases from RSS feed.
    Rate decisions, enforcement actions, regulatory changes.
    """
    __tablename__ = "fed_press_releases"

    __table_args__ = (
        UniqueConstraint("link", name="uq_fed_press_releases_link"),
    )

    id = Column(Integer, primary_key=True, index=True)
    institution_id = Column(String, ForeignKey("tracked_institutions.institution_id"), nullable=False, index=True)

    title = Column(Text, nullable=False)
    link = Column(String, nullable=False, index=True)
    published_at = Column(DateTime(timezone=True), nullable=True, index=True)
    category = Column(String, nullable=True, index=True)  # 'Monetary Policy', 'Enforcement Actions', etc.
    summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    institution = relationship("TrackedInstitution", backref="fed_press_releases")
