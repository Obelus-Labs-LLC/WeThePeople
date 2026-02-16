"""add_claim_hash_and_claim_sources_json

Revision ID: 1266ca97de37
Revises: ea3896bbf5e0
Create Date: 2026-02-04 23:56:26.513056

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1266ca97de37'
down_revision: Union[str, Sequence[str], None] = 'ea3896bbf5e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add claim_hash to claims table
    op.add_column('claims', sa.Column('claim_hash', sa.String(), nullable=True))
    op.create_index(op.f('ix_claims_claim_hash'), 'claims', ['claim_hash'], unique=True)
    
    # Add claim_sources_json to tracked_members table
    op.add_column('tracked_members', sa.Column('claim_sources_json', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove claim_sources_json from tracked_members table
    op.drop_column('tracked_members', 'claim_sources_json')
    
    # Remove claim_hash from claims table
    op.drop_index(op.f('ix_claims_claim_hash'), table_name='claims')
    op.drop_column('claims', 'claim_hash')
