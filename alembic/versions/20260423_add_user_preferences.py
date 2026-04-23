"""Add user preferences: zip_code, digest_opt_in, alert_opt_in

Revision ID: userprefs001
Revises: auth001
Create Date: 2026-04-23

These three columns are populated by the Signup form's optional ZIP + the two
notification checkboxes (Weekly Digest, Anomaly Alerts). Kept separate from
verified_zip (which requires SMS/letter/document proof) so self-reported ZIP
never accidentally grants verified-citizen status.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "userprefs001"
down_revision = "auth001"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    """Idempotency helper — SQLite ALTER TABLE ADD COLUMN fails if already present."""
    bind = op.get_bind()
    rows = bind.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def upgrade() -> None:
    if not _has_column("users", "zip_code"):
        op.add_column("users", sa.Column("zip_code", sa.String(10), nullable=True))
    if not _has_column("users", "digest_opt_in"):
        op.add_column(
            "users",
            sa.Column("digest_opt_in", sa.Integer(), nullable=False, server_default="1"),
        )
    if not _has_column("users", "alert_opt_in"):
        op.add_column(
            "users",
            sa.Column("alert_opt_in", sa.Integer(), nullable=False, server_default="1"),
        )


def downgrade() -> None:
    # SQLite doesn't support DROP COLUMN cleanly pre-3.35; leave columns in place.
    # Alembic's batch_alter_table would rebuild the table, but that's unsafe for
    # a live DB. Downgrade is a no-op.
    pass
