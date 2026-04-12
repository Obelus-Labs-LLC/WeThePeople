"""
Defense Sector Models

Tables for tracking defense prime contractors, subcontractors, aerospace defense,
cybersecurity, shipbuilding, munitions, intelligence, and logistics companies,
government contracts, lobbying, enforcement (DOD/DCAA/ITAR), and SEC filings.
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


class TrackedDefenseCompany(TrackedEntityMixin, Base):
    """
    Curated list of defense companies to monitor.
    """
    __tablename__ = "tracked_defense_companies"

    company_id = Column(String, unique=True, nullable=False, index=True)
    website = Column(String, nullable=True)  # Reserved for future use (company profile links, logo fallback)


class SECDefenseFiling(SECFilingMixin, Base):
    """
    SEC EDGAR filings for tracked defense companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_defense_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_defense_filings_accession"),
    )

    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedDefenseCompany", backref="sec_filings")


class DefenseGovernmentContract(GovernmentContractMixin, Base):
    """
    Federal government contracts awarded to tracked defense companies.
    Data from USASpending.gov.
    """
    __tablename__ = "defense_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_defense_gov_contracts_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedDefenseCompany", backref="government_contracts")


class DefenseLobbyingRecord(LobbyingRecordMixin, Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked defense companies.
    """
    __tablename__ = "defense_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_defense_lobbying_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedDefenseCompany", backref="lobbying_records")


class DefenseEnforcement(EnforcementMixin, Base):
    """
    DOD/DCAA/ITAR enforcement actions against tracked defense companies.
    """
    __tablename__ = "defense_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_defense_enforcement_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_defense_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedDefenseCompany", backref="enforcement_actions")
