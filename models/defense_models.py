"""
Defense Sector Models

Tables for tracking defense prime contractors, subcontractors, aerospace defense,
cybersecurity, shipbuilding, munitions, intelligence, and logistics companies,
government contracts, lobbying, enforcement (DOD/DCAA/ITAR), and SEC filings.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date, Boolean,
    ForeignKey, UniqueConstraint, JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class TrackedDefenseCompany(Base):
    """
    Curated list of defense companies to monitor.
    """
    __tablename__ = "tracked_defense_companies"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, nullable=False, index=True)  # 'lockheed-martin', 'rtx'
    display_name = Column(String, nullable=False)  # 'Lockheed Martin Corporation'
    ticker = Column(String, nullable=True, index=True)  # 'LMT'
    sector_type = Column(String, nullable=False, index=True)  # 'defense_prime', 'defense_sub', 'aerospace_defense', 'cybersecurity', 'shipbuilding', 'munitions', 'intelligence', 'logistics_defense'

    # Cross-reference names/IDs for API lookups.
    sec_cik = Column(String, nullable=True, index=True)
    usaspending_recipient_name = Column(String, nullable=True)
    website = Column(String, nullable=True)  # Reserved for future use (company profile links, logo fallback)

    # Metadata
    logo_url = Column(String, nullable=True)
    headquarters = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, server_default="1", index=True)

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


class SECDefenseFiling(Base):
    """
    SEC EDGAR filings for tracked defense companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_defense_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_defense_filings_accession"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

    accession_number = Column(String, nullable=False, index=True)
    form_type = Column(String, nullable=False, index=True)
    filing_date = Column(Date, nullable=True, index=True)
    primary_doc_url = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedDefenseCompany", backref="sec_filings")


class DefenseGovernmentContract(Base):
    """
    Federal government contracts awarded to tracked defense companies.
    Data from USASpending.gov.
    """
    __tablename__ = "defense_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_defense_gov_contracts_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

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

    company = relationship("TrackedDefenseCompany", backref="government_contracts")


class DefenseLobbyingRecord(Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked defense companies.
    """
    __tablename__ = "defense_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_defense_lobbying_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

    filing_uuid = Column(String, nullable=True, index=True)
    filing_year = Column(Integer, nullable=False, index=True)
    filing_period = Column(String, nullable=True)
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

    company = relationship("TrackedDefenseCompany", backref="lobbying_records")


class DefenseEnforcement(Base):
    """
    DOD/DCAA/ITAR enforcement actions against tracked defense companies.
    """
    __tablename__ = "defense_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_defense_enforcement_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)  # 'Civil Penalty', 'Consent Decree', 'Debarment', 'ITAR Violation', etc.
    penalty_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # 'DOD', 'DCAA', 'DDTC', 'DOD_IG', 'DOJ'

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedDefenseCompany", backref="enforcement_actions")
