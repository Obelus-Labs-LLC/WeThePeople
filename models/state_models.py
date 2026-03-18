"""
State-Level Legislative Models

Tables for tracking state legislators and state bills
via the OpenStates API v3.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Boolean, Date,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from models.database import Base


class StateLegislator(Base):
    """
    State-level legislators from OpenStates.
    Covers all 50 state legislatures.
    """
    __tablename__ = "state_legislators"

    __table_args__ = (
        UniqueConstraint("ocd_id", name="uq_state_legislators_ocd_id"),
        UniqueConstraint("dedupe_hash", name="uq_state_legislators_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    ocd_id = Column(String, nullable=False, index=True)  # OpenStates person ID
    name = Column(String, nullable=False)
    state = Column(String(2), nullable=False, index=True)  # 'NY', 'CA', etc.
    chamber = Column(String, nullable=True)  # 'upper' or 'lower'
    party = Column(String, nullable=True)  # 'D', 'R', 'I'
    district = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, index=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StateBill(Base):
    """
    State-level bills from OpenStates.
    """
    __tablename__ = "state_bills"

    __table_args__ = (
        UniqueConstraint("bill_id", name="uq_state_bills_bill_id"),
        UniqueConstraint("dedupe_hash", name="uq_state_bills_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    bill_id = Column(String, nullable=False, index=True)  # e.g., "ny-2025-S1234"
    state = Column(String(2), nullable=False, index=True)
    session = Column(String, nullable=True)
    identifier = Column(String, nullable=True)  # e.g., "S 1234"
    title = Column(String, nullable=True)
    subjects = Column(String, nullable=True)  # JSON array as string
    latest_action = Column(String, nullable=True)
    latest_action_date = Column(Date, nullable=True)
    sponsor_name = Column(String, nullable=True)
    source_url = Column(String, nullable=True)

    dedupe_hash = Column(String, nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
