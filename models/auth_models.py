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

    # Signup preferences (distinct from verified_zip which requires a proof step)
    # zip_code is self-reported at signup; used for "show my reps" lookup only.
    zip_code = Column(String(10), nullable=True)
    digest_opt_in = Column(Integer, nullable=False, server_default="1")  # SQLite compat: 0/1
    alert_opt_in = Column(Integer, nullable=False, server_default="1")   # SQLite compat: 0/1

    # Phase 2 personalization fields (alembic phase2_personalization_001).
    # Power the "Why this matters to you" block on every story and the
    # personalized action panel.
    home_state = Column(String(2), nullable=True)            # "MI", "CA", etc.
    congressional_district = Column(String(10), nullable=True)  # "MI-10", "CA-12"
    lifestyle_categories = Column(Text, nullable=True)       # JSON list
    current_concern = Column(String(64), nullable=True)      # "housing", "healthcare", ...
    personalization_completed_at = Column(DateTime(timezone=True), nullable=True)

    # Alert watermark (alembic alert_watermark_001). The send_alerts
    # job uses this to avoid re-alerting on stories already covered.
    # Null on first run = treat every recent story as candidate, capped
    # to a 7-day window inside the job.
    last_alert_at = Column(DateTime(timezone=True), nullable=True)

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


class RevokedToken(Base):
    """Refresh-token revocation list.

    Each refresh token carries a `jti` claim (UUID) issued at login. When the
    user logs out, changes their password, or revokes the token explicitly,
    the jti is inserted here. `verify_token` rejects any refresh token whose
    jti is present, even if the underlying signature is still valid.

    Stale rows (where ``expires_at < now()``) are safe to delete: the JWT
    library would reject those tokens for being expired anyway.
    """

    __tablename__ = "revoked_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), nullable=False, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    reason = Column(String(50), nullable=True)  # logout, password_change, manual, etc.


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
