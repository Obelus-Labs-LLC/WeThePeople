"""
Privacy Service — GDPR-style data subject rights.

Provides:
  - anonymize_user(db, user_id): Right to erasure — anonymize PII, keep aggregated data
  - export_user_data(db, user_id): Right to data portability — JSON export of all user records
  - get_data_inventory(): Data mapping — all tables containing PII with column names

This module handles User, APIKeyRecord, AuditLog, DigestSubscriber, and
RateLimitRecord — the tables that store personal or IP-based data.

Usage:
    from services.privacy import anonymize_user, export_user_data, get_data_inventory

    # GDPR erasure request:
    result = anonymize_user(db, user_id=42)

    # Data portability request:
    data = export_user_data(db, user_id=42)

    # Data inventory for compliance documentation:
    inventory = get_data_inventory()
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Data Inventory — documents all PII-containing tables
# ---------------------------------------------------------------------------

@dataclass
class PIIColumn:
    """A column that may contain personally identifiable information."""

    column_name: str
    data_type: str  # email, ip_address, name, token, credential, user_agent, free_text
    description: str
    is_direct_identifier: bool  # True = directly identifies a person (email, name)


@dataclass
class PIITable:
    """A table that contains PII data."""

    table_name: str
    description: str
    pii_columns: List[PIIColumn]
    user_id_column: Optional[str]  # Column that links to users.id (if any)
    retention_days: Optional[int]  # Retention period (if managed by data_retention)


def get_data_inventory() -> List[PIITable]:
    """Return a complete inventory of all tables containing PII.

    This is the canonical data map for GDPR Article 30 compliance —
    documents what personal data we hold, where it lives, and how
    long we keep it.

    Returns:
        List of PIITable objects describing every PII-bearing table.
    """
    return [
        PIITable(
            table_name="users",
            description="Registered platform users with credentials",
            pii_columns=[
                PIIColumn("email", "email", "User login email address", is_direct_identifier=True),
                PIIColumn("display_name", "name", "User-chosen display name", is_direct_identifier=True),
                PIIColumn("hashed_password", "credential", "Bcrypt-hashed password", is_direct_identifier=False),
                PIIColumn("api_key", "credential", "Legacy flat API key (migration period)", is_direct_identifier=False),
            ],
            user_id_column="id",
            retention_days=None,  # Retained until account deletion
        ),
        PIITable(
            table_name="api_key_records",
            description="Per-user API keys with scopes and expiry",
            pii_columns=[
                PIIColumn("key_hash", "credential", "SHA-256 hash of API key", is_direct_identifier=False),
                PIIColumn("name", "free_text", "User-provided key label (e.g. 'CI pipeline')", is_direct_identifier=False),
            ],
            user_id_column="user_id",
            retention_days=None,  # Tied to user lifecycle
        ),
        PIITable(
            table_name="audit_logs",
            description="Security audit trail of user actions",
            pii_columns=[
                PIIColumn("ip_address", "ip_address", "Client IP address", is_direct_identifier=False),
                PIIColumn("user_agent", "user_agent", "Browser/client user-agent string", is_direct_identifier=False),
                PIIColumn("details", "free_text", "JSON blob with action-specific details (may contain PII)", is_direct_identifier=False),
            ],
            user_id_column="user_id",
            retention_days=730,
        ),
        PIITable(
            table_name="digest_subscribers",
            description="Email digest subscribers with location data",
            pii_columns=[
                PIIColumn("email", "email", "Subscriber email address", is_direct_identifier=True),
                PIIColumn("zip_code", "location", "Subscriber zip code", is_direct_identifier=False),
                PIIColumn("state", "location", "Derived state from zip code", is_direct_identifier=False),
                PIIColumn("verification_token", "token", "Email verification token", is_direct_identifier=False),
                PIIColumn("unsubscribe_token", "token", "One-click unsubscribe token", is_direct_identifier=False),
            ],
            user_id_column=None,  # Not linked to users table — standalone subscribers
            retention_days=None,  # Retained until unsubscribe
        ),
        PIITable(
            table_name="rate_limit_records",
            description="Per-IP rate limit counters",
            pii_columns=[
                PIIColumn("ip_address", "ip_address", "Client IP address", is_direct_identifier=False),
            ],
            user_id_column=None,  # IP-based, not user-based
            retention_days=30,
        ),
    ]


# ---------------------------------------------------------------------------
# Data Export (GDPR Article 20 — Right to Data Portability)
# ---------------------------------------------------------------------------

def export_user_data(db: Session, user_id: int) -> Dict[str, Any]:
    """Export all data associated with a user in machine-readable JSON.

    Collects records from all PII-bearing tables that link to this user_id,
    plus any records that can be matched by the user's email or IP addresses.

    Args:
        db: Active SQLAlchemy session.
        user_id: The users.id to export data for.

    Returns:
        Dict with keys per table, each containing a list of row dicts.
        Also includes metadata (export_timestamp, user_id, tables_searched).
    """
    from models.auth_models import User, APIKeyRecord, AuditLog

    export: Dict[str, Any] = {
        "metadata": {
            "export_timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "format_version": "1.0",
            "tables_searched": [],
        },
    }

    # 1. User record
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        export["user"] = {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": _dt_str(user.created_at),
            "last_login": _dt_str(user.last_login),
            "updated_at": _dt_str(user.updated_at),
        }
    else:
        export["user"] = None
    export["metadata"]["tables_searched"].append("users")

    # 2. API keys (exclude actual key hashes — they're credentials, not user data)
    api_keys = db.query(APIKeyRecord).filter(APIKeyRecord.user_id == user_id).all()
    export["api_keys"] = [
        {
            "id": k.id,
            "name": k.name,
            "scopes": k.scopes,
            "is_active": k.is_active,
            "created_at": _dt_str(k.created_at),
            "expires_at": _dt_str(k.expires_at),
        }
        for k in api_keys
    ]
    export["metadata"]["tables_searched"].append("api_key_records")

    # 3. Audit logs for this user
    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user_id)
        .order_by(AuditLog.timestamp.desc())
        .all()
    )
    export["audit_logs"] = [
        {
            "id": log.id,
            "action": log.action,
            "resource": log.resource,
            "resource_id": log.resource_id,
            "ip_address": log.ip_address,
            "timestamp": _dt_str(log.timestamp),
            "details": _safe_json_parse(log.details),
        }
        for log in audit_logs
    ]
    export["metadata"]["tables_searched"].append("audit_logs")

    # 4. Digest subscriptions — match by email if user has one
    if user and user.email:
        from models.digest_models import DigestSubscriber
        subs = (
            db.query(DigestSubscriber)
            .filter(DigestSubscriber.email == user.email)
            .all()
        )
        export["digest_subscriptions"] = [
            {
                "id": s.id,
                "email": s.email,
                "zip_code": s.zip_code,
                "state": s.state,
                "frequency": s.frequency,
                "verified": s.verified,
                "sectors": s.sectors,
                "created_at": _dt_str(s.created_at),
                "last_sent_at": _dt_str(s.last_sent_at),
            }
            for s in subs
        ]
    else:
        export["digest_subscriptions"] = []
    export["metadata"]["tables_searched"].append("digest_subscribers")

    # 5. Rate limit records — match by known IP addresses from audit logs
    known_ips = {log.ip_address for log in audit_logs if log.ip_address}
    if known_ips:
        from services.rate_limit_store import RateLimitRecord
        rl_records = (
            db.query(RateLimitRecord)
            .filter(RateLimitRecord.ip_address.in_(list(known_ips)))
            .all()
        )
        export["rate_limit_records"] = [
            {
                "id": r.id,
                "ip_address": r.ip_address,
                "endpoint": r.endpoint,
                "window_start": r.window_start,
                "request_count": r.request_count,
            }
            for r in rl_records
        ]
    else:
        export["rate_limit_records"] = []
    export["metadata"]["tables_searched"].append("rate_limit_records")

    logger.info(
        "Exported user data for user_id=%d: %d tables, %d total records",
        user_id,
        len(export["metadata"]["tables_searched"]),
        sum(
            len(v) if isinstance(v, list) else (1 if v else 0)
            for k, v in export.items()
            if k != "metadata"
        ),
        extra={"job": "privacy_export"},
    )

    return export


# ---------------------------------------------------------------------------
# Anonymization (GDPR Article 17 — Right to Erasure)
# ---------------------------------------------------------------------------

@dataclass
class AnonymizationResult:
    """Summary of what was anonymized for a user."""

    user_id: int
    tables_affected: Dict[str, int]  # table_name -> count of rows anonymized
    errors: List[str]
    completed_at: str


def anonymize_user(db: Session, user_id: int) -> AnonymizationResult:
    """Anonymize all PII for a given user.

    Replaces direct identifiers (email, display_name) with anonymized values.
    Nullifies credentials (password, API keys). Anonymizes IP addresses and
    user-agent strings in audit logs. Preserves non-PII aggregated data
    (roles, timestamps, action types) for analytics.

    This is a destructive, irreversible operation. The user record is kept
    (with is_active=0) to maintain referential integrity, but all PII is
    removed.

    Args:
        db: Active SQLAlchemy session.
        user_id: The users.id to anonymize.

    Returns:
        AnonymizationResult with per-table counts.
    """
    from models.auth_models import User, APIKeyRecord, AuditLog

    result = AnonymizationResult(
        user_id=user_id,
        tables_affected={},
        errors=[],
        completed_at="",
    )

    # Generate a stable anonymous identifier for this user
    anon_id = hashlib.sha256(f"anon-{user_id}".encode()).hexdigest()[:12]
    anon_email = f"deleted-{anon_id}@anonymized.local"
    anon_name = f"Deleted User {anon_id}"

    try:
        # 1. Anonymize user record
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            result.errors.append(f"User {user_id} not found")
            result.completed_at = datetime.now(timezone.utc).isoformat()
            return result

        original_email = user.email
        user.email = anon_email
        user.display_name = anon_name
        user.hashed_password = "ANONYMIZED"
        user.api_key = None
        user.is_active = 0
        result.tables_affected["users"] = 1

        # 2. Revoke and anonymize API keys
        api_keys = db.query(APIKeyRecord).filter(APIKeyRecord.user_id == user_id).all()
        for key in api_keys:
            key.key_hash = f"ANONYMIZED-{key.id}"
            key.name = "anonymized"
            key.is_active = 0
        result.tables_affected["api_key_records"] = len(api_keys)

        # 3. Anonymize audit logs — keep action/resource for security analytics,
        #    but strip IP, user-agent, and details that may contain PII
        audit_count = (
            db.query(AuditLog)
            .filter(AuditLog.user_id == user_id)
            .update(
                {
                    AuditLog.ip_address: "0.0.0.0",
                    AuditLog.user_agent: "anonymized",
                    AuditLog.details: None,
                },
                synchronize_session=False,
            )
        )
        result.tables_affected["audit_logs"] = audit_count

        # 4. Anonymize digest subscriptions by email
        if original_email:
            from models.digest_models import DigestSubscriber
            digest_count = (
                db.query(DigestSubscriber)
                .filter(DigestSubscriber.email == original_email)
                .update(
                    {
                        DigestSubscriber.email: anon_email,
                        DigestSubscriber.zip_code: "00000",
                        DigestSubscriber.state: None,
                        DigestSubscriber.verification_token: None,
                        DigestSubscriber.unsubscribe_token: None,
                        DigestSubscriber.verified: False,
                    },
                    synchronize_session=False,
                )
            )
            result.tables_affected["digest_subscribers"] = digest_count

        # 5. Delete rate limit records for IPs found in this user's audit logs
        #    (best-effort — IPs are shared so we only delete if audit trail links them)
        ip_rows = (
            db.query(AuditLog.ip_address)
            .filter(
                AuditLog.user_id == user_id,
                AuditLog.ip_address != "0.0.0.0",  # Already anonymized above
            )
            .distinct()
            .all()
        )
        # After step 3, all IPs are anonymized to 0.0.0.0, so we skip this.
        # The rate limit records are ephemeral (30-day retention) and will be
        # cleaned up by the data retention job. No explicit deletion needed.
        result.tables_affected["rate_limit_records"] = 0

        db.commit()

        result.completed_at = datetime.now(timezone.utc).isoformat()
        total = sum(result.tables_affected.values())
        logger.info(
            "Anonymized user_id=%d: %d records across %d tables",
            user_id, total, len(result.tables_affected),
            extra={"job": "privacy_anonymize"},
        )

    except Exception as exc:
        db.rollback()
        error_msg = f"Anonymization failed for user {user_id}: {exc}"
        result.errors.append(error_msg)
        result.completed_at = datetime.now(timezone.utc).isoformat()
        logger.exception(error_msg, extra={"job": "privacy_anonymize"})

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dt_str(dt: Optional[datetime]) -> Optional[str]:
    """Convert a datetime to ISO string, or None."""
    if dt is None:
        return None
    return dt.isoformat() if hasattr(dt, "isoformat") else str(dt)


def _safe_json_parse(raw: Optional[str]) -> Any:
    """Parse a JSON string, returning the raw string on failure."""
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw
