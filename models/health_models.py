"""
Health Sector Models

Tables for tracking healthcare/pharmaceutical companies,
FDA adverse events, FDA recalls, clinical trials, and CMS payments.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date,
    ForeignKey, UniqueConstraint, JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class TrackedCompany(Base):
    """
    Curated list of healthcare/pharmaceutical companies to monitor.
    Mirrors TrackedInstitution pattern from finance sector.
    """
    __tablename__ = "tracked_companies"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, nullable=False, index=True)  # 'pfizer', 'johnson-johnson'
    display_name = Column(String, nullable=False)  # 'Pfizer Inc.'
    ticker = Column(String, nullable=True, index=True)  # 'PFE'
    sector_type = Column(String, nullable=False, index=True)  # 'pharma', 'biotech', 'insurer', 'pharmacy', 'distributor'

    # Cross-reference names/IDs for API lookups
    fda_manufacturer_name = Column(String, nullable=True)  # Exact name in FDA database (uppercase)
    ct_sponsor_name = Column(String, nullable=True)  # ClinicalTrials.gov sponsor name
    cms_company_name = Column(String, nullable=True)  # CMS Open Payments company name
    sec_cik = Column(String, nullable=True, index=True)  # SEC EDGAR CIK number (zero-padded 10 digits)

    # Metadata
    logo_url = Column(String, nullable=True)
    headquarters = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, server_default="1", index=True)  # SQLite: 0=inactive, 1=active

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


class FDAAdverseEvent(Base):
    """
    FDA openFDA drug adverse event reports for tracked companies.
    """
    __tablename__ = "fda_adverse_events"

    __table_args__ = (
        UniqueConstraint("report_id", name="uq_fda_adverse_events_report_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

    report_id = Column(String, nullable=False, index=True)  # safetyreportid from openFDA
    receive_date = Column(Date, nullable=True, index=True)
    serious = Column(Integer, nullable=True)  # 1=serious, 2=not serious
    drug_name = Column(String, nullable=True, index=True)
    reaction = Column(Text, nullable=True)  # Comma-separated reactions
    outcome = Column(String, nullable=True)  # 'Recovered', 'Fatal', 'Hospitalization', etc.

    # Raw data
    raw_json = Column(JSON, nullable=True)
    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedCompany", backref="fda_adverse_events")


class FDARecall(Base):
    """
    FDA drug enforcement/recall actions for tracked companies.
    """
    __tablename__ = "fda_recalls"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_fda_recalls_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

    recall_number = Column(String, nullable=True, index=True)  # FDA recall number
    classification = Column(String, nullable=True, index=True)  # 'Class I', 'Class II', 'Class III'
    recall_initiation_date = Column(Date, nullable=True, index=True)
    product_description = Column(Text, nullable=True)
    reason_for_recall = Column(Text, nullable=True)
    status = Column(String, nullable=True, index=True)  # 'Ongoing', 'Completed', 'Terminated'

    # Raw data
    raw_json = Column(JSON, nullable=True)
    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedCompany", backref="fda_recalls")


class ClinicalTrial(Base):
    """
    ClinicalTrials.gov studies sponsored by tracked companies.
    """
    __tablename__ = "clinical_trials"

    __table_args__ = (
        UniqueConstraint("nct_id", name="uq_clinical_trials_nct_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

    nct_id = Column(String, nullable=False, index=True)  # 'NCT04892108'
    title = Column(Text, nullable=True)
    overall_status = Column(String, nullable=True, index=True)  # 'RECRUITING', 'COMPLETED', etc.
    phase = Column(String, nullable=True, index=True)  # 'PHASE1', 'PHASE2', 'PHASE3', 'PHASE4'
    start_date = Column(Date, nullable=True, index=True)

    # Study details
    conditions = Column(Text, nullable=True)  # Comma-separated conditions
    interventions = Column(Text, nullable=True)  # Comma-separated interventions
    enrollment = Column(Integer, nullable=True)  # Target enrollment count

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedCompany", backref="clinical_trials")


class CMSPayment(Base):
    """
    CMS Open Payments records — pharma payments to healthcare providers.
    """
    __tablename__ = "cms_payments"

    __table_args__ = (
        UniqueConstraint("record_id", name="uq_cms_payments_record_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

    record_id = Column(String, nullable=False, index=True)
    payment_date = Column(Date, nullable=True, index=True)
    amount = Column(Float, nullable=True, index=True)  # USD
    payment_nature = Column(String, nullable=True, index=True)  # 'Consulting Fee', 'Food and Beverage', etc.

    # Physician info
    physician_name = Column(String, nullable=True)
    physician_specialty = Column(String, nullable=True, index=True)
    state = Column(String, nullable=True, index=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedCompany", backref="cms_payments")


class SECHealthFiling(Base):
    """
    SEC EDGAR filings for tracked health companies (10-K, 10-Q, 8-K, etc.).
    Mirrors SECFiling from finance sector but FK to tracked_companies.
    """
    __tablename__ = "sec_health_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_health_filings_accession"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

    accession_number = Column(String, nullable=False, index=True)
    form_type = Column(String, nullable=False, index=True)  # '10-K', '10-Q', '8-K', 'DEF 14A'
    filing_date = Column(Date, nullable=True, index=True)
    primary_doc_url = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("TrackedCompany", backref="sec_filings")


class HealthLobbyingRecord(Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked healthcare/pharmaceutical companies.
    """
    __tablename__ = "health_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_health_lobbying_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

    filing_uuid = Column(String, nullable=True, index=True)
    filing_year = Column(Integer, nullable=False, index=True)
    filing_period = Column(String, nullable=True)  # 'Q1', 'Q2', 'H1', 'H2'
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

    company = relationship("TrackedCompany", backref="lobbying_records")


class HealthGovernmentContract(Base):
    """
    Federal government contracts awarded to tracked health companies.
    Data from USASpending.gov (Medicare, VA, HHS contracts).
    """
    __tablename__ = "health_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_health_gov_contracts_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

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

    company = relationship("TrackedCompany", backref="government_contracts")


class HealthEnforcement(Base):
    """
    Enforcement actions against tracked health companies.
    Sources: FDA warning letters, DOJ pharma actions, OIG exclusions.
    """
    __tablename__ = "health_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_health_enforcement_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_companies.company_id"), nullable=False, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)  # 'Warning Letter', 'Consent Decree', 'Criminal Settlement'
    penalty_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # 'FDA', 'DOJ', 'OIG', 'State AG'

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedCompany", backref="enforcement_actions")
