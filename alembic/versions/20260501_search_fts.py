"""Phase 3 search performance: SQLite FTS5 virtual table over every
searchable entity in the platform.

Revision ID: search_fts_001
Revises: phase3_001
Create Date: 2026-05-01

The before-state: global search ran 11 separate ILIKE %q% queries
against tracked-* tables. With a leading wildcard SQLite can't use
any B-tree index, so each query was a full table scan. Add up the
sectors and you're 11x scanning. That, plus the per-sector pages
hitting their own ILIKEs, is why search felt slow on every page.

The after-state: one FTS5 virtual table populated from every
searchable source. A single MATCH query returns hits across all
sources in milliseconds.

Sources covered (one row per source per entity):
    - politicians            (TrackedMember)
    - companies              (every Tracked* table)
    - bills                  (Bill)
    - stories                (Story)
    - state_legislators      (StateLegislator)

The table is `entity_search` with these columns:
    entity_type   one of {politician, company, bill, story,
                          state_legislator}
    entity_id     stable string id (person_id, company slug,
                          bill_id, story slug, ocd_id)
    title         primary searchable text (display name, bill title,
                          story title)
    body          secondary searchable text (state, sector, party,
                          summary, etc. — concatenated)
    sector        sector slug (or null)
    url           canonical URL the frontend should navigate to

A backfill job populates the table from existing rows; ongoing
maintenance happens via triggers (added in a follow-up so this
migration stays small) or via the daily pipeline.
"""

from alembic import op


revision = "search_fts_001"
down_revision = "phase3_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # FTS5 with porter tokenizer — handles "lobby" matching "lobbying",
    # "trades" matching "traded", etc. Without porter the search has
    # to be exact stems.
    op.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS entity_search USING fts5(
            entity_type UNINDEXED,
            entity_id UNINDEXED,
            title,
            body,
            sector UNINDEXED,
            url UNINDEXED,
            tokenize = 'porter unicode61 remove_diacritics 1'
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS entity_search")
