"""
Chemicals Sector Models

Tables for tracking chemical companies (diversified, specialty, agrochemical,
petrochemical, industrial gas), government contracts, lobbying, enforcement,
and SEC filings.
"""

from sqlalchemy import (
    Column, String, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship

from models.database import Base
from models.sector_mixins import (
    TrackedEntityMixin, SECFilingMixin, GovernmentContractMixin,
    LobbyingRecordMixin, EnforcementMixin,
)


class TrackedChemicalCompany(TrackedEntityMixin, Base):
    """
    Curated list of chemical companies to monitor.
    """
    __tablename__ = "tracked_chemical_companies"

    company_id = Column(String, unique=True, nullable=False, index=True)
    epa_registry_id = Column(String, nullable=True)  # EPA Facility Registry ID


class SECChemicalFiling(SECFilingMixin, Base):
    """
    SEC EDGAR filings for tracked chemical companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_chemical_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_chemical_filings_accession"),
    )

    company_id = Column(String, ForeignKey("tracked_chemical_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedChemicalCompany", backref="sec_filings")


class ChemicalGovernmentContract(GovernmentContractMixin, Base):
    """
    Federal government contracts awarded to tracked chemical companies.
    Data from USASpending.gov.
    """
    __tablename__ = "chemical_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_chemical_gov_contracts_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_chemical_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedChemicalCompany", backref="government_contracts")


class ChemicalLobbyingRecord(LobbyingRecordMixin, Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked chemical companies.
    """
    __tablename__ = "chemical_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_chemical_lobbying_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_chemical_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedChemicalCompany", backref="lobbying_records")


class ChemicalEnforcement(EnforcementMixin, Base):
    """
    EPA/OSHA/DOJ enforcement actions against tracked chemical companies.
    """
    __tablename__ = "chemical_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_chemical_enforcement_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_chemical_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedChemicalCompany", backref="enforcement_actions")
