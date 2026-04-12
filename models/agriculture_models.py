"""
Agriculture Sector Models

Tables for tracking agriculture companies (crop production, livestock, food processing,
agricultural services, farm equipment, seed/biotech), government contracts, lobbying,
enforcement, and SEC filings.
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


class TrackedAgricultureCompany(TrackedEntityMixin, Base):
    """
    Curated list of agriculture companies to monitor.
    """
    __tablename__ = "tracked_agriculture_companies"

    company_id = Column(String, unique=True, nullable=False, index=True)
    usda_entity_id = Column(String, nullable=True)  # USDA entity identifier


class SECAgricultureFiling(SECFilingMixin, Base):
    """
    SEC EDGAR filings for tracked agriculture companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_agriculture_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_agriculture_filings_accession"),
    )

    company_id = Column(String, ForeignKey("tracked_agriculture_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedAgricultureCompany", backref="sec_filings")


class AgricultureGovernmentContract(GovernmentContractMixin, Base):
    """
    Federal government contracts awarded to tracked agriculture companies.
    Data from USASpending.gov.
    """
    __tablename__ = "agriculture_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_agriculture_gov_contracts_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_agriculture_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedAgricultureCompany", backref="government_contracts")


class AgricultureLobbyingRecord(LobbyingRecordMixin, Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked agriculture companies.
    """
    __tablename__ = "agriculture_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_agriculture_lobbying_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_agriculture_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedAgricultureCompany", backref="lobbying_records")


class AgricultureEnforcement(EnforcementMixin, Base):
    """
    USDA/EPA/FDA/DOJ enforcement actions against tracked agriculture companies.
    """
    __tablename__ = "agriculture_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_agriculture_enforcement_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_agriculture_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedAgricultureCompany", backref="enforcement_actions")
