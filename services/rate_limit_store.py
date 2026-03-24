"""
SQLite-backed rate limit store.

Persists rate limit counters in the existing WeThePeople database so they
survive process restarts. Uses a dedicated ``rate_limit_records`` table.

No external dependencies — uses SQLAlchemy (already installed).

Usage:
    from services.rate_limit_store import check_rate_limit

    allowed, remaining, reset_time = check_rate_limit(
        ip="1.2.3.4",
        endpoint="claims",
        max_requests=5,
        window_seconds=86400,
    )
"""

import time
from typing import Tuple

from sqlalchemy import Column, Integer, String, Float, Index
from sqlalchemy.orm import Session

from models.database import Base, get_db
from utils.logging import get_logger

logger = get_logger(__name__)


class RateLimitRecord(Base):
    """Tracks per-IP, per-endpoint request counts within sliding windows."""

    __tablename__ = "rate_limit_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ip_address = Column(String(45), nullable=False, index=True)   # IPv4 or IPv6
    endpoint = Column(String(100), nullable=False, index=True)
    window_start = Column(Float, nullable=False)                  # epoch seconds
    request_count = Column(Integer, nullable=False, default=1)

    __table_args__ = (
        Index("ix_ratelimit_ip_endpoint", "ip_address", "endpoint"),
    )


def check_rate_limit(
    ip: str,
    endpoint: str,
    max_requests: int,
    window_seconds: int,
    db: Session | None = None,
) -> Tuple[bool, int, float]:
    """Check and record a rate-limited request.

    Args:
        ip: Client IP address.
        endpoint: Logical endpoint name (e.g. "claims", "chat").
        max_requests: Maximum requests allowed in the window.
        window_seconds: Sliding window duration in seconds.
        db: Optional SQLAlchemy session. If None, creates one internally.

    Returns:
        (allowed, remaining, reset_time):
          - allowed: True if the request is within limits.
          - remaining: How many requests are left in the current window.
          - reset_time: Epoch timestamp when the current window resets.
    """
    close_db = False
    if db is None:
        db = next(get_db())
        close_db = True

    try:
        now = time.time()
        window_start = now - window_seconds

        # Clean up expired records for this IP+endpoint
        db.query(RateLimitRecord).filter(
            RateLimitRecord.ip_address == ip,
            RateLimitRecord.endpoint == endpoint,
            RateLimitRecord.window_start < window_start,
        ).delete(synchronize_session=False)

        # Count requests in the current window
        current_count = (
            db.query(RateLimitRecord)
            .filter(
                RateLimitRecord.ip_address == ip,
                RateLimitRecord.endpoint == endpoint,
                RateLimitRecord.window_start >= window_start,
            )
            .count()
        )

        if current_count >= max_requests:
            # Find the oldest record to compute reset time
            oldest = (
                db.query(RateLimitRecord.window_start)
                .filter(
                    RateLimitRecord.ip_address == ip,
                    RateLimitRecord.endpoint == endpoint,
                    RateLimitRecord.window_start >= window_start,
                )
                .order_by(RateLimitRecord.window_start.asc())
                .first()
            )
            reset_time = (oldest[0] + window_seconds) if oldest else (now + window_seconds)
            db.commit()
            return False, 0, reset_time

        # Record this request
        record = RateLimitRecord(
            ip_address=ip,
            endpoint=endpoint,
            window_start=now,
            request_count=1,
        )
        db.add(record)
        db.commit()

        remaining = max(0, max_requests - current_count - 1)
        reset_time = now + window_seconds
        return True, remaining, reset_time

    except Exception:
        logger.exception("Rate limit store error for ip=%s endpoint=%s", ip, endpoint)
        db.rollback()
        # Fail open — don't block requests if the store is broken
        return True, max_requests, time.time() + window_seconds

    finally:
        if close_db:
            db.close()
