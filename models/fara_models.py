"""
FARA (Foreign Agents Registration Act) Models — Cross-Sector Influence Layer

Tables for FARA registrants, foreign principals, and individual agents (short forms).
These tables are cross-sector — foreign lobbying spans all industries.
Data sourced from efile.fara.gov bulk CSV downloads.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Text, Date,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from models.database import Base


class FARARegistrant(Base):
    """FARA-registered lobbying firms and organizations.

    These are U.S.-based entities that have registered under FARA to represent
    foreign governments, political parties, or foreign principals.
    """
    __tablename__ = "fara_registrants"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_fara_registrant_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String, nullable=False, unique=True, index=True)
    registrant_name = Column(String, nullable=False, index=True)
    address = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, nullable=True, index=True)
    registration_date = Column(String, nullable=True, index=True)
    termination_date = Column(String, nullable=True)
    status = Column(String, nullable=True, index=True)  # Active / Terminated

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FARAForeignPrincipal(Base):
    """Foreign governments, parties, and entities represented by FARA registrants.

    Links foreign principals to the registrant lobbying on their behalf.
    The country field enables aggregation by nation.
    """
    __tablename__ = "fara_foreign_principals"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_fara_fp_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String, nullable=False, index=True)  # FK-ish to registrants
    registrant_name = Column(String, nullable=True, index=True)
    foreign_principal_name = Column(String, nullable=False, index=True)
    country = Column(String, nullable=True, index=True)
    principal_registration_date = Column(String, nullable=True)
    principal_termination_date = Column(String, nullable=True)
    status = Column(String, nullable=True, index=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FARAShortForm(Base):
    """Individual agents registered under FARA short forms.

    These are the specific people doing the lobbying work on behalf of
    foreign principals through their registrant firm.
    """
    __tablename__ = "fara_short_forms"

    __table_args__ = (
        UniqueConstraint("dedupe_hash", name="uq_fara_sf_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String, nullable=False, index=True)
    registrant_name = Column(String, nullable=True, index=True)
    agent_name = Column(String, nullable=False, index=True)
    agent_address = Column(Text, nullable=True)
    agent_city = Column(String, nullable=True)
    agent_state = Column(String, nullable=True)
    short_form_date = Column(String, nullable=True)
    status = Column(String, nullable=True, index=True)

    dedupe_hash = Column(String, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
