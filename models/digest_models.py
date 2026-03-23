"""
Digest Subscriber Models

Stores email digest subscription data for the "Your Weekly Influence Report" feature.
Users subscribe with their zip code and receive personalized emails about their representatives.
"""

from sqlalchemy import Column, String, Integer, DateTime, Text, Boolean
from sqlalchemy.sql import func

from models.database import Base


class DigestSubscriber(Base):
    """
    Email digest subscribers — users who want weekly (or daily) reports
    about their representatives' trades, votes, lobbying, and anomalies.
    """
    __tablename__ = "digest_subscribers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    zip_code = Column(String(10), nullable=False)
    state = Column(String(2), nullable=True)
    frequency = Column(String(20), default="weekly")  # weekly, daily
    verified = Column(Boolean, default=False)
    verification_token = Column(String(64), unique=True, nullable=True, index=True)
    unsubscribe_token = Column(String(64), unique=True, nullable=True, index=True)
    sectors = Column(Text, nullable=True)  # JSON array of sectors to track, null = all
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_sent_at = Column(DateTime(timezone=True), nullable=True)
