"""add_gold_ledger_table

Revision ID: c3a9d2f0a4b1
Revises: b8c1a5f1d2a3
Create Date: 2026-02-05

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3a9d2f0a4b1"
down_revision: Union[str, Sequence[str], None] = "b8c1a5f1d2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "gold_ledger",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("claim_id", sa.Integer(), nullable=False),
        sa.Column("evaluation_id", sa.Integer(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("claim_date", sa.Date(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("normalized_text", sa.Text(), nullable=False),
        sa.Column("intent_type", sa.String(), nullable=True),
        sa.Column("policy_area", sa.String(), nullable=True),
        sa.Column("matched_bill_id", sa.String(), nullable=True),
        sa.Column("best_action_id", sa.Integer(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("tier", sa.String(), nullable=False),
        sa.Column("relevance", sa.String(), nullable=True),
        sa.Column("progress", sa.String(), nullable=True),
        sa.Column("timing", sa.String(), nullable=True),
        sa.Column("evidence_json", sa.Text(), nullable=True),
        sa.Column("why_json", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["claim_id"], ["claims.id"]),
        sa.ForeignKeyConstraint(["evaluation_id"], ["claim_evaluations.id"]),
        sa.ForeignKeyConstraint(["best_action_id"], ["actions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_gold_ledger_claim_id", "gold_ledger", ["claim_id"], unique=False)
    op.create_index("ix_gold_ledger_evaluation_id", "gold_ledger", ["evaluation_id"], unique=False)
    op.create_index("ix_gold_ledger_person_id", "gold_ledger", ["person_id"], unique=False)
    op.create_index("ix_gold_ledger_claim_date", "gold_ledger", ["claim_date"], unique=False)
    op.create_index("ix_gold_ledger_matched_bill_id", "gold_ledger", ["matched_bill_id"], unique=False)
    op.create_index("ix_gold_ledger_best_action_id", "gold_ledger", ["best_action_id"], unique=False)
    op.create_index("ix_gold_ledger_tier", "gold_ledger", ["tier"], unique=False)

    # Idempotence guardrail: one gold row per claim.
    op.create_index(
        "uq_gold_ledger_claim_id",
        "gold_ledger",
        ["claim_id"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_gold_ledger_claim_id", table_name="gold_ledger")
    op.drop_index("ix_gold_ledger_tier", table_name="gold_ledger")
    op.drop_index("ix_gold_ledger_best_action_id", table_name="gold_ledger")
    op.drop_index("ix_gold_ledger_matched_bill_id", table_name="gold_ledger")
    op.drop_index("ix_gold_ledger_claim_date", table_name="gold_ledger")
    op.drop_index("ix_gold_ledger_person_id", table_name="gold_ledger")
    op.drop_index("ix_gold_ledger_evaluation_id", table_name="gold_ledger")
    op.drop_index("ix_gold_ledger_claim_id", table_name="gold_ledger")
    op.drop_table("gold_ledger")
