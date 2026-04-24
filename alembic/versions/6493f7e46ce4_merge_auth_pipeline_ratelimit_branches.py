"""merge auth, pipeline, ratelimit branches

Revision ID: 6493f7e46ce4
Revises: pipeline_reliability_001, ratelimit001, userprefs001
Create Date: 2026-04-23 20:07:26.146512

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6493f7e46ce4'
down_revision: Union[str, Sequence[str], None] = ('pipeline_reliability_001', 'ratelimit001', 'userprefs001')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
