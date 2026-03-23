"""
Transportation Sector Models

Tables for tracking airlines, shipping, automotive, rail, aerospace, and logistics companies,
government contracts, lobbying, enforcement (NHTSA/FAA/FMC/FMCSA), and SEC filings.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Float, Text, Date, Boolean,
    ForeignKey, UniqueConstraint, JSON
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class TrackedTransportationCompany(Base):
    """
    Curated list of transportation companies to monitor.
    """
    __tablename__ = "tracked_transportation_companies"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, unique=True, nullable=False, index=True)  # 'delta', 'fedex'
    display_name = Column(String, nullable=False)  # 'Delta Air Lines Inc.'
    ticker = Column(String, nullable=True, index=True)  # 'DAL'
    sector_type = Column(String, nullable=False, index=True)  # 'aviation', 'shipping', 'motor_vehicle', 'rail', 'logistics', 'aerospace', 'ride_share', 'maritime'

    # Cross-reference names/IDs for API lookups.
    # NHTSA/FAA cross-ref: no direct fields here — uses COMPANY_TO_MAKE dict
    # in sync_nhtsa_data.py and sync_fuel_economy.py to map company_id -> make names.
    sec_cik = Column(String, nullable=True, index=True)
    usaspending_recipient_name = Column(String, nullable=True)
    website = Column(String, nullable=True)  # Reserved for future use (company profile links, logo fallback)

    # Metadata
    logo_url = Column(String, nullable=True)
    headquarters = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, server_default="1", index=True)

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


class SECTransportationFiling(Base):
    """
    SEC EDGAR filings for tracked transportation companies (10-K, 10-Q, 8-K, etc.).
    """
    __tablename__ = "sec_transportation_filings"

    __table_args__ = (
        UniqueConstraint("accession_number", name="uq_sec_transportation_filings_accession"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

    accession_number = Column(String, nullable=False, index=True)
    form_type = Column(String, nullable=False, index=True)
    filing_date = Column(Date, nullable=True, index=True)
    primary_doc_url = Column(String, nullable=True)
    filing_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTransportationCompany", backref="sec_filings")


class TransportationGovernmentContract(Base):
    """
    Federal government contracts awarded to tracked transportation companies.
    Data from USASpending.gov.
    """
    __tablename__ = "transportation_government_contracts"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_transportation_gov_contracts_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

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

    company = relationship("TrackedTransportationCompany", backref="government_contracts")


class TransportationLobbyingRecord(Base):
    """
    Lobbying disclosure filings from the Senate LDA API
    for tracked transportation companies.
    """
    __tablename__ = "transportation_lobbying_records"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_transportation_lobbying_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

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

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTransportationCompany", backref="lobbying_records")


class TransportationEnforcement(Base):
    """
    NHTSA/FAA/FMC/FMCSA enforcement actions against tracked transportation companies.
    """
    __tablename__ = "transportation_enforcement_actions"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_transportation_enforcement_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

    case_title = Column(String, nullable=False)
    case_date = Column(Date, nullable=True, index=True)
    case_url = Column(String, nullable=True)
    enforcement_type = Column(String, nullable=True, index=True)  # 'Civil Penalty', 'Consent Decree', 'Safety Recall', etc.
    penalty_amount = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    source = Column(String, nullable=True)  # 'NHTSA', 'FAA', 'FMC', 'FMCSA', 'DOT'

    # AI-generated summary
    ai_summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTransportationCompany", backref="enforcement_actions")


class NHTSARecall(Base):
    """
    NHTSA vehicle recall campaigns for tracked transportation companies.
    Data from api.nhtsa.gov.
    """
    __tablename__ = "nhtsa_recalls"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_nhtsa_recalls_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

    recall_number = Column(String, nullable=False, index=True)
    make = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True, index=True)
    model_year = Column(Integer, nullable=True, index=True)
    recall_date = Column(String, nullable=True, index=True)  # Date string from API
    component = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    consequence = Column(Text, nullable=True)
    remedy = Column(Text, nullable=True)
    manufacturer = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTransportationCompany", backref="nhtsa_recalls")


class NHTSAComplaint(Base):
    """
    NHTSA vehicle complaint records for tracked transportation companies.
    Data from api.nhtsa.gov.
    """
    __tablename__ = "nhtsa_complaints"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_nhtsa_complaints_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

    odi_number = Column(String, nullable=False, index=True)
    make = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True, index=True)
    model_year = Column(Integer, nullable=True, index=True)
    date_of_complaint = Column(String, nullable=True, index=True)  # Date string from API
    crash = Column(Boolean, nullable=True, server_default="0")
    fire = Column(Boolean, nullable=True, server_default="0")
    injuries = Column(Integer, nullable=True, server_default="0")
    deaths = Column(Integer, nullable=True, server_default="0")
    component = Column(String, nullable=True)
    summary = Column(Text, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTransportationCompany", backref="nhtsa_complaints")


class FuelEconomyVehicle(Base):
    """
    EPA/DOE fuel economy data for tracked transportation companies.
    Data from fueleconomy.gov.
    """
    __tablename__ = "fuel_economy_vehicles"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_fuel_economy_vehicles_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

    vehicle_id = Column(String, nullable=False, index=True)  # FuelEconomy.gov vehicle ID
    year = Column(Integer, nullable=True, index=True)
    make = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True, index=True)
    mpg_city = Column(Float, nullable=True)
    mpg_highway = Column(Float, nullable=True)
    mpg_combined = Column(Float, nullable=True)
    co2_tailpipe = Column(Float, nullable=True)  # grams per mile
    fuel_type = Column(String, nullable=True)
    vehicle_class = Column(String, nullable=True)
    ghg_score = Column(Integer, nullable=True)  # 1-10 greenhouse gas score
    smog_rating = Column(Integer, nullable=True)  # 1-10 smog rating

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTransportationCompany", backref="fuel_economy_vehicles")


class NHTSASafetyRating(Base):
    """
    NHTSA NCAP safety ratings for tracked transportation companies.
    Data from api.nhtsa.gov SafetyRatings endpoint.
    Star ratings (1-5) for overall, frontal crash, side crash, and rollover.
    """
    __tablename__ = "nhtsa_safety_ratings"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_nhtsa_safety_ratings_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, ForeignKey("tracked_transportation_companies.company_id"), nullable=False, index=True)

    vehicle_id = Column(String(50), nullable=True)  # NHTSA VehicleId
    make = Column(String(100), nullable=True, index=True)
    model = Column(String(200), nullable=True, index=True)
    model_year = Column(Integer, nullable=True, index=True)
    overall_rating = Column(Integer, nullable=True)  # 1-5 stars (or "Not Rated")
    frontal_crash_rating = Column(Integer, nullable=True)
    side_crash_rating = Column(Integer, nullable=True)
    rollover_rating = Column(Integer, nullable=True)

    dedupe_hash = Column(String(64), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company = relationship("TrackedTransportationCompany", backref="safety_ratings")
