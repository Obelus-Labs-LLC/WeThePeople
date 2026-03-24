"""
Government Data Models — Cross-Sector

Tables for data from SAM.gov, Regulations.gov, IT Dashboard, and GSA Site Scanning.
These tables are cross-sector — a single company_id field (plain String, no FK)
links to tracked companies in any of the 7 sector tables.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date,
    UniqueConstraint, JSON,
)
from sqlalchemy.sql import func

from models.database import Base


# ── SAM.gov Exclusions ──────────────────────────────────────────────────


class SAMExclusion(Base):
    """Debarred/suspended federal contractors from SAM.gov Exclusions API.

    Free replacement for OpenSanctions ($0.10/call) for U.S. federal
    procurement exclusion data. Updated daily by GSA.
    """
    __tablename__ = "sam_exclusions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_sam_exclusion_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, nullable=True, index=True)  # Links to any sector's tracked company

    sam_number = Column(String, nullable=True, index=True)  # UEI or CAGE code
    entity_name = Column(String, nullable=False, index=True)
    exclusion_type = Column(String, nullable=True, index=True)
    # Types: Ineligible (Proceedings Completed), Ineligible (Proceedings Pending), Prohibition/Restriction
    exclusion_program = Column(String, nullable=True)
    excluding_agency = Column(String, nullable=True, index=True)
    # Agency codes: AF, ARMY, NAVY, DLA, DOJ, EPA, etc.
    classification = Column(String, nullable=True)  # Firm, Individual, Special Entity

    activation_date = Column(Date, nullable=True, index=True)
    termination_date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)

    city = Column(String, nullable=True)
    state = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── SAM.gov Entity Registrations ────────────────────────────────────────


class SAMEntity(Base):
    """Federal contractor registrations from SAM.gov Entity Management API.

    Provides UEI, CAGE codes, NAICS classification, and parent/subsidiary
    corporate hierarchy. The parent_uei/parent_name fields enable detecting
    subsidiary relationships across our tracked companies.
    """
    __tablename__ = "sam_entities"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_sam_entity_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, nullable=True, index=True)

    uei = Column(String, nullable=True, index=True)  # Unique Entity Identifier (replaced DUNS)
    cage_code = Column(String, nullable=True, index=True)
    legal_business_name = Column(String, nullable=False, index=True)
    dba_name = Column(String, nullable=True)
    physical_address = Column(Text, nullable=True)

    naics_codes = Column(JSON, nullable=True)  # List of NAICS codes
    parent_uei = Column(String, nullable=True, index=True)
    parent_name = Column(String, nullable=True)

    registration_status = Column(String, nullable=True)
    registration_date = Column(String, nullable=True)
    exclusion_status_flag = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── Regulations.gov Comments ────────────────────────────────────────────


class RegulatoryComment(Base):
    """Corporate comments on federal regulations from Regulations.gov.

    Tracks which companies comment on which proposed rules, enabling
    detection of regulatory capture patterns: lobby + comment + win contract.
    """
    __tablename__ = "regulatory_comments"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_regulatory_comment_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, nullable=True, index=True)

    comment_id = Column(String, nullable=True, index=True)
    document_id = Column(String, nullable=True, index=True)
    docket_id = Column(String, nullable=True, index=True)
    agency_id = Column(String, nullable=True, index=True)

    title = Column(String, nullable=True)
    posted_date = Column(Date, nullable=True, index=True)
    commenter_name = Column(String, nullable=True)
    comment_text = Column(Text, nullable=True)  # Truncated to 2000 chars

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── Regulations.gov Dockets ─────────────────────────────────────────────


class RegulatoryDocket(Base):
    """Federal regulatory docket metadata from Regulations.gov.

    Dockets are organizational folders containing proposed rules, final rules,
    supporting documents, and public comments.
    """
    __tablename__ = "regulatory_dockets"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_regulatory_docket_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    docket_id = Column(String, nullable=False, unique=True, index=True)

    title = Column(String, nullable=True)
    agency_id = Column(String, nullable=True, index=True)
    docket_type = Column(String, nullable=True)  # Rulemaking, Nonrulemaking
    abstract = Column(Text, nullable=True)
    rin = Column(String, nullable=True, index=True)  # Regulation Identifier Number

    comment_start_date = Column(Date, nullable=True)
    comment_end_date = Column(Date, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── IT Dashboard Investments ────────────────────────────────────────────


class ITInvestment(Base):
    """Federal IT investments from the IT Dashboard (itdashboard.gov).

    Tracks CIO risk ratings, spending, schedule/cost variance for major
    IT investments. CIO ratings 1-2 = Red (High Risk), 3 = Yellow, 4-5 = Green.
    """
    __tablename__ = "it_investments"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_it_investment_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)

    agency_code = Column(String, nullable=True, index=True)
    agency_name = Column(String, nullable=True, index=True)
    investment_title = Column(String, nullable=True)
    unique_investment_id = Column(String, nullable=True, index=True)  # UII

    cio_rating = Column(Integer, nullable=True, index=True)  # 1-5, Red=1-2, Yellow=3, Green=4-5
    total_it_spending = Column(Float, nullable=True)
    lifecycle_cost = Column(Float, nullable=True)
    schedule_variance = Column(Float, nullable=True)
    cost_variance = Column(Float, nullable=True)

    # Matched to WTP tracked company (fuzzy match by vendor name)
    vendor_name = Column(String, nullable=True, index=True)
    matched_company_id = Column(String, nullable=True, index=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── GSA Site Scanning ───────────────────────────────────────────────────


class GovernmentWebsiteScan(Base):
    """Federal government website scan data from GSA Site Scanning.

    Tracks which tech companies' code/services run on .gov websites.
    Enables three-way join: tech embedded + lobbying + contracts = vendor lock-in.
    """
    __tablename__ = "government_website_scans"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_gov_website_scan_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)

    target_url = Column(String, nullable=False, index=True)
    final_url = Column(String, nullable=True)
    agency = Column(String, nullable=True, index=True)
    bureau = Column(String, nullable=True)
    status_code = Column(Integer, nullable=True)

    third_party_domains = Column(Text, nullable=True)  # Comma-separated domain list
    third_party_count = Column(Integer, nullable=True)
    matched_company_ids = Column(JSON, nullable=True)  # ["alphabet", "amazon", "meta"]

    scan_date = Column(Date, nullable=True, index=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
