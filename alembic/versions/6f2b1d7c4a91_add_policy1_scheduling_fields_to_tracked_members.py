"""add_policy1_scheduling_fields_to_tracked_members

Revision ID: 6f2b1d7c4a91
Revises: e0f3b1c7d0aa
Create Date: 2026-02-06

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6f2b1d7c4a91"
down_revision: Union[str, Sequence[str], None] = "e0f3b1c7d0aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tracked_members",
        sa.Column("needs_ingest", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "tracked_members",
        sa.Column("last_full_refresh_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index(
        "ix_tracked_members_needs_ingest",
        "tracked_members",
        ["needs_ingest"],
        unique=False,
    )
    op.create_index(
        "ix_tracked_members_last_full_refresh_at",
        "tracked_members",
        ["last_full_refresh_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_tracked_members_last_full_refresh_at", table_name="tracked_members")
    op.drop_index("ix_tracked_members_needs_ingest", table_name="tracked_members")

    op.drop_column("tracked_members", "last_full_refresh_at")
    op.drop_column("tracked_members", "needs_ingest")
