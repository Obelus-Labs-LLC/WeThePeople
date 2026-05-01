"""Phase 3: action_clicks (engagement tracking) + story_outcomes
(per-story outcome state).

Revision ID: phase3_001
Revises: tips_001
Create Date: 2026-05-01

Two new tables, both Phase 3.

action_clicks
    One row per CTA click on the Action Panel. Anonymous-friendly:
    user_id is nullable, no PII captured. Aggregated counts feed
    the /ops/engagement dashboard so editors can see which scripts
    and which sectors actually move readers, and which actions are
    dead weight.

story_outcomes
    Per-story outcome state (open / improved / worsened / resolved)
    plus a free-text note + last-signal pointer. Updated by an
    outcome-detection job on a daily schedule. Surfaces as a status
    bar at the top of every story page so readers can see whether
    the situation has changed since the story dropped.

Both tables are append-most: action_clicks is pure insert; story_
outcomes is one row per story with updates in place.
"""

from alembic import op
import sqlalchemy as sa


revision = "phase3_001"
down_revision = "tips_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "action_clicks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "story_id", sa.Integer,
            sa.ForeignKey("stories.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column(
            "action_id", sa.Integer,
            sa.ForeignKey("story_actions.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("action_type", sa.String(32), nullable=False, index=True),
        # Nullable: anonymous readers tracked too, just without
        # user_id linkage. PII-free; we never log IP at the row level
        # (rate-limit happens at the middleware layer).
        sa.Column(
            "user_id", sa.Integer,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True, index=True,
        ),
        sa.Column(
            "clicked_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False, index=True,
        ),
    )

    op.create_table(
        "story_outcomes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "story_id", sa.Integer,
            sa.ForeignKey("stories.id", ondelete="CASCADE"),
            nullable=False, unique=True,
        ),
        # state: open | improved | worsened | resolved | unknown
        sa.Column(
            "state", sa.String(16), nullable=False,
            server_default="open",
        ),
        # 1-2 sentence editor-readable note explaining the state.
        sa.Column("note", sa.Text, nullable=True),
        # Pointer to the data point that triggered the most-recent
        # update. Free-text; common formats:
        #   "bill_action:hr1234-118:abc-123"
        #   "anomaly:42"
        #   "manual:dshon"
        sa.Column("last_signal_source", sa.String(255), nullable=True),
        sa.Column(
            "last_signal_at", sa.DateTime(timezone=True), nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
    )
    op.create_index("ix_story_outcomes_state", "story_outcomes", ["state"])


def downgrade() -> None:
    op.drop_index("ix_story_outcomes_state", table_name="story_outcomes")
    op.drop_table("story_outcomes")
    op.drop_table("action_clicks")
