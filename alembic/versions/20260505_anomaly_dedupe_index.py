"""Composite index on anomalies for the dedupe window function.

Revision ID: anomaly_dedupe_idx_001
Revises: search_fts_001
Create Date: 2026-05-05

The /anomalies list endpoint (routers/anomalies.py:list_anomalies) runs
a window function that partitions by (entity_id, pattern_type) and
orders within each partition by (score DESC, detected_at DESC):

    SELECT id, score, ROW_NUMBER() OVER (
        PARTITION BY entity_id, pattern_type
        ORDER BY score DESC, detected_at DESC
    ) AS rn FROM anomalies WHERE ...

Pre-fix the table had per-column indexes on entity_id, pattern_type,
score individually but no composite index covering the partition +
order columns. SQLite couldn't satisfy the window in index order, so
every request paid for a full sort over ~10K rows — measured at 4.94 s
on prod in the May 5 walkthrough.

Adding a composite index on (entity_id, pattern_type, score DESC,
detected_at DESC) lets SQLite stream the window function in index
order, producing partition-leaders without a sort. The index is also
useful for the entity-specific endpoint
(/anomalies/entity/{entity_type}/{entity_id}) which filters on
entity_id and orders by score.

A covering scan on this index expects sub-100ms response times even
without the in-process cache from PR #122.
"""

from alembic import op


revision = "anomaly_dedupe_idx_001"
down_revision = "search_fts_001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite supports DESC keywords in CREATE INDEX since 3.7.4 (we run
    # 3.40+). The DESC in the index matches the ORDER BY direction in
    # the dedupe query, so the planner can use the index for a
    # streaming partition-leader scan instead of building + sorting a
    # temporary result set.
    #
    # `IF NOT EXISTS` is intentional — running the migration twice on a
    # DB that already has the index (e.g. after a manual one-off SQL
    # patch) shouldn't fail.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_anomalies_dedupe "
        "ON anomalies (entity_id, pattern_type, score DESC, detected_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_anomalies_dedupe")
