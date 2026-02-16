"""add_votes_and_member_votes_tables

Revision ID: ea3896bbf5e0
Revises: 15de042fe35f
Create Date: 2026-02-04 12:59:09.149568

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea3896bbf5e0'
down_revision: Union[str, Sequence[str], None] = '15de042fe35f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
