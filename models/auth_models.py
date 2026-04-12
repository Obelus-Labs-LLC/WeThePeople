"""
Authentication & authorization models.

Tables:
  - User: registered users with hashed passwords and roles
  - APIKeyRecord: per-user API keys with granular scopes
  - AuditLog: immutable trail of security-relevant events
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, ForeignKey, Text, Float,
    UniqueConstraint, Boolean,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from models.database import Base


class User(Base):
    """Registered platform user."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)

    # Role hierarchy: free < pro < enterprise < admin
    role = Column(String(50), nullable=False, server_default="free", index=True)

    # Optional legacy-compatible flat API key (for migration period)
    api_key = Column(String(255), nullable=True, unique=True, index=True)

    display_name = Column(String(255), nullable=True)
    is_active = Column(Integer, nullable=False, server_default="1", index=True)  # SQLite compat: 0/1

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Tiered citizen verification (Consul-inspired)
    # Levels: 0=unverified (email only), 1=residence_verified, 2=document_verified
    verification_level = Column(Integer, nullable=False, server_default="0")
    verified_zip = Column(String(10), nullable=True)   # Zip code from residence verification
    verified_state = Column(String(2), nullable=True)   # State abbreviation
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verification_method = Column(String(50), nullable=True)  # sms, letter, document

    # Relationships
    api_keys = relationship("APIKeyRecord", back_populates="user", cascade="all, delete-orphan")


class APIKeyRecord(Base):
    """Per-user API key with granular scopes and optional expiry."""

    __tablename__ = "api_key_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # We store a SHA-256 hash of the key; the raw key is shown once at creation.
    key_hash = Column(String(64), unique=True, nullable=False, index=True)

    # Human-readable label, e.g. "CI pipeline", "Mobile app"
    name = Column(String(255), nullable=False)

    # JSON-encoded list of scopes, e.g. '["read","verify"]'
    scopes = Column(Text, nullable=False, server_default='["read"]')

    is_active = Column(Integer, nullable=False, server_default="1", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", back_populates="api_keys")


class UserWatchlistItem(Base):
    """User's tracked entities (politicians, companies, bills, sectors)."""

    __tablename__ = "user_watchlist"

    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_watchlist_user_entity"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    entity_type = Column(String(50), nullable=False, index=True)  # politician, company, bill, sector
    entity_id = Column(String(255), nullable=False, index=True)   # person_id, company_id, bill_id, sector slug
    entity_name = Column(String(500), nullable=True)              # Display name for quick rendering
    sector = Column(String(50), nullable=True)                    # Sector for company entities

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user = relationship("User", backref="watchlist_items")


class AuditLog(Base):
    """Immutable security audit trail."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    action = Column(String(100), nullable=False, index=True)  # login, register, api_key_create, etc.
    resource = Column(String(100), nullable=True, index=True)  # claims, api_keys, users, etc.
    resource_id = Column(String(255), nullable=True)

    ip_address = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(String(500), nullable=True)

    # JSON blob with action-specific details
    details = Column(Text, nullable=True)

    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
