"""
Story Models

Auto-generated data stories from pattern detection across all data sources.
Stories are drafted by Claude from structured evidence, reviewed, then published.
"""

from sqlalchemy import (
    CheckConstraint, Column, ForeignKey, String, Integer, Float, DateTime, Text,
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

    VALID_STATUSES = ("draft", "published", "archived", "retracted")

    VALID_VERIFICATION_TIERS = ("verified", "partially_verified", "unverified")

    __table_args__ = (
        UniqueConstraint("slug", name="uq_story_slug"),
        CheckConstraint(
            "status IN ('draft', 'published', 'archived', 'retracted')",
            name="ck_story_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True, index=True)
    summary = Column(Text, nullable=True)  # 1-2 sentence teaser
    body = Column(Text, nullable=True)  # Full markdown content

    # Classification
    category = Column(String, nullable=False, index=True)
    sector = Column(String, nullable=True, index=True)

    # Structured data
    entity_ids = Column(JSON, nullable=False, server_default="[]")
    data_sources = Column(JSON, nullable=False, server_default="[]")
    evidence = Column(JSON, nullable=False, server_default="{}")

    # Workflow
    status = Column(String, nullable=False, server_default="draft", index=True)

    # Verification (claims pipeline)
    verification_score = Column(Float, nullable=True)  # 0.0-1.0 overall
    verification_tier = Column(String, nullable=True, index=True)  # 'verified', 'partially_verified', 'unverified'
    verification_data = Column(Text, nullable=True)  # Full JSON from claims pipeline

    # Research-pipeline verification metadata (added by alembic
    # migration research_pipeline_001). Bumped/stamped by the
    # orchestrator on every Veritas post-write cycle and consumed by
    # the daily decay cron.
    claim_version = Column(Integer, nullable=False, server_default="0")
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    verification_stale = Column(Integer, nullable=False, server_default="0", index=True)

    # 60-second simplified summary for the disengaged-audience layer
    # (alembic simplified_summary_001). Generated lazily on first
    # request via Haiku and cached. Frontend renders a toggle when
    # non-null; falls back to summary otherwise.
    summary_simplified = Column(Text, nullable=True)
    summary_simplified_model = Column(String, nullable=True)

    # Editorial metadata
    correction_history = Column(JSON, nullable=True, server_default="[]")
    # List of {date, type, description} entries for corrections/retractions
    retraction_reason = Column(Text, nullable=True)
    # Why the story was retracted (null unless status == 'retracted')
    data_date_range = Column(String, nullable=True)
    # Human-readable date range of underlying data, e.g. "Jan 2020 - Mar 2026"
    data_freshness_at = Column(DateTime(timezone=True), nullable=True)
    # When the underlying data was last refreshed/verified
    ai_generated = Column(String, nullable=True, server_default="algorithmic")
    # 'algorithmic' = template-generated, 'opus' = AI-enhanced prose, 'human' = manually written

    published_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @staticmethod
    def validate_entity_ids(entity_ids: list) -> list:
        """Validate entity_ids are non-empty strings (app-level FK check)."""
        if not entity_ids:
            return []
        return [eid for eid in entity_ids if isinstance(eid, str) and eid.strip()]


class StoryCorrection(Base):
    """Tracks corrections, updates, and retractions for published stories.

    Every editorial change to a published story gets a row here, creating
    an auditable correction history that readers can view.
    """
    __tablename__ = "story_corrections"

    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False, index=True)

    correction_type = Column(String, nullable=False)
    # 'correction' = factual fix, 'update' = new info added,
    # 'retraction' = story pulled, 'clarification' = wording improved

    description = Column(Text, nullable=False)
    # What was wrong and what was fixed

    corrected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    corrected_by = Column(String, nullable=True)  # 'system', 'editorial', or username
