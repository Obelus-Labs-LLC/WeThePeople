"""
Energy Sector Models

Tables for tracking oil, gas, and energy companies,
EPA emissions, government contracts, lobbying, enforcement, and SEC filings.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date,
    ForeignKey, UniqueConstraint, JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class TrackedEnergyCompany(Base):
    """
    Curated list of oil, gas, and energy companies to monitor.
    """
    __tablename__ = "tracked_energy_companies"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, nullable=False, index=True)  # 'exxonmobil', 'chevron'
    display_name = Column(String, nullable=False)  # 'ExxonMobil Corporation'
    ticker = Column(String, nullable=True, index=True)  # 'XOM'
    sector_type = Column(String, nullable=False, index=True)  # 'oil_gas', 'utility', 'renewable', 'pipeline', 'services'

    # Cross-reference names/IDs for API lookups
    sec_cik = Column(String, nullable=True, index=True)
    epa_facility_id = Column(String, nullable=True)  # EPA GHGRP facility ID
    usaspending_recipient_name = Column(String, nullable=True)
    eia_company_id = Column(String, nullable=True)  # EIA company identifier

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


class SECEnergyFiling(Base):
    """
    SEC EDGAR filings for tracked energy companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_energy_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_energy_filings_accession"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

    accession_number = Column(String, nullable=False, index=True)
    form_type = Column(String, nullable=False, index=True)
    filing_date = Column(Date, nullable=True, index=True)
    primary_doc_url = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedEnergyCompany", backref="sec_filings")


class EnergyEmission(Base):
    """
    EPA Greenhouse Gas Reporting Program (GHGRP) emissions data.
    """
    __tablename__ = "energy_emissions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_energy_emissions_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

    facility_name = Column(String, nullable=True)
    facility_state = Column(String, nullable=True, index=True)
    reporting_year = Column(Integer, nullable=False, index=True)
    total_emissions = Column(Float, nullable=True)  # metric tons CO2e
    emission_type = Column(String, nullable=True, index=True)  # 'CO2', 'CH4', 'N2O', 'Total GHG'
    industry_type = Column(String, nullable=True)  # 'Petroleum Refining', 'Power Plants', etc.
    source_url = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedEnergyCompany", backref="emissions")


class EnergyGovernmentContract(Base):
    """
    Federal government contracts awarded to tracked energy companies.
    Data from USASpending.gov.
    """
    __tablename__ = "energy_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_energy_gov_contracts_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

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

    company = relationship("TrackedEnergyCompany", backref="government_contracts")


class EnergyLobbyingRecord(Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked energy companies.
    """
    __tablename__ = "energy_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_energy_lobbying_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

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

    company = relationship("TrackedEnergyCompany", backref="lobbying_records")


class EnergyEnforcement(Base):
    """
    EPA/FERC/DOJ enforcement actions against tracked energy companies.
    """
    __tablename__ = "energy_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_energy_enforcement_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)  # 'Civil Penalty', 'Consent Decree', 'Administrative Order'
    penalty_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # 'EPA', 'FERC', 'DOJ', 'State AG'

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedEnergyCompany", backref="enforcement_actions")
