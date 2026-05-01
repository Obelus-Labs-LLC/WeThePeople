"""Tip submissions from outside contributors.

Public POST /tips persists rows here; ops queue triages them. Kept
out of stories_models.py because tips are not stories — they're
inbox material that may or may not become a story (or a fact-check,
or a redirect, or nothing).
"""

from sqlalchemy import (
    CheckConstraint, Column, DateTime, Integer, String, Text,
)
from sqlalchemy.sql import func

from models.database import Base


class Tip(Base):
    """One contributor tip / story idea / pointer.

    Status workflow:
        new        — fresh submission
        in_review  — an editor is looking at it
        published  — it informed a story (link via admin_notes)
        dismissed  — not actionable (spam / out of scope / unclear)
    """
    __tablename__ = "tips"

    VALID_STATUSES = ("new", "in_review", "published", "dismissed")

    __table_args__ = (
        CheckConstraint(
            "status IN ('new','in_review','published','dismissed')",
            name="ck_tips_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)

    contact_email = Column(String(255), nullable=True)
    contact_name = Column(String(255), nullable=True)

    related_story_slug = Column(String(255), nullable=True)
    hint_sector = Column(String(64), nullable=True)
    hint_entity = Column(String(255), nullable=True)

    status = Column(String(16), nullable=False, server_default="new", index=True)
    admin_notes = Column(Text, nullable=True)

    submitter_ip = Column(String(64), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    triaged_at = Column(DateTime(timezone=True), nullable=True)
    triaged_by = Column(String(255), nullable=True)

    @staticmethod
    def validate_status(status: str) -> str:
        v = (status or "").strip().lower()
        if v not in Tip.VALID_STATUSES:
            raise ValueError(
                f"status must be one of {Tip.VALID_STATUSES}, got {status!r}"
            )
        return v
