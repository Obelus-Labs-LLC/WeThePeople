"""Phase 4-W: outcome history table.

Revision ID: outcome_history_001
Revises: search_fts_001
Create Date: 2026-05-01

The current `story_outcomes` table only stores the latest state.
Phase 4-W records every state transition so the /story page can
show a timeline ("open → improved on Mar 15"), and the
/ops/engagement dashboard can correlate action clicks against
outcome shifts.

Append-only. One row per (story_id, transition). Re-running the
detector with the same state is a no-op — we only insert when
the new state differs from the previous row's state.
"""

from alembic import op
import sqlalchemy as sa


revision = "outcome_history_001"
down_revision = "search_fts_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_outcome_history",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "story_id", sa.Integer,
            sa.ForeignKey("stories.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("from_state", sa.String(16), nullable=True),
        sa.Column("to_state", sa.String(16), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("signal_source", sa.String(255), nullable=True),
        sa.Column(
            "transitioned_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False, index=True,
        ),
    )
    op.create_index(
        "ix_outcome_history_story_at",
        "story_outcome_history",
        ["story_id", "transitioned_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_outcome_history_story_at", table_name="story_outcome_history")
    op.drop_table("story_outcome_history")
