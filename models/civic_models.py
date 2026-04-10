"""
Civic engagement models — accountability tracking, badges, proposals,
bill annotations, and citizen verification.

Inspired by Decidim (accountability tracking) and Consul Democracy
(tiered verification, confidence scoring).
"""

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text, ForeignKey,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import math

from models.database import Base


# ── Accountability Tracking ───────────────────────────────────────────
# Decidim-inspired: Promise → Result → Milestone → Progress


class Promise(Base):
    """A campaign promise or public commitment by a politician.

    Tracks the lifecycle from promise → legislative action → outcome.
    """
    __tablename__ = "promises"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(String(100), nullable=False, index=True)
    person_name = Column(String(300), nullable=True)

    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    source_url = Column(String(1000), nullable=True)
    promise_date = Column(DateTime, nullable=True)

    # Category: economy, healthcare, immigration, defense, environment, education, etc.
    category = Column(String(100), nullable=True, index=True)

    # Status lifecycle: pending → in_progress → partially_fulfilled → fulfilled → broken → retired
    status = Column(String(50), nullable=False, server_default="pending", index=True)
    retire_reason = Column(String(50), nullable=True)  # duplicated, superseded, irrelevant, withdrawn

    # Progress: 0-100 computed from milestones or set manually
    progress = Column(Integer, nullable=False, server_default="0")

    # Scoring
    confidence_score = Column(Float, nullable=True)  # Wilson score from votes
    hot_score = Column(Float, nullable=True, index=True)  # Temporal decay ranking

    # Linked evidence
    linked_bill_ids = Column(Text, nullable=True)  # JSON array of bill IDs
    linked_action_ids = Column(Text, nullable=True)  # JSON array of action IDs

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    milestones = relationship("Milestone", back_populates="promise", cascade="all, delete-orphan")
    votes = relationship("CivicVote", primaryjoin="and_(CivicVote.target_type=='promise', foreign(CivicVote.target_id)==Promise.id)", viewonly=True)


class Milestone(Base):
    """A trackable checkpoint in fulfilling a promise."""
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    promise_id = Column(Integer, ForeignKey("promises.id"), nullable=False, index=True)

    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    evidence_url = Column(String(1000), nullable=True)

    # Status: pending, achieved, missed
    status = Column(String(50), nullable=False, server_default="pending")
    achieved_date = Column(DateTime, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    promise = relationship("Promise", back_populates="milestones")


# ── Civic Voting (for proposals, promises, annotations) ──────────────


class CivicVote(Base):
    """User up/down vote on any civic content (promises, proposals, annotations)."""
    __tablename__ = "civic_votes"

    __table_args__ = (
        UniqueConstraint("user_id", "target_type", "target_id", name="uq_civic_vote"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    target_type = Column(String(50), nullable=False, index=True)  # promise, proposal, annotation
    target_id = Column(Integer, nullable=False, index=True)
    value = Column(Integer, nullable=False)  # +1 or -1
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── Citizen Proposals ─────────────────────────────────────────────────


class Proposal(Base):
    """Citizen-submitted proposal for policy discussion and voting.

    Lifecycle: draft → published → closed → retired
    """
    __tablename__ = "proposals"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)

    category = Column(String(100), nullable=True, index=True)
    sector = Column(String(50), nullable=True, index=True)

    # Lifecycle
    status = Column(String(50), nullable=False, server_default="draft", index=True)
    retire_reason = Column(String(50), nullable=True)  # duplicated, started, unfeasible, done

    # Cached vote counts for performance
    upvotes = Column(Integer, nullable=False, server_default="0")
    downvotes = Column(Integer, nullable=False, server_default="0")

    # Scoring
    confidence_score = Column(Float, nullable=True)  # Wilson score
    hot_score = Column(Float, nullable=True, index=True)

    published_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# ── Bill Section Annotations ──────────────────────────────────────────


class BillAnnotation(Base):
    """User annotation on a specific section of a bill.

    Enables participatory text discussion a la Decidim.
    """
    __tablename__ = "bill_annotations"

    id = Column(Integer, primary_key=True, index=True)
    bill_id = Column(String(100), nullable=False, index=True)  # e.g. "hr-119-1234"
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # What section of the bill
    section_ref = Column(String(200), nullable=True)  # e.g. "Section 3(a)(1)"
    text_excerpt = Column(Text, nullable=True)  # The quoted text

    # The annotation
    comment = Column(Text, nullable=False)
    sentiment = Column(String(20), nullable=True)  # support, oppose, neutral, question

    # Cached vote counts
    upvotes = Column(Integer, nullable=False, server_default="0")
    downvotes = Column(Integer, nullable=False, server_default="0")
    confidence_score = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── Gamification Badges ───────────────────────────────────────────────


class Badge(Base):
    """Badge definition. Badges are earned through civic actions."""
    __tablename__ = "badges"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=False)
    icon = Column(String(100), nullable=True)  # lucide icon name
    category = Column(String(50), nullable=False)  # engagement, research, verification, community

    # Threshold for earning (e.g., 10 = need 10 qualifying actions)
    threshold = Column(Integer, nullable=False, server_default="1")

    # Levels: badges can have bronze/silver/gold tiers
    level = Column(Integer, nullable=False, server_default="1")


class UserBadge(Base):
    """Badge awarded to a user."""
    __tablename__ = "user_badges"

    __table_args__ = (
        UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    badge_id = Column(Integer, ForeignKey("badges.id"), nullable=False, index=True)
    earned_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # Progress toward next level
    progress_count = Column(Integer, nullable=False, server_default="0")

    badge = relationship("Badge")


# ── Scoring Utilities ─────────────────────────────────────────────────


def wilson_score(upvotes: int, downvotes: int, z: float = 1.96) -> float:
    """Wilson score interval lower bound (Consul-style confidence ranking).

    Returns a score between 0 and 1. Higher = more confidently positive.
    z=1.96 gives 95% confidence interval.
    """
    n = upvotes + downvotes
    if n == 0:
        return 0.0
    p = upvotes / n
    denominator = 1 + z * z / n
    centre_adjusted_probability = p + z * z / (2 * n)
    adjusted_standard_deviation = math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    lower_bound = (centre_adjusted_probability - z * adjusted_standard_deviation) / denominator
    return round(lower_bound, 6)


def hot_score(upvotes: int, downvotes: int, created_epoch: float) -> float:
    """Time-decay hot score (Reddit/Consul-style).

    Balances vote quality with recency. Newer content with equal votes
    ranks higher than older content.
    """
    score = upvotes - downvotes
    order = math.log10(max(abs(score), 1))
    sign = 1 if score > 0 else -1 if score < 0 else 0
    # Epoch reference: Jan 1 2026 UTC
    seconds = created_epoch - 1767225600
    return round(sign * order + seconds / 45000, 7)
