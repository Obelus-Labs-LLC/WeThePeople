"""
Audit trail helper — logs security-relevant events to the audit_logs table.

Usage:
  from services.audit import log_event
  log_event(db, user_id=1, action="login", ip_address="1.2.3.4")
"""

import json
import logging
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from models.auth_models import AuditLog

logger = logging.getLogger(__name__)


def log_event(
    db: Session,
    *,
    action: str,
    user_id: Optional[int] = None,
    resource: Optional[str] = None,
    resource_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[dict] = None,
) -> AuditLog:
    """Insert an audit log row and commit."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource=resource,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        details=json.dumps(details) if details else None,
    )
    db.add(entry)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to write audit log for action=%s", action)
        raise
    return entry


def log_from_request(
    db: Session,
    request: Request,
    *,
    action: str,
    user_id: Optional[int] = None,
    resource: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> AuditLog:
    """Convenience wrapper that extracts IP and user-agent from a FastAPI Request."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")[:500]
    return log_event(
        db,
        action=action,
        user_id=user_id,
        resource=resource,
        resource_id=resource_id,
        ip_address=ip,
        user_agent=ua,
        details=details,
    )
