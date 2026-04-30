"""Add simplified-summary fields to stories for the disengaged-audience layer.

Revision ID: simplified_summary_001
Revises: research_pipeline_001
Create Date: 2026-04-30

Two columns power the 60-second simplified version of every published
story, the make-or-break feature for the platform's stated audience
(politically disengaged adults who don't already follow civic data):

  summary_simplified         TEXT     -- 250-ish word, 5th-grade
                                         reading level, no jargon
                                         summary. Generated via Haiku
                                         from the full body. Cached on
                                         the row so generation is paid
                                         once per story.
  summary_simplified_model   STRING   -- model identifier of the model
                                         that produced the simplified
                                         summary. Useful for re-running
                                         a sweep when we change models
                                         or rubric.

Both nullable. Stories without a simplified summary fall back to the
existing full summary in the UI; the toggle only appears when the
simplified version exists.
"""

from alembic import op
import sqlalchemy as sa


revision = "simplified_summary_001"
down_revision = "research_pipeline_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("stories", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("summary_simplified", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "summary_simplified_model", sa.String(length=128), nullable=True
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("stories", schema=None) as batch_op:
        batch_op.drop_column("summary_simplified_model")
        batch_op.drop_column("summary_simplified")
