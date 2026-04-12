"""Pipeline reliability ORM models — table registration for Alembic.

Defines FailedRecord (DLQ), ProcessedRecord (exactly-once), and
DataQualityCheck tables. Service logic remains in services/pipeline_reliability.py.
"""

from sqlalchemy import (
    Column, DateTime, Float, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from models.database import Base


class FailedRecord(Base):
    """Records that failed during sync job processing."""
    __tablename__ = "failed_records"

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(100), nullable=False, index=True)
    record_data = Column(Text, nullable=False)
    error_message = Column(Text, nullable=False)
    retry_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_retry_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class ProcessedRecord(Base):
    """Tracks which records have been successfully processed by each job."""
    __tablename__ = "processed_records"

    __table_args__ = (
        UniqueConstraint("job_name", "record_hash", name="uq_processed_job_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(100), nullable=False, index=True)
    record_hash = Column(String(64), nullable=False, index=True)
    processed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DataQualityCheck(Base):
    """Results of automated data quality checks."""
    __tablename__ = "data_quality_checks"

    id = Column(Integer, primary_key=True, index=True)
    check_name = Column(String(200), nullable=False, index=True)
    table_name = Column(String(100), nullable=False, index=True)
    expected_min = Column(Float, nullable=True)
    actual_count = Column(Float, nullable=True)
    passed = Column(Integer, nullable=False, index=True)
    checked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
