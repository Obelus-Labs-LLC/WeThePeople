"""Add pipeline reliability tables: failed_records, processed_records, data_quality_checks

Revision ID: pipeline_reliability_001
Revises: 001_initial
Create Date: 2026-03-24

Adds three tables for data pipeline observability:
  - failed_records: Dead Letter Queue for sync job failures
  - processed_records: Exactly-once processing deduplication
  - data_quality_checks: Automated quality check results
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "pipeline_reliability_001"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── failed_records (Dead Letter Queue) ────────────────────────────
    op.create_table(
        "failed_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_name", sa.String(100), nullable=False, index=True),
        sa.Column("record_data", sa.Text(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_failed_records_id", "failed_records", ["id"])
    op.create_index("ix_failed_records_resolved", "failed_records", ["resolved_at"])

    # ── processed_records (Exactly-Once) ──────────────────────────────
    op.create_table(
        "processed_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("job_name", sa.String(100), nullable=False, index=True),
        sa.Column("record_hash", sa.String(64), nullable=False, index=True),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("job_name", "record_hash", name="uq_processed_job_hash"),
    )
    op.create_index("ix_processed_records_id", "processed_records", ["id"])

    # ── data_quality_checks ───────────────────────────────────────────
    op.create_table(
        "data_quality_checks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("check_name", sa.String(200), nullable=False, index=True),
        sa.Column("table_name", sa.String(100), nullable=False, index=True),
        sa.Column("expected_min", sa.Float(), nullable=True),
        sa.Column("actual_count", sa.Float(), nullable=True),
        sa.Column("passed", sa.Integer(), nullable=False, index=True),
        sa.Column(
            "checked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_data_quality_checks_id", "data_quality_checks", ["id"])


def downgrade() -> None:
    op.drop_table("data_quality_checks")
    op.drop_table("processed_records")
    op.drop_table("failed_records")
