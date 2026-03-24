"""Add rate_limit_records table for persistent rate limiting

Revision ID: ratelimit001
Revises: None (standalone — safe to run on any DB state)
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "ratelimit001"
down_revision = None
branch_labels = ("ratelimit",)
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ip_address", sa.String(45), nullable=False, index=True),
        sa.Column("endpoint", sa.String(100), nullable=False, index=True),
        sa.Column("window_start", sa.Float(), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="1"),
    )
    # Composite index for fast lookups
    op.create_index(
        "ix_ratelimit_ip_endpoint",
        "rate_limit_records",
        ["ip_address", "endpoint"],
    )


def downgrade() -> None:
    op.drop_index("ix_ratelimit_ip_endpoint", table_name="rate_limit_records")
    op.drop_table("rate_limit_records")
