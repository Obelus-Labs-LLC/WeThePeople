"""
Telecommunications Sector Models

Tables for tracking telecom companies (wireless, broadband, cable, satellite,
fiber, voip, infrastructure), government contracts, lobbying,
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


class TrackedTelecomCompany(TrackedEntityMixin, Base):
    """
    Curated list of telecommunications companies to monitor.
    """
    __tablename__ = "tracked_telecom_companies"

    company_id = Column(String, unique=True, nullable=False, index=True)
    fcc_entity_id = Column(String, nullable=True)  # FCC entity identifier


class SECTelecomFiling(SECFilingMixin, Base):
    """
    SEC EDGAR filings for tracked telecom companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_telecom_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_telecom_filings_accession"),
    )

    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedTelecomCompany", backref="sec_filings")


class TelecomGovernmentContract(GovernmentContractMixin, Base):
    """
    Federal government contracts awarded to tracked telecom companies.
    Data from USASpending.gov.
    """
    __tablename__ = "telecom_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_telecom_gov_contracts_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedTelecomCompany", backref="government_contracts")


class TelecomLobbyingRecord(LobbyingRecordMixin, Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked telecom companies.
    """
    __tablename__ = "telecom_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_telecom_lobbying_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedTelecomCompany", backref="lobbying_records")


class TelecomEnforcement(EnforcementMixin, Base):
    """
    FCC/FTC/DOJ/State AG enforcement actions against tracked telecom companies.
    """
    __tablename__ = "telecom_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_telecom_enforcement_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_telecom_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedTelecomCompany", backref="enforcement_actions")
