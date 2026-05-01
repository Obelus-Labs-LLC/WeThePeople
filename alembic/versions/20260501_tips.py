"""Phase 2: contributor tips table.

Revision ID: tips_001
Revises: alert_watermark_001
Create Date: 2026-05-01

Adds the `tips` table — a single-row-per-submission inbox for
outside contributors who want to flag a story idea, point to a
public record, or share context an editor should consider.

Existing /stories/report-error already handles "this story has a
mistake"; this table is for the complementary case: "you should
look into X." Triaged in the ops queue alongside drafts.
"""

from alembic import op
import sqlalchemy as sa


revision = "tips_001"
down_revision = "alert_watermark_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tips",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        # Optional. We'd love a contact for follow-up but the
        # disengaged-audience thesis says lower the friction first.
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("contact_name", sa.String(255), nullable=True),
        # If the tip is anchored to an existing story, persist the slug.
        # Validated app-side; not a hard FK because tips can also be
        # about not-yet-published topics.
        sa.Column("related_story_slug", sa.String(255), nullable=True),
        # Sector / entity hint, both free-text. The editor decides
        # what to do with it.
        sa.Column("hint_sector", sa.String(64), nullable=True),
        sa.Column("hint_entity", sa.String(255), nullable=True),
        # Triage workflow.
        sa.Column(
            "status", sa.String(16), nullable=False, server_default="new"
        ),  # new | in_review | published | dismissed
        sa.Column("admin_notes", sa.Text, nullable=True),
        # Light spam-control surface so we can see (and rate-limit
        # by) the originating IP without putting it in the public
        # response. NULL when missing / behind a proxy chain.
        sa.Column("submitter_ip", sa.String(64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.Column("triaged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("triaged_by", sa.String(255), nullable=True),
    )
    op.create_index("ix_tips_status", "tips", ["status"])
    op.create_index("ix_tips_created_at", "tips", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_tips_created_at", table_name="tips")
    op.drop_index("ix_tips_status", table_name="tips")
    op.drop_table("tips")
