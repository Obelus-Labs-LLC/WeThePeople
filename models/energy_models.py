"""
Energy Sector Models

Tables for tracking oil, gas, and energy companies,
EPA emissions, government contracts, lobbying, enforcement, and SEC filings.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date,
    ForeignKey, UniqueConstraint
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base
from models.sector_mixins import (
    TrackedEntityMixin, SECFilingMixin, GovernmentContractMixin,
    LobbyingRecordMixin, EnforcementMixin,
)


class TrackedEnergyCompany(TrackedEntityMixin, Base):
    """
    Curated list of oil, gas, and energy companies to monitor.
    """
    __tablename__ = "tracked_energy_companies"

    company_id = Column(String, unique=True, nullable=False, index=True)
    epa_facility_id = Column(String, nullable=True)  # EPA GHGRP facility ID
    eia_company_id = Column(String, nullable=True)  # EIA company identifier


class SECEnergyFiling(SECFilingMixin, Base):
    """
    SEC EDGAR filings for tracked energy companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_energy_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_energy_filings_accession"),
    )

    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

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
    facility_id_epa = Column(String, nullable=True, index=True)  # EPA GHGRP facility ID
    facility_city = Column(String, nullable=True)
    facility_state = Column(String, nullable=True, index=True)
    reporting_year = Column(Integer, nullable=False, index=True)
    total_emissions = Column(Float, nullable=True)  # metric tons CO2e
    emission_type = Column(String, nullable=True, index=True)  # 'CO2', 'CH4', 'N2O', 'Total GHG'
    industry_type = Column(String, nullable=True)  # 'Petroleum Refining', 'Power Plants', etc.
    source_url = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedEnergyCompany", backref="emissions")


class EnergyGovernmentContract(GovernmentContractMixin, Base):
    """
    Federal government contracts awarded to tracked energy companies.
    Data from USASpending.gov.
    """
    __tablename__ = "energy_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_energy_gov_contracts_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedEnergyCompany", backref="government_contracts")


class EnergyLobbyingRecord(LobbyingRecordMixin, Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked energy companies.
    """
    __tablename__ = "energy_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_energy_lobbying_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedEnergyCompany", backref="lobbying_records")


class EnergyEnforcement(EnforcementMixin, Base):
    """
    EPA/FERC/DOJ enforcement actions against tracked energy companies.
    """
    __tablename__ = "energy_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_energy_enforcement_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_energy_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedEnergyCompany", backref="enforcement_actions")
