"""
Technology Sector Models

Tables for tracking technology companies, SEC filings,
USPTO patents, and government contracts (USASpending).
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date,
    ForeignKey, UniqueConstraint, JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class TrackedTechCompany(Base):
    """
    Curated list of technology companies to monitor.
    Mirrors TrackedCompany pattern from health sector.
    """
    __tablename__ = "tracked_tech_companies"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, nullable=False, index=True)  # 'apple', 'alphabet'
    display_name = Column(String, nullable=False)  # 'Apple Inc.'
    ticker = Column(String, nullable=True, index=True)  # 'AAPL'
    sector_type = Column(String, nullable=False, index=True)  # 'platform', 'enterprise', 'semiconductor', 'automotive', 'media'

    # Cross-reference names/IDs for API lookups
    sec_cik = Column(String, nullable=True, index=True)  # SEC EDGAR CIK number (zero-padded 10 digits)
    uspto_assignee_name = Column(String, nullable=True)  # Exact assignee name in USPTO PatentsView
    usaspending_recipient_name = Column(String, nullable=True)  # Recipient name in USASpending.gov

    # Metadata
    logo_url = Column(String, nullable=True)
    headquarters = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, server_default="1", index=True)  # SQLite: 0=inactive, 1=active

    # Scheduling state
    needs_ingest = Column(Integer, nullable=False, server_default="1", index=True)
    last_full_refresh_at = Column(DateTime(timezone=True), nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SECTechFiling(Base):
    """
    SEC EDGAR filings for tracked tech companies (10-K, 10-Q, 8-K, etc.).
    Mirrors SECHealthFiling from health sector but FK to tracked_tech_companies.
    """
    __tablename__ = "sec_tech_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_tech_filings_accession"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    accession_number = Column(String, nullable=False, index=True)
    form_type = Column(String, nullable=False, index=True)  # '10-K', '10-Q', '8-K', 'DEF 14A'
    filing_date = Column(Date, nullable=True, index=True)
    primary_doc_url = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedTechCompany", backref="sec_filings")


class TechPatent(Base):
    """
    USPTO patents granted to tracked tech companies via PatentsView API.
    """
    __tablename__ = "tech_patents"

    __table_args__ = (
        UniqueConstraint("patent_number", name="uq_tech_patents_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    patent_number = Column(String, nullable=False, index=True)  # e.g. '11234567'
    patent_title = Column(Text, nullable=True)
    patent_date = Column(Date, nullable=True, index=True)  # Grant date
    patent_abstract = Column(Text, nullable=True)
    num_claims = Column(Integer, nullable=True)
    cpc_codes = Column(Text, nullable=True)  # Comma-separated CPC classification codes

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedTechCompany", backref="patents")


class GovernmentContract(Base):
    """
    Federal government contracts awarded to tracked tech companies.
    Data from USASpending.gov.
    """
    __tablename__ = "government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_government_contracts_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    award_id = Column(String, nullable=True, index=True)  # USASpending generated_internal_id
    award_amount = Column(Float, nullable=True, index=True)  # USD
    awarding_agency = Column(String, nullable=True, index=True)  # 'Department of Defense', etc.
    description = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True)
    contract_type = Column(String, nullable=True, index=True)  # 'Definitive Contract', etc.

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedTechCompany", backref="government_contracts")


class LobbyingRecord(Base):
    """
    Lobbying disclosure filings from the Senate LDA API.
    Each record represents one quarterly filing from a lobbying firm
    on behalf of a tracked tech company.
    """
    __tablename__ = "lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_lobbying_records_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    filing_uuid = Column(String, nullable=True, index=True)  # Senate LDA filing UUID
    filing_year = Column(Integer, nullable=False, index=True)
    filing_period = Column(String, nullable=True)  # 'Q1', 'Q2', 'Q3', 'Q4', 'Mid-Year', 'Year-End'
    income = Column(Float, nullable=True)  # Amount paid to lobbying firm this period (USD)
    expenses = Column(Float, nullable=True)  # Self-reported expenses if self-filing
    registrant_name = Column(String, nullable=True, index=True)  # Lobbying firm name
    client_name = Column(String, nullable=True)  # Client organization as filed
    lobbying_issues = Column(Text, nullable=True)  # Comma-separated issue codes
    government_entities = Column(Text, nullable=True)  # Comma-separated entities lobbied

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedTechCompany", backref="lobbying_records")


class FTCEnforcement(Base):
    """
    FTC/DOJ enforcement actions against tracked tech companies.
    Sourced from curated seed data + FTC Legal Library scraping.
    """
    __tablename__ = "ftc_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_ftc_enforcement_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)  # 'Consent Order', 'Federal Court', 'Administrative'
    penalty_amount = Column(Float, nullable=True)  # USD fine/penalty amount
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # 'FTC', 'DOJ', 'FTC/State AGs'

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedTechCompany", backref="enforcement_actions")
