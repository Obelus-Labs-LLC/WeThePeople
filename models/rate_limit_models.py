"""Rate limit ORM model — table registration for Alembic."""

from sqlalchemy import Column, Integer, String, Float, Index

from models.database import Base


class RateLimitRecord(Base):
    """Tracks per-IP, per-endpoint request counts within sliding windows."""

    __tablename__ = "rate_limit_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ip_address = Column(String(45), nullable=False, index=True)
    endpoint = Column(String(100), nullable=False, index=True)
    window_start = Column(Float, nullable=False)
    request_count = Column(Integer, nullable=False, default=1)

    __table_args__ = (
        Index("ix_ratelimit_ip_endpoint", "ip_address", "endpoint"),
    )
