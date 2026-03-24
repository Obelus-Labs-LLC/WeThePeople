"""
Story Models

Auto-generated data stories from pattern detection across all data sources.
Stories are drafted by Claude from structured evidence, reviewed, then published.
"""

from sqlalchemy import (
    Column, String, Integer, DateTime, Text,
    UniqueConstraint, JSON,
)
from sqlalchemy.sql import func

from models.database import Base


class Story(Base):
    """Auto-generated data story from pattern detection.

    Each story represents a noteworthy finding — a lobbying spike,
    contract windfall, enforcement gap, trade cluster, or cross-sector link.
    Stories start as drafts, get reviewed, then published to the /stories page,
    newsletter, and Twitter feed.
    """
    __tablename__ = "stories"

    __table_args__ = (
        UniqueConstraint("slug", name="uq_story_slug"),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True, index=True)
    summary = Column(Text, nullable=True)  # 1-2 sentence teaser
    body = Column(Text, nullable=True)  # Full markdown content

    # Classification
    category = Column(String, nullable=False, index=True)
    # Categories: lobbying_spike, contract_windfall, enforcement_gap,
    # trade_cluster, cross_sector, regulatory_influence, it_failure
    sector = Column(String, nullable=True, index=True)
    # Sectors: finance, health, tech, energy, transportation, defense, politics, or null for cross-sector

    # Structured data
    entity_ids = Column(JSON, nullable=True)  # ["company-id-1", "person-id-2"]
    data_sources = Column(JSON, nullable=True)  # ["/finance/institutions/123", "/influence/top-lobbying"]
    evidence = Column(JSON, nullable=True)  # {"lobbying_spend": 5200000, "contract_amount": 120000000, ...}

    # Workflow
    status = Column(String, nullable=False, server_default="draft", index=True)
    # Status: draft, published, archived

    published_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
