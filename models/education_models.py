"""
Education Sector Models

Tables for tracking education companies (higher ed services, K-12 services, edtech,
student lending, for-profit colleges, publishing, testing), government contracts,
lobbying, enforcement, and SEC filings.
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


class TrackedEducationCompany(TrackedEntityMixin, Base):
    """
    Curated list of education companies to monitor.
    """
    __tablename__ = "tracked_education_companies"

    company_id = Column(String, unique=True, nullable=False, index=True)


class SECEducationFiling(SECFilingMixin, Base):
    """
    SEC EDGAR filings for tracked education companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_education_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_education_filings_accession"),
    )

    company_id = Column(String, ForeignKey("tracked_education_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedEducationCompany", backref="sec_filings")


class EducationGovernmentContract(GovernmentContractMixin, Base):
    """
    Federal government contracts awarded to tracked education companies.
    Data from USASpending.gov.
    """
    __tablename__ = "education_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_education_gov_contracts_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_education_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedEducationCompany", backref="government_contracts")


class EducationLobbyingRecord(LobbyingRecordMixin, Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked education companies.
    """
    __tablename__ = "education_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_education_lobbying_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_education_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedEducationCompany", backref="lobbying_records")


class EducationEnforcement(EnforcementMixin, Base):
    """
    Dept of Education/FTC/CFPB/State AG enforcement actions against tracked education companies.
    """
    __tablename__ = "education_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_education_enforcement_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_education_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedEducationCompany", backref="enforcement_actions")
