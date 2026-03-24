"""
Twitter bot models — tweet logging and deduplication.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String, Text

from models.database import Base


class TweetLog(Base):
    __tablename__ = "tweet_log"
    id = Column(Integer, primary_key=True)
    tweet_id = Column(String(50))
    category = Column(String(50))
    content_hash = Column(String(64), unique=True)
    text = Column(Text)
    posted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
