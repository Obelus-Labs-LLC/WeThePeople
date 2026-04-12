"""
Token Usage Tracking Model

Logs every Anthropic API call with the feature that triggered it,
model used, token counts, and dollar cost. Queryable by date, feature,
and model for granular usage analysis.
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Text
from sqlalchemy.sql import func

from models.database import Base


class TokenUsageLog(Base):
    """Per-call token usage log for all Anthropic API calls."""
    __tablename__ = "token_usage_log"

    id = Column(Integer, primary_key=True, index=True)
    feature = Column(String, nullable=False, index=True)
    # Features: 'chat_agent', 'story_opus', 'story_haiku', 'ai_summarize',
    # 'claims_pipeline', 'twitter_bot', 'enrichment', 'test'
    model = Column(String, nullable=False, index=True)
    input_tokens = Column(Integer, nullable=False, server_default="0")
    output_tokens = Column(Integer, nullable=False, server_default="0")
    total_tokens = Column(Integer, nullable=False, server_default="0")
    cost_usd = Column(Float, nullable=False, server_default="0.0")
    # Optional context
    detail = Column(String, nullable=True)  # e.g., story slug, entity_id, question preview
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
