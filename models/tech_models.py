"""
Technology Sector Models

Tables for tracking technology companies, SEC filings,
USPTO patents, and government contracts (USASpending).
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


class TrackedTechCompany(TrackedEntityMixin, Base):
    """
    Curated list of technology companies to monitor.
    """
    __tablename__ = "tracked_tech_companies"

    company_id = Column(String, unique=True, nullable=False, index=True)
    uspto_assignee_name = Column(String, nullable=True)  # Exact assignee name in USPTO PatentsView


class SECTechFiling(SECFilingMixin, Base):
    """
    SEC EDGAR filings for tracked tech companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_tech_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_tech_filings_accession"),
    )

    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

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

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTechCompany", backref="patents")


class GovernmentContract(GovernmentContractMixin, Base):
    """
    Federal government contracts awarded to tracked tech companies.
    Data from USASpending.gov.
    """
    __tablename__ = "government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_government_contracts_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedTechCompany", backref="government_contracts")


class LobbyingRecord(LobbyingRecordMixin, Base):
    """
    Lobbying disclosure filings from the Senate LDA API.
    Each record represents one quarterly filing from a lobbying firm
    on behalf of a tracked tech company.
    """
    __tablename__ = "lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_lobbying_records_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedTechCompany", backref="lobbying_records")


class FTCEnforcement(EnforcementMixin, Base):
    """
    FTC/DOJ enforcement actions against tracked tech companies.
    Sourced from curated seed data + FTC Legal Library scraping.
    """
    __tablename__ = "ftc_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_ftc_enforcement_hash"),
    )

    company_id = Column(String, ForeignKey("tracked_tech_companies.company_id"), nullable=False, index=True)

    company = relationship("TrackedTechCompany", backref="enforcement_actions")
