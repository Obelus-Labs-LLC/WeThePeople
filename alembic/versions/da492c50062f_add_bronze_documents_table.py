"""add_bronze_documents_table

Revision ID: da492c50062f
Revises: 1266ca97de37
Create Date: 2026-02-05 12:31:09.033785

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da492c50062f'
down_revision: Union[str, Sequence[str], None] = '1266ca97de37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'bronze_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('person_id', sa.String(), nullable=False),
        sa.Column('source_url', sa.Text(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.Column('content_type', sa.String(), nullable=True),  # 'html', 'text', 'json', etc.
        sa.Column('raw_text', sa.Text(), nullable=True),
        sa.Column('raw_html', sa.Text(), nullable=True),
        sa.Column('fetch_hash', sa.String(), nullable=False),  # MD5 of content for deduplication
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_bronze_person_id', 'bronze_documents', ['person_id'])
    op.create_index('ix_bronze_fetch_hash', 'bronze_documents', ['fetch_hash'])
    op.create_index('ix_bronze_fetched_at', 'bronze_documents', ['fetched_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_bronze_fetched_at', table_name='bronze_documents')
    op.drop_index('ix_bronze_fetch_hash', table_name='bronze_documents')
    op.drop_index('ix_bronze_person_id', table_name='bronze_documents')
    op.drop_table('bronze_documents')
