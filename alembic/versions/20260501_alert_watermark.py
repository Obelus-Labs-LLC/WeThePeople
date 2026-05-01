"""Phase 2: alert watermark on users.

Revision ID: alert_watermark_001
Revises: phase2_personalization_001
Create Date: 2026-05-01

The alert job (`jobs/send_alerts.py`) walks users with alert_opt_in=true
on a schedule (hourly), finds stories published since each user's last
alert that match their personalization (sector match) or watchlist
(entity_id match), and emails a single roll-up. The watermark column
prevents re-alerting on the same story twice. Initialized to NULL so
the first run treats every recent story as new (capped to a 7-day
window in the job to avoid a giant first-run blast).
"""

from alembic import op
import sqlalchemy as sa


revision = "alert_watermark_001"
down_revision = "phase2_personalization_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("last_alert_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("last_alert_at")
