"""
Congressional Committee Models

Tables for tracking House, Senate, and Joint committees
plus committee membership (which members sit on which committees).

Data source: unitedstates/congress-legislators (CC0 public domain)
  - committees-current.yaml
  - committee-membership-current.yaml
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Text,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from models.database import Base


class Committee(Base):
    """
    Congressional committees (standing, select, joint).
    Keyed by thomas_id which is the canonical ID in the congress-legislators dataset.
    """
    __tablename__ = "committees"

    __table_args__ = (
        UniqueConstraint("thomas_id", name="uq_committees_thomas_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    thomas_id = Column(String, nullable=False, index=True)  # 'HSAG', 'SSAF', 'JSTX'
    name = Column(String, nullable=False)  # 'House Committee on Agriculture'
    chamber = Column(String, nullable=False, index=True)  # 'house', 'senate', 'joint'
    committee_type = Column(String, nullable=True, index=True)  # 'standing', 'select', 'joint', 'special'
    url = Column(String, nullable=True)  # Official committee website
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    jurisdiction = Column(Text, nullable=True)  # Committee jurisdiction description

    # Additional IDs for cross-referencing
    house_committee_id = Column(String, nullable=True)  # 'AG' (House-specific short ID)
    senate_committee_id = Column(String, nullable=True)  # 'SSAF' (Senate-specific ID)

    # Parent committee (for subcommittees)
    parent_thomas_id = Column(String, nullable=True, index=True)  # NULL for top-level committees

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    memberships = relationship("CommitteeMembership", back_populates="committee")


class CommitteeMembership(Base):
    """
    Which members of Congress sit on which committees, with their role.
    Cross-references TrackedMember via bioguide_id for linking.
    """
    __tablename__ = "committee_memberships"

    __table_args__ = (
        UniqueConstraint(
            "committee_thomas_id", "bioguide_id",
            name="uq_committee_memberships_committee_member",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Committee reference (thomas_id from committees table)
    committee_thomas_id = Column(String, ForeignKey("committees.thomas_id"), nullable=False, index=True)

    # Member reference — bioguide_id links to TrackedMember.bioguide_id
    bioguide_id = Column(String, nullable=False, index=True)

    # Resolved person_id from TrackedMember (nullable — not all members may be tracked)
    person_id = Column(String, nullable=True, index=True)

    # Role on the committee
    role = Column(String, nullable=False, server_default="member", index=True)  # 'chair', 'ranking_member', 'member', 'vice_chair', 'ex_officio'
    rank = Column(Integer, nullable=True)  # Seniority rank within party
    party = Column(String, nullable=True)  # 'majority', 'minority'
    member_name = Column(String, nullable=True)  # Name as listed in membership data

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    committee = relationship("Committee", back_populates="memberships")
