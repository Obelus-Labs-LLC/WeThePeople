"""add_silver_layer_tables

Revision ID: b8c1a5f1d2a3
Revises: da492c50062f
Create Date: 2026-02-05

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8c1a5f1d2a3"
down_revision: Union[str, Sequence[str], None] = "da492c50062f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "silver_claims",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bronze_id", sa.Integer(), nullable=True),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("normalized_text", sa.Text(), nullable=False),
        sa.Column("intent_type", sa.String(), nullable=True),
        sa.Column("policy_area", sa.String(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("published_at", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["bronze_id"], ["bronze_documents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_silver_claims_person_id", "silver_claims", ["person_id"])
    op.create_index("ix_silver_claims_published_at", "silver_claims", ["published_at"])
    op.create_index("ix_silver_claims_bronze_id", "silver_claims", ["bronze_id"])

    # Idempotence guardrail: prevent duplicate normalized claims per person+url.
    op.create_index(
        "uq_silver_claims_person_url_text",
        "silver_claims",
        ["person_id", "source_url", "normalized_text"],
        unique=True,
    )

    op.create_table(
        "silver_actions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bill_id", sa.String(), nullable=False),
        sa.Column("action_type", sa.String(), nullable=True),
        sa.Column("chamber", sa.String(), nullable=True),
        sa.Column("canonical_status", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("action_date", sa.DateTime(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["bill_id"], ["bills.bill_id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_silver_actions_bill_id", "silver_actions", ["bill_id"])

    # Idempotence guardrail: prevent duplicate timeline actions.
    op.create_index(
        "uq_silver_actions_bill_date_desc",
        "silver_actions",
        ["bill_id", "action_date", "description"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_silver_actions_bill_date_desc", table_name="silver_actions")
    op.drop_index("ix_silver_actions_bill_id", table_name="silver_actions")
    op.drop_table("silver_actions")

    op.drop_index("uq_silver_claims_person_url_text", table_name="silver_claims")
    op.drop_index("ix_silver_claims_bronze_id", table_name="silver_claims")
    op.drop_index("ix_silver_claims_published_at", table_name="silver_claims")
    op.drop_index("ix_silver_claims_person_id", table_name="silver_claims")
    op.drop_table("silver_claims")
