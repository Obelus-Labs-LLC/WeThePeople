"""Add research-pipeline verification metadata to stories.

Revision ID: research_pipeline_001
Revises: 6493f7e46ce4
Create Date: 2026-04-26

Adds three columns the new research-agent + Veritas pipeline writes
on every draft:

  claim_version       INTEGER  -- bumped each time the story's claim
                                   set is re-verified against the
                                   vault. Lets us detect when a draft
                                   has been re-checked after vault
                                   facts decayed.
  last_seen_at        DATETIME -- timestamp of the most recent
                                   verification cycle. The decay cron
                                   uses this to find stories whose
                                   underlying claims may have aged out
                                   of their decay-policy window.
  verification_stale  INTEGER  -- 0/1 flag set by the decay cron when
                                   any claim that backs this story has
                                   passed its decay window without
                                   being re-confirmed. Surfaced in the
                                   ops queue so editors can re-verify
                                   or retract.
"""

from alembic import op
import sqlalchemy as sa


revision = "research_pipeline_001"
down_revision = "6493f7e46ce4"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    rows = bind.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def upgrade() -> None:
    if not _has_column("stories", "claim_version"):
        op.add_column(
            "stories",
            sa.Column("claim_version", sa.Integer(), nullable=False, server_default="0"),
        )
    if not _has_column("stories", "last_seen_at"):
        op.add_column(
            "stories",
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        )
    if not _has_column("stories", "verification_stale"):
        op.add_column(
            "stories",
            sa.Column("verification_stale", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    pass
