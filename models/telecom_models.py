"""
Telecommunications Sector Models

Tables for tracking telecom companies (wireless, broadband, cable, satellite,
fiber, voip, infrastructure), government contracts, lobbying,
enforcement, and SEC filings.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date,
    ForeignKey, UniqueConstraint, JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class TrackedTelecomCompany(Base):
    """
    Curated list of telecommunications companies to monitor.
    """
    __tablename__ = "tracked_telecom_companies"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String, nullable=False)
    ticker = Column(String, nullable=True, index=True)
    sector_type = Column(String, nullable=False, index=True)  # 'wireless', 'broadband', 'cable', 'satellite', 'fiber', 'voip', 'infrastructure'

    # Cross-reference names/IDs for API lookups
    sec_cik = Column(String, nullable=True, index=True)
    usaspending_recipient_name = Column(String, nullable=True)
    fcc_entity_id = Column(String, nullable=True)  # FCC entity identifier

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


class SECTelecomFiling(Base):
    """
    SEC EDGAR filings for tracked telecom companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_telecom_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_telecom_filings_accession"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

    accession_number = Column(String, nullable=False, index=True)
    form_type = Column(String, nullable=False, index=True)
    filing_date = Column(Date, nullable=True, index=True)
    primary_doc_url = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTelecomCompany", backref="sec_filings")


class TelecomGovernmentContract(Base):
    """
    Federal government contracts awarded to tracked telecom companies.
    Data from USASpending.gov.
    """
    __tablename__ = "telecom_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_telecom_gov_contracts_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

    award_id = Column(String, nullable=True, index=True)
    award_amount = Column(Float, nullable=True, index=True)
    awarding_agency = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True)
    contract_type = Column(String, nullable=True, index=True)

    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTelecomCompany", backref="government_contracts")


class TelecomLobbyingRecord(Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked telecom companies.
    """
    __tablename__ = "telecom_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_telecom_lobbying_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

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

    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTelecomCompany", backref="lobbying_records")


class TelecomEnforcement(Base):
    """
    FCC/FTC/DOJ/State AG enforcement actions against tracked telecom companies.
    """
    __tablename__ = "telecom_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_telecom_enforcement_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)  # 'Civil Penalty', 'Consent Decree', 'Administrative Order'
    penalty_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # 'FCC', 'FTC', 'DOJ', 'State AG'

    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTelecomCompany", backref="enforcement_actions")
