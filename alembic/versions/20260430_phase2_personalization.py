"""Phase 2: personalization fields on users + story_actions table.

Revision ID: phase2_personalization_001
Revises: simplified_summary_001
Create Date: 2026-04-30

The Phase 2 audience-fit work hangs on two structural additions:

1. Personalization fields on `users`:
   - home_state (2-char state code; derived from zip when not explicit)
   - congressional_district (e.g. "MI-10")
   - lifestyle_categories (JSON list, e.g. ["banking", "healthcare"])
   - current_concern (single string, e.g. "housing")
   - personalization_completed_at (timestamp; null until onboarding done)

   These power the "Why this matters to you" block on every story
   and gate which alerts the user is opted into.

2. New `story_actions` table:
   - one to three actions per story
   - action_type: "call_rep" | "switch_provider" | "check_redress" |
                  "attend_hearing" | "read_more" | "verify_data"
   - is_passive: 1 if action requires no political activity (switch
     bank, check refund portal); 0 if it's call/attend/contact
   - geographic_filter: optional state/district filter
   - script_template: text body for "call your rep" actions
   - external_url: link target

   Rendered in an Action Panel at the bottom of every story.
"""

from alembic import op
import sqlalchemy as sa


revision = "phase2_personalization_001"
down_revision = "simplified_summary_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Personalization fields on users.
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("home_state", sa.String(length=2), nullable=True))
        batch_op.add_column(
            sa.Column("congressional_district", sa.String(length=10), nullable=True)
        )
        batch_op.add_column(
            sa.Column("lifestyle_categories", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("current_concern", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "personalization_completed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )

    # story_actions table.
    op.create_table(
        "story_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("story_id", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_passive", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("geographic_filter", sa.String(length=10), nullable=True),
        sa.Column("script_template", sa.Text(), nullable=True),
        sa.Column("external_url", sa.String(length=500), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["story_id"], ["stories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_story_actions_story_id", "story_actions", ["story_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_story_actions_story_id", table_name="story_actions")
    op.drop_table("story_actions")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("personalization_completed_at")
        batch_op.drop_column("current_concern")
        batch_op.drop_column("lifestyle_categories")
        batch_op.drop_column("congressional_district")
        batch_op.drop_column("home_state")
