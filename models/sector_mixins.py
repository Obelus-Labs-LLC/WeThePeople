"""
SQLAlchemy Mixins for sector model tables.

All 9 sector model files share nearly identical table definitions for:
- Tracked entity (company/institution)
- SEC filings
- Government contracts
- Lobbying records
- Enforcement actions

These mixins define the common columns once. Each concrete model class
inherits from the mixin and only specifies __tablename__, __table_args__,
ForeignKey references, and any sector-specific extra columns.

Addresses bug #334 (45+ near-identical table definitions).
"""

from sqlalchemy import Column, String, Integer, DateTime, Float, Text, Date
from sqlalchemy.sql import func


class TrackedEntityMixin:
    """Common columns for all tracked company/institution tables."""
    id = Column(Integer, primary_key=True, index=True)
    display_name = Column(String, nullable=False, index=True)
    ticker = Column(String, nullable=True, index=True)
    sector_type = Column(String, nullable=False, index=True)

    sec_cik = Column(String, nullable=True, index=True)
    usaspending_recipient_name = Column(String, nullable=True)

    logo_url = Column(String, nullable=True)
    headquarters = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, server_default="1", index=True)

    ai_profile_summary = Column(Text, nullable=True)

    sanctions_status = Column(String, nullable=True)
    sanctions_data = Column(Text, nullable=True)
    sanctions_checked_at = Column(DateTime(timezone=True), nullable=True)

    needs_ingest = Column(Integer, nullable=False, server_default="1", index=True)
    last_full_refresh_at = Column(DateTime(timezone=True), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SECFilingMixin:
    """Common columns for all SEC filing tables."""
    id = Column(Integer, primary_key=True, index=True)

    accession_number = Column(String, nullable=False, index=True)
    form_type = Column(String, nullable=False, index=True)
    filing_date = Column(Date, nullable=True, index=True)
    primary_doc_url = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class GovernmentContractMixin:
    """Common columns for all government contract tables."""
    id = Column(Integer, primary_key=True, index=True)

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


class LobbyingRecordMixin:
    """Common columns for all lobbying record tables."""
    id = Column(Integer, primary_key=True, index=True)

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


class EnforcementMixin:
    """Common columns for all enforcement action tables."""
    id = Column(Integer, primary_key=True, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)
    penalty_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)

    ai_summary = Column(Text, nullable=True)
    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
